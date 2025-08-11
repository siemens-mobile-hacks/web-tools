import { intervalToDuration } from "date-fns/intervalToDuration";
import { useLocation } from "@solidjs/router";

export type PublicMethods<T> = {
	[K in keyof T as T[K] extends (...args: any[]) => any ? K : never]: T[K];
};

export function resolveURL(url: string): string {
	return `${import.meta.env.BASE_URL}${url}`.replace(/\/+/g, '/').replace(/\/$/, '');
}

export function matchURL(url: string): boolean {
	const location = useLocation();
	const target = resolveURL(url);
	const effectiveURL = location.pathname.replace(/\/+/g, '/').replace(/\/$/, '');
	return target === effectiveURL;
}

export function recursiveUpdateObject(value: any, callback: (value: any) => any): any {
	value = callback(value);
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			value[i] = recursiveUpdateObject(value[i], callback);
		}
		return value;
	} else if (typeof value === 'object' && value !== null) {
		for (const k of Object.keys(value)) {
			value[k] = recursiveUpdateObject(value[k], callback);
		}
		return value;
	} else {
		return callback(value);
	}
}

export function transferBufferToCanvas(mode: string, buffer: Uint8Array, canvas: HTMLCanvasElement): void {
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx)
		return;

	let pixelIndex = 0;
	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	switch (mode) {
		case "rgb332":
			for (let i = 0; i < buffer.length; i++) {
				const color = buffer[i];
				const r = (color >> 5) & 7;
				const g = (color >> 2) & 7;
				const b = color & 3;

				imageData.data[pixelIndex++] = Math.round(r * 0xFF / 7);
				imageData.data[pixelIndex++] = Math.round(g * 0xFF / 7);
				imageData.data[pixelIndex++] = Math.round(b * 0xFF / 3);
				imageData.data[pixelIndex++] = 0xFF;
			}
			break;
		case "rgba4444":
			for (let i = 0; i < buffer.length; i += 2) {
				const color = (buffer[i + 1] << 8) | buffer[i];
				const a = (color >> 12) & 0xF;
				const r = (color >> 8) & 0xF;
				const g = (color >> 4) & 0xF;
				const b = color & 0xF;

				imageData.data[pixelIndex++] = Math.round(r * 0xFF / 0xF);
				imageData.data[pixelIndex++] = Math.round(g * 0xFF / 0xF);
				imageData.data[pixelIndex++] = Math.round(b * 0xFF / 0xF);
				imageData.data[pixelIndex++] = Math.round(a * 0xFF / 0xF);
			}
			break;
		case "rgb565be":
			for (let i = 0; i < buffer.length; i += 2) {
				const color = (buffer[i] << 8) | buffer[i + 1];
				const r = ((((color >> 11) & 0x1F) * 527) + 23) >> 6;
				const g = ((((color >> 5) & 0x3F) * 259) + 33) >> 6;
				const b = (((color & 0x1F) * 527) + 23) >> 6;
				imageData.data[pixelIndex++] = r;
				imageData.data[pixelIndex++] = g;
				imageData.data[pixelIndex++] = b;
				imageData.data[pixelIndex++] = 0xFF;
			}
			break;
		case "rgb565":
			for (let i = 0; i < buffer.length; i += 2) {
				const color = (buffer[i + 1] << 8) | buffer[i];
				const r = ((((color >> 11) & 0x1F) * 527) + 23) >> 6;
				const g = ((((color >> 5) & 0x3F) * 259) + 33) >> 6;
				const b = (((color & 0x1F) * 527) + 23) >> 6;
				imageData.data[pixelIndex++] = r;
				imageData.data[pixelIndex++] = g;
				imageData.data[pixelIndex++] = b;
				imageData.data[pixelIndex++] = 0xFF;
			}
			break;
		case "rgb888":
			for (let i = 0; i < buffer.length; i += 3) {
				imageData.data[pixelIndex++] = buffer[i];
				imageData.data[pixelIndex++] = buffer[i + 1];
				imageData.data[pixelIndex++] = buffer[i + 2];
				imageData.data[pixelIndex++] = 0xFF;
			}
			break;
		case "rgb8888":
			for (let i = 0; i < buffer.length; i += 4) {
				imageData.data[pixelIndex++] = buffer[i + 2];
				imageData.data[pixelIndex++] = buffer[i + 1];
				imageData.data[pixelIndex++] = buffer[i];
				imageData.data[pixelIndex++] = Math.round(buffer[i + 3] * 0xFF / 100);
			}
			break;
		default:
			console.error(`Unknown mode: ${mode}`);
			break;
	}

	ctx.putImageData(imageData, 0, 0);
}

export function downloadCanvasImage(canvas: HTMLCanvasElement, filename: string): void {
	const a = document.createElement('a');
	a.href = canvas.toDataURL('image/png');
	a.download = filename;
	a.click();
}

export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

export function formatDuration(seconds: number): string {
	const duration = intervalToDuration({ start: 0, end: seconds * 1000 });
	return [duration.hours, duration.minutes || 0, duration.seconds || 0]
		.filter((v) => v != null)
		.map((num) => String(num).padStart(2, '0'))
		.join(':');
}

export function validateHex(value: string): boolean {
	if (!value.match(/^([A-F0-9]+)$/i))
		return false;
	const num = parseInt(value, 16);
	return num <= 0xFFFFFFFF;
}

export function formatSize(size: number): string {
	if (size > 1024 * 1024) {
		return +(size / 1024 / 1024).toFixed(2) + " Mb";
	} else {
		return +(size / 1024).toFixed(2) + " kB";
	}
}
