
-- Clean up orphan push notification for deleted user
DELETE FROM push_notifications WHERE user_id = 'a4424161-d976-4fd5-818d-4c283bc1528c';

-- Clean up expired OTP codes
DELETE FROM otp_codes WHERE expires_at < now();

-- Clean up expired telegram auth codes  
DELETE FROM telegram_auth_codes WHERE expires_at < now();
