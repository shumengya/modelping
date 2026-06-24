import { useRef, type ReactNode } from "react";
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

/** 卡片上下两行：模型一行，协议一行 */
function protocolCardLines(p: MonitorDto["protocol"]): { name: string; path: string } {
  if (p === "claude") return { name: "Anthropic", path: "（/messages）" };
  if (p === "openai_responses") return { name: "OpenAI Responses", path: "（/v1/responses）" };
  return { name: "OpenAI Chat Completions", path: "（/v1/chat/completions）" };
}

function httpStatusValueClass(st: number | undefined | null): string {
  if (st == null) return "card-metric-value card-metric-value-muted";
  if (st >= 200 && st < 300) return "card-metric-value card-accent-http-ok";
  if (st >= 300 && st < 400) return "card-metric-value card-accent-http-info";
  if (st >= 400 && st < 500) return "card-metric-value card-accent-http-client";
  if (st >= 500) return "card-metric-value card-accent-http-server";
  return "card-metric-value";
}

function latencyValueClass(ms: number | undefined | null): string {
  if (ms == null) return "card-metric-value card-metric-value-muted";
  if (ms < 500) return "card-metric-value card-accent-latency-good";
  if (ms < 1500) return "card-metric-value card-accent-latency-mid";
  return "card-metric-value card-accent-latency-slow";
}

/** 与「可用率」色带一致，用于 24h 与卡片中部大字 */
function pctAccentClass(pct: number | null): string {
  if (pct == null) return "card-metric-value-muted";
  if (pct >= 99) return "card-accent-pct-high";
  if (pct >= 95) return "card-accent-pct-mid";
  if (pct >= 90) return "card-accent-pct-low";
  return "card-accent-pct-critical";
}

function availabilityValueClass(pct: number | null): string {
  return `card-metric-value ${pctAccentClass(pct)}`;
}

/** 时间条桶为上海时区 00–12 / 12–24（与 Worker 一致） */
const TIMELINE_SHANGHAI_OFF = 8 * 3600;
const HALF_DAY_SEC = 43200;

/** 当前时刻在上海时区属于上午还是下午（与时间条最右一格一致） */
function shanghaiAmPmNow(): "上午" | "下午" {
  const nowSec = Math.floor(Date.now() / 1000);
  const L = nowSec + TIMELINE_SHANGHAI_OFF;
  const secInDay = ((L % 86400) + 86400) % 86400;
  return secInDay < HALF_DAY_SEC ? "上午" : "下午";
}

function formatTimelineSlotLabel(t: number): string {
  const half = (t + TIMELINE_SHANGHAI_OFF) % 86400 === 0 ? "上午" : "下午";
  const dateStr = new Date(t * 1000).toLocaleDateString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
  });
  return `${dateStr} ${half}`;
}

/** 时间条：无数据灰、全成功绿、部分成功黄、全失败红 */
function timelineSegTone(d: MonitorDto["timelineDaily"][number]): "none" | "up" | "warn" | "down" {
  if (d.hasData === false) return "none";
  if (d.up) return "up";
  if (d.ratio <= 0) return "down";
  return "warn";
}

function timelineSegTitle(d: MonitorDto["timelineDaily"][number]): string {
  const label = formatTimelineSlotLabel(d.t);
  if (d.hasData === false) return `${label} · 无探测`;
  return `${label} · ${(d.ratio * 100).toFixed(0)}%`;
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

export function MonitorCard({ m, footerExtra }: { m: MonitorDto; footerExtra?: ReactNode }) {
  const dlgRef = useRef<HTMLDialogElement>(null);
  const timelineDaily = Array.isArray(m.timelineDaily) ? m.timelineDaily : [];
  const ok = m.lastProbe?.ok === 1;
  const ft = m.lastProbe?.first_token_ms;
  const st = m.lastProbe?.http_status;
  const pct30 = m.availability30d;
  const probe = m.lastProbe;

  const openDetail = () => dlgRef.current?.showModal();
  const closeDetail = () => dlgRef.current?.close();
  const protoLines = protocolCardLines(m.protocol);

  return (
    <article className="card">
      <header className="card-head">
        <div className="card-title-row">
          <div>
            <h2 className="card-name">{m.display_name}</h2>
            <div className="card-sub card-sub-stack">
              <div className="card-sub-row card-sub-row-model">
                <span className="card-sub-model">{m.model}</span>
              </div>
              <div className="card-sub-col-protocol">
                <span className="card-sub-protocol">{protoLines.name}</span>
                <span className="card-sub-protocol-path">{protoLines.path}</span>
                {m.category?.trim() ? (
                  <span className="card-sub-meta card-sub-meta-after">{m.category.trim()}</span>
                ) : null}
                <span className="card-sub-meta card-sub-meta-after">
                  {m.probe_stream !== 0 ? "流式" : "非流式"}
                </span>
                {m.show_on_dashboard === 0 ? (
                  <span className="card-sub-meta card-sub-meta-after">首页隐藏</span>
                ) : null}
                {m.enabled === 0 ? <span className="card-sub-paused card-sub-paused-after">已停用</span> : null}
              </div>
            </div>
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

      <div
        className="timeline"
        role="img"
        aria-label={`约 30 天、上海时区每格半天（0–12 点为上午，12–24 点为下午），右侧为当前${shanghaiAmPmNow()}`}
      >
        {timelineDaily.length === 0 ? (
          <div className="timeline-empty">暂无历史条形数据</div>
        ) : (
          timelineDaily.map((d) => (
            <span
              key={d.t}
              className={`tl-seg tl-${timelineSegTone(d)}`}
              title={timelineSegTitle(d)}
            />
          ))
        )}
      </div>

      <div className="card-mid">
        <span className="card-mid-edge">约 30 天前</span>
        <strong className={`card-mid-pct ${pctAccentClass(pct30)}`}>{formatPct(pct30)} 可用率</strong>
        <span className="card-mid-edge">{shanghaiAmPmNow()}</span>
      </div>

      <footer className="card-foot">
        <div className="card-foot-cell">
          <span className="card-foot-label">状态</span>
          <span className={httpStatusValueClass(st ?? null)}>{st != null ? st : "—"}</span>
        </div>
        <div className="card-foot-cell">
          <span className="card-foot-label">首字延迟</span>
          <span className={latencyValueClass(ft ?? null)}>{ft != null ? `${ft} ms` : "—"}</span>
        </div>
        <div className="card-foot-cell">
          <span className="card-foot-label">24h 可用</span>
          <span className={availabilityValueClass(m.availability24h)}>{formatPct(m.availability24h)}</span>
        </div>
        <div className="card-foot-cell card-foot-probe-time">
          <span className="card-foot-label">探测时间</span>
          <span
            className={probe ? "card-foot-probe-value" : "card-foot-probe-value card-metric-value-muted"}
          >
            {probe ? formatLastProbeTime(probe.ts) : "—"}
          </span>
        </div>
        <div className="card-foot-wide card-foot-count-row">
          <span className="card-foot-label">探测次数</span>
          <span className="card-foot-count-value">{m.probe_count}</span>
        </div>
      </footer>

      {footerExtra ? <div className="card-admin-footer">{footerExtra}</div> : null}

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
