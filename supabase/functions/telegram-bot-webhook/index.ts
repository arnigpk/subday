import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface TelegramUpdate {
  update_id: number;
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

// In-memory dedup to prevent processing same update_id twice
const processedUpdates = new Set<number>();

async function sendTelegramMessage(botToken: string, chatId: number, text: string, parseMode = 'HTML', replyMarkup?: unknown) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let workerEnv: Record<string, string> = {};
  try { workerEnv = JSON.parse(req.headers.get('x-worker-env') || '{}'); } catch { /* ignore */ }
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || workerEnv['TELEGRAM_BOT_TOKEN'];
  if (!botToken) {
    console.error('TELEGRAM_BOT_TOKEN not set');
    return new Response('OK', { status: 200 });
  }

  try {
    const update: TelegramUpdate = await req.json();
    
    // CRITICAL: Deduplicate - Telegram may retry the same update
    if (processedUpdates.has(update.update_id)) {
      console.log('Skipping duplicate update_id:', update.update_id);
      return new Response('OK', { status: 200 });
    }
    processedUpdates.add(update.update_id);
    
    // Keep set small - remove old entries after 100
    if (processedUpdates.size > 100) {
      const arr = Array.from(processedUpdates);
      for (let i = 0; i < arr.length - 50; i++) {
        processedUpdates.delete(arr[i]);
      }
    }

    console.log('Processing update_id:', update.update_id);

    if (!update.message?.text) {
      return new Response('OK', { status: 200 });
    }

    const chatId = update.message.chat.id;
    const user = update.message.from;
    const text = update.message.text.trim();

    if (text === '/start' || text.startsWith('/start ') || text === '/login') {
      const supabaseUrl = (Deno.env.get('SUPABASE_URL') || workerEnv['SUPABASE_URL'])!;
      const supabaseServiceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || workerEnv['SUPABASE_SERVICE_ROLE_KEY'])!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      });

      // Generate 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      // Delete old codes, then insert new one
      await supabase
        .from('telegram_auth_codes')
        .delete()
        .eq('telegram_id', user.id.toString());

      const { error: insertError } = await supabase
        .from('telegram_auth_codes')
        .insert({
          telegram_id: user.id.toString(),
          code,
          first_name: user.first_name || null,
          last_name: user.last_name || null,
          username: user.username || null,
          photo_url: null, // Skip avatar fetch to speed up response
          expires_at: expiresAt.toISOString(),
        });

      if (insertError) {
        console.error('Insert error:', insertError);
        await sendTelegramMessage(botToken, chatId, '❌ Ошибка. Попробуйте позже.');
        return new Response('OK', { status: 200 });
      }

      console.log(`Generated code ${code} for user ${user.id}`);

      await sendTelegramMessage(
        botToken,
        chatId,
        `🔐 <b>Ваш код для входа в subday:</b>\n\n` +
        `<code>${code}</code>\n\n` +
        `Введите этот код в приложении или нажмите кнопку «Открыть».\n` +
        `⏱️ Код действителен 5 минут.`,
        'HTML',
        { inline_keyboard: [[{ text: 'Открыть', web_app: { url: 'https://web.subday.app' } }]] }
      );

      // Background: fetch and store avatar
      (async () => {
        try {
          const photosResponse = await fetch(
            `https://api.telegram.org/bot${botToken}/getUserProfilePhotos?user_id=${user.id}&limit=1`
          );
          const photosData = await photosResponse.json();
          if (photosData.ok && photosData.result?.photos?.length) {
            const photos = photosData.result.photos[0];
            const largestPhoto = photos[photos.length - 1];
            const fileResponse = await fetch(
              `https://api.telegram.org/bot${botToken}/getFile?file_id=${largestPhoto.file_id}`
            );
            const fileData = await fileResponse.json();
            if (fileData.ok && fileData.result?.file_path) {
              const avatarUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
              await supabase
                .from('telegram_auth_codes')
                .update({ photo_url: avatarUrl })
                .eq('telegram_id', user.id.toString())
                .eq('code', code);
            }
          }
        } catch (e) {
          console.error('Background avatar error:', e);
        }
      })();
    } else {
      await sendTelegramMessage(
        botToken,
        chatId,
        `👋 Привет! Это бот <b>subday</b>.\n\nДля входа в приложение нажмите /login`
      );
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('OK', { status: 200 });
  }
});
