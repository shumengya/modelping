export type MonitorProtocol = "openai" | "openai_responses" | "claude";

export type MonitorDto = {
  id: string;
  display_name: string;
  api_base_url: string;
  model: string;
  protocol: MonitorProtocol;
  interval_minutes: number;
  enabled: number;
  category: string;
  created_at: number;
  last_run_at: number | null;
  next_run_at: number;
  availability24h: number | null;
  availability30d: number | null;
  probe_count: number;
  lastProbe: {
    ts: number;
    ok: number;
    first_token_ms: number | null;
    http_status: number | null;
    error_message: string | null;
    probe_input: string | null;
    probe_output: string | null;
  } | null;
  timelineDaily: Array<{ t: number; up: boolean; ratio: number }>;
};

/** 管理后台列表（无统计字段；interval_minutes 为全站统一值） */
export type AdminMonitorRow = Pick<
  MonitorDto,
  | "id"
  | "display_name"
  | "api_base_url"
  | "model"
  | "protocol"
  | "interval_minutes"
  | "enabled"
  | "category"
  | "created_at"
  | "last_run_at"
  | "next_run_at"
>;

/** /api/admin/probe-settings 与后台表单 */
export type GlobalProbeSettings = {
  probe_interval_minutes: number;
  probe_prompts: string;
};

export const ADMIN_TOKEN_KEY = "modelping_admin_token";

export function getAdminToken(): string | null {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}
