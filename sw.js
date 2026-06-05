const CACHE = 'recipebook-v20260605a';

const STATIC = [
    '/recipebook/',
    '/recipebook/index.html',
    '/recipebook/style.css',
    '/recipebook/app.js',
    '/recipebook/logo.svg',
    '/recipebook/manifest.json',
    '/recipebook/icons/favicon.ico',
    '/recipebook/icons/icon-16.png',
    '/recipebook/icons/icon-32.png',
    '/recipebook/icons/icon-180.png',
    '/recipebook/icons/icon-192.png',
    '/recipebook/icons/icon-512.png',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
];

// Install: cache all static assets
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
    );
});

// Activate: delete old caches
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// Fetch: cache-first for static assets, network-first for HTML
self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);

    // Skip non-GET and cross-origin API calls (Firebase, Claude API)
    if (e.request.method !== 'GET') return;
    if (url.hostname.includes('firebaseapp') || url.hostname.includes('googleapis.com') && url.pathname.includes('/firestore')) return;
    if (url.hostname.includes('api.anthropic.com')) return;

    // HTML: network-first so updates land immediately
    if (e.request.headers.get('accept')?.includes('text/html')) {
        e.respondWith(
            fetch(e.request)
                .then(res => { caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res; })
                .catch(() => caches.match(e.request))
        );
        return;
    }

    // Everything else: cache-first
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request).then(res => {
                if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
                return res;
            });
        })
    );
});
