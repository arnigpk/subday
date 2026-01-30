
# Plan: Telegram Notifications for Subscriptions

## Overview

This plan implements a notification system via Telegram bot (@subday_lgbot) for:
1. **Subscription activation notifications** - sent when a subscription is activated (manually or after payment)
2. **Low balance notifications** - sent when remaining coffee drops to 7, 5, or 3 cups

## Current System Analysis

### Existing Infrastructure
- **TELEGRAM_BOT_TOKEN** - bot token for @subday_lgbot (already configured)
- **NOTIFICATION_BOT_TOKEN** & **NOTIFICATION_CHAT_ID** - used for admin notifications about logins
- Users with Telegram have phone format: `+telegram_{telegram_id}` (e.g., `+telegram_6814215400`)

### Key Files to Modify
- `supabase/functions/send-subscription-notification/index.ts` (new edge function)
- `supabase/functions/partner-scan-qr/index.ts` (add low balance notifications)
- `src/pages/admin/AdminUsersPage.tsx` (call notification after activation)
- `supabase/config.toml` (register new function)

## Implementation Steps

### 1. Create New Edge Function: `send-subscription-notification`

A new edge function to handle all subscription-related notifications:

```typescript
// Purpose: Send Telegram notifications for subscription events
// Endpoints:
//   - type: "activated" - subscription activation
//   - type: "low_balance" - remaining cups warning (7, 5, 3)

// Features:
// 1. Extract telegram_id from user's phone field (format: +telegram_XXXXX)
// 2. Only send to Telegram users (skip non-Telegram users)
// 3. Send formatted message via Telegram Bot API
```

**Messages:**
- Activation: "Подписка активирована. X кофе на Y дней."
- Low balance: "У вас по подписке осталось X кофе на Y дней."

### 2. Update Admin Panel (AdminUsersPage.tsx)

After successful subscription activation via `activate_subscription` RPC:
- Call the new edge function with `type: "activated"`
- Pass user_id, cups_count, and duration_days

```typescript
// After subscription activation success
await supabase.functions.invoke('send-subscription-notification', {
  body: {
    type: 'activated',
    userId: editingUser.user_id,
    cupsCount: result.cups_count,
    daysCount: result.duration_days,
  }
});
```

### 3. Update Partner Scan Function

Modify `partner-scan-qr` to send low balance notifications:
- Check remaining balance after redemption
- If remaining equals 7, 5, or 3, trigger notification
- Get subscription expiry date for the message

```typescript
// After stats update in partner-scan-qr
const newRemaining = drinkType === 'coffee' ? newStats.coffee_remaining : newStats.drinks_remaining;

if ([7, 5, 3].includes(newRemaining)) {
  // Fetch user's active subscription for expiry date
  // Send notification with remaining cups and days
}
```

### 4. Configuration Changes

Add new function to `supabase/config.toml`:
```toml
[functions.send-subscription-notification]
verify_jwt = false
```

## Technical Details

### Edge Function Logic

```text
+----------------------+
| send-subscription-   |
| notification         |
+----------------------+
          |
    [Get user phone]
          |
    [Is Telegram user?]
     /          \
   No            Yes
    |             |
[Return OK]  [Extract telegram_id]
                  |
            [Send Telegram message]
                  |
            [Return success]
```

### Telegram User Detection

```typescript
function extractTelegramId(phone: string): string | null {
  const match = phone.match(/^\+telegram_(\d+)$/);
  return match ? match[1] : null;
}
```

### Message Templates

| Event | Message |
|-------|---------|
| Activated | "Подписка активирована. {cups} кофе на {days} дней." |
| Low balance (7/5/3) | "У вас по подписке осталось {remaining} кофе на {days_left} дней." |

## Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/functions/send-subscription-notification/index.ts` | Create |
| `supabase/functions/partner-scan-qr/index.ts` | Modify |
| `src/pages/admin/AdminUsersPage.tsx` | Modify |
| `supabase/config.toml` | Modify |

## Synchronization Notes

All notification logic is centralized in the edge function, ensuring:
- Admin panel activations trigger notifications
- Partner QR scans trigger low balance warnings
- Future payment integrations can call the same function

## Testing Considerations

1. Activate subscription for Telegram user via admin panel - should receive message
2. Scan QR for user with 8 cups remaining - after scan (7 left) should receive notification
3. Non-Telegram users (regular phone) should not cause errors - silently skip

---

**Technical Section**

### Edge Function Implementation Details

The `send-subscription-notification` function will:
1. Accept POST with JSON body: `{ type, userId, cupsCount, daysCount }`
2. Query `profiles` table to get user's phone
3. Check if phone matches Telegram pattern
4. If yes, send message via `https://api.telegram.org/bot{TOKEN}/sendMessage`
5. Use TELEGRAM_BOT_TOKEN (same bot as @subday_lgbot)

### For Low Balance Notifications

The `partner-scan-qr` function will:
1. After updating stats, check `newRemaining`
2. If in [7, 5, 3], query `user_subscriptions` for expiry date
3. Calculate days remaining
4. Call notification function internally or make direct Telegram API call

