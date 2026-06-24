import { d1BlobToUint8Array } from "./crypto";
import type { Protocol } from "./probe";

const THIRTY_DAYS_SEC = 30 * 24 * 60 * 60;

export async function pruneProbeEvents(db: D1Database): Promise<void> {
  const cutoff = Math.floor(Date.now() / 1000) - THIRTY_DAYS_SEC;
  await db.prepare("DELETE FROM probe_events WHERE ts < ?").bind(cutoff).run();
}

export type AppSettingsRow = {
  id: number;
  probe_prompts: string;
  probe_interval_minutes: number;
};

export async function getAppSettings(db: D1Database): Promise<AppSettingsRow> {
  const r = await db
    .prepare("SELECT id, probe_prompts, probe_interval_minutes FROM app_settings WHERE id = 1")
    .first<AppSettingsRow>();
  if (r) return r;
  await db
    .prepare("INSERT INTO app_settings (id, probe_prompts, probe_interval_minutes) VALUES (1, '', 5)")
    .run();
  return { id: 1, probe_prompts: "", probe_interval_minutes: 5 };
}

export async function updateAppSettings(
  db: D1Database,
  patch: Partial<Pick<AppSettingsRow, "probe_prompts" | "probe_interval_minutes">>
): Promise<void> {
  const cur = await getAppSettings(db);
  const next = {
    probe_prompts: patch.probe_prompts !== undefined ? patch.probe_prompts : cur.probe_prompts,
    probe_interval_minutes:
      patch.probe_interval_minutes !== undefined ? patch.probe_interval_minutes : cur.probe_interval_minutes,
  };
  await db
    .prepare("UPDATE app_settings SET probe_prompts = ?, probe_interval_minutes = ? WHERE id = 1")
    .bind(next.probe_prompts, next.probe_interval_minutes)
    .run();
}

/** 库中存证的监控行（不含全站探测间隔，间隔在 app_settings） */
export type MonitorRow = {
  id: string;
  display_name: string;
  api_base_url: string;
  model: string;
  protocol: Protocol;
  enabled: number;
  category: string;
  created_at: number;
  api_key_ciphertext: ArrayBuffer;
  api_key_nonce: ArrayBuffer;
  last_run_at: number | null;
  next_run_at: number;
  /** 1 = 流式；0 = 非流式 */
  probe_stream: number;
  /** 1 = 首页卡片展示；0 = 仅后台可见 */
  show_on_dashboard: number;
};

/** 列表 API 在合并 interval_minutes 之前的行 */
export type MonitorPublic = {
  id: string;
  display_name: string;
  api_base_url: string;
  model: string;
  protocol: Protocol;
  enabled: number;
  category: string;
  created_at: number;
  last_run_at: number | null;
  next_run_at: number;
  probe_stream: number;
  show_on_dashboard: number;
};

export async function listMonitorsPublic(
  db: D1Database,
  visibility: "all" | "dashboard" = "all"
): Promise<MonitorPublic[]> {
  const where = visibility === "dashboard" ? " WHERE show_on_dashboard = 1" : "";
  const r = await db
    .prepare(
      `SELECT id, display_name, api_base_url, model, protocol, enabled, category,
              created_at, last_run_at, next_run_at, probe_stream, show_on_dashboard
       FROM monitors${where} ORDER BY display_name ASC`
    )
    .all();
  return (r.results ?? []) as unknown as MonitorPublic[];
}

export async function listAllMonitors(db: D1Database): Promise<MonitorRow[]> {
  const r = await db
    .prepare(
      `SELECT id, display_name, api_base_url, model, protocol, enabled, category,
              created_at, api_key_ciphertext, api_key_nonce, last_run_at, next_run_at, probe_stream,
              show_on_dashboard
       FROM monitors ORDER BY display_name ASC`
    )
    .all();
  return (r.results ?? []) as unknown as MonitorRow[];
}

export async function listDueMonitors(db: D1Database, nowSec: number): Promise<MonitorRow[]> {
  const r = await db
    .prepare(
      `SELECT id, display_name, api_base_url, model, protocol, enabled, category,
              created_at, api_key_ciphertext, api_key_nonce, last_run_at, next_run_at, probe_stream,
              show_on_dashboard
       FROM monitors WHERE enabled = 1 AND next_run_at <= ? ORDER BY next_run_at ASC`
    )
    .bind(nowSec)
    .all();
  return (r.results ?? []) as unknown as MonitorRow[];
}

