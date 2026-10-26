import { Hono } from "hono";
import {
  availabilityAndTimeline,
  availabilityAndTimelineBatch,
  getAppSettings,
  getMonitor,
  listMonitorsPublic,
  normMonitorId,
  pruneProbeEvents,
  updateAppSettings,
} from "./db";
import {
  createMonitorFromPayload,
  deleteMonitor,
  runScheduled,
  runSingleProbe,
  updateMonitorFromPayload,
} from "./scheduler";

type MonitorCreateBody = {
  display_name: string;
  api_base_url: string;
  api_key: string;
  model: string;
  protocol: "openai" | "openai_responses" | "claude";
  category?: string;
  enabled?: boolean;
  /** 未传时默认为流式 */
  probe_stream?: boolean;
  /** 未传时默认在首页展示 */
  show_on_dashboard?: boolean;
};

function parseOptionalBool01(o: Record<string, unknown>, key: string): boolean | undefined {
  const v = o[key];
  if (typeof v === "boolean") return v;
  if (v === 0) return false;
  if (v === 1) return true;
  return undefined;
}

function parseOptionalProbeStream(o: Record<string, unknown>): boolean | undefined {
  return parseOptionalBool01(o, "probe_stream");
}

const app = new Hono<{ Bindings: Env }>();

/** 管理与详情接口保持私有；公开列表由路由显式配置短时共享缓存。 */
app.use("/api/*", async (c, next) => {
  await next();
  if (c.req.path !== "/api/monitors") {
    c.header("Cache-Control", "private, no-store, max-age=0");
  }
});

const ALLOWED = new Set([5, 10, 30, 60, 360]);
const PROBE_CRON = "*/5 * * * *";
/** 兼容旧的独立清理 Cron；新部署已合并到探测 Cron，在每日 03:00 UTC 那次触发里顺带清理。 */
const PRUNE_CRON = "17 3 * * *";
const PRUNE_UTC_HOUR = 3;
const PRUNE_UTC_MINUTE = 0;

