import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.1f0fb7ffd23642dc84de6a2e07064142',
  appName: 'vhod',
  webDir: 'dist',
  server: {
    url: 'https://1f0fb7ff-d236-42dc-84de-6a2e07064142.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      autoHideTimeout: 2000,
      backgroundColor: '#FAF9F6',
    },
  },
};

export default config;
