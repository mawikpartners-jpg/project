// Lead management function - handles CRUD operations for leads
import { createClient } from '@supabase/supabase-js';

export async function handler(event) {
  try {
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const identity = (qs.get('identity') || '').trim();
    const password = (qs.get('password') || '').trim();
    
    let action = (qs.get('action') || '').trim();
    
    // For POST requests, try to get action from body
    if (!action && event.body) {
      try {
        const bodyData = JSON.parse(event.body);
        action = bodyData.action || '';
      } catch {
        // Ignore JSON parse errors for action extraction
      }
    }
    
    if (!identity || !password) {
      return { statusCode: 400, body: 'identity and password are required' };
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Authenticate user against Supabase
    const { data: users, error: authError } = await supabase
      .from('users')
      .select('id, password, role, identity')
      .eq('identity', identity)
      .limit(1);

    if (authError) {
      console.error('Supabase auth error:', authError);
      return { statusCode: 500, body: 'Database error' };
    }

    if (!users || users.length === 0 || users[0].password !== password) { // In a real app, hash and compare passwords
      return { statusCode: 403, body: 'Invalid credentials' };
    }
    const user = users[0];

    const headers = {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'access-control-allow-headers': 'Content-Type'
    };

    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers };
    }

    switch (action) {
      case 'get':
        return handleGetLeads(supabase, user, headers);
      
      case 'create':
        if (user.role !== 'manager' && user.role !== 'admin') {
          return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only managers and admins can create leads' }) };
        }
        return handleCreateLead(supabase, event, user, headers);
      
      case 'update':
        return handleUpdateLead(supabase, event, user, headers);
      
      case 'assign':
        if (user.role !== 'manager' && user.role !== 'admin') {
          return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only managers and admins can assign leads' }) };
        }
        return handleAssignLead(supabase, event, user, headers);
      
      default:
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid action' }) };
    }
  } catch (e) {
    return { 
      statusCode: 500, 
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      body: JSON.stringify({ error: `leads error: ${e.message}` })
    };
  }
}

async function handleGetLeads(supabase, user, headers) {
  let query = supabase.from('leads').select('*');

  switch (user.role) {
    case 'admin':
    case 'manager':
      // Admins and managers see all leads
      break;
    
    case 'caller':
      // Callers see only their assigned leads or unassigned leads
      query = query.or(`assigned_to.eq.${user.identity},assigned_to.is.null`);
      break;
    
    default:
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Invalid user role' }) };
  }

  query = query.order('created_at', { ascending: false });

  const { data: leads, error } = await query;
  if (error) {
    console.error('Supabase error fetching leads:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: `Failed to fetch leads: ${error.message}` }) };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ leads: leads || [], userRole: user.role })
  };
}

async function handleCreateLead(supabase, event, user, headers) {
  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { phoneNumber, leadInfo, assignedTo } = body;
  
  if (!phoneNumber || !leadInfo) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'phoneNumber and leadInfo are required' }) };
  }

  const newLead = {
    phone_number: phoneNumber.trim(),
    lead_info: leadInfo.trim(),
    assigned_to: assignedTo || null,
    status: 'new',
    created_by: user.identity,
    notes: '',
    updated_by: user.identity
  };

  const { data, error } = await supabase.from('leads').insert([newLead]).select();
  if (error) {
    console.error('Supabase error creating lead:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: `Failed to create lead: ${error.message}` }) };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ 
      message: 'Lead created successfully', 
      lead: data[0]
    })
  };
}

async function handleUpdateLead(supabase, event, user, headers) {
  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { leadId, notes, status } = body;
  
  if (!leadId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'leadId is required' }) };
  }

  const { data: existingLeads, error: fetchError } = await supabase.from('leads').select('*').eq('id', leadId).limit(1);
  if (fetchError) {
    console.error('Supabase error fetching lead:', fetchError);
    return { statusCode: 500, headers, body: JSON.stringify({ error: `Database error: ${fetchError.message}` }) };
  }
  
  if (!existingLeads || existingLeads.length === 0) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Lead not found' }) };
  }
  const lead = existingLeads[0];

  // Callers can only update leads assigned to them
  if (user.role === 'caller' && lead.assigned_to !== user.identity) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'You can only update your assigned leads' }) };
  }

  const updateData = {};
  if (notes !== undefined) updateData.notes = notes;
  if (status !== undefined) updateData.status = status;
  updateData.updated_at = new Date().toISOString();
  updateData.updated_by = user.identity;

  const { data, error } = await supabase.from('leads').update(updateData).eq('id', leadId).select();
  if (error) {
    console.error('Supabase error updating lead:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: `Failed to update lead: ${error.message}` }) };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ 
      message: 'Lead updated successfully', 
      lead: data[0]
    })
  };
}

async function handleAssignLead(supabase, event, user, headers) {
  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { leadId, assignedTo } = body;
  
  if (!leadId || !assignedTo) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'leadId and assignedTo are required' }) };
  }

  const { data: existingLeads, error: fetchError } = await supabase.from('leads').select('*').eq('id', leadId).limit(1);
  if (fetchError) {
    console.error('Supabase error fetching lead:', fetchError);
    return { statusCode: 500, headers, body: JSON.stringify({ error: `Database error: ${fetchError.message}` }) };
  }
  
  if (!existingLeads || existingLeads.length === 0) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Lead not found' }) };
  }

  const updateData = {
    assigned_to: assignedTo,
    updated_at: new Date().toISOString(),
    updated_by: user.identity
  };

  const { data, error } = await supabase.from('leads').update(updateData).eq('id', leadId).select();
  if (error) {
    console.error('Supabase error assigning lead:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: `Failed to assign lead: ${error.message}` }) };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ 
      message: 'Lead assigned successfully', 
      lead: data[0]
    })
  };
}