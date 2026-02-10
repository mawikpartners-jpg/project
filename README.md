# Web Softphone (Twilio + WebRTC)

This is a minimal browser softphone that dials real PSTN numbers using the Twilio Voice JavaScript SDK v2.

## What's inside
- Vite + Vanilla JS frontend (WebRTC via `@twilio/voice-sdk`)
- Netlify Functions:
  - `/.netlify/functions/token` → returns a Twilio Access Token (VoiceGrant)
  - `/.netlify/functions/voice` → returns TwiML to `<Dial>` the destination number

## Prerequisites
- Twilio account with a **voice-capable phone number**
- A **TwiML Application** (we'll point its Voice URL to your `/.netlify/functions/voice`)
- Node 18+
- Netlify account (free tier works)

## Environment variables (set in Netlify → Site settings → Environment variables)
- `TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- `TWILIO_API_KEY_SID=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- `TWILIO_API_KEY_SECRET=your_api_key_secret`
- `TWIML_APP_SID=APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`  ← your TwiML Application SID
- `CALLER_ID=+1XXXXXXXXXX`  ← your Twilio number in E.164 (used as callerId)

> Never commit these secrets to the repo.

## Local development
```bash
npm install
netlify dev
# Open http://localhost:8888
```

For Twilio to reach your voice webhook during local dev, use:
```bash
npx netlify dev --live
# Copy the https://<random>.netlify.live URL and set it as your TwiML App Voice URL (append /.netlify/functions/voice)
```

## Deploy
1. Push this repo to GitHub (or use your provider).
2. Create a new Netlify site from this repo.
3. Add the environment variables above, then Deploy.
4. In Twilio Console → TwiML Apps, set the Voice URL to:
   ```
   https://YOUR-SITE.netlify.app/.netlify/functions/voice   (HTTP POST)
   ```
5. In the deployed site, open the app over HTTPS, allow microphone, enter an E.164 number (e.g., +15551234567), and click Call.

## How outbound calling works (high level)
Browser (WebRTC) → Twilio Voice SDK (using Access Token) → Twilio calls your TwiML App's Voice URL → your `/voice` function returns `<Dial><Number>...</Number></Dial>` → Twilio bridges media to the PSTN.

## Notes & limits
- Mobile browsers are fine for light use but may pause audio when backgrounded. For production mobile, use Twilio's native iOS/Android Voice SDKs with push notifications.
- Use proper E.164 formatting for all dialed numbers.
- **Emergency calling**: This demo is not configured for 911/112. Don't advertise emergency calling unless you implement and test it.
- **Compliance**: If you enable recording, follow local laws and consent requirements.

## Troubleshooting
- **Call fails immediately**: Ensure CALLER_ID is a Twilio number and that your TwiML App's Voice URL is reachable.
- **Token errors**: Verify TWIML_APP_SID, API Key/Secret, and that the token function is returning JSON.
- **No audio / drops**: Check microphone permissions, corporate firewalls blocking UDP, or try another network.