// Shared helpers for the Edge Functions.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export const BUCKET = "memories";
export const SIGN_SECONDS = 6 * 3600;
export const PAGE = 24;

export type Sb = SupabaseClient;

export function adminClient(): Sb {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

const ORIGINS = (Deno.env.get("ALLOWED_ORIGIN") ?? "*").split(",").map((s) => s.trim()).filter(Boolean);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allow = ORIGINS.includes("*") ? "*" : ORIGINS.includes(origin) ? origin : ORIGINS[0] ?? "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req), ...extra },
  });
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function randomHex(bytes: number): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

// Returns the logged-in user for the request's `Authorization: Bearer <jwt>`, or null.
export async function userFrom(req: Request, sb: Sb) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return null;
  const { data, error } = await sb.auth.getUser(jwt);
  return error || !data.user ? null : data.user;
}

// Every account has one wall; it is created the first time they ask for it.
export async function ensureWall(sb: Sb, user: { id: string; user_metadata?: Record<string, unknown> }) {
  const cols = "id,title,share_token";
  const { data: existing } = await sb.from("walls").select(cols).eq("owner_id", user.id).maybeSingle();
  if (existing) return existing as { id: string; title: string; share_token: string };
  const name = String(user.user_metadata?.name ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 40);
  const title = name ? `${name}'s little corner` : "My little corner";
  const { data, error } = await sb.from("walls")
    .insert({ owner_id: user.id, title, share_token: randomHex(16) }).select(cols).single();
  if (error) {
    const { data: again } = await sb.from("walls").select(cols).eq("owner_id", user.id).maybeSingle();
    if (again) return again as { id: string; title: string; share_token: string };
    throw error;
  }
  return data as { id: string; title: string; share_token: string };
}

// Allows at most `max` events per `windowSec` for this key. Returns false when over the limit.
export async function rateLimit(sb: Sb, keyRaw: string, kind: string, max: number, windowSec: number): Promise<boolean> {
  const salt = Deno.env.get("RATE_SALT") ?? "lmc-default-salt";
  const key = await sha256Hex(salt + ":" + keyRaw);
  const since = new Date(Date.now() - windowSec * 1000).toISOString();
  const { count, error } = await sb.from("upload_attempts")
    .select("id", { count: "exact", head: true }).eq("ip_hash", key).eq("kind", kind).gte("created_at", since);
  if (error) throw error;
  if ((count ?? 0) >= max) return false;
  await sb.from("upload_attempts").insert({ ip_hash: key, kind });
  if (Math.random() < 0.05) {
    await sb.from("upload_attempts").delete().lt("created_at", new Date(Date.now() - 2 * 86400 * 1000).toISOString());
  }
  return true;
}

type Row = {
  id: string; caption: string; display_name: string | null; memory_date: string | null;
  created_at: string; like_count: number; images: { path: string; width?: number; height?: number }[];
};

// Turn DB rows into what the browser gets: private image paths become short-lived signed URLs.
export async function toOut(sb: Sb, rows: Row[], liked: Set<string>) {
  const paths = rows.flatMap((r) => r.images.map((i) => i.path));
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths, SIGN_SECONDS);
    for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
  }
  return rows.map((r) => ({
    id: r.id, caption: r.caption, display_name: r.display_name, memory_date: r.memory_date,
    created_at: r.created_at, like_count: r.like_count ?? 0, liked: liked.has(r.id),
    images: r.images.map((i) => ({ url: urls.get(i.path) ?? "", width: i.width, height: i.height })),
  }));
}

export async function memoriesPage(sb: Sb, wallId: string, offset: number, limit: number, voter: string) {
  const { data, count, error } = await sb.from("memories")
    .select("id,caption,display_name,memory_date,images,created_at,like_count", { count: "exact" })
    .eq("wall_id", wallId)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  let liked = new Set<string>();
  if (voter && rows.length) {
    const { data: l } = await sb.from("likes").select("memory_id").eq("voter_id", voter).in("memory_id", rows.map((r) => r.id));
    liked = new Set((l ?? []).map((x: { memory_id: string }) => x.memory_id));
  }
  const memories = await toOut(sb, rows, liked);
  const total = count ?? memories.length;
  return { memories, total, has_more: offset + rows.length < total };
}
