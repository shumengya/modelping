import { useEffect, useMemo, useState } from "react";
import { fetchMonitors } from "../api";
import { MonitorCard } from "../components/MonitorCard";
import type { MonitorDto } from "../types";

export function Dashboard() {
  const [rows, setRows] = useState<MonitorDto[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<string>("__all__");
  const [q, setQ] = useState("");

  const load = () => {
    fetchMonitors()
      .then(setRows)
      .catch(() => setErr("加载失败"));
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const m of rows ?? []) {
      if (m.category?.trim()) s.add(m.category.trim());
    }
    return ["__all__", ...[...s].sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows ?? [];
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
  }, [rows, filterCat, q]);

  const online = (rows ?? []).filter((m) => m.lastProbe?.ok === 1).length;
  const offline = (rows ?? []).filter((m) => m.lastProbe && m.lastProbe.ok !== 1).length;

  return (
    <div className="page dashboard">
      <section className="panel-intro">
        <div className="status-line">
          <span className="dot ok" />
          <span>
            {online} 在线 | <span className="muted">{offline} 离线</span>
          </span>
        </div>
        <div className="toolbar">
          <div className="pills">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                className={`pill ${filterCat === c ? "active" : ""}`}
                onClick={() => setFilterCat(c)}
              >
                {c === "__all__" ? "全部" : c}
              </button>
            ))}
          </div>
          <label className="search">
            <span className="sr-only">搜索</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索名称、模型或地址…" />
          </label>
        </div>
      </section>

      {err ? <p className="banner error">{err}</p> : null}

      {!rows ? <p className="muted">加载中…</p> : null}

      {rows?.length === 0 ? <p className="muted">暂无监控项。请从管理入口添加。</p> : null}

      <div className="card-grid">
        {filtered.map((m) => (
          <MonitorCard key={m.id} m={m} />
        ))}
      </div>
    </div>
  );
}
