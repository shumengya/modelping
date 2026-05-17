-- 可配置探测用语（多行随机）+ 每次探测记录的输入/输出摘要

ALTER TABLE monitors ADD COLUMN probe_prompts TEXT NOT NULL DEFAULT '';

ALTER TABLE probe_events ADD COLUMN probe_input TEXT;
ALTER TABLE probe_events ADD COLUMN probe_output TEXT;
