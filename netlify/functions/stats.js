// Stats per-identity (supports multi-number). Falls back to single CALLER_ID if identity not supplied.
import twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';

export async function handler(event) {
  try {
    const need = (k) => { const v = process.env[k]; if (!v) throw new Error(`Missing env ${k}`); return v; };
    const ACCOUNT_SID   = need('TWILIO_ACCOUNT_SID');
    const API_KEY_SID   = need('TWILIO_API_KEY_SID');
    const API_KEY_SECRET= need('TWILIO_API_KEY_SECRET');

    const qs = new URLSearchParams(event.queryStringParameters || {});
    const identity = (qs.get('identity') || '').trim();
    const days  = Math.max(1, Math.min(365, parseInt(qs.get('days')  || '30', 10)));
    const limit = Math.max(1, Math.min(5000, parseInt(qs.get('limit') || '1000', 10)));
    const since = new Date(Date.now() - days * 86400000);

    // Resolve FROM numbers
    let fromNumbers = [];
    if (identity) {
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

      if (error || !users || users.length === 0) {
        return { statusCode: 404, headers:{'content-type':'application/json'}, body: JSON.stringify({ identity, byNumber: [], totalMatched: 0, since: since.toISOString(), note: 'invalid identity' }) };
      }
      const user = users[0];
      fromNumbers = Array.isArray(user.caller_ids) ? user.caller_ids : [];
      if (!fromNumbers.length) {
        return { statusCode: 404, headers:{'content-type':'application/json'}, body: JSON.stringify({ identity, byNumber: [], totalMatched: 0, since: since.toISOString(), note: 'no caller IDs configured for this identity' }) };
      }
    } else {
      // Backward-compat: single CALLER_ID env var
      const single = process.env.CALLER_ID;
      if (single) fromNumbers = [single];
    }

    const client = twilio(API_KEY_SID, API_KEY_SECRET, { accountSid: ACCOUNT_SID });

    // Fetch completed calls FROM any of the numbers
    const calls = [];
    for (const from of fromNumbers) {
      const page = await client.calls.list({ from, startTimeAfter: since, status: 'completed', limit });
      calls.push(...page);
    }

    // Group by destination
    const by = new Map();
    for (const c of calls) {
      const dest = c.to || 'unknown';
      const started = (c.startTime || c.dateCreated || new Date()).toISOString?.() || String(c.startTime || c.dateCreated);
      if (!by.has(dest)) by.set(dest, { to: dest, count: 0, timestamps: [] });
      const row = by.get(dest);
      row.count += 1;
      row.timestamps.push(started);
    }
    for (const v of by.values()) {
      v.timestamps.sort((a,b)=>new Date(b)-new Date(a));
      v.recent = v.timestamps.slice(0, 10);
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-cache' },
      body: JSON.stringify({
        since: since.toISOString(),
        identity: identity || null,
        fromNumbers,
        totalMatched: calls.length,
        byNumber: Array.from(by.values()).sort((a,b)=>b.count-a.count)
      })
    };
  } catch (e) {
    return { statusCode: 500, headers: { 'content-type': 'text/plain' }, body: `stats error: ${e.message}` };
  }
}