import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.44.4";
import twilio from "npm:twilio@4.20.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const API_KEY_SID = Deno.env.get("TWILIO_API_KEY_SID");
    const API_KEY_SECRET = Deno.env.get("TWILIO_API_KEY_SECRET");

    if (!ACCOUNT_SID || !API_KEY_SID || !API_KEY_SECRET) {
      return new Response("Twilio configuration missing", {
        status: 500,
        headers: { ...corsHeaders, "content-type": "text/plain" },
      });
    }

    const url = new URL(req.url);
    const identity = url.searchParams.get("identity")?.trim();
    const password = url.searchParams.get("password")?.trim();
    const toFilter = url.searchParams.get("to")?.trim();
    const days = Math.max(1, Math.min(365, parseInt(url.searchParams.get("days") || "30", 10)));
    const limit = Math.max(1, Math.min(5000, parseInt(url.searchParams.get("limit") || "500", 10)));

    if (!identity || !password) {
      return new Response("identity and password are required", {
        status: 400,
        headers: { ...corsHeaders, "content-type": "text/plain" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: users, error } = await supabase
      .from("users")
      .select("caller_ids, password")
      .eq("identity", identity)
      .limit(1);

    if (error || !users || users.length === 0 || users[0].password !== password) {
      return new Response("Invalid credentials", {
        status: 403,
        headers: { ...corsHeaders, "content-type": "text/plain" },
      });
    }

    const allowed = Array.isArray(users[0].caller_ids) ? users[0].caller_ids : [];
    if (!allowed.length) {
      return new Response("No caller IDs configured for this identity", {
        status: 403,
        headers: { ...corsHeaders, "content-type": "text/plain" },
      });
    }

    const norm = (n: any) => {
      if (!n) return "";
      const s = String(n).replace(/[^\d+]/g, "");
      return s.startsWith("+") ? s : "+" + s.replace(/^\+/, "");
    };

    const allowedNorm = new Set(allowed.map(norm));
    const toNorm = toFilter ? norm(toFilter) : "";

    const since = new Date(Date.now() - days * 86400000);
    const client = twilio(API_KEY_SID, API_KEY_SECRET, { accountSid: ACCOUNT_SID });

    const recs = await client.recordings.list({
      dateCreatedAfter: since,
      limit,
    });

    const items = [];
    for (const r of recs) {
      let call;
      try {
        call = await client.calls(r.callSid).fetch();
      } catch {
        continue;
      }

      const fromN = norm(call.from);
      const toN = norm(call.to);

      let owned = allowedNorm.has(fromN);
      let owningChild = null;

      if (!owned && call.from && String(call.from).startsWith("client:")) {
        const children = await client.calls.list({ parentCallSid: call.sid, limit: 5 });
        for (const ch of children) {
          const chFromN = norm(ch.from);
          if (allowedNorm.has(chFromN)) {
            owned = true;
            owningChild = ch;
            break;
          }
        }
      }

      if (!owned) continue;
      if (toNorm && toN !== toNorm) continue;

      const ownerCall = owningChild || call;
      items.push({
        callSid: r.callSid,
        ownerCallSid: ownerCall.sid,
        to: ownerCall.to || call.to,
        from: ownerCall.from || call.from,
        startTime:
          (ownerCall.startTime || ownerCall.dateCreated || call.startTime || call.dateCreated || new Date())
            .toISOString?.() ||
          String(ownerCall.startTime || ownerCall.dateCreated || call.startTime || call.dateCreated),
        durationSec: ownerCall.duration ? Number(ownerCall.duration) : call.duration ? Number(call.duration) : undefined,
      });
    }

    items.sort((a: any, b: any) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

    return new Response(
      JSON.stringify({ identity, since: since.toISOString(), count: items.length, items }),
      {
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
      }
    );
  } catch (e) {
    console.error("Recordings error:", e);
    return new Response(`recordings error: ${e.message}`, {
      status: 500,
      headers: { ...corsHeaders, "content-type": "text/plain" },
    });
  }
});
