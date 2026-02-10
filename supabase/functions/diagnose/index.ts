import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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
    const diagnostics = {
      supabase: {
        url: !!Deno.env.get("SUPABASE_URL"),
        anonKey: !!Deno.env.get("SUPABASE_ANON_KEY"),
        serviceRoleKey: !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      },
      twilio: {
        accountSid: !!Deno.env.get("TWILIO_ACCOUNT_SID"),
        apiKeySid: !!Deno.env.get("TWILIO_API_KEY_SID"),
        apiKeySecret: !!Deno.env.get("TWILIO_API_KEY_SECRET"),
        twimlAppSid: !!Deno.env.get("TWIML_APP_SID"),
      },
      allConfigured: false,
      missingVariables: [] as string[],
    };

    // Check which variables are missing
    const requiredVars = [
      { name: "TWILIO_ACCOUNT_SID", value: diagnostics.twilio.accountSid },
      { name: "TWILIO_API_KEY_SID", value: diagnostics.twilio.apiKeySid },
      { name: "TWILIO_API_KEY_SECRET", value: diagnostics.twilio.apiKeySecret },
      { name: "TWIML_APP_SID", value: diagnostics.twilio.twimlAppSid },
    ];

    for (const v of requiredVars) {
      if (!v.value) {
        diagnostics.missingVariables.push(v.name);
      }
    }

    diagnostics.allConfigured = diagnostics.missingVariables.length === 0;

    return new Response(JSON.stringify(diagnostics, null, 2), {
      status: 200,
      headers: {
        ...corsHeaders,
        "content-type": "application/json",
      },
    });
  } catch (e) {
    console.error("Diagnose error:", e);
    return new Response(`Diagnose error: ${e.message}`, {
      status: 500,
      headers: { ...corsHeaders, "content-type": "text/plain" },
    });
  }
});
