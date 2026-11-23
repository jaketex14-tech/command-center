importScripts("https://www.gstatic.com/firebasejs/13.4.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/13.4.0/firebase-messaging-compat.js");

const FIREBASE_WEB_CONFIG = PLACEHOLDER_FIREBASE_WEB_CONFIG;

if (FIREBASE_WEB_CONFIG && FIREBASE_WEB_CONFIG.projectId) {
  firebase.initializeApp(FIREBASE_WEB_CONFIG);
  const messaging = firebase.messaging();

  // Only manually show if payload has no top-level notification (prevents duplicate alerts on iOS/Android)
  messaging.onBackgroundMessage((payload) => {
    if (payload && payload.notification) return;
    const data = (payload && payload.data) || {};
    self.registration.showNotification(data.title || "Command Center", {
      body: data.body || "You have a new task update.",
      tag: data.notifId || undefined
    });
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow("./");
    })
  );
});
