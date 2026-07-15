// Service worker — chỉ cache app shell, không đụng vào request JSONP sang Apps Script
// Chiến lược: MẠNG TRƯỚC (network-first) — luôn lấy bản mới nhất khi có mạng, chỉ dùng cache khi mất mạng.
// Đổi CACHE_NAME mỗi khi cần ép dọn sạch cache cũ trên máy đã cài PWA trước đó.
const CACHE_NAME = 'cc-shell-v2';
const APP_SHELL = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // để JSONP/API đi thẳng ra mạng

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
