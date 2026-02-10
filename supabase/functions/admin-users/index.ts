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
    let action = url.searchParams.get("action")?.trim();

    if (!action && req.method === "POST") {
      try {
        const bodyData = await req.json();
        action = bodyData.action || "";
      } catch {
        // Ignore
      }
    }

    if (!identity || !password) {
      return new Response("identity and password are required", {
        status: 400,
        headers: { ...corsHeaders, "content-type": "text/plain" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: users, error: authError } = await supabase
      .from("users")
      .select("id, password, role, identity")
      .eq("identity", identity)
      .limit(1);

    if (authError || !users || users.length === 0 || users[0].password !== password) {
      return new Response("Invalid credentials", {
        status: 403,
        headers: { ...corsHeaders, "content-type": "text/plain" },
      });
    }

    const user = users[0];
    if (user.role !== "admin") {
      return new Response("Only admins can manage users", {
        status: 403,
        headers: { ...corsHeaders, "content-type": "text/plain" },
      });
    }

    switch (action) {
      case "list":
        return await handleListUsers(supabase);
      case "create":
        return await handleCreateUser(supabase, req);
      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400,
          headers: { ...corsHeaders, "content-type": "application/json" },
        });
    }
  } catch (e) {
    console.error("Admin-users error:", e);
    return new Response(JSON.stringify({ error: `admin-users error: ${e.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});

async function handleListUsers(supabase: any) {
  const { data: users, error } = await supabase
    .from("users")
    .select("id, identity, role, caller_ids")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Supabase error listing users:", error);
    return new Response(JSON.stringify({ error: `Failed to fetch users: ${error.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ users: users || [] }), {
    status: 200,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

async function handleCreateUser(supabase: any, req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const { newIdentity, newPassword, role, callerIds } = body;

  if (!newIdentity || !newPassword || !role) {
    return new Response(JSON.stringify({ error: "newIdentity, newPassword, and role are required" }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  if (!["admin", "manager", "caller"].includes(role)) {
    return new Response(JSON.stringify({ error: "role must be admin, manager, or caller" }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const { data: existingUsers, error: checkError } = await supabase
    .from("users")
    .select("id")
    .eq("identity", newIdentity)
    .limit(1);

  if (checkError) {
    console.error("Supabase error checking existing user:", checkError);
    return new Response(JSON.stringify({ error: `Database error: ${checkError.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  if (existingUsers && existingUsers.length > 0) {
    return new Response(JSON.stringify({ error: "User with this identity already exists" }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const { data, error } = await supabase
    .from("users")
    .insert([
      {
        identity: newIdentity,
        password: newPassword,
        role,
        caller_ids: Array.isArray(callerIds) ? callerIds : [],
      },
    ])
    .select();

  if (error) {
    console.error("Supabase error creating user:", error);
    return new Response(JSON.stringify({ error: `Failed to create user: ${error.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ message: "User created successfully", newUser: data[0] }), {
    status: 200,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
