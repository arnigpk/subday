## Plan: Add WhatsApp as alternative OTP channel alongside SMS

### What changes

**1. UI — Channel selector on both LoginScreen and RegisterScreen**

Before the "Send code" button, add two toggle buttons: **SMS** and **WhatsApp**. Default to SMS. Store selection in `channel` state (`'sms' | 'whatsapp'`). Pass `channel` to `send-otp` function. Also pass it on resend.

The selector will be a simple two-button toggle group styled like a pill/segmented control:

```
[💬 WhatsApp]  [📱 SMS]
```

**2. Edge function `send-otp/index.ts` — WhatsApp delivery via SMSC.kz**

Accept `channel` parameter from the request body. When `channel === 'whatsapp'`, use SMSC.kz's WhatsApp integration by adding parameters to the existing SMSC API call:

- Set `sender` to the WHATSAPP_BOT_NUMBER secret (already configured)  
- Add `&viber=1` parameter for messengers mode with SMS fallback

When channel is `'sms'` (default), keep current behavior unchanged.

**3. Toast messages**

Update success toast to say "Код отправлен в WhatsApp!" or "Код отправлен по SMS!" depending on selected channel.

### Files to edit

- `src/components/auth/LoginScreen.tsx` — add channel toggle, pass to send-otp
- `src/components/auth/RegisterScreen.tsx` — add channel toggle, pass to send-otp  
- `supabase/functions/send-otp/index.ts` — handle `channel` param, route to WhatsApp or SMS

### Technical details

SMSC.kz WhatsApp sending uses the same API endpoint with additional params:

```
smsUrl.searchParams.set('sender', whatsappBotNumber)  // from secret
smsUrl.searchParams.set('viber', '1')  // enables messenger channel with SMS fallback
```

No new secrets needed — `WHATSAPP_BOT_NUMBER` is already configured.