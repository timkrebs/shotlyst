// Environment access in one place. NEXT_PUBLIC_* values are inlined at build
// time, so they must be read with their literal names.

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const publicEnv = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  },
  get appUrl() {
    return required("NEXT_PUBLIC_APP_URL", process.env.NEXT_PUBLIC_APP_URL).replace(/\/$/, "");
  },
};

// Server-only values. None of these names start with NEXT_PUBLIC_, so the
// bundler never ships them to the browser.
export const serverEnv = {
  get serviceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
  },
  get ownerEmail() {
    return (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
  },
  get loginThrottleSecret() {
    return required("LOGIN_THROTTLE_SECRET", process.env.LOGIN_THROTTLE_SECRET);
  },
  get cronSecret() {
    return required("CRON_SECRET", process.env.CRON_SECRET);
  },
};
