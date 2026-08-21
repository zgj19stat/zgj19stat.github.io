CREATE TABLE IF NOT EXISTS visit_counter (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  total INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),
  since_label TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO visit_counter (id, total, since_label, updated_at)
VALUES (1, 0, 'Aug 2026', datetime('now'));

CREATE TABLE IF NOT EXISTS visit_sessions (
  session_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS increment_visit_counter
AFTER INSERT ON visit_sessions
BEGIN
  UPDATE visit_counter
  SET total = total + 1,
      updated_at = NEW.created_at
  WHERE id = 1;
END;
