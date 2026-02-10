// Securely proxy Twilio recording audio files
import twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';

export async function handler(event) {
  try {
    const need = (k) => { const v = process.env[k]; if (!v) throw new Error(`Missing env ${k}`); return v; };
    const ACCOUNT_SID = need('TWILIO_ACCOUNT_SID');
    const API_KEY_SID = need('TWILIO_API_KEY_SID');
    const API_KEY_SECRET = need('TWILIO_API_KEY_SECRET');

    const qs = new URLSearchParams(event.queryStringParameters || {});
    const identity = (qs.get('identity') || '').trim();
    const sid = (qs.get('sid') || '').trim();
    const fmt = (qs.get('fmt') || 'mp3').toLowerCase(); // 'mp3' or 'wav'

    if (!identity) return { statusCode: 400, body: 'identity is required' };
    if (!sid) return { statusCode: 400, body: 'sid is required' };
    if (!['mp3', 'wav'].includes(fmt)) return { statusCode: 400, body: 'fmt must be mp3 or wav' };

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Fetch user from Supabase to get allowed caller IDs
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('caller_ids')
      .eq('identity', identity)
      .limit(1);

    if (userError || !users || users.length === 0) return { statusCode: 403, body: 'invalid identity' };
    const allowed = Array.isArray(users[0].caller_ids) ? users[0].caller_ids : [];
    if (!allowed.length) return { statusCode: 403, body: 'no caller IDs configured' };

    const client = twilio(API_KEY_SID, API_KEY_SECRET, { accountSid: ACCOUNT_SID });
    const rec = await client.recordings(sid).fetch();           // has callSid
    const call = await client.calls(rec.callSid).fetch();       // verify origin
    
    // Normalize numbers: keep digits and leading +
    const norm = (n) => {
      if (!n) return '';
      const s = String(n).replace(/[^\d+]/g, '');
      return s.startsWith('+') ? s : ('+' + s.replace(/^\+/, ''));
    };

    if (!allowedNorm.has(fromNorm)) {
      return { statusCode: 403, body: `forbidden: recording not owned by your caller IDs (call.from=${call.from})` };
    }

    // fetch media bytes from Twilio 2010 API using Basic auth with API Key/Secret
    const mediaUrl = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Recordings/${encodeURIComponent(sid)}.${fmt}`;
    const auth = Buffer.from(`${API_KEY_SID}:${API_KEY_SECRET}`).toString('base64');
    const res = await fetch(mediaUrl, { headers: { Authorization: `Basic ${auth}` } });
    if (!res.ok) {
      const text = await res.text();
      return { statusCode: res.status, body: `media fetch failed: ${text}` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = fmt === 'mp3' ? 'audio/mpeg' : 'audio/wav';

    return {
      statusCode: 200,
      headers: {
        'content-type': ct,
        'content-disposition': `inline; filename="${sid}.${fmt}"`,
        'cache-control': 'no-store'
      },
      isBase64Encoded: true,
      body: buf.toString('base64')
    };
  } catch (e) {
    return { 
      statusCode: 500, 
      headers: { 'content-type': 'text/plain' }, 
      body: `recording-media error: ${e.message}` 
    };
  }
}