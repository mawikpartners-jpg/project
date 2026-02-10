import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.44.4";

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

    if (!users || users.length === 0 || users[0].password !== password) {
      return new Response("Invalid credentials", {
        status: 403,
        headers: { ...corsHeaders, "content-type": "text/plain" },
      });
    }

    const user = users[0];

    return new Response(
      JSON.stringify({
        identity,
        role: user.role || "caller",
        callerIds: user.caller_ids || [],
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "content-type": "application/json",
        },
      }
    );
  } catch (e) {
    console.error("User-info error:", e);
    return new Response(`user-info error: ${e.message}`, {
      status: 500,
      headers: { ...corsHeaders, "content-type": "text/plain" },
    });
  }
});
