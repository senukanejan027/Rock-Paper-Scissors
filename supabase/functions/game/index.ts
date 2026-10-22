
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Return JSON responses with CORS headers.
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

// Supabase server-side admin client.
// Never expose the service role key to the frontend.
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const admin = createClient(supabaseUrl, serviceRoleKey);

const hits = new Map<string, number[]>();

Deno.serve(async (req: Request) => {
  // Handle browser CORS preflight requests first.
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  // Only accept POST requests for game actions.
  if (req.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  try {
    // Authenticate the caller using their Supabase access token.
    const authorization = req.headers.get("Authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return json({ error: "UNAUTHENTICATED" }, 401);
    }

    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(token);

    if (authError || !user) {
      return json({ error: "UNAUTHENTICATED" }, 401);
    }

    // Best-effort per-instance rate limit.
    const now = Date.now();
    const recent = (hits.get(user.id) ?? []).filter(
      (timestamp) => now - timestamp < 10_000,
    );

    if (recent.length >= 15) {
      return json({ error: "RATE_LIMIT" }, 429);
    }

    hits.set(user.id, [...recent, now]);

    // Validate request body.
    let body: Record<string, unknown>;

    try {
      const parsed: unknown = await req.json();

      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        return json({ error: "BAD_REQUEST" }, 400);
      }

      body = parsed as Record<string, unknown>;
    } catch {
      return json({ error: "BAD_REQUEST" }, 400);
    }

    const code = String(body.code ?? "").trim().toUpperCase();
    const name = String(body.name ?? "")
      .replace(/[\u0000-\u001f<>]/g, "")
      .trim()
      .slice(0, 20);

    const codeOk = /^[A-HJ-NP-Z2-9]{5}$/.test(code);
    const uid = user.id;

    let result;

    switch (body.action) {
      case "create": {
        if (!name) {
          return json({ error: "INVALID_NAME" }, 400);
        }

        result = await admin.rpc("create_room", {
          p_user: uid,
          p_name: name,
        });
        break;
      }

      case "join": {
        if (!name) {
          return json({ error: "INVALID_NAME" }, 400);
        }

        if (!codeOk) {
          return json({ error: "ROOM_NOT_FOUND" }, 404);
        }

        result = await admin.rpc("join_room", {
          p_user: uid,
          p_code: code,
          p_name: name,
        });
        break;
      }

      case "move": {
        if (!codeOk) {
          return json({ error: "ROOM_NOT_FOUND" }, 404);
        }

        if (
          !["rock", "paper", "scissors"].includes(String(body.move))
        ) {
          return json({ error: "INVALID_MOVE" }, 400);
        }

        result = await admin.rpc("submit_move", {
          p_user: uid,
          p_code: code,
          p_move: String(body.move),
        });
        break;
      }

      case "reset": {
        if (!codeOk) {
          return json({ error: "ROOM_NOT_FOUND" }, 404);
        }

        result = await admin.rpc("reset_room", {
          p_user: uid,
          p_code: code,
        });
        break;
      }

      case "leave": {
        if (!codeOk) {
          return json({ error: "ROOM_NOT_FOUND" }, 404);
        }

        result = await admin.rpc("leave_room", {
          p_user: uid,
          p_code: code,
        });
        break;
      }

      default:
        return json({ error: "BAD_REQUEST" }, 400);
    }

    if (result.error) {
      console.error("Game RPC error:", result.error.message);
      return json({ error: result.error.message }, 400);
    }

    return json({ ok: true, data: result.data });
  } catch (error) {
    console.error("Unexpected game function error:", error);

    return json({ error: "INTERNAL_SERVER_ERROR" }, 500);
  }
});
