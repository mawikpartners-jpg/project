# Web Softphone (Twilio + WebRTC + Supabase)

This is a browser-based softphone that dials real PSTN numbers using the Twilio Voice JavaScript SDK v2, with Supabase for database and Edge Functions.

## What's inside
- Vite + Vanilla JS frontend (WebRTC via `@twilio/voice-sdk`)
- Supabase PostgreSQL database for users, leads, and recordings
- Supabase Edge Functions:
  - `token` → returns a Twilio Access Token (VoiceGrant)
  - `user-info` → returns user role and caller IDs
  - `admin-users` → user management
  - `leads` → lead management
  - `recordings` → call recording management

## Prerequisites
- Twilio account with a **voice-capable phone number**
- A **TwiML Application** (we'll point its Voice URL to your voice webhook)
- Node 18+
- Supabase project (free tier works)

## Required Configuration

### 1. Supabase Environment Variables

⚠️ **IMPORTANT**: Configure these secrets in your Supabase project:

**Supabase Dashboard → Project Settings → Edge Functions → Secrets**

Add the following secrets:
- `TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- `TWILIO_API_KEY_SID=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- `TWILIO_API_KEY_SECRET=your_api_key_secret`
- `TWIML_APP_SID=APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### 2. Local .env File

Create a `.env` file in the project root:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

> Never commit secrets to the repo.

## Getting Twilio Credentials

1. **Create a Twilio Account**: Sign up at [twilio.com](https://www.twilio.com/try-twilio)
2. **Get Account SID**: Found on your [Twilio Console Dashboard](https://console.twilio.com/)
3. **Create API Key**:
   - Go to Account → API Keys & Tokens
   - Create a new API Key (Standard)
   - Save the SID and Secret (you won't see the secret again!)
4. **Create TwiML Application**:
   - Go to Programmable Voice → Tools → TwiML Apps
   - Create a new TwiML App
   - Set the Voice URL to your voice webhook (see Deploy section)
   - Save the Application SID
5. **Get a Phone Number**:
   - Go to Phone Numbers → Manage → Buy a number
   - Buy a voice-capable number
   - This will be your Caller ID

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:5173
```

## Deploy

### 1. Deploy Database Migrations

The database schema is already created via migrations in `supabase/migrations/`.

### 2. Deploy Edge Functions

Deploy all edge functions to Supabase:

```bash
# Deploy token function
supabase functions deploy token

# Deploy user-info function
supabase functions deploy user-info

# Deploy admin-users function
supabase functions deploy admin-users

# Deploy leads function
supabase functions deploy leads

# Deploy recordings function
supabase functions deploy recordings
```

### 3. Configure Twilio Webhook

In Twilio Console → TwiML Apps, set the Voice URL to your voice webhook endpoint.

### 4. Default Login

Default admin account:
- **Username**: admin
- **Password**: admin123

⚠️ Change this password immediately after first login!

## How outbound calling works (high level)
Browser (WebRTC) → Twilio Voice SDK (using Access Token) → Twilio calls your TwiML App's Voice URL → your `/voice` function returns `<Dial><Number>...</Number></Dial>` → Twilio bridges media to the PSTN.

## Notes & limits
- Mobile browsers are fine for light use but may pause audio when backgrounded. For production mobile, use Twilio's native iOS/Android Voice SDKs with push notifications.
- Use proper E.164 formatting for all dialed numbers.
- **Emergency calling**: This demo is not configured for 911/112. Don't advertise emergency calling unless you implement and test it.
- **Compliance**: If you enable recording, follow local laws and consent requirements.

## Troubleshooting

### "Twilio configuration missing" Error
This means the Twilio secrets are not configured in Supabase. Go to:
- **Supabase Dashboard → Project Settings → Edge Functions → Secrets**
- Add all four required Twilio secrets (see Configuration section above)

### "Invalid credentials" Error
- Check that you're using the correct username/password
- Default admin credentials: admin / admin123
- Check the `users` table in Supabase to verify the user exists

### "AccessTokenInvalid" Error
- Verify all Twilio secrets are correctly set in Supabase
- Check that your API Key is still valid in Twilio Console
- Ensure TWIML_APP_SID matches your TwiML Application

### Call Fails Immediately
- Ensure your TwiML App's Voice URL is configured and reachable
- Verify your Twilio phone number is voice-capable
- Check that you have sufficient Twilio credits

### No Audio / Drops
- Check microphone permissions in your browser
- Corporate firewalls may block UDP (WebRTC requirement)
- Try a different network or disable VPN

### Authorization Header Missing
- Make sure you're using the latest version with proper headers
- Check browser console for detailed error messages