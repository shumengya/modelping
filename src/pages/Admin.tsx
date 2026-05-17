import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  adminCreateMonitor,
  adminDeleteMonitor,
  adminGetProbeSettings,
  adminListMonitors,
  adminPing,
  adminRunMonitor,
  adminSaveProbeSettings,
  adminUpdateMonitor,
} from "../api";
import {
  clearAdminToken,
  getAdminToken,
  setAdminToken,
  type AdminMonitorRow,
  type MonitorProtocol,
} from "../types";

const INTERVALS = [1, 5, 10, 30, 60, 360] as const;

type Row = AdminMonitorRow;

export function Admin() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [hasToken, setHasToken] = useState(() => !!getAdminToken());
  const [urlVerifying, setUrlVerifying] = useState(false);
  const authAttempt = useRef(0);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [globalForm, setGlobalForm] = useState({
    probe_interval_minutes: 5 as (typeof INTERVALS)[number],
    probe_prompts: "",
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);

  const [form, setForm] = useState({
    display_name: "",
    api_base_url: "",
    api_key: "",
    model: "",
    protocol: "openai" as MonitorProtocol,
    category: "",
    enabled: true,
  });

  const refreshAll = () => {
    if (!getAdminToken()) {
      setRows([]);
      return;
    }
    void Promise.all([adminListMonitors(), adminGetProbeSettings()])
      .then(([list, g]) => {
        setRows(list);
        setGlobalForm({
          probe_interval_minutes: g.probe_interval_minutes as (typeof INTERVALS)[number],
          probe_prompts: g.probe_prompts,
        });
        setMsg(null);
      })
      .catch(() => setMsg("加载失败，请重新使用带 token 的链接登录"));
  };

  /** 从 /admin?token=xxx 登录：校验后写入 sessionStorage 并去掉地址栏参数 */
  useEffect(() => {
    const raw = searchParams.get("token");
    const tokenFromUrl = typeof raw === "string" ? raw.trim() : "";
    if (!tokenFromUrl) return;

    const id = ++authAttempt.current;
    queueMicrotask(() => {
      if (authAttempt.current !== id) return;
      setUrlVerifying(true);
      setMsg(null);
    });

    void (async () => {
      try {
        const result = await adminPing(tokenFromUrl);
        if (authAttempt.current !== id) return;
        if (result.ok) {
          setAdminToken(tokenFromUrl);
          setHasToken(true);
        } else {
          const copy: Record<typeof result.reason, string> = {
            not_configured:
              "服务端未配置 ADMIN_TOKEN：本地检查 .dev.vars 是否生效并已重启 dev；线上请执行 npx wrangler secret put ADMIN_TOKEN。",
            unauthorized:
              "Token 校验失败：请确认 URL 中的 token 与 ADMIN_TOKEN 完全一致（线上 .dev.vars 不会自动同步，必须单独设 Secret）。",
            network:
              "无法访问 /api/admin/ping：请用 npm run dev 启动（需 Cloudflare Vite 插件带起 Worker），或确认部署站点与 API 同域。",
          };
          setMsg(copy[result.reason]);
        }
      } catch {
        if (authAttempt.current === id) {
          setMsg("无法校验 token，请确认已用 npm run dev 或已部署 Worker");
        }
      } finally {
        if (authAttempt.current === id) {
          setUrlVerifying(false);
          navigate("/admin", { replace: true });
        }
      }
    })();
  }, [searchParams, navigate]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!getAdminToken()) {
        if (!cancelled) setRows([]);
        return;
      }
      try {
        const [list, g] = await Promise.all([adminListMonitors(), adminGetProbeSettings()]);
        if (!cancelled) {
          setRows(list);
          setGlobalForm({
            probe_interval_minutes: g.probe_interval_minutes as (typeof INTERVALS)[number],
            probe_prompts: g.probe_prompts,
          });
          setMsg(null);
        }
      } catch {
        if (!cancelled) setMsg("加载失败，请重新使用带 token 的链接登录");
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [hasToken]);

  if (urlVerifying) {
    return (
      <div className="page admin">
        <p className="muted">正在验证地址中的 token…</p>
      </div>
    );
  }

  if (!hasToken) {
    return (
      <div className="page admin">
        {msg ? <p className="banner error">{msg}</p> : null}
        <p className="muted">请通过带查询参数 <code>token</code> 的地址进入管理后台，例如：</p>
        <p>
          <code className="admin-code-sample">/admin?token=你的ADMIN_TOKEN</code>
        </p>
        <p className="muted small">
          本地默认可与 <code>.dev.vars</code> 中 <code>ADMIN_TOKEN</code> 一致（示例 <code>shumengya520</code>
          ）。验证成功后 token 会保存在当前浏览器会话，并自动去掉地址栏里的 token。
        </p>
        <Link to="/">返回面板</Link>
      </div>
    );
  }

  const saveGlobal = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await adminSaveProbeSettings({
        probe_interval_minutes: globalForm.probe_interval_minutes,
        probe_prompts: globalForm.probe_prompts,
      });
      refreshAll();
      setMsg("全局设置已保存（对所有监控生效）");
    } catch (err) {
      setMsg(err instanceof Error && err.message ? err.message : "全局设置保存失败");
    }
  };

  const submitNew = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await adminCreateMonitor({
        display_name: form.display_name,
        api_base_url: form.api_base_url,
        api_key: form.api_key,
        model: form.model,
        protocol: form.protocol,
        category: form.category || undefined,
        enabled: form.enabled,
      });
      setForm({
        display_name: "",
        api_base_url: "",
        api_key: "",
        model: "",
        protocol: "openai",
        category: "",
        enabled: true,
      });
      refreshAll();
      setMsg("已创建");
    } catch {
      setMsg("创建失败");
    }
  };

  const startEdit = (r: Row) => {
    setEditing(r);
    setForm({
      display_name: r.display_name,
      api_base_url: r.api_base_url,
      api_key: "",
      model: r.model,
      protocol: r.protocol,
      category: r.category,
      enabled: r.enabled !== 0,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setMsg(null);
    try {
      const patch: Parameters<typeof adminUpdateMonitor>[1] = {
        display_name: form.display_name,
        api_base_url: form.api_base_url,
        model: form.model,
        protocol: form.protocol,
        category: form.category,
        enabled: form.enabled,
      };
      if (form.api_key.trim()) patch.api_key = form.api_key.trim();
      await adminUpdateMonitor(editing.id, patch);
      setEditing(null);
      setForm({
        display_name: "",
        api_base_url: "",
        api_key: "",
        model: "",
        protocol: "openai",
        category: "",
        enabled: true,
      });
      refreshAll();
      setMsg("已保存");
    } catch (e) {
      setMsg(e instanceof Error && e.message ? e.message : "保存失败");
    }
  };

  const logout = () => {
    clearAdminToken();
    setHasToken(false);
    setRows([]);
    navigate("/admin", { replace: true });
  };

  return (
    <div className="page admin">
      <div className="admin-actions-bar">
        <button type="button" className="btn ghost" onClick={logout}>
          退出管理
        </button>
      </div>

      {msg ? <p className="banner">{msg}</p> : null}

      <section className="admin-form-section">
        <h2>全局设置</h2>
        <form className="admin-form" onSubmit={saveGlobal}>
          <label>
            探测间隔
            <select
              value={globalForm.probe_interval_minutes}
              onChange={(e) =>
                setGlobalForm((f) => ({
                  ...f,
                  probe_interval_minutes: Number(e.target.value) as (typeof INTERVALS)[number],
                }))
              }
            >
              {INTERVALS.map((n) => (
                <option key={n} value={n}>
                  {n === 60 ? "1小时" : n === 360 ? "6小时" : `${n}分钟`}
                </option>
              ))}
            </select>
          </label>
          <label>
            探测用语
            <textarea
              rows={4}
              placeholder={"你好\nhello\nping"}
              value={globalForm.probe_prompts}
              onChange={(e) => setGlobalForm((f) => ({ ...f, probe_prompts: e.target.value }))}
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn primary">
              保存全局设置
            </button>
          </div>
        </form>
      </section>

      <section className="admin-form-section">
        <h2>{editing ? "编辑监控" : "新建监控"}</h2>
        <form className="admin-form" onSubmit={editing ? saveEdit : submitNew}>
          <label>
            显示名称
            <input
              required
              value={form.display_name}
              onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
            />
          </label>
          <label>
            API 根地址（如 https://api.openai.com/v1）
            <input
              required
              value={form.api_base_url}
              onChange={(e) => setForm((f) => ({ ...f, api_base_url: e.target.value }))}
            />
          </label>
          <label>
            API Key {editing ? "（留空则不变）" : null}
            <input
              required={!editing}
              type="password"
              autoComplete="off"
              value={form.api_key}
              onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
            />
          </label>
          <label>
            模型名
            <input required value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} />
          </label>
          <label>
            协议
            <select
              value={form.protocol}
              onChange={(e) =>
                setForm((f) => ({ ...f, protocol: e.target.value as MonitorProtocol }))
              }
            >
              <option value="openai">OpenAI Chat Completions（/v1/chat/completions）</option>
              <option value="openai_responses">OpenAI Responses（/v1/responses）</option>
              <option value="claude">Anthropic（/messages）</option>
            </select>
          </label>
          <label>
            分类（可选）
            <input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            />
            启用
          </label>
          <div className="form-actions">
            {editing ? (
              <button type="button" className="btn ghost" onClick={() => setEditing(null)}>
                取消编辑
              </button>
            ) : null}
            <button type="submit" className="btn primary">
              {editing ? "保存" : "创建"}
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2>监控列表</h2>
        {!rows ? <p className="muted">加载中…</p> : null}
        <ul className="admin-list">
          {(rows ?? []).map((r) => (
            <li key={r.id} className="admin-row">
              <div>
                <strong>{r.display_name}</strong>
                <span className="muted small">
                  {" "}
                  · {r.model} · {r.protocol} · 每 {r.interval_minutes} 分钟 · {r.enabled ? "开" : "停"}
                </span>
              </div>
              <div className="admin-row-actions">
                <button type="button" className="btn small" onClick={() => void adminRunMonitor(r.id).then(refreshAll)}>
                  立即探测
                </button>
                <button type="button" className="btn small" onClick={() => startEdit(r)}>
                  编辑
                </button>
                <button
                  type="button"
                  className="btn small danger"
                  onClick={() => {
                    if (confirm("确定删除？")) void adminDeleteMonitor(r.id).then(refreshAll);
                  }}
                >
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
