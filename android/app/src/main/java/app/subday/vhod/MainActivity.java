package app.subday.vhod;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // ВНИМАНИЕ: id канала ДОЛЖЕН совпадать с:
    //  - AndroidManifest.xml (com.google.firebase.messaging.default_notification_channel_id)
    //  - supabase/functions/_shared/fcm.ts (channel_id по умолчанию)
    // Иначе Android 8+ МОЛЧА не покажет пуш. Канал создаём нативно в onCreate,
    // чтобы он существовал ещё до запуска JS и корректно отображал фоновые пуши
    // при убитом из памяти приложении.
    private static final String CHANNEL_ID = "default";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannel();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Уведомления",
                NotificationManager.IMPORTANCE_HIGH // всплывающий баннер + звук
            );
            channel.setDescription("Пуш-уведомления subday");
            channel.enableVibration(true);
            channel.enableLights(true);
            nm.createNotificationChannel(channel);
        }
    }
}
