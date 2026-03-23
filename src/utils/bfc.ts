import { getBitmapDecoder } from "@/utils/bitmap";
import { BfcDisplayBufferData } from "@sie-js/serial";

interface BfcDisplayDecodedBuffer {
	width: number;
	height: number;
	data: Buffer;
}

export function decodeBfcDisplayBuffer(response: BfcDisplayBufferData): BfcDisplayDecodedBuffer {
	let type = response.type;
	let isYuvMask = false;
	if (type == 'argb8888+yuv') {
		type = 'argb8888';
		isYuvMask = true;
	}

	const clamp8 = (v: number): number => {
		return v < 0 ? 0 : v > 255 ? 255 : v;
	};

	const decodeYUV = (y: number, u: number, v: number): number => {
		const d = u - 128;
		const e = v - 128;
		const r = clamp8((298 * y + 409 * e + 128) >> 8);
		const g = clamp8((298 * y - 100 * d - 208 * e + 128) >> 8);
		const b = clamp8((298 * y + 516 * d + 128) >> 8);
		return 0xFF000000 | (b << 16) | (g << 8) | r;
	};

	const image: BfcDisplayDecodedBuffer = {
		width: response.displayWidth,
		height: response.displayHeight,
		data: Buffer.alloc(response.displayWidth * response.displayHeight * 4),
	};
	const getBitmapPixel = getBitmapDecoder(type);
	for (let y = 0; y < response.height; y++) {
		for (let x = 0; x < response.width; x++) {
			let color = getBitmapPixel(x, y, response.width, response.height, response.buffer);
			if (isYuvMask) { // EL71 in camera
				const mask = (color & 0xFF000000) >>> 24;
				if (mask == 0x8D) {
					color = decodeYUV(color & 0xFF, (color >>> 8) & 0xFF, (color >>> 16) & 0xFF) >>> 0;
				} else {
					color = (color | 0xFF000000) >>> 0;
				}
			}
			image.data.writeUInt32LE(color, (y * image.width + x) * 4);
		}
	}

	const cropImage = (x: number, y: number, w: number, h: number): BfcDisplayDecodedBuffer => {
		const out: BfcDisplayDecodedBuffer = {
			width: w,
			height: h,
			data: Buffer.alloc(w * h * 4),
		};

		const src = image.data;
		const dst = out.data;

		const stride = image.width * 4;
		const bytesPerRow = w * 4;

		for (let row = 0; row < h; row++) {
			const offsetSrc = (y + row) * stride + x * 4;
			const offsetDst = row * bytesPerRow;
			src.copy(dst, offsetDst, offsetSrc, offsetSrc + bytesPerRow);
		}

		return out;
	};

	// C72 shit
	if (response.displayWidth < response.width || response.displayHeight < response.height) {
		const x = Math.round((response.width - response.displayWidth) / 2);
		const y = Math.round((response.height - response.displayHeight) / 2);
		return cropImage(x, y, response.displayWidth, response.displayHeight);
	}

	return image;
}
