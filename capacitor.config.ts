import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.subday.app',
  appName: 'subday',
  webDir: 'web.subday.app',
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      autoHideTimeout: 2000,
      backgroundColor: '#FAF9F6',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
