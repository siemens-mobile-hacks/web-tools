export type BitmapType =
	| "wb"
	| "bgr233"
	| "bgra4444"
	| "bgr565"
	| "bgr888"
	| "bgra8888"
	| "bgra8888p"
	| "bgra8888mask";

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

/* ================= BGRA4444 ================= */

export function getPixelBGRA4444(x: number, y: number, w: number, _h: number, bitmap: Buffer): number {
	const o = (y * w + x) * 2;
	const c16 = bitmap.readUInt16LE(o);
	const a = ((c16 >>> 12) & 0xF) * 0xFF / 0xF;
	const r = ((c16 >>> 8) & 0xF) * 0xFF / 0xF;
	const g = ((c16 >>> 4) & 0xF) * 0xFF / 0xF;
	const b = (c16 & 0xF) * 0xFF / 0xF;
	return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function setPixelBGRA4444(x: number, y: number, w: number, _h: number, bitmap: Buffer, color: number): void {
	const a = ((color >>> 24) & 0xFF) >>> 4;
	const b = ((color >>> 16) & 0xFF) >>> 4;
	const g = ((color >>> 8) & 0xFF) >>> 4;
	const r = (color & 0xFF) >>> 4;
	const c16 = ((a << 12) | (r << 8) | (g << 4) | b) & 0xFFFF;
	bitmap.writeUInt16LE(c16, (y * w + x) * 2);
}

/* ================= BGR565 ================= */

export function getPixelBGR565(x: number, y: number, w: number, _h: number, bitmap: Buffer): number {
	const o = (y * w + x) * 2;
	const c16 = bitmap.readUInt16LE(o);
	const r = ((((c16 >>> 11) & 0x1F) * 527) + 23) >> 6;
	const g = ((((c16 >>> 5) & 0x3F) * 259) + 33) >> 6;
	const b = (((c16 & 0x1F) * 527) + 23) >> 6;
	return ((0xFF << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function setPixelBGR565(x: number, y: number, w: number, _h: number, bitmap: Buffer, color: number): void {
	const b = (color >>> 16) & 0xFF;
	const g = (color >>> 8) & 0xFF;
	const r = color & 0xFF;
	const c16 = (((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >>> 3)) & 0xFFFF;
	bitmap.writeUInt16LE(c16, (y * w + x) * 2);
}

/* ================= BGR888 ================= */

export function getPixelBGR888(x: number, y: number, w: number, _h: number, bitmap: Buffer): number {
	const o = (y * w + x) * 3;
	const b = bitmap[o];
	const g = bitmap[o + 1];
	const r = bitmap[o + 2];
	return ((0xFF << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function setPixelBGR888(x: number, y: number, w: number, _h: number, bitmap: Buffer, color: number): void {
	const b = (color >>> 16) & 0xFF;
	const g = (color >>> 8) & 0xFF;
	const r = color & 0xFF;
	const o = (y * w + x) * 3;
	bitmap[o] = b;
	bitmap[o + 1] = g;
	bitmap[o + 2] = r;
}

/* ================= BGRA8888 ================= */

export function getPixelBGRA8888(x: number, y: number, w: number, _h: number, bitmap: Buffer): number {
	const bgra = bitmap.readUInt32LE((y * w + x) * 4);
	const a = (bgra >>> 24) & 0xFF;
	const r = (bgra >>> 16) & 0xFF;
	const g = (bgra >>> 8)  & 0xFF;
	const b =  bgra & 0xFF;
	return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function setPixelBGRA8888(x: number, y: number, w: number, _h: number, bitmap: Buffer, color: number): void {
	const a = ((color >>> 24) & 0xFF) >>> 4;
	const b = ((color >>> 16) & 0xFF) >>> 4;
	const g = ((color >>> 8) & 0xFF) >>> 4;
	const r = (color & 0xFF) >>> 4;
	const bgra = ((a << 24) | (r << 16) | (g << 8) | b) >> 0;
	bitmap.writeUInt32LE(bgra, (y * w + x) * 4);
}

/* ================= BGRA8888P ================= */

export function getPixelBGRA8888P(x: number, y: number, w: number, _h: number, bitmap: Buffer): number {
	const bgra = bitmap.readUInt32LE((y * w + x) * 4);
	const a100 = (bgra >>> 24) & 0xFF;
	const r = (bgra >>> 16) & 0xFF;
	const g = (bgra >>> 8)  & 0xFF;
	const b =  bgra & 0xFF;
	const a = Math.round(a100 * 255 / 100);
	return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function setPixelBGRA8888P(x: number, y: number, w: number, _h: number, bitmap: Buffer, color: number): void {
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
		case "bgr233":			return getPixelBGR233;
		case "bgra4444":		return getPixelBGRA4444;
		case "bgr565":			return getPixelBGR565;
		case "bgr888":			return getPixelBGR888;
		case "bgra8888":		return getPixelBGRA8888;
		case "bgra8888p":		return getPixelBGRA8888P;
	}
	throw new Error("Unknown bitmap type: " + type);
}

export function getBitmapEncoder(type: BitmapType): BitmapPixelWriter {
	switch (type) {
		case "wb":				return setPixelWB;
		case "bgr233":			return setPixelBGR233;
		case "bgra4444":		return setPixelBGRA4444;
		case "bgr565":			return setPixelBGR565;
		case "bgr888":			return setPixelBGR888;
		case "bgra8888":		return setPixelBGRA8888;
		case "bgra8888p":		return setPixelBGRA8888P;
	}
	throw new Error("Unknown bitmap type: " + type);
}
