/*
 * File previews are served through the service worker (public/sw.js) so that a
 * previewed phone file has a real URL ending with its name. "Save as" from the
 * preview tab then suggests the original file name; with a plain blob: URL the
 * browser would suggest the random blob UUID instead. Falls back to a blob URL
 * if the service worker or the Cache API is unavailable.
 */
const PREVIEW_CACHE = 'file-previews';
const PREVIEW_PREFIX = '/__preview/';

const previewSupported = (): boolean =>
	'serviceWorker' in navigator && typeof caches !== 'undefined';

// Registers the service worker early, so it controls the page by the time a
// preview is opened (a freshly registered worker needs skipWaiting + claim to
// take over existing pages). Also drops preview files cached by a previous
// visit, which are no longer reachable.
export async function prepareFilePreview(): Promise<void> {
	if (!previewSupported())
		return;
	try {
		void caches.delete(PREVIEW_CACHE);
		await navigator.serviceWorker.register('/sw.js');
		await navigator.serviceWorker.ready;
		if (!navigator.serviceWorker.controller) {
			await new Promise<void>((resolve) => {
				const done = () => {
					navigator.serviceWorker.removeEventListener('controllerchange', done);
					clearTimeout(timer);
					resolve();
				};
				const timer = setTimeout(done, 2000);
				navigator.serviceWorker.addEventListener('controllerchange', done);
			});
		}
	} catch {
		// Service workers unavailable, previews fall back to blob URLs
	}
}

// Puts the file into the preview cache and returns a URL ending with the file
// name, or undefined if the preview service worker is not available
export async function createFilePreviewUrl(data: Blob, name: string): Promise<string | undefined> {
	if (!previewSupported() || !navigator.serviceWorker.controller)
		return undefined;
	try {
		const cache = await caches.open(PREVIEW_CACHE);
		// The uuid path segment makes each preview URL unique (same name in different
		// folders); it must NOT be a query string and the response must not carry a
		// Content-Disposition — either makes "Save page as" save an HTML wrapper
		// instead of the file itself. The name comes from the last path segment.
		const url = `${PREVIEW_PREFIX}${crypto.randomUUID()}/${encodeURIComponent(name)}`;
		await cache.put(new Request(url), new Response(data, {
			headers: { 'Content-Type': data.type || 'application/octet-stream' },
		}));
		return url;
	} catch {
		return undefined;
	}
}
