-- Allow OpenAI Responses API alongside Chat Completions (SQLite cannot alter CHECK in-place)
CREATE TABLE monitors_new (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  api_base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  protocol TEXT NOT NULL CHECK (protocol IN ('openai', 'openai_responses', 'claude')),
  interval_minutes INTEGER NOT NULL CHECK (interval_minutes IN (1, 5, 10, 30, 60, 360)),
  enabled INTEGER NOT NULL DEFAULT 1,
  category TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  api_key_ciphertext BLOB NOT NULL,
  api_key_nonce BLOB NOT NULL,
  last_run_at INTEGER,
  next_run_at INTEGER NOT NULL
);

INSERT INTO monitors_new SELECT * FROM monitors;

DROP TABLE monitors;

ALTER TABLE monitors_new RENAME TO monitors;

CREATE INDEX idx_monitors_next_run ON monitors (enabled, next_run_at);
