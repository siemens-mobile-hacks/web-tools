/*
 * Mock replacement for @/workers/endpoints/serial, used by e2e tests (vite.e2e.config.ts).
 * Simulates a connected phone without any serial hardware: the File Explorer page
 * sees protocol OBEX + readyState CONNECTED, and the OBEX service serves a fake
 * filesystem from memory.
 */
import EventEmitter from "eventemitter3";

export enum SerialReadyState {
	DISCONNECTED,
	CONNECTED,
	CONNECTING,
	DISCONNECTING
}

export type SerialProtocol = 'none' | 'BFC' | 'CGSN' | 'DWD' | 'OBEX';

type ObexDirEntry = {
	name: string;
	isDir: boolean;
	size: number;
	mtime?: Date;
	readable: boolean;
	writable: boolean;
	hidden: boolean;
};

type ObexProgress = { percent: number; cursor: number; total: number; speed: number };

// 1x1 red PNG
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

const day = new Date('2024-05-01T12:00:00Z');
const mk = (name: string, isDir: boolean, size: number, writable = true): ObexDirEntry =>
	({ name, isDir, size, mtime: day, readable: true, writable, hidden: false });

const FILES: Record<string, ObexDirEntry[]> = {
	"/": [
		mk('Pictures', true, 0),
		mk('Sounds', true, 0),
		mk('logo.png', false, PNG.length),
		mk('notes.txt', false, 12),
		mk('addressbook.vcf', false, 1024),
		mk('theme.mid', false, 4096),
		mk('wallpaper.jpg', false, 15000),
		mk('readme.txt', false, 200, false),
		mk('hidden.dat', false, 300),
		mk('bigvideo.3gp', false, 512 * 1024),
		mk('config.ini', false, 64),
		mk('logo2.png', false, PNG.length),
		mk('logo3.png', false, PNG.length),
		mk('logo4.png', false, PNG.length),
		mk('logo5.png', false, PNG.length),
		mk('logo6.png', false, PNG.length),
	],
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const dirname = (path: string): string => {
	const parts = path.split("/").filter(Boolean);
	parts.pop();
	return "/" + parts.join("/");
};
const basename = (path: string): string => path.split("/").filter(Boolean).pop() ?? "";

// File contents of the fake phone, so uploads become visible in the listings
const CONTENT: Record<string, Uint8Array> = {
	"/logo.png": PNG,
};

const obexService = {
	async getBaudrate() { return 115200; },
	async getCapacity() { return 8 * 1024 * 1024; },
	async getAvailable() { return 4 * 1024 * 1024; },
	getMaxPacketSize() { return 4096; },
	async readDir(path: string) {
		await sleep(150);
		return (FILES[path] ?? []).map((e) => ({ ...e }));
	},
	async getFile(path: string, onProgress?: (e: ObexProgress) => void) {
		const entry = (FILES["/"] ?? []).find((e) => e.name == path.split("/").pop());
		const total = entry?.size ?? PNG.length;
		const data = entry && entry.name == 'logo.png' ? PNG : new Uint8Array(total);
		const chunk = Math.max(1, Math.floor(total / 5));
		for (let cursor = chunk; cursor <= total; cursor += chunk) {
			await sleep(120);
			onProgress?.({ percent: (cursor / total) * 100, cursor, total, speed: 100000 });
		}
		await sleep(120);
		return data;
	},
	// Siemens phones append to an existing file instead of replacing it, so the
	// mock reproduces the same quirk when overwrite is not requested
	async putFile(path: string, data: Uint8Array, onProgress?: (e: ObexProgress) => void, overwrite = true) {
		await sleep(150);
		const name = basename(path);
		const dir = dirname(path);
		FILES[dir] ??= [];
		const entry = FILES[dir].find((e) => e.name == name && !e.isDir);
		if (entry && !overwrite) {
			CONTENT[path] = new Uint8Array([...CONTENT[path] ?? [], ...data]);
			entry.size = CONTENT[path].length;
		} else {
			CONTENT[path] = new Uint8Array(data);
			if (entry)
				entry.size = data.length;
			else
				FILES[dir].push(mk(name, false, data.length));
		}
		onProgress?.({ percent: 100, cursor: data.length, total: data.length, speed: 100000 });
	},
	async deleteFile() {},
	async mkdir() {},
	async move() {},
};

const logService = {
	async getLog() { return []; },
	async setListener() {},
	async clear() {},
};

const SERVICES: Record<string, unknown> = {
	OBEX: obexService,
	LOG: logService,
};

type Events = {
	protocolChange: [SerialProtocol];
	readyStateChange: [SerialReadyState];
	serialPortChange: [string];
	deviceChange: [string | undefined];
};

class MockSerial extends EventEmitter<Events> {
	private protocol: SerialProtocol = 'none';
	private readyState: SerialReadyState = SerialReadyState.DISCONNECTED;

	async connect(protocol: SerialProtocol) {
		this.protocol = protocol;
		this.emit('protocolChange', protocol);
		this.emit('readyStateChange', SerialReadyState.CONNECTING);
		await sleep(100);
		this.emit('serialPortChange', 'webserial://mock');
		this.emit('deviceChange', 'Mock S55');
		this.readyState = SerialReadyState.CONNECTED;
		this.emit('readyStateChange', SerialReadyState.CONNECTED);
	}

	async disconnect() {
		this.emit('deviceChange', undefined);
		this.emit('protocolChange', 'none');
		this.emit('readyStateChange', SerialReadyState.DISCONNECTED);
	}

	getService<T>(type: string): T {
		return SERVICES[type] as T;
	}

	async setDebug() {}
}

export const serialWorker = new MockSerial();
