// Minimal service worker so phones offer "Add to Home screen". Always uses the network.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("fetch", () => {});
