// Service worker voor /v2/.
//
// Eerst het netwerk, dan de kopie. Een nieuwe versie is er dus bij de volgende
// keer openen, zonder versienummers te hoeven ophogen. De kopie is er alleen
// voor als je offline bent.
//
// Deze worker heeft een eigen scope (/v2/). Zonder hem zou de worker van v1
// (scope /recipebook/) deze bestanden onderscheppen en voor altijd vasthouden.

const CACHE = 'recepten-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // De Firebase-bibliotheek heeft een versienummer in het adres en verandert
    // dus nooit. Eén keer ophalen is genoeg, daarna start de app ook offline.
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

    // Verder alleen eigen bestanden. Firestore, de Claude API en foto's van andere
    // sites gaan rechtstreeks naar het netwerk.
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
