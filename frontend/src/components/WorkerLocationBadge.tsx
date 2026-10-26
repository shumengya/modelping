import { useEffect, useState } from "react";
import { fetchWorkerLocation } from "../api";
import type { WorkerLocation } from "../types";
import styles from "./WorkerLocationBadge.module.css";

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

  const text = [loc.colo, loc.city].filter(Boolean).join(" · ");
  return (
    <span
      className={styles.location}
      title="Cloudflare Workers 运行在全球边缘网络，没有固定部署地；这里显示的是处理本次访问的数据中心"
    >
      Worker 节点：{text}
    </span>
  );
}
