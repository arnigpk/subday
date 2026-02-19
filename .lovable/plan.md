

# Vibration Feedback on App Load

## What will happen
When the app finishes loading (preloader disappears and main content appears), the phone will give a short vibration buzz as tactile feedback that the app is ready.

## Technical Details

### File: `src/App.tsx`

1. Import the existing `useVibration` hook
2. Add a `useEffect` that triggers `vibrateShort()` (50ms buzz) when `isLoading` transitions from `true` to `false`
3. The vibration will only fire once per app launch

```text
Loading flow:
  [Preloader GIF/Logo] --> isLoading becomes false --> vibrateShort() --> [Main App]
```

### Compatibility
- Works on Android Chrome, Samsung Internet, Firefox Mobile
- Safari/iOS does NOT support the Vibration API (this is an Apple limitation), so the call will silently do nothing -- no errors, no crashes
- The existing `useVibration` hook already handles this gracefully with a `'vibrate' in navigator` check

### Impact
- Zero performance cost (single API call)
- No changes to loading logic or timing
- No new dependencies needed

