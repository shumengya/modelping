-- 全局探测间隔 + 探测用语；监控表不再存储 interval_minutes / probe_prompts

CREATE TABLE app_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  probe_prompts TEXT NOT NULL DEFAULT '',
  probe_interval_minutes INTEGER NOT NULL DEFAULT 5 CHECK (probe_interval_minutes IN (1, 5, 10, 30, 60, 360))
);

INSERT INTO app_settings (id, probe_prompts, probe_interval_minutes) VALUES (1, '', 5);

UPDATE app_settings SET probe_interval_minutes = (
  SELECT M.interval_minutes FROM monitors M LIMIT 1
) WHERE EXISTS (SELECT 1 FROM monitors LIMIT 1);

UPDATE app_settings SET probe_prompts = (
  SELECT M.probe_prompts FROM monitors M WHERE TRIM(COALESCE(M.probe_prompts, '')) != '' LIMIT 1
) WHERE EXISTS (
  SELECT 1 FROM monitors M WHERE TRIM(COALESCE(M.probe_prompts, '')) != ''
);

CREATE TABLE monitors_new (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  api_base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  protocol TEXT NOT NULL CHECK (protocol IN ('openai', 'openai_responses', 'claude')),
  enabled INTEGER NOT NULL DEFAULT 1,
  category TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  api_key_ciphertext BLOB NOT NULL,
  api_key_nonce BLOB NOT NULL,
  last_run_at INTEGER,
  next_run_at INTEGER NOT NULL
);

INSERT INTO monitors_new (
  id, display_name, api_base_url, model, protocol, enabled, category, created_at,
  api_key_ciphertext, api_key_nonce, last_run_at, next_run_at
)
SELECT
  id, display_name, api_base_url, model, protocol, enabled, category, created_at,
  api_key_ciphertext, api_key_nonce, last_run_at, next_run_at
FROM monitors;

DROP TABLE monitors;
ALTER TABLE monitors_new RENAME TO monitors;

CREATE INDEX idx_monitors_next_run ON monitors (enabled, next_run_at);
