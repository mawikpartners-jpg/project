// Returns a short-lived Twilio Access Token (JWT) with a VoiceGrant
import twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';

export async function handler(event) {
  try {
    const { jwt:{ AccessToken } } = twilio;
    const VoiceGrant = AccessToken.VoiceGrant;

    const need = k => { if(!process.env[k]) throw new Error(`Missing env: ${k}`); return process.env[k]; };
    const ACCOUNT_SID   = need('TWILIO_ACCOUNT_SID');  // AC...
    const API_KEY_SID   = need('TWILIO_API_KEY_SID');  // SK...
    const API_KEY_SECRET= need('TWILIO_API_KEY_SECRET');
    const TWIML_APP_SID = need('TWIML_APP_SID');       // AP...

    const qs = new URLSearchParams(event.queryStringParameters || {});
    const identity = (qs.get('identity') || '').trim();
    const password = (qs.get('password') || '').trim();
    if (!identity || !password) throw new Error('identity and password are required');

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
      return {
        statusCode: 500,
        headers: { 'content-type': 'text/plain' },
        body: 'Database error'
      };
    }

    if (!users || users.length === 0) {
      return {
        statusCode: 403,
        headers: { 'content-type': 'text/plain' },
        body: 'Invalid credentials'
      };
    }

    const user = users[0];
    if (user.password !== password) { // In a real app, hash and compare passwords
      return {
        statusCode: 403,
        headers: { 'content-type': 'text/plain' },
        body: 'Invalid credentials'
      };
    }

    // ✅ identity and password validated, create token:
    const token = new AccessToken(ACCOUNT_SID, API_KEY_SID, API_KEY_SECRET, {
      identity,
      ttl: 3600
    });

    token.addGrant(new VoiceGrant({ outgoingApplicationSid: TWIML_APP_SID }));

    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*'
      },
      body: JSON.stringify({ token: token.toJwt(), identity })
    };
  } catch (e) {
    return { statusCode: 500, headers: { 'content-type': 'text/plain' }, body: `token error: ${e.message}` };
  }
}