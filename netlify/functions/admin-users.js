// User management function - allows admins to manage users
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
    if (user.role !== 'admin') { // Only admins can manage users
      return { statusCode: 403, body: 'Only admins can manage users' };
    }

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
      case 'list':
        return handleListUsers(supabase, headers);
      
      case 'create':
        return handleCreateUser(supabase, event, headers);
      
      default:
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid action' }) };
    }
  } catch (e) {
    return { 
      statusCode: 500, 
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      body: JSON.stringify({ error: `admin-users error: ${e.message}` })
    };
  }
}

async function handleListUsers(supabase, headers) {
  const { data: users, error } = await supabase
    .from('users')
    .select('id, identity, role, caller_ids')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Supabase error listing users:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: `Failed to fetch users: ${error.message}` }) };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ users: users || [] })
  };
}

async function handleCreateUser(supabase, event, headers) {
  let body = {};
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { newIdentity, newPassword, role, callerIds } = body;
  
  if (!newIdentity || !newPassword || !role) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'newIdentity, newPassword, and role are required' }) };
  }

  if (!['admin', 'manager', 'caller'].includes(role)) { // Validate role
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'role must be admin, manager, or caller' }) };
  }

  // Check if user already exists
  const { data: existingUsers, error: checkError } = await supabase
    .from('users')
    .select('id')
    .eq('identity', newIdentity)
    .limit(1);

  if (checkError) {
    console.error('Supabase error checking existing user:', checkError);
    return { statusCode: 500, headers, body: JSON.stringify({ error: `Database error: ${checkError.message}` }) };
  }

  if (existingUsers && existingUsers.length > 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'User with this identity already exists' }) };
  }

  // Create user in Supabase
  const { data, error } = await supabase.from('users').insert([{
    identity: newIdentity,
    password: newPassword, // In a real app, hash this password
    role,
    caller_ids: Array.isArray(callerIds) ? callerIds : []
  }]).select();

  if (error) {
    console.error('Supabase error creating user:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: `Failed to create user: ${error.message}` }) };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      message: 'User created successfully',
      newUser: data[0]
    })
  };
}