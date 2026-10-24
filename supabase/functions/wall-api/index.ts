// Edge Function: wall-api
// One endpoint for everything except uploading pictures:
//   view    (share link)  -> read someone's wall
//   like    (share link)  -> like / unlike a memory
//   mine    (logged in)   -> read my own wall (created on first use)
//   rotate  (logged in)   -> make a new share link (old one stops working)
//   title   (logged in)   -> rename my wall
//   delete  (logged in)   -> delete one of my memories
//
// Deploy:  supabase functions deploy wall-api --no-verify-jwt

import {
  adminClient, BUCKET, clientIp, corsHeaders, ensureWall, json, memoriesPage, PAGE,
  randomHex, rateLimit, userFrom,
} from "../_shared/common.ts";

const TOKEN = /^[0-9a-f]{32}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIKES_PER_HOUR = Number(Deno.env.get("LIKE_LIMIT_PER_HOUR") ?? "240");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405);

  try {
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* ignore */ }
    const action = String(body.action ?? "");
    const sb = adminClient();
    const offset = Math.max(0, Math.min(100000, Math.floor(Number(body.offset)) || 0));
    const voter = typeof body.voter_id === "string" && UUID.test(body.voter_id) ? body.voter_id : "";

    // ----- actions that need the wall's share link, not a login -----
    if (action === "view" || action === "like") {
      const t = String(body.token ?? "").toLowerCase();
      const notFound = "This wall link doesn't work (anymore). Ask for a fresh link.";
      if (!TOKEN.test(t)) return json(req, { error: notFound }, 404);
      const { data: wall } = await sb.from("walls").select("id,title,owner_id").eq("share_token", t).maybeSingle();
      if (!wall) return json(req, { error: notFound }, 404);

      if (action === "view") {
        const user = await userFrom(req, sb);
        const page = await memoriesPage(sb, wall.id, offset, PAGE, voter);
        return json(req, { wall: { title: wall.title }, is_owner: !!user && user.id === wall.owner_id, ...page });
      }

      const memoryId = String(body.memory_id ?? "");
      if (!UUID.test(memoryId) || !voter) return json(req, { error: "Invalid request." }, 400);
      const { data: mem } = await sb.from("memories").select("id").eq("id", memoryId).eq("wall_id", wall.id).maybeSingle();
      if (!mem) return json(req, { error: "That memory isn't on this wall." }, 404);
      if (!(await rateLimit(sb, clientIp(req), "like", LIKES_PER_HOUR, 3600))) {
        return json(req, { error: "That's a lot of hearts! Please slow down a little." }, 429);
      }
      if (body.on === false) {
        await sb.from("likes").delete().eq("memory_id", memoryId).eq("voter_id", voter);
      } else {
        await sb.from("likes").upsert({ memory_id: memoryId, voter_id: voter }, { onConflict: "memory_id,voter_id", ignoreDuplicates: true });
      }
      const { data: m } = await sb.from("memories").select("like_count").eq("id", memoryId).single();
      return json(req, { like_count: m?.like_count ?? 0 });
    }

    // ----- everything below needs a logged-in owner -----
    const user = await userFrom(req, sb);
    if (!user) return json(req, { error: "Please log in." }, 401);
    const wall = await ensureWall(sb, user);

    if (action === "mine") {
      const page = await memoriesPage(sb, wall.id, offset, PAGE, "");
      return json(req, { wall: { title: wall.title, share_token: wall.share_token }, is_owner: true, ...page });
    }

    if (action === "rotate") {
      const share_token = randomHex(16);
      const { error } = await sb.from("walls").update({ share_token }).eq("id", wall.id);
      if (error) throw error;
      return json(req, { share_token });
    }

    if (action === "title") {
      const title = String(body.title ?? "").replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
      if (title.length < 1 || title.length > 60) return json(req, { error: "Wall names can be 1–60 characters." }, 400);
      const { error } = await sb.from("walls").update({ title }).eq("id", wall.id);
      if (error) throw error;
      return json(req, { title });
    }

    if (action === "delete") {
      const id = String(body.memory_id ?? "");
      if (!UUID.test(id)) return json(req, { error: "Invalid memory id." }, 400);
      const { data: row } = await sb.from("memories").select("images").eq("id", id).eq("wall_id", wall.id).maybeSingle();
      if (!row) return json(req, { error: "Memory not found." }, 404);
      const paths = ((row.images ?? []) as { path: string }[]).map((i) => i.path).filter(Boolean);
      if (paths.length) {
        const { error } = await sb.storage.from(BUCKET).remove(paths);
        if (error) console.error("storage remove failed", error);
      }
      const { error } = await sb.from("memories").delete().eq("id", id).eq("wall_id", wall.id);
      if (error) throw error;
      return json(req, { ok: true });
    }

    return json(req, { error: "Unknown action." }, 400);
  } catch (err) {
    console.error("wall-api error", err);
    return json(req, { error: "Server hiccup. Please try again in a moment." }, 500);
  }
});
