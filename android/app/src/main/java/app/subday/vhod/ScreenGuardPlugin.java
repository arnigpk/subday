package app.subday.vhod;

import android.view.WindowManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Блокировка скриншота/записи экрана на отдельных экранах (напр. показ QR).
 * enable() ставит FLAG_SECURE окну, disable() снимает. Точечно включается из JS
 * (см. src/lib/screenGuard.ts). iOS системно не позволяет запрещать скриншот.
 */
@CapacitorPlugin(name = "ScreenGuard")
public class ScreenGuardPlugin extends Plugin {

    @PluginMethod
    public void enable(PluginCall call) {
        if (getActivity() != null) {
            getActivity().runOnUiThread(() ->
                getActivity().getWindow().setFlags(
                    WindowManager.LayoutParams.FLAG_SECURE,
                    WindowManager.LayoutParams.FLAG_SECURE));
        }
        call.resolve();
    }

    @PluginMethod
    public void disable(PluginCall call) {
        if (getActivity() != null) {
            getActivity().runOnUiThread(() ->
                getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE));
        }
        call.resolve();
    }
}
