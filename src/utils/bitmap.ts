export type BitmapType =
	| "wb"
	| "rgb332"
	| "argb4444"
	| "rgb565"
	| "rgb888"
	| "argb8888"
	| "argb8888p";

export type BitmapPixelReader = (x: number, y: number, w: number, h: number, bitmap: Buffer) => number;
export type BitmapPixelWriter = (x: number, y: number, w: number, h: number, bitmap: Buffer, color: number) => void;

export function getPixelWB(x: number, y: number, w: number, _h: number, bitmap: Buffer): number {
	const rowBytes = Math.floor((w + 7) / 8);
	const bitN = y * (rowBytes * 8) + x;
	const byteN = bitN >>> 3;
	const shift = 7 - (bitN - (byteN << 3));
	const bit = (bitmap[byteN] >>> shift) & 1;
	return bit ? 0xFFFFFFFF : 0xFF000000;
}

export function setPixelWB(x: number, y: number, w: number, _h: number, bitmap: Buffer, color: number): void {
	const rowBytes = Math.floor((w + 7) / 8);
	const bitN = y * (rowBytes * 8) + x;
	const byteN = bitN >>> 3;
	const shift = 7 - (bitN - (byteN << 3));
	const b = (color >>> 16) & 0xFF;
	const g = (color >>> 8) & 0xFF;
	const r = color & 0xFF;
	const gray = 0.299 * r + 0.587 * g + 0.114 * b;
	if (gray >= 128) {
		bitmap[byteN] |= (1 << shift);
	} else {
		bitmap[byteN] &= ~(1 << shift)
	}
}

/* ================= ARGB4444 ================= */

