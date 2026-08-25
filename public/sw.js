/*
 * File Explorer preview service worker.
 *
 * Serves phone files cached by the File Explorer page under /__preview/<name>,
 * so that previews have a real URL ending with the file name instead of an
 * opaque blob:<uuid> URL. This makes "Save as" and "Save image as" in the
 * preview tab suggest the original file name. Everything else passes through
 * untouched.
 */
const PREVIEW_CACHE = 'file-previews';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	if (!url.pathname.startsWith('/__preview/'))
		return;
	event.respondWith((async () => {
		const cache = await caches.open(PREVIEW_CACHE);
		const response = await cache.match(event.request);
		return response ?? new Response('Preview is no longer available.\nOpen the file from the File Explorer again.', {
			status: 404,
			headers: { 'Content-Type': 'text/plain' },
		});
	})());
});
