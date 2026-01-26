import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    from: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    text?: string;
  };
}

async function sendTelegramMessage(botToken: string, chatId: number, text: string, parseMode = 'HTML') {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
    }),
  });
}

async function getTelegramAvatarUrl(botToken: string, userId: number): Promise<string | null> {
  try {
    // Get user profile photos
    const photosResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getUserProfilePhotos?user_id=${userId}&limit=1`
    );
    const photosData = await photosResponse.json();
    
    if (!photosData.ok || !photosData.result?.photos?.length) {
      console.log('No profile photos found for user:', userId);
      return null;
    }

    // Get the largest photo (last in array)
    const photos = photosData.result.photos[0];
    const largestPhoto = photos[photos.length - 1];
    
    // Get file path
    const fileResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${largestPhoto.file_id}`
    );
    const fileData = await fileResponse.json();
    
    if (!fileData.ok || !fileData.result?.file_path) {
      console.log('Could not get file path');
      return null;
    }

    // Return the full URL to the file
    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
    console.log('Got avatar URL for user:', userId);
    return fileUrl;
  } catch (error) {
    console.error('Error getting avatar:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!botToken) {
    console.error('TELEGRAM_BOT_TOKEN not set');
    return new Response('OK', { status: 200 });
  }

  try {
    const update: TelegramUpdate = await req.json();
    console.log('Received update:', JSON.stringify(update));

    if (!update.message?.text) {
      return new Response('OK', { status: 200 });
    }

    const chatId = update.message.chat.id;
    const user = update.message.from;
    const text = update.message.text.trim();

    // Handle /start and /login commands
    if (text === '/start' || text.startsWith('/start ') || text === '/login') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Get user's Telegram avatar
      const avatarUrl = await getTelegramAvatarUrl(botToken, user.id);

      // Generate 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Delete any existing codes for this telegram_id
      await supabase
        .from('telegram_auth_codes')
        .delete()
        .eq('telegram_id', user.id.toString());

      // Insert new code with avatar URL
      const { error: insertError } = await supabase
        .from('telegram_auth_codes')
        .insert({
          telegram_id: user.id.toString(),
          code,
          first_name: user.first_name || null,
          last_name: user.last_name || null,
          username: user.username || null,
          photo_url: avatarUrl,
          expires_at: expiresAt.toISOString(),
        });

      if (insertError) {
        console.error('Insert error:', insertError);
        await sendTelegramMessage(botToken, chatId, '❌ Ошибка. Попробуйте позже.');
        return new Response('OK', { status: 200 });
      }

      console.log(`Generated code ${code} for user ${user.id}, avatar: ${avatarUrl ? 'yes' : 'no'}`);

      await sendTelegramMessage(
        botToken,
        chatId,
        `🔐 <b>Ваш код для входа в subday:</b>\n\n` +
        `<code>${code}</code>\n\n` +
        `Введите этот код на сайте.\n` +
        `⏱ Код действителен 5 минут.`
      );
    } else {
      await sendTelegramMessage(
        botToken,
        chatId,
        `👋 Привет! Это бот <b>subday</b>.\n\n` +
        `Для входа в приложение нажмите /login`
      );
    }

    return new Response('OK', { status: 200 });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('OK', { status: 200 });
  }
});
