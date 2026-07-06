import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.subday.vhod',
  appName: 'subday',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      // Нативный splash скрывается сразу — не держим его поверх webview, чтобы
      // анимированный Lottie-прелоадер получал всё своё время (без 2-сек задержки).
      launchAutoHide: true,
      launchShowDuration: 0,
      launchFadeOutDuration: 0,
      backgroundColor: '#FAF9F6',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
