// Service worker for /v2/.
//
// Network first, then the cached copy. A new version is there the next time
// you open the app, without bumping version numbers. The copy is only for
// when you are offline.
//
// This worker has its own scope (/v2/). Without it the v1 worker
// (scope /recipebook/) would intercept these files and hold on to them forever.

const CACHE = 'recepten-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // The Firebase library has a version number in its URL, so it never
    // changes. Fetching it once is enough; after that the app also starts offline.
    if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
        event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
            if (response.ok) {
                const copy = response.clone();
                caches.open(CACHE).then(cache => cache.put(request, copy));
            }
            return response;
        })));
        return;
    }

    // Beyond that, only our own files. Firestore, the Claude API and photos from
    // other sites go straight to the network.
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        fetch(request)
            .then(response => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE).then(cache => cache.put(request, copy));
                }
                return response;
            })
            .catch(async () => {
                const cached = await caches.match(request, { ignoreSearch: true });
                if (cached) return cached;
                if (request.mode === 'navigate') {
                    const shell = await caches.match(new URL('./index.html', self.location).href);
                    if (shell) return shell;
                }
                return Response.error();
            })
    );
});
