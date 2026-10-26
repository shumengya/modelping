import { useEffect, useState } from "react";
import { fetchWorkerLocation } from "../api";
import type { WorkerLocation } from "../types";
import styles from "./WorkerLocationBadge.module.css";

const regionNames = new Intl.DisplayNames(["zh-CN"], { type: "region" });

/** 国家/地区代码转中文名；不认识的代码原样返回 */
function countryName(code: string | null): string | null {
  if (!code) return null;
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export function WorkerLocationBadge() {
  const [loc, setLoc] = useState<WorkerLocation | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWorkerLocation()
      .then((data) => {
        if (!cancelled) setLoc(data);
      })
      .catch(() => {
        /* 位置只是辅助信息，失败就不显示 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loc?.colo) return null;

  const text = [loc.colo, loc.city, countryName(loc.country)].filter(Boolean).join(" · ");
  return (
    <span
      className={styles.badge}
      title="Cloudflare Workers 运行在全球边缘网络，没有固定部署地；这里显示的是处理本次访问的数据中心"
    >
      <span className={styles.dot} aria-hidden />
      Worker 节点：{text}
    </span>
  );
}
