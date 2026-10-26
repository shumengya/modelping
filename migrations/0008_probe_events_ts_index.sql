-- 每日按过期时间清理探测记录，避免扫描按监控维度排列的复合索引。
CREATE INDEX idx_probe_events_ts ON probe_events (ts);