export function getPixelARGB4444(x: number, y: number, w: number, _h: number, bitmap: Buffer): number {
	const o = (y * w + x) * 2;
	const c16 = bitmap.readUInt16LE(o);
	const a = ((c16 >>> 12) & 0xF) * 0xFF / 0xF;
	const r = ((c16 >>> 8) & 0xF) * 0xFF / 0xF;
	const g = ((c16 >>> 4) & 0xF) * 0xFF / 0xF;
	const b = (c16 & 0xF) * 0xFF / 0xF;
	return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function setPixelARGB4444(x: number, y: number, w: number, _h: number, bitmap: Buffer, color: number): void {
	const a = ((color >>> 24) & 0xFF) >>> 4;
	const b = ((color >>> 16) & 0xFF) >>> 4;
	const g = ((color >>> 8) & 0xFF) >>> 4;
	const r = (color & 0xFF) >>> 4;
	const c16 = ((a << 12) | (r << 8) | (g << 4) | b) & 0xFFFF;
	bitmap.writeUInt16LE(c16, (y * w + x) * 2);
}

/* ================= RGB565 ================= */

export function getPixelRGB565(x: number, y: number, w: number, _h: number, bitmap: Buffer): number {
	const o = (y * w + x) * 2;
	const c16 = bitmap.readUInt16LE(o);
	const r = ((((c16 >>> 11) & 0x1F) * 527) + 23) >> 6;
	const g = ((((c16 >>> 5) & 0x3F) * 259) + 33) >> 6;
	const b = (((c16 & 0x1F) * 527) + 23) >> 6;
	return ((0xFF << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function setPixelRGB565(x: number, y: number, w: number, _h: number, bitmap: Buffer, color: number): void {
	const b = (color >>> 16) & 0xFF;
	const g = (color >>> 8) & 0xFF;
	const r = color & 0xFF;
	const c16 = (((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >>> 3)) & 0xFFFF;
	bitmap.writeUInt16LE(c16, (y * w + x) * 2);
}

/* ================= RGB888 ================= */

export function getPixelRGB888(x: number, y: number, w: number, _h: number, bitmap: Buffer): number {
	const o = (y * w + x) * 3;
	const b = bitmap[o];
	const g = bitmap[o + 1];
	const r = bitmap[o + 2];
	return ((0xFF << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function setPixelRGB888(x: number, y: number, w: number, _h: number, bitmap: Buffer, color: number): void {
	const b = (color >>> 16) & 0xFF;
	const g = (color >>> 8) & 0xFF;
	const r = color & 0xFF;
	const o = (y * w + x) * 3;
	bitmap[o] = b;
	bitmap[o + 1] = g;
	bitmap[o + 2] = r;
}

/* ================= ARGB8888 ================= */

export function getPixelARGB8888(x: number, y: number, w: number, _h: number, bitmap: Buffer): number {
	const bgra = bitmap.readUInt32LE((y * w + x) * 4);
	const a = (bgra >>> 24) & 0xFF;
	const r = (bgra >>> 16) & 0xFF;
	const g = (bgra >>> 8)  & 0xFF;
	const b =  bgra & 0xFF;
	return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function setPixelARGB8888(x: number, y: number, w: number, _h: number, bitmap: Buffer, color: number): void {
	const a = ((color >>> 24) & 0xFF) >>> 4;
	const b = ((color >>> 16) & 0xFF) >>> 4;
	const g = ((color >>> 8) & 0xFF) >>> 4;
	const r = (color & 0xFF) >>> 4;
	const bgra = ((a << 24) | (r << 16) | (g << 8) | b) >> 0;
	bitmap.writeUInt32LE(bgra, (y * w + x) * 4);
}

/* ================= ARGB8888P ================= */

export function getPixelARGB8888P(x: number, y: number, w: number, _h: number, bitmap: Buffer): number {
	const bgra = bitmap.readUInt32LE((y * w + x) * 4);
	const a100 = (bgra >>> 24) & 0xFF;
	const r = (bgra >>> 16) & 0xFF;
	const g = (bgra >>> 8)  & 0xFF;
	const b =  bgra & 0xFF;
	const a = Math.round(a100 * 255 / 100);
	return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function setPixelARGB8888P(x: number, y: number, w: number, _h: number, bitmap: Buffer, color: number): void {
	const a = ((color >>> 24) & 0xFF) >>> 4;
	const b = ((color >>> 16) & 0xFF) >>> 4;
	const g = ((color >>> 8) & 0xFF) >>> 4;
	const r = (color & 0xFF) >>> 4;
	const a100 = Math.round(a * 100 / 255);
	const bgra = ((a100 << 24) | (r << 16) | (g << 8) | b) >> 0;
	bitmap.writeUInt32LE(bgra, (y * w + x) * 4);
}

/* ================= BGR233 ================= */

export function getPixelBGR233(x: number, y: number, w: number, _h: number, bitmap: Buffer): number {
	const c = bitmap[y * w + x];
	const r = ((c >>> 5) & 0x7) * 0xFF / 0x7;
	const g = ((c >>> 2) & 0x7) * 0xFF / 0x7;
	const b = (c & 0x3) * 0xFF / 0x3;
	return ((0xFF << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function setPixelBGR233(x: number, y: number, w: number, _h: number, bitmap: Buffer, color: number): void {
	const b = ((color >>> 16) & 0xFF) >>> 5;
	const g = ((color >>> 8) & 0xFF) >>> 5;
	const r = (color & 0xFF) >>> 6;
	bitmap[y * w + x] = ((r << 5) | (g << 2) | b) & 0xFF;
}

/* ================= Main ================= */

export function getBitmapDecoder(type: BitmapType): BitmapPixelReader {
	switch (type) {
		case "wb":				return getPixelWB;
		case "rgb332":			return getPixelBGR233;
		case "argb4444":		return getPixelARGB4444;
		case "rgb565":			return getPixelRGB565;
		case "rgb888":			return getPixelRGB888;
		case "argb8888":		return getPixelARGB8888;
		case "argb8888p":		return getPixelARGB8888P;
	}
	throw new Error("Unknown bitmap type: " + type);
}

export function getBitmapEncoder(type: BitmapType): BitmapPixelWriter {
	switch (type) {
		case "wb":				return setPixelWB;
		case "rgb332":			return setPixelBGR233;
		case "argb4444":		return setPixelARGB4444;
		case "rgb565":			return setPixelRGB565;
		case "rgb888":			return setPixelRGB888;
		case "argb8888":		return setPixelARGB8888;
		case "argb8888p":		return setPixelARGB8888P;
	}
	throw new Error("Unknown bitmap type: " + type);
}
