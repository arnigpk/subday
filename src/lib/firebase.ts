import { initializeApp } from 'firebase/app';
import { getMessaging, type Messaging } from 'firebase/messaging';
import { Capacitor } from '@capacitor/core';

const firebaseConfig = {
  apiKey: "AIzaSyDFeeZ8dzLh3P-flvJ1HpWZi5axN5LvNDI",
  authDomain: "subday-group.firebaseapp.com",
  projectId: "subday-group",
  storageBucket: "subday-group.firebasestorage.app",
  messagingSenderId: "77776210321",
  appId: "1:77776210321:web:44e2b9f0be990cb7f83230",
  measurementId: "G-Y1C67QCLK9",
};

export const app = initializeApp(firebaseConfig);

let messaging: Messaging | null = null;
try {
  // Только веб: на нативе (Capacitor) пуш идёт через @capacitor/push-notifications,
  // веб-SDK Firebase Messaging там трогать нельзя — на части webview getMessaging
  // бросает messaging/unsupported-browser (безобидно, но шумит в логах).
  if (!Capacitor.isNativePlatform() && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    messaging = getMessaging(app);
  }
} catch (err) {
  console.warn('[firebase] getMessaging init failed:', err);
  messaging = null;
}

export { messaging };
