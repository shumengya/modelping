-- 全局探测是否使用流式 API（1=流式，0=非流式）

ALTER TABLE app_settings ADD COLUMN probe_stream INTEGER NOT NULL DEFAULT 1 CHECK (probe_stream IN (0, 1));
