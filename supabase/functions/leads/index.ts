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

    switch (action) {
      case "get":
        return await handleGetLeads(supabase, user);
      case "create":
        if (user.role !== "manager" && user.role !== "admin") {
          return new Response(JSON.stringify({ error: "Only managers and admins can create leads" }), {
            status: 403,
            headers: { ...corsHeaders, "content-type": "application/json" },
          });
        }
        return await handleCreateLead(supabase, req, user);
      case "update":
        return await handleUpdateLead(supabase, req, user);
      case "assign":
        if (user.role !== "manager" && user.role !== "admin") {
          return new Response(JSON.stringify({ error: "Only managers and admins can assign leads" }), {
            status: 403,
            headers: { ...corsHeaders, "content-type": "application/json" },
          });
        }
        return await handleAssignLead(supabase, req, user);
      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400,
          headers: { ...corsHeaders, "content-type": "application/json" },
        });
    }
  } catch (e) {
    console.error("Leads error:", e);
    return new Response(JSON.stringify({ error: `leads error: ${e.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});

async function handleGetLeads(supabase: any, user: any) {
  let query = supabase.from("leads").select("*");

  switch (user.role) {
    case "admin":
    case "manager":
      break;
    case "caller":
      query = query.or(`assigned_to.eq.${user.identity},assigned_to.is.null`);
      break;
    default:
      return new Response(JSON.stringify({ error: "Invalid user role" }), {
        status: 403,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
  }

  query = query.order("created_at", { ascending: false });

  const { data: leads, error } = await query;
  if (error) {
    console.error("Supabase error fetching leads:", error);
    return new Response(JSON.stringify({ error: `Failed to fetch leads: ${error.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ leads: leads || [], userRole: user.role }), {
    status: 200,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

async function handleCreateLead(supabase: any, req: Request, user: any) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const { phoneNumber, leadInfo, assignedTo } = body;

  if (!phoneNumber || !leadInfo) {
    return new Response(JSON.stringify({ error: "phoneNumber and leadInfo are required" }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const newLead = {
    phone_number: phoneNumber.trim(),
    lead_info: leadInfo.trim(),
    assigned_to: assignedTo || null,
    status: "new",
    created_by: user.identity,
    notes: "",
    updated_by: user.identity,
  };

  const { data, error } = await supabase.from("leads").insert([newLead]).select();
  if (error) {
    console.error("Supabase error creating lead:", error);
    return new Response(JSON.stringify({ error: `Failed to create lead: ${error.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ message: "Lead created successfully", lead: data[0] }), {
    status: 200,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

async function handleUpdateLead(supabase: any, req: Request, user: any) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const { leadId, notes, status } = body;

  if (!leadId) {
    return new Response(JSON.stringify({ error: "leadId is required" }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const { data: existingLeads, error: fetchError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .limit(1);

  if (fetchError || !existingLeads || existingLeads.length === 0) {
    return new Response(JSON.stringify({ error: "Lead not found" }), {
      status: 404,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const lead = existingLeads[0];

  if (user.role === "caller" && lead.assigned_to !== user.identity) {
    return new Response(JSON.stringify({ error: "You can only update your assigned leads" }), {
      status: 403,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const updateData: any = {};
  if (notes !== undefined) updateData.notes = notes;
  if (status !== undefined) updateData.status = status;
  updateData.updated_at = new Date().toISOString();
  updateData.updated_by = user.identity;

  const { data, error } = await supabase.from("leads").update(updateData).eq("id", leadId).select();
  if (error) {
    console.error("Supabase error updating lead:", error);
    return new Response(JSON.stringify({ error: `Failed to update lead: ${error.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ message: "Lead updated successfully", lead: data[0] }), {
    status: 200,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

async function handleAssignLead(supabase: any, req: Request, user: any) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const { leadId, assignedTo } = body;

  if (!leadId || !assignedTo) {
    return new Response(JSON.stringify({ error: "leadId and assignedTo are required" }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const { data: existingLeads, error: fetchError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .limit(1);

  if (fetchError || !existingLeads || existingLeads.length === 0) {
    return new Response(JSON.stringify({ error: "Lead not found" }), {
      status: 404,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  const updateData = {
    assigned_to: assignedTo,
    updated_at: new Date().toISOString(),
    updated_by: user.identity,
  };

  const { data, error } = await supabase.from("leads").update(updateData).eq("id", leadId).select();
  if (error) {
    console.error("Supabase error assigning lead:", error);
    return new Response(JSON.stringify({ error: `Failed to assign lead: ${error.message}` }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ message: "Lead assigned successfully", lead: data[0] }), {
    status: 200,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