export async function getMonitor(db: D1Database, id: string): Promise<MonitorRow | null> {
  const r = await db
    .prepare(
      `SELECT id, display_name, api_base_url, model, protocol, enabled, category,
              created_at, api_key_ciphertext, api_key_nonce, last_run_at, next_run_at, probe_stream,
              show_on_dashboard
       FROM monitors WHERE id = ?`
    )
    .bind(id)
    .first();
  return (r as unknown as MonitorRow) ?? null;
}

export async function insertMonitor(
  db: D1Database,
  row: Omit<MonitorRow, "last_run_at"> & { last_run_at: number | null }
): Promise<void> {
  const ct = d1BlobToUint8Array(row.api_key_ciphertext as unknown);
  const nn = d1BlobToUint8Array(row.api_key_nonce as unknown);
  await db
    .prepare(
      `INSERT INTO monitors (id, display_name, api_base_url, model, protocol, enabled, category,
        created_at, api_key_ciphertext, api_key_nonce, last_run_at, next_run_at, probe_stream,
        show_on_dashboard)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      row.id,
      row.display_name,
      row.api_base_url,
      row.model,
      row.protocol,
      row.enabled,
      row.category,
      row.created_at,
      ct,
      nn,
      row.last_run_at,
      row.next_run_at,
      row.probe_stream,
      row.show_on_dashboard
    )
    .run();
}

export async function updateMonitorMeta(
  db: D1Database,
  id: string,
  patch: Partial<{
    display_name: string;
    api_base_url: string;
    model: string;
    protocol: Protocol;
    category: string;
    enabled: number;
    api_key_ciphertext: ArrayBuffer;
    api_key_nonce: ArrayBuffer;
    next_run_at: number;
    probe_stream: number;
    show_on_dashboard: number;
  }>
): Promise<void> {
  const cur = await getMonitor(db, id);
  if (!cur) return;
  const next = { ...cur, ...patch };
  const ct = d1BlobToUint8Array(next.api_key_ciphertext as unknown);
  const nn = d1BlobToUint8Array(next.api_key_nonce as unknown);
  await db
    .prepare(
      `UPDATE monitors SET display_name=?, api_base_url=?, model=?, protocol=?,
       enabled=?, category=?, api_key_ciphertext=?, api_key_nonce=?, next_run_at=?, probe_stream=?,
       show_on_dashboard=?
       WHERE id=?`
    )
    .bind(
      next.display_name,
      next.api_base_url,
      next.model,
      next.protocol,
      next.enabled,
      next.category,
      ct,
      nn,
      next.next_run_at,
      next.probe_stream,
      next.show_on_dashboard,
      id
    )
    .run();
}

export async function deleteMonitor(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM probe_events WHERE monitor_id = ?").bind(id).run();
  await db.prepare("DELETE FROM monitors WHERE id = ?").bind(id).run();
}

export async function insertProbeEvent(
  db: D1Database,
  e: {
    monitor_id: string;
    ts: number;
    ok: number;
    first_token_ms: number | null;
    http_status: number | null;
    error_message: string | null;
    probe_input: string | null;
    probe_output: string | null;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO probe_events (monitor_id, ts, ok, first_token_ms, http_status, error_message, probe_input, probe_output)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      e.monitor_id,
      e.ts,
      e.ok,
      e.first_token_ms,
      e.http_status,
      e.error_message,
      e.probe_input,
      e.probe_output
    )
    .run();
}

export async function updateMonitorRunTimes(
  db: D1Database,
  id: string,
  last_run_at: number,
  next_run_at: number
): Promise<void> {
  await db
    .prepare("UPDATE monitors SET last_run_at = ?, next_run_at = ? WHERE id = ?")
    .bind(last_run_at, next_run_at, id)
    .run();
}

export type AvailabilityTimelineStats = {
  availability24h: number | null;
  availability30d: number | null;
  probe_count: number;
  daily: Array<{ dayStart: number; ok: number; total: number }>;
  lastProbe: {
    ts: number;
    ok: number;
    first_token_ms: number | null;
    http_status: number | null;
    error_message: string | null;
    probe_input: string | null;
    probe_output: string | null;
  } | null;
};

type LastProbeRow = NonNullable<AvailabilityTimelineStats["lastProbe"]>;

function finalizeAvailabilityTimeline(
  lastProbe: LastProbeRow | null | undefined,
  stats24: { okc: number | null; total: number | null } | null | undefined,
  stats30: { okc: number | null; total: number | null } | null | undefined,
  dailyRaw: unknown[],
  countRow: { c: number | null } | null | undefined
): AvailabilityTimelineStats {
  const daily = dailyRaw.map((r) => ({
    dayStart: Number((r as { day_start: number }).day_start),
    ok: Number((r as { okc: number | null }).okc ?? 0),
    total: Number((r as { cnt: number | null }).cnt ?? 0),
  }));

  const availability24h =
    stats24?.total && stats24.total > 0 ? (Number(stats24.okc ?? 0) / Number(stats24.total)) * 100 : null;
  const availability30d =
    stats30?.total && stats30.total > 0 ? (Number(stats30.okc ?? 0) / Number(stats30.total)) * 100 : null;

  return {
    availability24h,
    availability30d,
    probe_count: Number(countRow?.c ?? 0),
    daily,
    lastProbe: lastProbe ?? null,
  };
}

/** 与 SQL bind / Map 查找统一，避免首尾空白或类型不一致导致 stats 对不上 */
export function normMonitorId(id: unknown): string {
  return String(id ?? "").trim();
}

/** 每个监控单独 batch（5 条语句），多监控并发；避免单次 mega-batch 下结果与语句顺序偶发错位 */
const AV_STATS_PARALLEL_MONITORS = 12;

/**
 * 批量拉取多个监控的可用率与时间线（每位监控 1 次 `db.batch`，含 5 条 SELECT）。
 */
export async function availabilityAndTimelineBatch(
  db: D1Database,
  monitorIds: string[]
): Promise<Map<string, AvailabilityTimelineStats>> {
  const out = new Map<string, AvailabilityTimelineStats>();
  const unique = [...new Set(monitorIds.map(normMonitorId).filter((id) => id.length > 0))];
  if (unique.length === 0) return out;

  const now = Math.floor(Date.now() / 1000);
  const start24 = now - 86400;
  const start30 = now - THIRTY_DAYS_SEC;

  const sqlLast = `SELECT ts, ok, first_token_ms, http_status, error_message, probe_input, probe_output FROM probe_events WHERE monitor_id = ? ORDER BY ts DESC LIMIT 1`;
  const sqlRange = `SELECT SUM(ok) AS okc, COUNT(*) AS total FROM probe_events WHERE monitor_id = ? AND ts >= ?`;
  const sqlDaily = `SELECT (CAST((ts + 28800) / 43200 AS INTEGER) * 43200 - 28800) AS day_start,
              SUM(ok) AS okc,
              COUNT(*) AS cnt
       FROM probe_events WHERE monitor_id = ? AND ts >= ?
       GROUP BY day_start ORDER BY day_start ASC`;
  const sqlCount = `SELECT COUNT(*) AS c FROM probe_events WHERE monitor_id = ?`;

  async function fetchOne(monitorId: string): Promise<void> {
    const batchResults = await db.batch([
      db.prepare(sqlLast).bind(monitorId),
      db.prepare(sqlRange).bind(monitorId, start24),
      db.prepare(sqlRange).bind(monitorId, start30),
      db.prepare(sqlDaily).bind(monitorId, start30),
      db.prepare(sqlCount).bind(monitorId),
    ]);

    const lastProbe = batchResults[0].results?.[0] as LastProbeRow | undefined;
    const stats24 = batchResults[1].results?.[0] as { okc: number | null; total: number | null } | undefined;
    const stats30 = batchResults[2].results?.[0] as { okc: number | null; total: number | null } | undefined;
    const dailyRaw = batchResults[3].results ?? [];
    const countRow = batchResults[4].results?.[0] as { c: number | null } | undefined;

    out.set(monitorId, finalizeAvailabilityTimeline(lastProbe, stats24, stats30, dailyRaw, countRow));
  }

  for (let off = 0; off < unique.length; off += AV_STATS_PARALLEL_MONITORS) {
    const slice = unique.slice(off, off + AV_STATS_PARALLEL_MONITORS);
    await Promise.all(slice.map((id) => fetchOne(id)));
  }

  return out;
}

/** Timeline bucket: half-day slots aligned to Asia/Shanghai 00:00 and 12:00. */
export async function availabilityAndTimeline(
  db: D1Database,
  monitorId: string
): Promise<AvailabilityTimelineStats> {
  const id = normMonitorId(monitorId);
  const m = await availabilityAndTimelineBatch(db, [id]);
  return m.get(id) ?? finalizeAvailabilityTimeline(null, null, null, [], null);
}
