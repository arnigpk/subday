UPDATE subscription_transactions st
SET receipt_data = jsonb_build_object(
  'payment_id', wl.payload->>'uid',
  'amount', (wl.payload->>'amount')::numeric,
  'currency', COALESCE(wl.payload->>'currency', 'KZT'),
  'card_last4', wl.payload->>'last4',
  'description', wl.payload->>'description',
  'tracking_id', wl.payload->>'trackingId',
  'paid_at', COALESCE(wl.payload->>'paidAt', wl.created_at::text),
  'status', 'successful'
)
FROM (
  SELECT DISTINCT ON (order_id) order_id, payload, created_at
  FROM webhook_logs
  WHERE status = 'SUCCESSFUL' AND source = 'paylink'
  ORDER BY order_id, created_at DESC
) wl
JOIN payment_orders po ON po.order_id = wl.order_id
WHERE st.payment_order_id = po.id
  AND st.receipt_data IS NULL
  AND st.payment_method = 'paylink';