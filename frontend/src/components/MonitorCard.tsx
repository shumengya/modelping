import { useRef, type ReactNode } from "react";
import type { MonitorDto } from "../types";
import dialogStyles from "../styles/dialog.module.css";
import styles from "./MonitorCard.module.css";

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

function metricClass(accent?: string): string {
  return accent ? `${styles.cardMetricValue} ${accent}` : styles.cardMetricValue;
}

function httpStatusValueClass(st: number | undefined | null): string {
  if (st == null) return metricClass(styles.cardMetricValueMuted);
  if (st >= 200 && st < 300) return metricClass(styles.cardAccentHttpOk);
  if (st >= 300 && st < 400) return metricClass(styles.cardAccentHttpInfo);
  if (st >= 400 && st < 500) return metricClass(styles.cardAccentHttpClient);
  if (st >= 500) return metricClass(styles.cardAccentHttpServer);
  return metricClass();
}

function latencyValueClass(ms: number | undefined | null): string {
  if (ms == null) return metricClass(styles.cardMetricValueMuted);
  if (ms < 500) return metricClass(styles.cardAccentLatencyGood);
  if (ms < 1500) return metricClass(styles.cardAccentLatencyMid);
  return metricClass(styles.cardAccentLatencySlow);
}

/** 与「可用率」色带一致，用于 24h 与卡片中部大字 */
function pctAccentClass(pct: number | null): string {
  if (pct == null) return styles.cardMetricValueMuted;
  if (pct >= 99) return styles.cardAccentPctHigh;
  if (pct >= 95) return styles.cardAccentPctMid;
  if (pct >= 90) return styles.cardAccentPctLow;
  return styles.cardAccentPctCritical;
}

function availabilityValueClass(pct: number | null): string {
  return metricClass(pctAccentClass(pct));
}

/** 时间条桶为上海时区 00–12 / 12–24（与 Worker 一致） */
const TIMELINE_SHANGHAI_OFF = 8 * 3600;

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
const TL_TONE_CLASS = {
  none: styles.tlNone,
  up: styles.tlUp,
  warn: styles.tlWarn,
  down: styles.tlDown,
} as const;

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

const TIMELINE_SLOT_COUNT = 60;

type TimelineSeg = MonitorDto["timelineDaily"][number];

/** 只保留有探测数据的格子，按时间顺序靠右排列，左侧补空位。 */
function rightAlignedTimeline(daily: TimelineSeg[]): Array<TimelineSeg | null> {
  const withData = daily.filter((d) => d.hasData !== false).slice(-TIMELINE_SLOT_COUNT);
  return [...Array<null>(TIMELINE_SLOT_COUNT - withData.length).fill(null), ...withData];
}

