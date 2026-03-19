-- ① 視聴履歴テーブル
CREATE TABLE IF NOT EXISTS watch_history (
  id          BIGSERIAL PRIMARY KEY,
  username    TEXT NOT NULL,
  video_id    TEXT NOT NULL,
  title       TEXT NOT NULL,
  thumbnail   TEXT DEFAULT '',
  channel     TEXT DEFAULT '',
  watched_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_by_user BOOLEAN DEFAULT FALSE
);

-- ② 検索履歴テーブル
CREATE TABLE IF NOT EXISTS search_history (
  id          BIGSERIAL PRIMARY KEY,
  username    TEXT NOT NULL,
  query       TEXT NOT NULL,
  searched_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_by_user BOOLEAN DEFAULT FALSE
);

-- ③ インデックス（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_watch_history_username ON watch_history(username);
CREATE INDEX IF NOT EXISTS idx_search_history_username ON search_history(username);
