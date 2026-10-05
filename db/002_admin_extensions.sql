-- Run after 001_system_admin.sql

-- Audit log entries can now point at groups, rewards, badges, runs, etc.
ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS target_type VARCHAR(30);
ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS target_id   INTEGER;

UPDATE admin_audit_logs
SET target_type = 'user', target_id = target_user_id
WHERE target_type IS NULL AND target_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target ON admin_audit_logs (target_type, target_id);

-- Badge.award() looks badges up by name, so names must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS badges_name_key ON badges (name);

-- Speeds up admin group listing and group leaderboards.
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members (group_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_group_id   ON tournaments (group_id);
