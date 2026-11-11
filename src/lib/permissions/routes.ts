// Routes reachable without a session. Everything else redirects to /login.
// /api/cron authenticates with CRON_SECRET instead of a session.
const PUBLIC_PREFIXES = ["/login", "/accept-invite", "/reset-password", "/share/", "/api/cron/"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) =>
    prefix.endsWith("/")
      ? pathname.startsWith(prefix)
      : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// Only same-origin paths are accepted as a post-login destination.
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  return next;
}