function checkAdmin(c: { req: { header: (k: string) => string | undefined }; env: Env }): Response | null {
  const configured = (c.env.ADMIN_TOKEN ?? "").trim();
  if (!configured) {
    return new Response(
      JSON.stringify({
        error: "admin_token_not_configured",
        message: "Configure ADMIN_TOKEN in .dev.vars (local) or wrangler secret put ADMIN_TOKEN (production).",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
  const h = c.req.header("Authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  const bearer = (m?.[1] ?? "").trim();
  if (bearer !== configured) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

async function parseMonitorCreate(c: { req: { json: () => Promise<unknown> } }): Promise<MonitorCreateBody | null> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return null;
  }
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const display_name = typeof o.display_name === "string" ? o.display_name : "";
  const api_base_url = typeof o.api_base_url === "string" ? o.api_base_url : "";
  const api_key = typeof o.api_key === "string" ? o.api_key : "";
  const model = typeof o.model === "string" ? o.model : "";
  const protocol =
    o.protocol === "openai" || o.protocol === "openai_responses" || o.protocol === "claude" ? o.protocol : null;
  if (!display_name.trim() || !api_base_url.trim() || !api_key.trim() || !model.trim() || !protocol) {
    return null;
  }
  const category = typeof o.category === "string" ? o.category : undefined;
  const enabled = typeof o.enabled === "boolean" ? o.enabled : undefined;
  const probe_stream = parseOptionalProbeStream(o);
  const show_on_dashboard = parseOptionalBool01(o, "show_on_dashboard");
  return {
    display_name,
    api_base_url,
    api_key,
    model,
    protocol,
    category,
    enabled,
    probe_stream,
    show_on_dashboard,
  };
}

type MonitorRowWithInterval = Awaited<ReturnType<typeof listMonitorsPublic>>[number] & {
  interval_minutes: number;
};

const TIMELINE_SHANGHAI_OFF = 8 * 3600;
const TIMELINE_HALF_DAY_SEC = 12 * 60 * 60;
const TIMELINE_SLOTS = 60;

function currentTimelineSlotStart(nowSec: number): number {
  return Math.floor((nowSec + TIMELINE_SHANGHAI_OFF) / TIMELINE_HALF_DAY_SEC) * TIMELINE_HALF_DAY_SEC - TIMELINE_SHANGHAI_OFF;
}

function timelineDailyFromBuckets(daily: Array<{ dayStart: number; ok: number; total: number }>) {
  const bySlot = new Map(daily.map((d) => [d.dayStart, d]));
  const current = currentTimelineSlotStart(Math.floor(Date.now() / 1000));
  const first = current - (TIMELINE_SLOTS - 1) * TIMELINE_HALF_DAY_SEC;

  return Array.from({ length: TIMELINE_SLOTS }, (_, i) => {
    const t = first + i * TIMELINE_HALF_DAY_SEC;
    const d = bySlot.get(t);
    const total = d?.total ?? 0;
    const ratio = total > 0 ? (d?.ok ?? 0) / total : 0;
    return {
      t,
      up: total > 0 && (d?.ok ?? 0) === total,
      ratio,
      hasData: total > 0,
    };
  });
}

async function monitorsDtoList(db: D1Database, merged: MonitorRowWithInterval[]) {
  const statsMap = await availabilityAndTimelineBatch(
    db,
    merged.map((m) => m.id)
  );
  return merged.map((m) => {
    const stats = statsMap.get(normMonitorId(m.id));
    if (!stats) {
      return {
        ...m,
        availability24h: null,
        availability30d: null,
        probe_count: 0,
        lastProbe: null,
        timelineDaily: [],
      };
    }
    const timelineDaily = timelineDailyFromBuckets(stats.daily);
    return {
      ...m,
      availability24h: stats.availability24h,
      availability30d: stats.availability30d,
      probe_count: stats.probe_count,
      lastProbe: stats.lastProbe,
      timelineDaily,
    };
  });
}

function publicMonitorsCacheKey(requestUrl: string): Request {
  return new Request(new URL("/_cache/public-monitors-v1", requestUrl).toString());
}

async function purgePublicMonitorsCache(requestUrl: string): Promise<void> {
  try {
    await caches.default.delete(publicMonitorsCacheKey(requestUrl));
  } catch {
    /* 缓存不可用时等待最多 60 秒自然过期 */
  }
}

app.get("/api/monitors", async (c) => {
  const cacheKey = publicMonitorsCacheKey(c.req.url);
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;

  const db = c.env.DB;
  const [rows, s] = await Promise.all([listMonitorsPublic(db, "dashboard"), getAppSettings(db)]);
  const merged: MonitorRowWithInterval[] = rows.map((m) => ({
    ...m,
    interval_minutes: s.probe_interval_minutes,
  }));
  const response = new Response(JSON.stringify(await monitorsDtoList(db, merged)), {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=60",
      "Content-Type": "application/json",
    },
  });
  try {
    await caches.default.put(cacheKey, response.clone());
  } catch {
    /* 缓存不可用时仍返回实时数据 */
  }
  return response;
});

app.get("/api/monitors/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const [m, s] = await Promise.all([getMonitor(db, id), getAppSettings(db)]);
  if (!m) return c.json({ error: "not_found" }, 404);
  if (m.show_on_dashboard === 0) return c.json({ error: "not_found" }, 404);
  const stats = await availabilityAndTimeline(db, id);
  const timelineDaily = timelineDailyFromBuckets(stats.daily);
  return c.json({
    id: m.id,
    display_name: m.display_name,
    api_base_url: m.api_base_url,
    model: m.model,
    protocol: m.protocol,
    interval_minutes: s.probe_interval_minutes,
    probe_stream: m.probe_stream,
    show_on_dashboard: m.show_on_dashboard,
    enabled: m.enabled,
    category: m.category,
    created_at: m.created_at,
    last_run_at: m.last_run_at,
    next_run_at: m.next_run_at,
    availability24h: stats.availability24h,
    availability30d: stats.availability30d,
    probe_count: stats.probe_count,
    lastProbe: stats.lastProbe,
    timelineDaily,
  });
});

app.get("/api/admin/ping", (c) => {
  const err = checkAdmin(c);
  if (err) return err;
  return c.json({ ok: true });
});

app.get("/api/admin/probe-settings", async (c) => {
  const err = checkAdmin(c);
  if (err) return err;
  const s = await getAppSettings(c.env.DB);
  return c.json({
    probe_prompts: s.probe_prompts,
    probe_interval_minutes: s.probe_interval_minutes,
  });
});

app.put("/api/admin/probe-settings", async (c) => {
  const err = checkAdmin(c);
  if (err) return err;
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const patch: Partial<{ probe_prompts: string; probe_interval_minutes: number }> = {};
  if (typeof body.probe_prompts === "string") patch.probe_prompts = body.probe_prompts;
  if (typeof body.probe_interval_minutes === "number") {
    if (!ALLOWED.has(body.probe_interval_minutes)) {
      return c.json({ error: "invalid_interval" }, 400);
    }
    patch.probe_interval_minutes = body.probe_interval_minutes as 1 | 5 | 10 | 30 | 60 | 360;
  }
  if (Object.keys(patch).length === 0) return c.json({ error: "invalid_body" }, 400);
  try {
    await updateAppSettings(c.env.DB, patch);
    await purgePublicMonitorsCache(c.req.url);
    return c.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: "update_failed", message }, 500);
  }
});

