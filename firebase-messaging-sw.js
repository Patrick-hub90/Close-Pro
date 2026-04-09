importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBPkWFyfZacTKggPdCq0_EwJq4eq82XbXc",
  authDomain: "close-pro.firebaseapp.com",
  projectId: "close-pro",
  storageBucket: "close-pro.firebasestorage.app",
  messagingSenderId: "921075884191",
  appId: "1:921075884191:web:61577297fdef360b6202aa"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  var title = (payload.notification && payload.notification.title) || (payload.data && payload.data.title) || 'ClosePro';
  var body = (payload.notification && payload.notification.body) || (payload.data && payload.data.body) || '';
  return self.registration.showNotification(title, {
    body: body,
    tag: 'closepro-bg-' + Date.now(),
    renotify: true,
    vibrate: [300, 150, 300, 150, 300],
    requireInteraction: true,
    actions: [{ action: 'open', title: 'Ouvrir' }]
  });
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].visibilityState === 'visible') return list[i].focus();
      }
      return clients.openWindow('/');
    })
  );
});

self.addEventListener('install', function() { self.skipWaiting(); });
self.addEventListener('activate', function(e) { e.waitUntil(clients.claim()); });
