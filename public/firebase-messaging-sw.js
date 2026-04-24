/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDFeeZ8dzLh3P-flvJ1HpWZi5axN5LvNDI",
  authDomain: "subday-group.firebaseapp.com",
  projectId: "subday-group",
  storageBucket: "subday-group.firebasestorage.app",
  messagingSenderId: "77776210321",
  appId: "1:77776210321:web:44e2b9f0be990cb7f83230",
  measurementId: "G-Y1C67QCLK9",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || 'subday';
  const options = {
    body: payload?.notification?.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: payload?.data || {},
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
