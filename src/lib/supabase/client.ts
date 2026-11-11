import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/db.types";
import { publicEnv } from "@/lib/env";

// Browser client. Used for direct uploads to storage; data writes go through
// Server Actions.
export function createClient() {
  return createBrowserClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}
