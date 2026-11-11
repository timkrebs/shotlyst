import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db.types";
import { publicEnv, serverEnv } from "@/lib/env";

// Service-role client: bypasses Row Level Security. An ESLint rule limits who
// may import this module (CLAUDE.md rule 7).
export function createAdminClient() {
  return createClient<Database>(publicEnv.supabaseUrl, serverEnv.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
