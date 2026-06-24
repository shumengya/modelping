import { decryptSecret, encryptSecret } from "./crypto";
import {
  deleteMonitor,
  getAppSettings,
  getMonitor,
  insertMonitor,
  insertProbeEvent,
  listDueMonitors,
  pruneProbeEvents,
  updateMonitorMeta,
  updateMonitorRunTimes,
} from "./db";
import { runProbe } from "./probe";

const PROBE_ERROR_MAX = 8000;
const PROBE_IO_FIELD_MAX = 6000;

const DEFAULT_PROBE_PROMPTS = ["你好", "hello", "ping", "Hi", "测试一下"];

function parseProbePromptsConfig(raw: string): string[] {
  const lines = raw.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 0);
  return lines.length > 0 ? lines : DEFAULT_PROBE_PROMPTS;
}

function pickProbeUserMessage(raw: string): string {
  const list = parseProbePromptsConfig(raw);
  const u = new Uint32Array(1);
  crypto.getRandomValues(u);
  return list[u[0]! % list.length]!;
}

function truncateProbeError(s: string): string {
  if (s.length <= PROBE_ERROR_MAX) return s;
  return s.slice(0, PROBE_ERROR_MAX);
}

function truncateIo(s: string | null): string | null {
  if (s == null) return null;
  if (s.length <= PROBE_IO_FIELD_MAX) return s;
  return s.slice(0, PROBE_IO_FIELD_MAX) + "…";
}

export type RunSingleProbeOutcome = { success: true } | { success: false; error: string };

export async function runScheduled(env: Env): Promise<void> {
  const db = env.DB;
  try {
    await pruneProbeEvents(db);
  } catch {
    /* ignore */
  }
  const nowSec = Math.floor(Date.now() / 1000);
  let due: Awaited<ReturnType<typeof listDueMonitors>>;
  try {
    due = await listDueMonitors(db, nowSec);
  } catch {
    return;
  }
  for (const m of due) {
    try {
      await runSingleProbe(env, m.id, db, nowSec);
    } catch {
      /* runSingleProbe should not throw; defensive for unexpected runtime errors */
    }
  }
}

export async function runSingleProbe(
  env: Env,
  monitorId: string,
  db: D1Database,
  nowSec: number
): Promise<RunSingleProbeOutcome> {
  const m = await getMonitor(db, monitorId);
  if (!m || !m.enabled) return { success: true };

  let settings: Awaited<ReturnType<typeof getAppSettings>>;
  try {
    settings = await getAppSettings(db);
  } catch {
    return { success: false, error: "app_settings_unavailable" };
  }

  const userMsg = pickProbeUserMessage(settings.probe_prompts ?? "");
  const intervalMin = settings.probe_interval_minutes;

  const advanceSchedule = async () => {
    try {
      const nextRun = nowSec + intervalMin * 60;
      await updateMonitorRunTimes(db, m.id, nowSec, nextRun);
    } catch {
      /* ignore */
    }
  };

  const recordInfrastructureFailure = async (errorMessage: string) => {
    try {
      await insertProbeEvent(db, {
        monitor_id: m.id,
        ts: nowSec,
        ok: 0,
        first_token_ms: null,
        http_status: null,
        error_message: truncateProbeError(errorMessage),
        probe_input: truncateIo(userMsg),
        probe_output: null,
      });
    } catch {
      /* ignore */
    }
    await advanceSchedule();
  };

  try {
    const apiKey = await decryptSecret(m.api_key_ciphertext, m.api_key_nonce, env);
    const result = await runProbe({
      apiBaseUrl: m.api_base_url,
      apiKey,
      model: m.model,
      protocol: m.protocol,
      userMessage: userMsg,
      stream: m.probe_stream !== 0,
    });
    try {
      await insertProbeEvent(db, {
        monitor_id: m.id,
        ts: nowSec,
        ok: result.ok ? 1 : 0,
        first_token_ms: result.firstTokenMs,
        http_status: result.httpStatus,
        error_message: result.errorMessage ? truncateProbeError(result.errorMessage) : null,
        probe_input: truncateIo(result.requestMessage),
        probe_output: truncateIo(result.responseText),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await advanceSchedule();
      return { success: false, error: msg };
    }
    await advanceSchedule();
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordInfrastructureFailure(msg);
    return { success: false, error: msg };
  }
}

export async function createMonitorFromPayload(
  env: Env,
  db: D1Database,
  body: {
    display_name: string;
    api_base_url: string;
    api_key: string;
    model: string;
    protocol: "openai" | "openai_responses" | "claude";
    category?: string;
    enabled?: boolean;
    /** 未传时默认流式 */
    probe_stream?: boolean;
    /** 未传时默认在首页展示 */
    show_on_dashboard?: boolean;
  }
): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  const nowSec = Math.floor(Date.now() / 1000);
  const { ciphertext, nonce } = await encryptSecret(body.api_key, env);
  const nonceCopy = new Uint8Array(nonce);
  await insertMonitor(db, {
    id,
    display_name: body.display_name.trim(),
    api_base_url: body.api_base_url.trim(),
    model: body.model.trim(),
    protocol: body.protocol,
    enabled: body.enabled === false ? 0 : 1,
    category: (body.category ?? "").trim(),
    created_at: nowSec,
    api_key_ciphertext: ciphertext,
    api_key_nonce: nonceCopy.buffer.slice(nonceCopy.byteOffset, nonceCopy.byteOffset + nonceCopy.byteLength),
    last_run_at: null,
    next_run_at: nowSec,
    probe_stream: body.probe_stream === false ? 0 : 1,
    show_on_dashboard: body.show_on_dashboard === false ? 0 : 1,
  });
  return { id };
}

export async function updateMonitorFromPayload(
  env: Env,
  db: D1Database,
  id: string,
  body: Partial<{
    display_name: string;
    api_base_url: string;
    api_key: string;
    model: string;
    protocol: "openai" | "openai_responses" | "claude";
    category: string;
    enabled: boolean;
    probe_stream: boolean;
    show_on_dashboard: boolean;
  }>
): Promise<boolean> {
  const cur = await getMonitor(db, id);
  if (!cur) return false;
  let ciphertext = cur.api_key_ciphertext as ArrayBuffer;
  let nonceBuf = cur.api_key_nonce as ArrayBuffer;
  if (body.api_key != null && body.api_key !== "") {
    const enc = await encryptSecret(body.api_key, env);
    const nc = new Uint8Array(enc.nonce);
    ciphertext = enc.ciphertext;
    nonceBuf = nc.buffer.slice(nc.byteOffset, nc.byteOffset + nc.byteLength);
  }
  const nowSec = Math.floor(Date.now() / 1000);
  await updateMonitorMeta(db, id, {
    display_name: body.display_name?.trim() ?? cur.display_name,
    api_base_url: body.api_base_url?.trim() ?? cur.api_base_url,
    model: body.model?.trim() ?? cur.model,
    protocol: body.protocol ?? cur.protocol,
    category: body.category !== undefined ? body.category.trim() : cur.category,
    enabled: body.enabled != null ? (body.enabled ? 1 : 0) : cur.enabled,
    api_key_ciphertext: ciphertext,
    api_key_nonce: nonceBuf,
    next_run_at: nowSec,
    probe_stream:
      body.probe_stream !== undefined ? (body.probe_stream ? 1 : 0) : cur.probe_stream,
    show_on_dashboard:
      body.show_on_dashboard !== undefined
        ? (body.show_on_dashboard ? 1 : 0)
        : cur.show_on_dashboard,
  });
  return true;
}

export { deleteMonitor };
