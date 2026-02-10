// Webhook to receive call events from Twilio (DialCallStatus, DialCallDuration, etc.)
export async function handler(event) {
  const ct = (event.headers?.['content-type'] || '').toLowerCase();
  const params = ct.includes('application/x-www-form-urlencoded')
    ? new URLSearchParams(event.body || '')
    : new URLSearchParams(event.queryStringParameters || {});
  
  const payload = Object.fromEntries(params.entries());
  console.log('[call-events]', payload); // DialCallStatus, DialCallDuration, DialCallSid, To, From, etc.
  
  return { 
    statusCode: 200, 
    headers: { 'Content-Type': 'text/plain' },
    body: 'ok' 
  };
}