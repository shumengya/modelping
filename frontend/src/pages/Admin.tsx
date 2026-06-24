import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
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
import { MonitorCard } from "../components/MonitorCard";
import { useAppBoot } from "../context/AppBootContext";
import {
  clearAdminToken,
  getAdminToken,
  setAdminToken,
  type AdminMonitorRow,
  type MonitorProtocol,
} from "../types";

const INTERVALS = [1, 5, 10, 30, 60, 360] as const;
/** 管理页与首页一致：拉取最新监控与统计数据 */
const ADMIN_REFRESH_MS = 60_000;

const EMPTY_FORM = {
  display_name: "",
  api_base_url: "",
  api_key: "",
  model: "",
  protocol: "openai" as MonitorProtocol,
  category: "",
  enabled: true,
  probe_stream: true,
  show_on_dashboard: true,
};

type Row = AdminMonitorRow;

export function Admin() {
  const { signalBootReady } = useAppBoot();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [hasToken, setHasToken] = useState(() => !!getAdminToken());

  useEffect(() => {
    const sync = () => setHasToken(!!getAdminToken());
    window.addEventListener("modelping:admin-auth", sync);
    return () => window.removeEventListener("modelping:admin-auth", sync);
  }, []);
  const [urlVerifying, setUrlVerifying] = useState(false);
  const authAttempt = useRef(0);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [globalForm, setGlobalForm] = useState({
    probe_interval_minutes: 5 as (typeof INTERVALS)[number],
    probe_prompts: "",
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const monitorFormDlgRef = useRef<HTMLDialogElement>(null);

  const [form, setForm] = useState({ ...EMPTY_FORM });

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

  const refreshAllRef = useRef(refreshAll);
  refreshAllRef.current = refreshAll;

  useEffect(() => {
    if (!hasToken) return;
    const tick = () => {
      refreshAllRef.current();
    };
    const t = setInterval(tick, ADMIN_REFRESH_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [hasToken]);

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
        if (result.ok === true) {
          setAdminToken(tokenFromUrl);
          setHasToken(true);
        } else if (result.ok === false) {
          setMsg(null);
        }
      } catch {
        if (authAttempt.current === id) setMsg(null);
      } finally {
        if (authAttempt.current === id) {
          setUrlVerifying(false);
          if (getAdminToken()) {
            navigate("/admin", { replace: true });
          } else {
            navigate("/", { replace: true });
          }
        }
      }
    })();
  }, [searchParams, navigate]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!getAdminToken()) {
        if (!cancelled) {
          setRows([]);
        }
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
        if (!cancelled) {
          setRows([]);
          setMsg("加载失败，请重新使用带 token 的链接登录");
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [hasToken]);

  useEffect(() => {
    if (!urlVerifying && rows !== null) signalBootReady();
  }, [urlVerifying, rows, signalBootReady]);

  if (urlVerifying || !hasToken) {
    if (urlVerifying) return null;
    return <Navigate to="/" replace />;
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
        probe_stream: form.probe_stream,
        show_on_dashboard: form.show_on_dashboard,
      });
      setForm({ ...EMPTY_FORM });
      monitorFormDlgRef.current?.close();
      refreshAll();
      setMsg("已创建");
    } catch {
      setMsg("创建失败");
    }
  };

  const openNewMonitorModal = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    monitorFormDlgRef.current?.showModal();
  };

  const openEditMonitor = (r: Row) => {
    setEditing(r);
    setForm({
      display_name: r.display_name,
      api_base_url: r.api_base_url,
      api_key: "",
      model: r.model,
      protocol: r.protocol,
      category: r.category,
      enabled: r.enabled !== 0,
      probe_stream: r.probe_stream !== 0,
      show_on_dashboard: r.show_on_dashboard !== 0,
    });
    monitorFormDlgRef.current?.showModal();
  };

  const onMonitorFormDialogClose = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
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
        probe_stream: form.probe_stream,
        show_on_dashboard: form.show_on_dashboard,
      };
      if (form.api_key.trim()) patch.api_key = form.api_key.trim();
      await adminUpdateMonitor(editing.id, patch);
      monitorFormDlgRef.current?.close();
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

      <section className="admin-monitors-section">
        <div className="admin-monitors-head">
          <h2>监控列表</h2>
          <button type="button" className="btn primary" onClick={openNewMonitorModal}>
            新增监控
          </button>
        </div>
        <div className="card-grid admin-monitor-grid">
          {(rows ?? []).map((r) => {
            const bar = (
              <div className="card-admin-footer-inner">
                <button type="button" className="btn small" onClick={() => void adminRunMonitor(r.id).then(refreshAll)}>
                  立即探测
                </button>
                <button type="button" className="btn small" onClick={() => openEditMonitor(r)}>
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
            );
            return <MonitorCard key={r.id} m={r} footerExtra={bar} />;
          })}
        </div>
      </section>

      <dialog
        ref={monitorFormDlgRef}
        className="probe-detail-dialog admin-monitor-dialog"
        onClose={onMonitorFormDialogClose}
      >
        <div className="probe-detail-inner admin-monitor-dialog-inner">
          <header className="probe-detail-head">
            <h3 className="probe-detail-title">{editing ? "编辑监控" : "新建监控"}</h3>
            <button
              type="button"
              className="probe-detail-close"
              aria-label="关闭"
              onClick={() => monitorFormDlgRef.current?.close()}
            >
              ×
            </button>
          </header>
          <form className="admin-form admin-form--modal" onSubmit={editing ? saveEdit : submitNew}>
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
                checked={form.show_on_dashboard}
                onChange={(e) => setForm((f) => ({ ...f, show_on_dashboard: e.target.checked }))}
              />
              在首页展示该监控卡片（关闭则仅后台可见，仍参与定时探测）
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.probe_stream}
                onChange={(e) => setForm((f) => ({ ...f, probe_stream: e.target.checked }))}
              />
              使用流式调用（SSE）；关闭则为非流式 JSON，首包耗时为整段响应完成时间
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
              <button type="button" className="btn ghost" onClick={() => monitorFormDlgRef.current?.close()}>
                取消
              </button>
              <button type="submit" className="btn primary">
                {editing ? "保存" : "创建"}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </div>
  );
}
