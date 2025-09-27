self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => clients.claim());

self.addEventListener("message", e => {
  const { title, body } = e.data;
  if (title && body) self.registration.showNotification(title, { body, icon: "/icon.png" });
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(clients.openWindow("/"));
});
