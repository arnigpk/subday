

## Plan: Auto-login after registration

### Problem
Currently, registration creates the user account but does not return a session. The user is redirected to the login screen and must enter their phone + SMS code again, costing an extra SMS.

### Solution
Two changes needed:

**1. Edge function `verify-otp/index.ts` — registration branch**
After creating the user and profile, perform the same sign-in logic as the login branch: call `signInWithPassword` and return the `session` object in the response.

**2. Frontend `RegisterScreen.tsx`**
Instead of showing "Регистрация успешна! Теперь войди" and switching to login, take the returned session, call `supabase.auth.setSession()`, and invoke `onComplete()` from `AuthScreen` (which triggers the main app).

**3. `AuthScreen.tsx`**
Pass the real `onComplete` callback to `RegisterScreen` instead of `() => setMode('login')`, so successful registration goes directly into the app.

### Technical details

In `verify-otp/index.ts`, registration branch (after profile insert):
```typescript
// Sign in the newly created user
const email = phoneToEmail(formattedPhone)
const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
  email, password: tempPassword
})
// Return session in response
return Response({ success: true, session: loginData.session, ... })
```

In `RegisterScreen.tsx`, `handleVerifyCode`:
```typescript
if (data.session) {
  await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token
  });
  toast.success('Добро пожаловать!');
  onComplete(); // go straight to the app
}
```

In `AuthScreen.tsx`:
```typescript
<RegisterScreen onComplete={onComplete} ... />
// Instead of onComplete={() => setMode('login')}
```

### Summary of files to edit
- `supabase/functions/verify-otp/index.ts` — return session after registration
- `src/components/auth/RegisterScreen.tsx` — set session and enter app
- `src/components/auth/AuthScreen.tsx` — pass `onComplete` directly

