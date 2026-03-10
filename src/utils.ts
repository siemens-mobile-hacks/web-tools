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
