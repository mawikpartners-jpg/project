// Find recent calls. If a call belongs to a parent call (From=client:ID),
// also resolve its child PSTN leg and validate ownership against caller IDs.
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
    const toFilter = (qs.get('to') || '').trim();
    const days  = Math.max(1, Math.min(365, parseInt(qs.get('days')  || '30', 10)));
    const limit = Math.max(1, Math.min(5000, parseInt(qs.get('limit') || '500', 10)));
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

    if (error || !users || users.length === 0) return { statusCode: 403, body: 'invalid identity' };
    const allowed = Array.isArray(users[0].caller_ids) ? users[0].caller_ids : [];
    if (!allowed.length) return { statusCode: 403, body: 'no caller IDs configured for this identity' };

    const norm = (n) => {
      if (!n) return '';
      const s = String(n).replace(/[^\d+]/g, '');
      return s.startsWith('+') ? s : ('+' + s.replace(/^\+/, ''));
    };
    const allowedNorm = new Set(allowed.map(norm));
    const toNorm = toFilter ? norm(toFilter) : '';

    const since = new Date(Date.now() - days * 86400000);
    const client = twilio(API_KEY_SID, API_KEY_SECRET, { accountSid: ACCOUNT_SID });

    // Pull recent recordings to find associated calls
    const recs = await client.recordings.list({
      dateCreatedAfter: since,
      limit
    });

    const items = [];
    for (const r of recs) {
      let call;
      try { call = await client.calls(r.callSid).fetch(); } catch { continue; }

      // Determine ownership:
      // - If call.from is one of our Twilio numbers, good.
      // - If call.from is 'client:<identity>', look up its child leg(s) and check their 'from'.
      const fromN = norm(call.from);
      const toN   = norm(call.to);

      let owned = allowedNorm.has(fromN);
      let owningChild = null;

      if (!owned && call.from && String(call.from).startsWith('client:')) {
        const children = await client.calls.list({ parentCallSid: call.sid, limit: 5 });
        for (const ch of children) {
          const chFromN = norm(ch.from);
          if (allowedNorm.has(chFromN)) {
            owned = true;
            owningChild = ch;
            break;
          }
        }
      }

      if (!owned) continue;
      if (toNorm && toN !== toNorm) continue;

      const ownerCall = owningChild || call;
      items.push({
        callSid: r.callSid,
        ownerCallSid: ownerCall.sid,
        to: ownerCall.to || call.to,
        from: ownerCall.from || call.from,
        startTime: (ownerCall.startTime || ownerCall.dateCreated || call.startTime || call.dateCreated || new Date()).toISOString?.() || String(ownerCall.startTime || ownerCall.dateCreated || call.startTime || call.dateCreated),
        durationSec: ownerCall.duration ? Number(ownerCall.duration) : (call.duration ? Number(call.duration) : undefined)
      });
    }

    items.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      body: JSON.stringify({ identity, since: since.toISOString(), count: items.length, items })
    };
  } catch (e) {
    return { statusCode: 500, headers: { 'content-type': 'text/plain' }, body: `recordings error: ${e.message}` };
  }
}