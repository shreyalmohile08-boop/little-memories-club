// Edge Function: submit-memory
// A LOGGED-IN user adds a memory (pictures + note) to their own wall.
// Everything is validated here on the server; files go into the private bucket.
//
// Deploy:  supabase functions deploy submit-memory --no-verify-jwt

import {
  adminClient, BUCKET, corsHeaders, ensureWall, json, rateLimit, toOut, userFrom,
} from "../_shared/common.ts";

const MAX_FILES = 6;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;
const RATE_LIMIT = Number(Deno.env.get("RATE_LIMIT_PER_HOUR") ?? "20");

// Identify the real file type from its first bytes (never trust the browser's MIME type).
function sniff(b: Uint8Array): { mime: string; ext: string } | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: "image/png", ext: "png" };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return { mime: "image/gif", ext: "gif" };
  const riff = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46;
  const webp = b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  if (riff && webp) return { mime: "image/webp", ext: "webp" };
  return null;
}

function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return false;
  return d.getUTCFullYear() >= 1900 && d.getTime() <= Date.now() + 36 * 3600 * 1000;
}

const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405);

  try {
    const sb = adminClient();
    const user = await userFrom(req, sb);
    if (!user) return json(req, { error: "Please log in to add a memory." }, 401);

    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_TOTAL_BYTES + 1024 * 1024) {
      return json(req, { error: "That's a lot of pictures at once — try fewer or smaller ones." }, 413);
    }

    let form: FormData;
    try { form = await req.formData(); } catch {
      return json(req, { error: "We couldn't read that upload. Please try again." }, 400);
    }

    if (!(await rateLimit(sb, "user:" + user.id, "upload", RATE_LIMIT, 3600))) {
      return json(req, { error: "You've shared a lot just now! Please wait a little while and try again." }, 429, { "Retry-After": "900" });
    }

    const caption = clean(String(form.get("caption") ?? "")).trim();
    if (caption.length < 1 || caption.length > 500) return json(req, { error: "Please write a little note (1–500 characters)." }, 400);
    const nameRaw = clean(String(form.get("display_name") ?? "")).replace(/\s+/g, " ").trim();
    if (nameRaw.length > 40) return json(req, { error: "Display name can be at most 40 characters." }, 400);
    const display_name = nameRaw || null;
    const dateRaw = String(form.get("memory_date") ?? "").trim();
    if (dateRaw && !validDate(dateRaw)) return json(req, { error: "That date doesn't look right." }, 400);
    const memory_date = dateRaw || null;

    const files = form.getAll("images").filter((f): f is File => f instanceof File);
    if (files.length < 1) return json(req, { error: "Please add at least one picture." }, 400);
    if (files.length > MAX_FILES) return json(req, { error: `Up to ${MAX_FILES} pictures per memory, please.` }, 400);

    let dims: unknown = [];
    try { dims = JSON.parse(String(form.get("dims") ?? "[]")); } catch { /* ignore */ }
    const dimAt = (i: number) => {
      const d = Array.isArray(dims) ? (dims as unknown[])[i] : null;
      const w = Array.isArray(d) ? Math.round(Number(d[0])) : NaN;
      const h = Array.isArray(d) ? Math.round(Number(d[1])) : NaN;
      return w > 0 && h > 0 && w <= 12000 && h <= 12000 ? { width: w, height: h } : {};
    };

    let total = 0;
    const prepared: { bytes: Uint8Array; mime: string; ext: string }[] = [];
    for (const f of files) {
      if (f.size > MAX_FILE_BYTES) return json(req, { error: "Each picture must be 8 MB or smaller." }, 413);
      total += f.size;
      if (total > MAX_TOTAL_BYTES) return json(req, { error: "That's a lot of pictures at once — try fewer or smaller ones." }, 413);
      const bytes = new Uint8Array(await f.arrayBuffer());
      const kind = sniff(bytes);
      if (!kind) return json(req, { error: "Only JPG, PNG, WebP or GIF pictures are allowed." }, 415);
      prepared.push({ bytes, ...kind });
    }

    const wall = await ensureWall(sb, user);
    const id = crypto.randomUUID();
    const uploaded: string[] = [];
    const images: { path: string; width?: number; height?: number }[] = [];
    for (let i = 0; i < prepared.length; i++) {
      const p = prepared[i];
      const path = `${wall.id}/${id}/${i}-${crypto.randomUUID().slice(0, 8)}.${p.ext}`;
      const { error } = await sb.storage.from(BUCKET).upload(path, p.bytes, { contentType: p.mime, cacheControl: "31536000", upsert: false });
      if (error) {
        console.error("storage upload failed", error);
        if (uploaded.length) await sb.storage.from(BUCKET).remove(uploaded);
        return json(req, { error: "We couldn't save your pictures. Please try again." }, 500);
      }
      uploaded.push(path);
      images.push({ path, ...dimAt(i) });
    }

    const { data, error } = await sb.from("memories")
      .insert({ id, wall_id: wall.id, caption, display_name, memory_date, images })
      .select("id,caption,display_name,memory_date,images,created_at,like_count").single();
    if (error) {
      console.error("insert failed", error);
      await sb.storage.from(BUCKET).remove(uploaded);
      return json(req, { error: "We couldn't save your memory. Please try again." }, 500);
    }

    const [memory] = await toOut(sb, [data], new Set());
    return json(req, { memory }, 201);
  } catch (err) {
    console.error("submit-memory error", err);
    return json(req, { error: "Server hiccup. Please try again in a moment." }, 500);
  }
});
