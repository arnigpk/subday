

## Plan: Receipt/Check for Transactions

### Summary
Save payment receipt data from the Paylink webhook callback and display a receipt icon next to each transaction in the History page. Tapping the icon opens a popup with the receipt details.

### 1. Database: Add `receipt_data` column to `subscription_transactions`

Migration to add a JSONB column `receipt_data` to `subscription_transactions` table. This will store the full receipt info (amount, card last4, brand, RRN, description, paid_at, payment_id, etc.).

### 2. Webhook: Save receipt data in `paylink-webhook`

In `supabase/functions/paylink-webhook/index.ts`, after successful payment, fetch the full invoice details from Paylink API (`GET /api/v1/invoices/{uid}`) using the payment UID. Extract receipt-relevant fields:
- `amount`, `commissionAmount`, `currency`
- `cardInfo.last4`, `cardInfo.brand`, `cardInfo.issuerBank`
- `transaction.rrn`, `transaction.status`
- `description`, `trackingId`
- `paid_at` timestamp

Store this as JSONB in the `receipt_data` column when inserting the `subscription_transactions` record.

### 3. Frontend: HistoryPage — receipt icon and popup

**HistoryPage.tsx changes:**
- Fetch `receipt_data` along with other transaction fields
- For transactions that have `receipt_data`, show a small receipt icon (FileText from lucide) next to the date/amount area
- On icon click, open a Dialog/Sheet popup displaying formatted receipt:
  - Transaction ID / RRN
  - Date & time
  - Subscription name
  - Amount with currency
  - Card info (brand + last 4 digits)
  - Payment status
  - Clean receipt-like layout

### Technical Details

**Migration SQL:**
```sql
ALTER TABLE subscription_transactions 
ADD COLUMN receipt_data jsonb DEFAULT NULL;
```

**Webhook receipt data structure (stored in JSONB):**
```json
{
  "payment_id": "...",
  "rrn": 123456789012,
  "amount": 5000,
  "currency": "KZT",
  "card_last4": "1234",
  "card_brand": "VISA",
  "issuer_bank": "Halyk Bank",
  "description": "Подписка: ...",
  "tracking_id": "...",
  "paid_at": "2026-03-20T..."
}
```

**Files to modify:**
- `supabase/functions/paylink-webhook/index.ts` — fetch invoice details from Paylink API after successful payment, save receipt_data
- `src/pages/HistoryPage.tsx` — add receipt icon + popup component

