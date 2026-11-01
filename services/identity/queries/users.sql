-- name: CreateUser :one
-- The id is chosen by the caller so the session token (which carries the
-- user id) can be signed before the insert transaction starts.
INSERT INTO users (id, email, password_hash, display_name, locale)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- GetUserByEmail is the one lookup not scoped by user_id: it is how login
-- finds the user in the first place.
-- name: GetUserByEmail :one
SELECT *
FROM users
WHERE email = $1;

-- name: GetUser :one
SELECT *
FROM users
WHERE id = $1;

-- name: UpdateUser :one
UPDATE users
SET display_name = coalesce(sqlc.narg(display_name), display_name),
    locale       = coalesce(sqlc.narg(locale), locale),
    updated_at   = now()
WHERE id = sqlc.arg(id)
RETURNING *;
