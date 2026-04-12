const CACHE_NAME = 'gunnerthelab-v2';

// Core shell — pre-cached on install
const PRECACHE_URLS = [
    '/',
    '/stories/',
    '/about/',
    '/site.webmanifest',
    '/favicon.png',
    '/apple-touch-icon.png',
];

// Install: pre-cache the shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

// Activate: delete old caches, notify clients of update
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => key !== CACHE_NAME)
                        .map((key) => caches.delete(key))
                )
            )
            .then(() => self.clients.claim())
            .then(() => {
                self.clients.matchAll({ type: 'window' }).then((clients) => {
                    clients.forEach((client) => {
                        client.postMessage({ type: 'NEW_CONTENT' });
                    });
                });
                return self.registration
                    .showNotification('Gunner the Lab', {
                        body: 'New stories have been published!',
                        icon: '/icons/icon-192.png',
                        badge: '/icons/icon-80.png',
                        tag: 'new-content',
                        data: { url: '/stories/' }
                    })
                    .catch(() => {});
            })
    );
});

// Notification click: open the stories page
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url || '/';
    event.waitUntil(
        self.clients.matchAll({ type: 'window' }).then((clients) => {
            const existing = clients.find((c) => c.url.includes(url));
            if (existing) return existing.focus();
            return self.clients.openWindow(url);
        })
    );
});

// Fetch: different strategies for different content types
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Only handle same-origin GET requests
    if (url.origin !== location.origin) return;
    if (request.method !== 'GET') return;

    // Page navigations: network first, fall back to cache, then home page
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    return response;
                })
                .catch(() =>
                    caches.match(request).then((cached) => {
                        // Serve cached version, or fall back to cached home page
                        return cached || caches.match('/');
                    })
                )
        );
        return;
    }

    // Images: cache first — they're large and rarely change
    if (request.destination === 'image') {
        event.respondWith(
            caches.match(request).then(
                (cached) =>
                    cached ||
                    fetch(request)
                        .then((response) => {
                            const clone = response.clone();
                            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                            return response;
                        })
                        .catch(() => new Response('', { status: 408 }))
            )
        );
        return;
    }

    // CSS, JS, fonts: cache first, network fallback
    event.respondWith(
        caches.match(request).then(
            (cached) =>
                cached ||
                fetch(request)
                    .then((response) => {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                        return response;
                    })
                    .catch(() => new Response('', { status: 408 }))
        )
    );
});
