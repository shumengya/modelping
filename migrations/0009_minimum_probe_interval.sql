-- 5 分钟 Cron 无法保证 1 分钟频率，迁移已有全局配置以保持调度语义一致。
UPDATE app_settings
SET probe_interval_minutes = 5
WHERE probe_interval_minutes < 5;
