// Firebase Cloud Messaging Service Worker
// This file must be named firebase-messaging-sw.js and placed in /public

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyCoTmHR6LUgV4u6Qcz2ERZkBZzaSH_xR0A",
  authDomain:        "mbdasboard.firebaseapp.com",
  projectId:         "mbdasboard",
  storageBucket:     "mbdasboard.firebasestorage.app",
  messagingSenderId: "806064547678",
  appId:             "1:806064547678:web:115907d020c0192b8211cf",
});

const messaging = firebase.messaging();

// Handle background push notifications
messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || 'mbDashboard', {
    body: body || '',
    icon: icon || '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: payload.data,
    actions: [{ action: 'open', title: 'Open Portal' }],
  });
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
