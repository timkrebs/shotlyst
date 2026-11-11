import "server-only";

import type { ServerClient } from "@/lib/supabase/server";

export async function listBrands(supabase: ServerClient) {
  const { data, error } = await supabase.from("brands").select("*").order("name");
  if (error) throw new Error(error.message);
  return data;
}

export async function listClients(supabase: ServerClient) {
  const { data, error } = await supabase.from("clients").select("*").order("name");
  if (error) throw new Error(error.message);
  return data;
}