export function MonitorCard({ m, footerExtra }: { m: MonitorDto; footerExtra?: ReactNode }) {
  const dlgRef = useRef<HTMLDialogElement>(null);
  const timelineSegs = rightAlignedTimeline(Array.isArray(m.timelineDaily) ? m.timelineDaily : []);
  const ok = m.lastProbe?.ok === 1;
  const ft = m.lastProbe?.first_token_ms;
  const st = m.lastProbe?.http_status;
  const pct30 = m.availability30d;
  const probe = m.lastProbe;

  const openDetail = () => dlgRef.current?.showModal();
  const closeDetail = () => dlgRef.current?.close();
  const protoLines = protocolCardLines(m.protocol);

  return (
    <article className={styles.card}>
      <header className={styles.cardHead}>
        <div className={styles.cardTitleRow}>
          <div>
            <h2 className={styles.cardName}>{m.display_name}</h2>
            <div className={`${styles.cardSub} ${styles.cardSubStack}`}>
              <div className={styles.cardSubRowModel}>
                <span className={styles.cardSubModel}>{m.model}</span>
              </div>
              <div className={styles.cardSubColProtocol}>
                <span className={styles.cardSubProtocol}>{protoLines.name}</span>
                <span className={styles.cardSubProtocolPath}>{protoLines.path}</span>
                {m.category?.trim() ? (
                  <span className={`${styles.cardSubMeta} ${styles.cardSubMetaAfter}`}>{m.category.trim()}</span>
                ) : null}
                <span className={`${styles.cardSubMeta} ${styles.cardSubMetaAfter}`}>
                  {m.probe_stream !== 0 ? "流式" : "非流式"}
                </span>
                {m.show_on_dashboard === 0 ? (
                  <span className={`${styles.cardSubMeta} ${styles.cardSubMetaAfter}`}>首页隐藏</span>
                ) : null}
                {m.enabled === 0 ? <span className={`${styles.cardSubPaused} ${styles.cardSubPausedAfter}`}>已停用</span> : null}
              </div>
            </div>
          </div>
        </div>
        <div className={styles.cardHeadRight}>
          <span className={`${styles.badge} ${ok ? styles.badgeOk : styles.badgeBad}`}>
            {ok ? "运行正常" : m.lastProbe ? "异常" : "尚无数据"}
          </span>
          <button type="button" className={styles.btnDetail} onClick={openDetail}>
            详情
          </button>
        </div>
      </header>

      <div
        className={styles.timeline}
        role="img"
        aria-label="上海时区每格半天（0–12 点为上午，12–24 点为下午），最新数据在右侧"
      >
        {timelineSegs.map((d, i) =>
          d ? (
            <span key={d.t} className={`${styles.tlSeg} ${TL_TONE_CLASS[timelineSegTone(d)]}`} title={timelineSegTitle(d)} />
          ) : (
            <span key={`empty-${i}`} className={`${styles.tlSeg} ${styles.tlNone}`} />
          )
        )}
      </div>

      <div className={styles.cardMid}>
        <span className={styles.cardMidEdge}>较早</span>
        <strong className={`card-mid-pct ${pctAccentClass(pct30)}`}>{formatPct(pct30)} 可用率</strong>
        <span className={styles.cardMidEdge}>最新</span>
      </div>

      <footer className={styles.cardFoot}>
        <div className={styles.cardFootCell}>
          <span className={styles.cardFootLabel}>状态</span>
          <span className={httpStatusValueClass(st ?? null)}>{st != null ? st : "—"}</span>
        </div>
        <div className={styles.cardFootCell}>
          <span className={styles.cardFootLabel}>首字延迟</span>
          <span className={latencyValueClass(ft ?? null)}>{ft != null ? `${ft} ms` : "—"}</span>
        </div>
        <div className={styles.cardFootCell}>
          <span className={styles.cardFootLabel}>24h 可用</span>
          <span className={availabilityValueClass(m.availability24h)}>{formatPct(m.availability24h)}</span>
        </div>
        <div className={`${styles.cardFootCell} ${styles.cardFootProbeTime}`}>
          <span className={styles.cardFootLabel}>探测时间</span>
          <span
            className={probe ? styles.cardFootProbeValue : `${styles.cardFootProbeValue} ${styles.cardMetricValueMuted}`}
          >
            {probe ? formatLastProbeTime(probe.ts) : "—"}
          </span>
        </div>
        <div className={`${styles.cardFootWide} ${styles.cardFootCountRow}`}>
          <span className={styles.cardFootLabel}>探测次数</span>
          <span className={styles.cardFootCountValue}>{m.probe_count}</span>
        </div>
      </footer>

      {footerExtra ? <div className={styles.cardAdminFooter}>{footerExtra}</div> : null}

      <dialog ref={dlgRef} className={dialogStyles.probeDetailDialog}>
        <div className={dialogStyles.probeDetailInner}>
          <header className={dialogStyles.probeDetailHead}>
            <h3 className={dialogStyles.probeDetailTitle}>最近探测详情</h3>
            <button type="button" className={dialogStyles.probeDetailClose} aria-label="关闭" onClick={closeDetail}>
              ×
            </button>
          </header>
          <div>
            <dl className={styles.probeDetailDl}>
              <dt>显示名称</dt>
              <dd>{m.display_name}</dd>
              <dt>协议</dt>
              <dd>{protocolLabel(m.protocol)}</dd>
              <dt>模型</dt>
              <dd>{m.model}</dd>
              <dt>API 根地址</dt>
              <dd>
                <code className={styles.probeDetailCode}>{m.api_base_url}</code>
                <div className={styles.probeDetailLinkWrap}>
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
              <div className={styles.probeDetailError}>
                <strong>错误信息</strong>
                <pre className={styles.probeDetailPre}>{probe.error_message}</pre>
              </div>
            ) : null}
            {probe ? (
              <div className={styles.probeDetailIo}>
                <strong>输入（本次请求发送的用户消息）</strong>
                <pre className={styles.probeDetailIoPre}>{probe.probe_input ?? "—"}</pre>
                <strong>输出（模型流式正文摘要，最长约数千字）</strong>
                <pre className={`${styles.probeDetailIoPre} ${styles.probeDetailIoOut}`}>
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
