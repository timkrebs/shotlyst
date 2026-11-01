-- Identity schema: accounts and server-side session records.
--
-- Email is stored lowercased with a CHECK instead of citext so the service
-- role needs no extension privileges (citext requires CREATE on the
-- database); uniqueness is then a plain unique index.
-- Sessions back the stateless tokens (ADR-3): the token carries sid, and a
-- row here is what /refresh renews and /logout deletes. token_hash is the
-- sha256 of the current token, so a rotated-out token cannot be refreshed.

-- +goose Up
CREATE TABLE users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text NOT NULL CONSTRAINT users_email_lower CHECK (email = lower(email)),
    password_hash text NOT NULL,
    display_name  text NOT NULL,
    locale        text NOT NULL DEFAULT 'en',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (email);

CREATE TABLE sessions (
    id           uuid PRIMARY KEY,
    user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash   bytea NOT NULL,
    expires_at   timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sessions_token_hash_key ON sessions (token_hash);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
