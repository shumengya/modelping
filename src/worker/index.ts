import { Hono } from "hono";
import { availabilityAndTimeline, getAppSettings, getMonitor, listMonitorsPublic, updateAppSettings } from "./db";
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
};

const app = new Hono<{ Bindings: Env }>();

const ALLOWED = new Set([1, 5, 10, 30, 60, 360]);

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
  return {
    display_name,
    api_base_url,
    api_key,
    model,
    protocol,
    category,
    enabled,
  };
}

async function withIntervalForApi(
  db: D1Database,
  rows: Awaited<ReturnType<typeof listMonitorsPublic>>
): Promise<Array<(typeof rows)[number] & { interval_minutes: number }>> {
  const s = await getAppSettings(db);
  const iv = s.probe_interval_minutes;
  return rows.map((m) => ({ ...m, interval_minutes: iv }));
}

app.get("/api/monitors", async (c) => {
  const db = c.env.DB;
  const rows = await listMonitorsPublic(db);
  const merged = await withIntervalForApi(db, rows);
  const out = [];
  for (const m of merged) {
    const stats = await availabilityAndTimeline(db, m.id);
    const timelineDaily = stats.daily.map((d) => ({
      t: d.dayStart,
      up: d.total > 0 && d.ok === d.total,
      ratio: d.total > 0 ? d.ok / d.total : 0,
    }));
    out.push({
      ...m,
      availability24h: stats.availability24h,
      availability30d: stats.availability30d,
      probe_count: stats.probe_count,
      lastProbe: stats.lastProbe,
      timelineDaily,
    });
  }
  return c.json(out);
});

app.get("/api/monitors/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const m = await getMonitor(db, id);
  if (!m) return c.json({ error: "not_found" }, 404);
  const s = await getAppSettings(db);
  const stats = await availabilityAndTimeline(db, id);
  const timelineDaily = stats.daily.map((d) => ({
    t: d.dayStart,
    up: d.total > 0 && d.ok === d.total,
    ratio: d.total > 0 ? d.ok / d.total : 0,
  }));
  return c.json({
    id: m.id,
    display_name: m.display_name,
    api_base_url: m.api_base_url,
    model: m.model,
    protocol: m.protocol,
    interval_minutes: s.probe_interval_minutes,
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
  const rows = await listMonitorsPublic(db);
  return c.json(await withIntervalForApi(db, rows));
});

app.post("/api/admin/monitors", async (c) => {
  const err = checkAdmin(c);
  if (err) return err;
  const parsed = await parseMonitorCreate(c);
  if (!parsed) return c.json({ error: "invalid_body" }, 400);
  const { id } = await createMonitorFromPayload(c.env, c.env.DB, parsed);
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
  try {
    const ok = await updateMonitorFromPayload(c.env, c.env.DB, id, patch);
    if (!ok) return c.json({ error: "not_found" }, 404);
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
  return c.json({ ok: true });
});

app.post("/api/admin/monitors/:id/run", async (c) => {
  const err = checkAdmin(c);
  if (err) return err;
  const id = c.req.param("id");
  const m = await getMonitor(c.env.DB, id);
  if (!m) return c.json({ error: "not_found" }, 404);
  const nowSec = Math.floor(Date.now() / 1000);
  const outcome = await runSingleProbe(c.env, id, c.env.DB, nowSec);
  if (!outcome.success) {
    return c.json({ ok: false, error: outcome.error }, 200);
  }
  return c.json({ ok: true });
});

export default {
  fetch: app.fetch,
  scheduled: (_event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(runScheduled(env));
  },
};
