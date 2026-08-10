// Shared Supabase row helpers for the subscription feature.
//
// Centralizes insert/lookup so the route handlers stay focused on request
// handling and rate limiting. All access uses the service role client.

import { getSupabase } from "@/lib/supabase/server";
import { generateCode } from "./code";

export interface SubscriptionRow {
  id: string;
  code: string;
  content: string;
  node_count: number;
  download_count: number;
  creator_ip: string | null;
  created_at: string;
}

export interface CreateInput {
  content: string;
  node_count: number;
  creator_ip: string;
}

export async function createSubscription(input: CreateInput): Promise<SubscriptionRow> {
  const sb = getSupabase();
  // Retry on the (astronomically unlikely) code collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { data, error } = await sb
      .from("subscriptions")
      .insert({
        code,
        content: input.content,
        node_count: input.node_count,
        creator_ip: input.creator_ip,
      })
      .select()
      .single();
    if (error && error.code === "23505") continue; // unique violation on code
    if (error) throw error;
    return data as SubscriptionRow;
  }
  throw new Error("Failed to allocate a unique short code");
}

export async function getById(id: string): Promise<SubscriptionRow | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("subscriptions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as SubscriptionRow) ?? null;
}

export async function getByCode(code: string): Promise<SubscriptionRow | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("subscriptions")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  return (data as SubscriptionRow) ?? null;
}

/**
 * Atomically bump the download counter, returning the new count.
 */
export async function incrementDownload(id: string): Promise<number> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc("bump_download", { p_id: id });
  if (error) throw error;
  return typeof data === "number" ? data : Number(data) || 0;
}
