// TwiML webhook: Twilio calls this URL when you place an outbound call from the browser.
// It dials the PSTN number with your configured CALLER_ID and enables dual-channel recording.
import twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';

export async function handler(event) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  // Twilio sends application/x-www-form-urlencoded by default.
  const body = event.body || '';
  const ct = (event.headers?.['content-type'] || '').toLowerCase();
  const isForm = ct.includes('application/x-www-form-urlencoded');
  const params = isForm ? new URLSearchParams(body) : new URLSearchParams(event.queryStringParameters || {});
  
  const to = (params.get('To') || '').replace(/[^+\d]/g, ''); // sanitize: keep + and digits
  const requestedCallerId = (params.get('CallerId') || '').replace(/[^+\d]/g, '');

  // token identity shows up as From=client:IDENTITY on the parent call; we also accept explicit Identity param
  const fromRaw = params.get('From') || '';
  const identity = fromRaw.startsWith('client:') ? fromRaw.slice(7) : (params.get('Identity') || '').trim();

  // Build absolute callback URLs from the current host so you don't have to hardcode
  const proto = (event.headers?.['x-forwarded-proto'] || 'https');
  const host = (event.headers?.['x-forwarded-host'] || event.headers?.host);
  const base = `${proto}://${host}`;
  const dialStatusCb = `${base}/.netlify/functions/call-events`;
  const recStatusCb = `${base}/.netlify/functions/recording-events`;

  if (!to || !to.startsWith('+')) {
    twiml.say('Missing or invalid destination number');
    return respond(twiml);
  }
  if (!identity) {
    twiml.say('Missing identity');
    return respond(twiml);
  }

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
    twiml.say('Invalid user identity');
    return respond(twiml);
  }
  
  const allowed = Array.isArray(users[0].caller_ids) ? users[0].caller_ids : [];
  const callerId = allowed.includes(requestedCallerId) ? requestedCallerId : null;
  if (!callerId) {
    twiml.say('You are not allowed to use this caller ID.');
    return respond(twiml);
  }

  const dial = twiml.dial({
    callerId,
    answerOnBridge: true,
    // Start dual-channel recording when the callee answers - this should appear in TwiML XML
    record: 'record-from-answer-dual',
    recordingStatusCallback: recStatusCb,
    recordingStatusCallbackEvent: 'in-progress completed',
    recordingStatusCallbackMethod: 'POST',
    action: dialStatusCb,
    method: 'POST'
  });
  dial.number({}, to);

  return respond(twiml);

  function respond(t) {
    return { statusCode: 200, headers: { 'Content-Type': 'text/xml' }, body: t.toString() };
  }
}