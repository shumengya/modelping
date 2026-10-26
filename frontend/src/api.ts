import axios, { type AxiosResponse } from "axios";
import type { GlobalProbeSettings, MonitorDto, MonitorProtocol, WorkerLocation } from "./types";
import { getAdminToken } from "./types";

/** 与原 fetch 语义一致：任何 HTTP 状态都不抛错，由调用方按状态码处理；仅网络层失败才抛错。 */
const http = axios.create({ validateStatus: () => true });

/** 绕过浏览器 HTTP 缓存（等价于 fetch 的 cache: "no-store"）。 */
const NO_STORE = { adapter: "fetch", fetchOptions: { cache: "no-store" } } as const;

const isOkStatus = (status: number): boolean => status >= 200 && status < 300;
const isOk = (r: AxiosResponse): boolean => isOkStatus(r.status);

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function requireToken(): string {
  const t = getAdminToken();
  if (!t) throw new Error("no_token");
  return t;
}

type ErrorBody = { error?: string; message?: string; ok?: boolean };

function asErrorBody(data: unknown): ErrorBody {
  return data !== null && typeof data === "object" ? (data as ErrorBody) : {};
}

function saveFailedMessage(r: AxiosResponse): string {
  const body = asErrorBody(r.data);
  const parts = [typeof body.error === "string" ? body.error : null, typeof body.message === "string" ? body.message : null]
    .filter(Boolean)
    .join(": ");
  return parts || `保存失败（HTTP ${r.status}）`;
}

/** index.html 内联脚本提前发出的首页数据请求；超过这个时长就认为太旧，重新请求 */
const EARLY_MONITORS_MAX_AGE_MS = 30_000;

declare global {
  interface Window {
    __earlyMonitors?: { at: number; promise: Promise<MonitorDto[]> };
  }
}

/** 取走（只取一次）index.html 提前发出的请求结果；不可用或失败时返回 null，由调用方走常规请求 */
async function takeEarlyMonitors(): Promise<MonitorDto[] | null> {
  const early = window.__earlyMonitors;
  window.__earlyMonitors = undefined;
  if (!early || Date.now() - early.at > EARLY_MONITORS_MAX_AGE_MS) return null;
  try {
    return await early.promise;
  } catch {
    return null;
  }
}

export async function fetchMonitors(): Promise<MonitorDto[]> {
  const early = await takeEarlyMonitors();
  if (early) return early;
  const r = await http.get<MonitorDto[]>("/api/monitors", NO_STORE);
  if (!isOk(r)) throw new Error("failed_to_load");
  return r.data;
}

/** 处理本次请求的 Cloudflare 数据中心；拿不到时返回 null，界面直接不显示。 */
export async function fetchWorkerLocation(): Promise<WorkerLocation | null> {
  const r = await http.get<WorkerLocation>("/api/location", NO_STORE);
  if (!isOk(r) || !r.data?.colo) return null;
  return r.data;
}

/** 随机背景图服务返回的图片地址；失败时返回 null。 */
export async function fetchRandBgJson(url: string): Promise<string | null> {
  const r = await axios.get<{ url?: string }>(url, { ...NO_STORE, validateStatus: isOkStatus });
  const u = typeof r.data?.url === "string" ? r.data.url.trim() : "";
  return u || null;
}

export type AdminPingResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "unauthorized" | "network" };

export async function adminPing(token: string): Promise<AdminPingResult> {
  try {
    const r = await http.get("/api/admin/ping", { headers: bearer(token.trim()) });
    if (isOk(r)) return { ok: true };
    if (r.status === 503) return { ok: false, reason: "not_configured" };
    return { ok: false, reason: "unauthorized" };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export async function adminListMonitors(): Promise<MonitorDto[]> {
  const r = await http.get<MonitorDto[]>("/api/admin/monitors", { ...NO_STORE, headers: bearer(requireToken()) });
  if (!isOk(r)) throw new Error("admin_list_failed");
  return r.data;
}

export async function adminGetProbeSettings(): Promise<GlobalProbeSettings> {
  const r = await http.get<GlobalProbeSettings>("/api/admin/probe-settings", { headers: bearer(requireToken()) });
  if (!isOk(r)) throw new Error("settings_load_failed");
  return r.data;
}

export async function adminSaveProbeSettings(patch: Partial<GlobalProbeSettings>): Promise<void> {
  const r = await http.put("/api/admin/probe-settings", patch, { headers: bearer(requireToken()) });
  if (!isOk(r)) throw new Error(saveFailedMessage(r));
}

type CreateBody = {
  display_name: string;
  api_base_url: string;
  api_key: string;
  model: string;
  protocol: MonitorProtocol;
  category?: string;
  enabled?: boolean;
  probe_stream?: boolean;
  show_on_dashboard?: boolean;
};

export async function adminCreateMonitor(body: CreateBody): Promise<string> {
  const r = await http.post<{ id: string }>("/api/admin/monitors", body, { headers: bearer(requireToken()) });
  if (!isOk(r)) throw new Error("create_failed");
  return r.data.id;
}

export async function adminUpdateMonitor(
  id: string,
  patch: Partial<CreateBody> & { api_key?: string }
): Promise<void> {
  const r = await http.put(`/api/admin/monitors/${id}`, patch, { headers: bearer(requireToken()) });
  if (!isOk(r)) throw new Error(saveFailedMessage(r));
}

export async function adminDeleteMonitor(id: string): Promise<void> {
  const r = await http.delete(`/api/admin/monitors/${id}`, { headers: bearer(requireToken()) });
  if (!isOk(r)) throw new Error("delete_failed");
}

export async function adminRunMonitor(id: string): Promise<void> {
  const r = await http.post(`/api/admin/monitors/${id}/run`, undefined, { headers: bearer(requireToken()) });
  const body = asErrorBody(r.data);
  const failure = typeof body.error === "string" && body.error ? body.error : "run_failed";
  if (!isOk(r) || body.ok === false) throw new Error(failure);
}
