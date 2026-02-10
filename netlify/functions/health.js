// Health check function to verify all required Twilio environment variables
export async function handler(event) {
  const requiredVars = [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_API_KEY_SID', 
    'TWILIO_API_KEY_SECRET',
    'TWIML_APP_SID',
    'CALLER_ID'
  ];

  const status = {};
  requiredVars.forEach(varName => {
    status[varName] = !!process.env[varName];
  });

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    },
    body: JSON.stringify(status)
  };
}