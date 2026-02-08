// Service Worker for Cent Music - Background Playback
const CACHE_NAME = 'cent-music-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Keep alive mechanism - responds to periodic pings from the app
self.addEventListener('message', (event) => {
  if (event.data === 'keepalive') {
    // Respond back to keep the connection alive
    event.source.postMessage('alive');
  }
  if (event.data === 'ping') {
    event.source.postMessage('pong');
  }
});

// Fetch handler - pass through all requests
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
