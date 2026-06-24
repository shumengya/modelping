-- 每条监控单独配置是否流式（1=流式，0=非流式）。未应用过 0005 的数据库也可执行本迁移。

ALTER TABLE monitors ADD COLUMN probe_stream INTEGER NOT NULL DEFAULT 1 CHECK (probe_stream IN (0, 1));
