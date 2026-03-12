import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.1f0fb7ffd23642dc84de6a2e07064142',
  appName: 'vhod',
  webDir: 'dist',
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
