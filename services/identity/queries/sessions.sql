-- name: CreateSession :exec
INSERT INTO sessions (id, user_id, token_hash, expires_at, last_seen_at)
VALUES ($1, $2, $3, $4, $5);

-- RotateSession renews a live session only when the presented token is the
-- current one (hash match); zero rows means expired, revoked or replayed.
-- name: RotateSession :execrows
UPDATE sessions
SET token_hash   = sqlc.arg(new_hash),
    expires_at   = sqlc.arg(expires_at),
    last_seen_at = sqlc.arg(now),
    updated_at   = now()
WHERE id = sqlc.arg(id)
  AND user_id = sqlc.arg(user_id)
  AND token_hash = sqlc.arg(old_hash)
  AND expires_at > sqlc.arg(now);

-- name: DeleteSession :exec
DELETE FROM sessions
WHERE id = $1 AND user_id = $2;

-- name: DeleteExpiredSessions :execrows
DELETE FROM sessions
WHERE user_id = $1 AND expires_at <= $2;
