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
    if (!identity) return { statusCode: 400, body: 'identity is required' };

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Fetch user from Supabase
    const { data: users, error } = await supabase
      .from('users')
      .select('caller_ids')
      .eq('identity', identity)
      .limit(1);

    if (error || !users || users.length === 0) return { statusCode: 404, body: 'invalid identity' };
    const fromList = Array.isArray(users[0].caller_ids) ? users[0].caller_ids : [];
    if (!fromList.length) return { statusCode: 404, body: 'no caller IDs for identity' };

    const norm = (n) => {
      if (!n) return '';
      const s = String(n).replace(/[^\d+]/g, '');
      return s.startsWith('+') ? s : ('+' + s.replace(/^\+/, ''));
    };
    const fromNormSet = new Set(fromList.map(norm));

    const client = twilio(API_KEY_SID, API_KEY_SECRET, { accountSid: ACCOUNT_SID });
    // last 5 completed calls from any allowed number
    let calls = [];
    for (const from of fromList) {
      const sub = await client.calls.list({ from, status: 'completed', limit: 5 });
      calls.push(...sub);
    }
    calls.sort((a,b) => new Date(b.startTime||b.dateCreated) - new Date(a.startTime||a.dateCreated));
    calls = calls.slice(0, 5);

    const out = [];
    for (const c of calls) {
      const recs = await client.recordings.list({ callSid: c.sid, limit: 10 });
      out.push({
        callSid: c.sid,
        from: c.from,
        to: c.to,
        startTime: (c.startTime || c.dateCreated || new Date()).toISOString?.() || String(c.startTime || c.dateCreated),
        durationSec: c.duration ? Number(c.duration) : undefined,
        allowedOwner: fromNormSet.has(norm(c.from)),
        recordings: recs.map(r => ({ recordingSid: r.sid, channels: r.channels, durationSec: r.duration, status: r.status }))
      });
    }

    return { statusCode: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify({ identity, fromList, recent: out }, null, 2) };
  } catch (e) {
    return { statusCode: 500, body: `diagnose error: ${e.message}` };
  }
}