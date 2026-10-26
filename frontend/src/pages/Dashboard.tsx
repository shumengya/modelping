import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchMonitors } from "../api";
import { MonitorCard } from "../components/MonitorCard";
import { useAppBoot } from "../context/useAppBoot";
import type { MonitorDto } from "../types";
import common from "../styles/common.module.css";
import styles from "./Dashboard.module.css";

const REFRESH_MS = 60_000;

export function Dashboard() {
  const { signalBootReady } = useAppBoot();
  const [rows, setRows] = useState<MonitorDto[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<string>("__all__");
  const [q, setQ] = useState("");
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (document.visibilityState !== "visible" || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const data = await fetchMonitors();
      setRows(data);
      setErr(null);
    } catch {
      setRows([]);
      setErr("加载失败");
    } finally {
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
    const t = setInterval(() => void load(), REFRESH_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  useEffect(() => {
    if (rows !== null) signalBootReady();
  }, [rows, signalBootReady]);

  /** 后端已暂停探测（enabled=0）的监控不在首页展示；兼容服务端缓存未过期时拿到的旧列表。 */
  const visible = useMemo(() => (rows ?? []).filter((m) => m.enabled !== 0), [rows]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const m of visible) {
      if (m.category?.trim()) s.add(m.category.trim());
    }
    return ["__all__", ...[...s].sort()];
  }, [visible]);

  const filtered = useMemo(() => {
    let list = visible;
    if (filterCat !== "__all__") list = list.filter((m) => (m.category || "").trim() === filterCat);
    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter(
        (m) =>
          m.display_name.toLowerCase().includes(qq) ||
          m.model.toLowerCase().includes(qq) ||
          m.api_base_url.toLowerCase().includes(qq)
      );
    }
    return list;
  }, [visible, filterCat, q]);

  const online = visible.filter((m) => m.lastProbe?.ok === 1).length;
  const offline = visible.filter((m) => m.lastProbe && m.lastProbe.ok !== 1).length;

  return (
    <div className={common.page}>
      <section className={styles.panelIntro}>
        <div className={styles.statusLine}>
          <span className={`${styles.dot} ${styles.ok}`} />
          <span>
            {online} 在线 | <span className={common.muted}>{offline} 离线</span>
          </span>
        </div>
        <div className={styles.toolbar}>
          <div className={styles.pills}>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                className={filterCat === c ? `${styles.pill} ${styles.active}` : styles.pill}
                onClick={() => setFilterCat(c)}
              >
                {c === "__all__" ? "全部" : c}
              </button>
            ))}
          </div>
          <label className={styles.search}>
            <span className={common.srOnly}>搜索</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索名称、模型或地址…" />
          </label>
        </div>
      </section>

      {err ? <p className={`${common.banner} ${common.error}`}>{err}</p> : null}

      {rows !== null && visible.length === 0 ? (
        <p className={common.muted}>暂无监控项。请从管理入口添加。</p>
      ) : null}

      <div className={common.cardGrid}>
        {filtered.map((m) => (
          <MonitorCard key={m.id} m={m} />
        ))}
      </div>
    </div>
  );
}
