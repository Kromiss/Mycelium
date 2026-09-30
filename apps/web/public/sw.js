// Service worker for browser notifications (M7). The server sends { title, body, tag } while the
// player is away; clicking a notification brings the game back to the front.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Mycelium", {
      body: data.body || "",
      tag: data.tag || "mycelium",
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) if ("focus" in w) return w.focus();
      return self.clients.openWindow("/");
    }),
  );
});
