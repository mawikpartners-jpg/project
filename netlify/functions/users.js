// User management function - allows admins to manage users
export async function handler(event) {
  try {
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const identity = (qs.get('identity') || '').trim();
    const password = (qs.get('password') || '').trim();
    const action = (qs.get('action') || '').trim();
    
    if (!identity || !password) {
      return { statusCode: 400, body: 'identity and password are required' };
    }

    // Load and validate user credentials
    let userConfig = {};
    try {
      userConfig = JSON.parse(process.env.USER_CONFIG || '{}');
    } catch {
      return { statusCode: 500, body: 'USER_CONFIG is invalid JSON' };
    }

    const user = userConfig[identity];
    if (!user || user.password !== password) {
      return { statusCode: 403, body: 'Invalid credentials' };
    }

    // Only admins can manage users
    if (user.role !== 'admin') {
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
        return handleListUsers(userConfig, headers);
      
      case 'create':
        return handleCreateUser(event, userConfig, headers);
      
      default:
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid action' }) };
    }
  } catch (e) {
    return { 
      statusCode: 500, 
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      body: JSON.stringify({ error: `users error: ${e.message}` })
    };
  }
}

function handleListUsers(userConfig, headers) {
  const users = Object.keys(userConfig).map(identity => ({
    identity,
    role: userConfig[identity].role,
    callerIds: userConfig[identity].callerIds || []
  }));

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ users })
  };
}

function handleCreateUser(event, userConfig, headers) {
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

  if (!['admin', 'manager', 'caller'].includes(role)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'role must be admin, manager, or caller' }) };
  }

  if (userConfig[newIdentity]) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'User already exists' }) };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ 
      message: 'User creation structure validated',
      newUser: {
        identity: newIdentity,
        role,
        callerIds: callerIds || []
      },
      note: 'In production, add this to USER_CONFIG environment variable and redeploy'
    })
  };
}