// Returns user information including role after authentication
import { createClient } from '@supabase/supabase-js';

export async function handler(event) {
  try {
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const identity = (qs.get('identity') || '').trim();
    const password = (qs.get('password') || '').trim();
    
    if (!identity || !password) {
      return { statusCode: 400, body: 'identity and password are required' };
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Fetch user from Supabase
    const { data: users, error } = await supabase
      .from('users')
      .select('id, password, role, caller_ids')
      .eq('identity', identity)
      .limit(1);

    if (error) {
      console.error('Supabase error:', error);
      return { statusCode: 500, body: 'Database error' };
    }

    if (!users || users.length === 0 || users[0].password !== password) { // In a real app, hash and compare passwords
      return { statusCode: 403, body: 'Invalid credentials' };
    }
    const user = users[0];

    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*'
      },
      body: JSON.stringify({
        identity,
        role: user.role || 'caller',
        callerIds: user.caller_ids || []
      })
    };
  } catch (e) {
    return { 
      statusCode: 500, 
      headers: { 'content-type': 'text/plain' },
      body: `user-info error: ${e.message}` 
    };
  }
}