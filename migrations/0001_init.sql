-- modelping: monitors + probe events (30d retention enforced in worker)

CREATE TABLE monitors (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  api_base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  protocol TEXT NOT NULL CHECK (protocol IN ('openai', 'claude')),
  interval_minutes INTEGER NOT NULL CHECK (interval_minutes IN (1, 5, 10, 30, 60, 360)),
  enabled INTEGER NOT NULL DEFAULT 1,
  category TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  api_key_ciphertext BLOB NOT NULL,
  api_key_nonce BLOB NOT NULL,
  last_run_at INTEGER,
  next_run_at INTEGER NOT NULL
);

CREATE INDEX idx_monitors_next_run ON monitors (enabled, next_run_at);

CREATE TABLE probe_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  monitor_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  ok INTEGER NOT NULL,
  first_token_ms INTEGER,
  http_status INTEGER,
  error_message TEXT
);

CREATE INDEX idx_probe_events_monitor_ts ON probe_events (monitor_id, ts);
