import type { AdminMonitorRow, GlobalProbeSettings, MonitorDto, MonitorProtocol } from "./types";
import { getAdminToken } from "./types";

export async function fetchMonitors(): Promise<MonitorDto[]> {
  const r = await fetch("/api/monitors");
  if (!r.ok) throw new Error("failed_to_load");
  return r.json() as Promise<MonitorDto[]>;
}

export type AdminPingResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "unauthorized" | "network" };

export async function adminPing(token: string): Promise<AdminPingResult> {
  try {
    const r = await fetch("/api/admin/ping", {
      headers: { Authorization: `Bearer ${token.trim()}` },
    });
    if (r.ok) return { ok: true };
    if (r.status === 503) return { ok: false, reason: "not_configured" };
    return { ok: false, reason: "unauthorized" };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export async function adminListMonitors(): Promise<AdminMonitorRow[]> {
  const t = getAdminToken();
  if (!t) throw new Error("no_token");
  const r = await fetch("/api/admin/monitors", { headers: { Authorization: `Bearer ${t}` } });
  if (!r.ok) throw new Error("admin_list_failed");
  return r.json();
}

export async function adminGetProbeSettings(): Promise<GlobalProbeSettings> {
  const t = getAdminToken();
  if (!t) throw new Error("no_token");
  const r = await fetch("/api/admin/probe-settings", { headers: { Authorization: `Bearer ${t}` } });
  if (!r.ok) throw new Error("settings_load_failed");
  return r.json() as Promise<GlobalProbeSettings>;
}

export async function adminSaveProbeSettings(patch: Partial<GlobalProbeSettings>): Promise<void> {
  const t = getAdminToken();
  if (!t) throw new Error("no_token");
  const r = await fetch("/api/admin/probe-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
    body: JSON.stringify(patch),
  });
  let body: { error?: string; message?: string } = {};
  try {
    body = (await r.json()) as { error?: string; message?: string };
  } catch {
    /* ignore */
  }
  if (!r.ok) {
    const parts = [typeof body.error === "string" ? body.error : null, typeof body.message === "string" ? body.message : null]
      .filter(Boolean)
      .join(": ");
    throw new Error(parts || `保存失败（HTTP ${r.status}）`);
  }
}

type CreateBody = {
  display_name: string;
  api_base_url: string;
  api_key: string;
  model: string;
  protocol: MonitorProtocol;
  category?: string;
  enabled?: boolean;
};

export async function adminCreateMonitor(body: CreateBody): Promise<string> {
  const t = getAdminToken();
  if (!t) throw new Error("no_token");
  const r = await fetch("/api/admin/monitors", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("create_failed");
  const j = (await r.json()) as { id: string };
  return j.id;
}

export async function adminUpdateMonitor(
  id: string,
  patch: Partial<CreateBody> & { api_key?: string }
): Promise<void> {
  const t = getAdminToken();
  if (!t) throw new Error("no_token");
  const r = await fetch(`/api/admin/monitors/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
    body: JSON.stringify(patch),
  });
  let body: { error?: string; message?: string } = {};
  try {
    body = (await r.json()) as { error?: string; message?: string };
  } catch {
    /* ignore */
  }
  if (!r.ok) {
    const parts = [typeof body.error === "string" ? body.error : null, typeof body.message === "string" ? body.message : null]
      .filter(Boolean)
      .join(": ");
    throw new Error(parts || `保存失败（HTTP ${r.status}）`);
  }
}

export async function adminDeleteMonitor(id: string): Promise<void> {
  const t = getAdminToken();
  if (!t) throw new Error("no_token");
  const r = await fetch(`/api/admin/monitors/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${t}` },
  });
  if (!r.ok) throw new Error("delete_failed");
}

export async function adminRunMonitor(id: string): Promise<void> {
  const t = getAdminToken();
  if (!t) throw new Error("no_token");
  const r = await fetch(`/api/admin/monitors/${id}/run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}` },
  });
  let body: { ok?: boolean; error?: string } = {};
  try {
    body = (await r.json()) as { ok?: boolean; error?: string };
  } catch {
    /* ignore */
  }
  if (!r.ok) {
    const msg = typeof body.error === "string" && body.error ? body.error : "run_failed";
    throw new Error(msg);
  }
  if (body.ok === false) {
    throw new Error(typeof body.error === "string" && body.error ? body.error : "run_failed");
  }
}
