import { useRef } from "react";
import type { MonitorDto } from "../types";

function formatPct(v: number | null): string {
  if (v == null) return "—";
  return `${v.toFixed(2)}%`;
}

function protocolLabel(p: MonitorDto["protocol"]): string {
  if (p === "claude") return "Anthropic（/messages）";
  if (p === "openai_responses") return "OpenAI Responses（/v1/responses）";
  return "OpenAI Chat Completions（/v1/chat/completions）";
}

/** 与详情弹窗一致风格：2026年5月17日 19:42:45 */
function formatLastProbeTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function MonitorCard({ m }: { m: MonitorDto }) {
  const dlgRef = useRef<HTMLDialogElement>(null);
  const ok = m.lastProbe?.ok === 1;
  const ft = m.lastProbe?.first_token_ms;
  const st = m.lastProbe?.http_status;
  const pct30 = m.availability30d;
  const probe = m.lastProbe;

  const openDetail = () => dlgRef.current?.showModal();
  const closeDetail = () => dlgRef.current?.close();

  return (
    <article className="card">
      <header className="card-head">
        <div className="card-title-row">
          <div>
            <h2 className="card-name">{m.display_name}</h2>
            <p className="card-sub">
              {m.model} · {protocolLabel(m.protocol)}
              {m.category ? ` · ${m.category}` : ""}
            </p>
          </div>
        </div>
        <div className="card-head-right">
          <span className={`badge ${ok ? "badge-ok" : "badge-bad"}`}>
            {ok ? "运行正常" : m.lastProbe ? "异常" : "尚无数据"}
          </span>
          <button type="button" className="btn-detail" onClick={openDetail}>
            详情
          </button>
        </div>
      </header>

      <div className="timeline" role="img" aria-label="最近30天每日可用简图">
        {m.timelineDaily.length === 0 ? (
          <div className="timeline-empty">暂无历史条形数据</div>
        ) : (
          m.timelineDaily.map((d) => (
            <span
              key={d.t}
              className={`tl-seg ${d.up ? "tl-up" : "tl-down"}`}
              title={`${new Date(d.t * 1000).toLocaleDateString()} · ${(d.ratio * 100).toFixed(0)}%`}
            />
          ))
        )}
      </div>

      <div className="card-mid">
        <span>30 天前</span>
        <strong>{formatPct(pct30)} 可用率</strong>
        <span>今天</span>
      </div>

      <footer className="card-foot">
        <span>状态 {st != null ? st : "—"}</span>
        <span>首字延迟 {ft != null ? `${ft} ms` : "—"}</span>
        <span>24h {formatPct(m.availability24h)}</span>
        <div className="card-foot-probe-time">
          <span className="card-foot-probe-label">探测时间</span>
          <span className="card-foot-probe-value">
            {probe ? formatLastProbeTime(probe.ts) : "—"}
          </span>
        </div>
        <span className="card-foot-wide">
          探测次数 <strong className="card-foot-count">{m.probe_count}</strong>
        </span>
      </footer>

      <dialog ref={dlgRef} className="probe-detail-dialog">
        <div className="probe-detail-inner">
          <header className="probe-detail-head">
            <h3 className="probe-detail-title">最近探测详情</h3>
            <button type="button" className="probe-detail-close" aria-label="关闭" onClick={closeDetail}>
              ×
            </button>
          </header>
          <div className="probe-detail-body">
            <dl className="probe-detail-dl">
              <dt>显示名称</dt>
              <dd>{m.display_name}</dd>
              <dt>协议</dt>
              <dd>{protocolLabel(m.protocol)}</dd>
              <dt>模型</dt>
              <dd>{m.model}</dd>
              <dt>API 根地址</dt>
              <dd>
                <code className="probe-detail-code">{m.api_base_url}</code>
                <div className="probe-detail-link-wrap">
                  <a href={m.api_base_url} target="_blank" rel="noreferrer">
                    在浏览器中打开
                  </a>
                </div>
              </dd>
              <dt>探测时间</dt>
              <dd>
                {probe
                  ? new Date(probe.ts * 1000).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "medium",
                    })
                  : "—"}
              </dd>
              <dt>结果</dt>
              <dd>{probe ? (probe.ok === 1 ? "成功" : "失败") : "尚无记录"}</dd>
              <dt>HTTP 状态</dt>
              <dd>{probe?.http_status != null ? probe.http_status : "—"}</dd>
              <dt>首字延迟</dt>
              <dd>{probe?.first_token_ms != null ? `${probe.first_token_ms} ms` : "—"}</dd>
            </dl>
            {probe?.error_message ? (
              <div className="probe-detail-error">
                <strong>错误信息</strong>
                <pre className="probe-detail-pre">{probe.error_message}</pre>
              </div>
            ) : null}
            {probe ? (
              <div className="probe-detail-io">
                <strong>输入（本次请求发送的用户消息）</strong>
                <pre className="probe-detail-io-pre">{probe.probe_input ?? "—"}</pre>
                <strong>输出（模型流式正文摘要，最长约数千字）</strong>
                <pre className="probe-detail-io-pre probe-detail-io-out">
                  {probe.probe_output ?? "—"}
                </pre>
              </div>
            ) : null}
          </div>
        </div>
      </dialog>
    </article>
  );
}
