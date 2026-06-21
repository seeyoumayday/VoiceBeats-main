/*! coi-serviceworker v0.1.7 | MIT License | https://github.com/gzuidhof/coi-serviceworker */
const CACHE_NAME = "voicebeats-cache-v6";
const ASSETS_TO_CACHE = [
    "./",
    "./index.html",
    "./styles.css",
    "./script.js",
    "./manifest.json",
    "./coi-serviceworker.js",
    "./about.html",
    "./howto.html",
    "./update.html",
    "./sample/logo.png",
    "./sample/logo-tab.png",
    "./sounds/kick.wav",
    "./sounds/snare.wav",
    "./sounds/clap.wav",
    "./sounds/hihat.wav",
    "./sounds/bell.wav"
];

if (typeof window === 'undefined') {
    self.addEventListener("install", (event) => {
        event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.addAll(ASSETS_TO_CACHE);
            }).then(() => self.skipWaiting())
        );
    });

    self.addEventListener("activate", (event) => {
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            }).then(() => self.clients.claim())
        );
    });

    self.addEventListener("fetch", (event) => {
        if (event.request.cache === "only-if-cached" && event.request.mode !== "same-origin") {
            return;
        }

        // Network-First Strategy (Online: fetch and update cache, Offline: fall back to cache)
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.status === 0) {
                        return response;
                    }
                    // Clone response to put it into cache
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        // Avoid caching non-GET requests or temporary blobs
                        if (event.request.method === "GET" && !event.request.url.startsWith("blob:")) {
                            cache.put(event.request, responseClone);
                        }
                    });
                    return addCoiHeaders(response);
                })
                .catch(() => {
                    // Offline fallback: try to serve from cache
                    return caches.match(event.request).then((cachedResponse) => {
                        if (cachedResponse) {
                            return addCoiHeaders(cachedResponse.clone());
                        }
                        // Return empty response or handle error if both fail
                        return new Response("Offline content not available", {
                            status: 503,
                            statusText: "Service Unavailable"
                        });
                    });
                })
        );
    });

    function addCoiHeaders(response) {
        const newHeaders = new Headers(response.headers);
        newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
        newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
        });
    }
} else {
    (() => {
        const script = document.currentScript;
        const reloader = () => {
            navigator.serviceWorker.register(script.src, { scope: "./" }).then((registration) => {
                registration.addEventListener("updatefound", () => {
                    location.reload();
                });
                if (registration.active && !navigator.serviceWorker.controller) {
                    location.reload();
                }
            });
        };
        if (!window.crossOriginIsolated) {
            reloader();
        }
    })();
}