app.get("/api/admin/monitors", async (c) => {
  const err = checkAdmin(c);
  if (err) return err;
  const db = c.env.DB;
  const [rows, s] = await Promise.all([listMonitorsPublic(db, "all"), getAppSettings(db)]);
  const merged: MonitorRowWithInterval[] = rows.map((m) => ({
    ...m,
    interval_minutes: s.probe_interval_minutes,
  }));
  return c.json(await monitorsDtoList(db, merged));
});

app.post("/api/admin/monitors", async (c) => {
  const err = checkAdmin(c);
  if (err) return err;
  const parsed = await parseMonitorCreate(c);
  if (!parsed) return c.json({ error: "invalid_body" }, 400);
  const { id } = await createMonitorFromPayload(c.env, c.env.DB, parsed);
  await purgePublicMonitorsCache(c.req.url);
  return c.json({ id }, 201);
});

app.put("/api/admin/monitors/:id", async (c) => {
  const err = checkAdmin(c);
  if (err) return err;
  const id = c.req.param("id");
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const patch: Parameters<typeof updateMonitorFromPayload>[3] = {};
  if (typeof body.display_name === "string") patch.display_name = body.display_name;
  if (typeof body.api_base_url === "string") patch.api_base_url = body.api_base_url;
  if (typeof body.api_key === "string") patch.api_key = body.api_key;
  if (typeof body.model === "string") patch.model = body.model;
  if (body.protocol === "openai" || body.protocol === "openai_responses" || body.protocol === "claude")
    patch.protocol = body.protocol;
  if (typeof body.category === "string") patch.category = body.category;
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.probe_stream === "boolean") patch.probe_stream = body.probe_stream;
  else if (body.probe_stream === 0 || body.probe_stream === 1) patch.probe_stream = body.probe_stream === 1;
  if (typeof body.show_on_dashboard === "boolean") patch.show_on_dashboard = body.show_on_dashboard;
  else if (body.show_on_dashboard === 0 || body.show_on_dashboard === 1)
    patch.show_on_dashboard = body.show_on_dashboard === 1;
  try {
    const ok = await updateMonitorFromPayload(c.env, c.env.DB, id, patch);
    if (!ok) return c.json({ error: "not_found" }, 404);
    await purgePublicMonitorsCache(c.req.url);
    return c.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: "update_failed", message }, 500);
  }
});

app.delete("/api/admin/monitors/:id", async (c) => {
  const err = checkAdmin(c);
  if (err) return err;
  const id = c.req.param("id");
  const m = await getMonitor(c.env.DB, id);
  if (!m) return c.json({ error: "not_found" }, 404);
  await deleteMonitor(c.env.DB, id);
  await purgePublicMonitorsCache(c.req.url);
  return c.json({ ok: true });
});

app.post("/api/admin/monitors/:id/run", async (c) => {
  const err = checkAdmin(c);
  if (err) return err;
  const id = c.req.param("id");
  const m = await getMonitor(c.env.DB, id);
  if (!m) return c.json({ error: "not_found" }, 404);
  const nowSec = Math.floor(Date.now() / 1000);
  const outcome = await runSingleProbe(c.env, id, c.env.DB, nowSec, { monitor: m });
  await purgePublicMonitorsCache(c.req.url);
  if (!outcome.success) {
    return c.json({ ok: false, error: outcome.error }, 200);
  }
  return c.json({ ok: true });
});

export default {
  fetch: app.fetch,
  scheduled: (event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    // Free 计划每个账号仅允许 5 个 Cron 触发器，因此只保留一条 */5 触发：
    // 每日 03:00 UTC 的那次触发顺带清理过期探测记录，其余触发只跑探测调度。
    if (event.cron === PRUNE_CRON) {
      ctx.waitUntil(pruneProbeEvents(env.DB));
      return;
    }
    if (event.cron !== PROBE_CRON && event.cron !== "* * * * *") {
      return;
    }
    const at = new Date(event.scheduledTime);
    if (at.getUTCHours() === PRUNE_UTC_HOUR && at.getUTCMinutes() === PRUNE_UTC_MINUTE) {
      ctx.waitUntil(pruneProbeEvents(env.DB));
    }
    ctx.waitUntil(runScheduled(env));
  },
};
