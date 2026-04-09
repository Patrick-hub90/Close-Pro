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
  const title = payload.notification?.title || payload.data?.title || 'ClosePro';
  const body = payload.notification?.body || payload.data?.body || '';
  return self.registration.showNotification(title, {
    body: body,
    tag: payload.data?.tag || 'closepro-' + Date.now(),
    renotify: true,
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: true
  });
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(cs) {
      if (cs.length > 0) return cs[0].focus();
      return clients.openWindow('/');
    })
  );
});
