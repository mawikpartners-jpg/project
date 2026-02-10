// Webhook to receive recording events from Twilio (RecordingSid, RecordingUrl, etc.)
export async function handler(event) {
  const ct = (event.headers?.['content-type'] || '').toLowerCase();
  const params = ct.includes('application/x-www-form-urlencoded')
    ? new URLSearchParams(event.body || '')
    : new URLSearchParams(event.queryStringParameters || {});
  
  const payload = Object.fromEntries(params.entries());
  console.log('[recording-events]', payload); // RecordingSid, RecordingUrl, RecordingStatus, CallSid, Duration, Channels...
  
  return { 
    statusCode: 200, 
    headers: { 'Content-Type': 'text/plain' },
    body: 'ok' 
  };
}