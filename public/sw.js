// __CACHE_VERSION__ is stamped onto the built dist/sw.js at deploy time
// (see astro.config.mjs's swCacheBuster integration) so this file's bytes
// change on every deploy. Browsers only re-check a service worker for
// updates when its script content differs from what they last saw, so a
// static name here would mean deploys could go undetected indefinitely
// and the installed PWA would keep serving whatever it cached long ago.
const CACHE_NAME = 'gunnerthelab-v3-__CACHE_VERSION__';

// Core shell: pre-cached on install
const PRECACHE_URLS = ['/', '/stories/', '/about/', '/site.webmanifest', '/favicon.png', '/apple-touch-icon.png'];

// Install: pre-cache the shell. Deliberately does NOT call skipWaiting()
// here: when an old worker is already controlling the page, this new
// worker should sit in the "waiting" state until the page's visible
// update toast gets an explicit tap from the user (see BaseHead.astro),
// which sends the SKIP_WAITING message handled below. That keeps an
// already-open tab on its current, working version instead of having
// its controller swapped out from under it mid-session.
self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

// Let the page hand off control once the user has confirmed the update.
self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Activate: delete old caches, take control of open clients
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

// NOTE: the push and notificationclick handlers were removed on 2026-09-01 (AB#7970).
// New-story alerts are owned by the StoryLark app at app.gunnerthelab.com, which has its
// own push pipeline. This site had a second, hand-rolled subscribe button that hardcoded
// the retired StoryReader VAPID key, so it could never succeed. If site-based alerts are
// ever wanted again, read the live public key rather than hardcoding one.

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

    // Images: cache first, since they're large and rarely change
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
