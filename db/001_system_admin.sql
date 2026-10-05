-- System admin support
-- users.role already allows 'registered_user', 'instructor', 'system_admin'
-- in schema.sql, so no change to the users table is needed.

-- Audit log of every admin action.
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    log_id          SERIAL PRIMARY KEY,
    admin_id        INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    action          VARCHAR(50) NOT NULL,
    target_user_id  INTEGER,            -- no FK: target may later be deleted
    details         JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action     ON admin_audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_users_role                  ON users (role);
