import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.44.4";
import * as jwt from "npm:jsonwebtoken@9.0.2";

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
    const url = new URL(req.url);
    const identity = url.searchParams.get("identity")?.trim();
    const password = url.searchParams.get("password")?.trim();

    if (!identity || !password) {
      return new Response("identity and password are required", {
        status: 400,
        headers: { ...corsHeaders, "content-type": "text/plain" },
      });
    }

    // Get Twilio credentials from environment
    const ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const API_KEY_SID = Deno.env.get("TWILIO_API_KEY_SID");
    const API_KEY_SECRET = Deno.env.get("TWILIO_API_KEY_SECRET");
    const TWIML_APP_SID = Deno.env.get("TWIML_APP_SID");

    if (!ACCOUNT_SID || !API_KEY_SID || !API_KEY_SECRET || !TWIML_APP_SID) {
      return new Response("Twilio configuration missing", {
        status: 500,
        headers: { ...corsHeaders, "content-type": "text/plain" },
      });
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch user from Supabase
    const { data: users, error } = await supabase
      .from("users")
      .select("id, password, role, caller_ids")
      .eq("identity", identity)
      .limit(1);

    if (error) {
      console.error("Supabase error:", error);
      return new Response("Database error", {
        status: 500,
        headers: { ...corsHeaders, "content-type": "text/plain" },
      });
    }

    if (!users || users.length === 0) {
      return new Response("Invalid credentials", {
        status: 403,
        headers: { ...corsHeaders, "content-type": "text/plain" },
      });
    }

    const user = users[0];
    if (user.password !== password) {
      return new Response("Invalid credentials", {
        status: 403,
        headers: { ...corsHeaders, "content-type": "text/plain" },
      });
    }

    // Create Twilio Access Token
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 3600; // 1 hour

    const voiceGrant = {
      outgoing: {
        application_sid: TWIML_APP_SID,
      },
    };

    const payload = {
      jti: `${API_KEY_SID}-${now}`,
      grants: {
        identity: identity,
        voice: voiceGrant,
      },
      iss: API_KEY_SID,
      sub: ACCOUNT_SID,
      exp: exp,
      nbf: now,
    };

    const token = jwt.sign(payload, API_KEY_SECRET, { algorithm: "HS256" });

    return new Response(
      JSON.stringify({ token, identity }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      }
    );
  } catch (e) {
    console.error("Token error:", e);
    return new Response(`token error: ${e.message}`, {
      status: 500,
      headers: { ...corsHeaders, "content-type": "text/plain" },
    });
  }
});
