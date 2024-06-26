export function resolveURL(url) {
	return `${import.meta.env.BASE_URL}${url}`.replace(/[\/]+/g, '/');
}

export function recursiveMap(value, callback) {
	value = callback(value);

	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			value[i] = recursiveMap(value[i], callback)
		}
		return value;
	} else if (typeof value == 'object') {
		for (let k of Object.keys(value)) {
			value[k] = recursiveMap(value[k], callback);
		}
		return value;
	} else {
		return callback(value);
	}
}

export function transferBufferToCanvas(mode, buffer, canvas) {
	let ctx = canvas.getContext('2d', { willReadFrequently: true });

	let pixelIndex = 0;
	let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	switch (mode) {
		case "rgb332":
			for (let i = 0; i < buffer.length; i++) {
				let color = buffer[i];
				let r = (color >> 5) & 7;
				let g = (color >> 2) & 7;
				let b = color & 3;

				imageData.data[pixelIndex++] = Math.round(r * 0xFF / 7);
				imageData.data[pixelIndex++] = Math.round(g * 0xFF / 7);
				imageData.data[pixelIndex++] = Math.round(b * 0xFF / 3);
				imageData.data[pixelIndex++] = 0xFF;
			}
		break;
		case "rgba4444":
			for (let i = 0; i < buffer.length; i += 2) {
				let color = (buffer[i + 1] << 8) | buffer[i];
				let a = (color >> 12) & 0xF;
				let r = (color >> 8) & 0xF;
				let g = (color >> 4) & 0xF;
				let b = color & 0xF;

				imageData.data[pixelIndex++] = Math.round(r * 0xFF / 0xF);
				imageData.data[pixelIndex++] = Math.round(g * 0xFF / 0xF);
				imageData.data[pixelIndex++] = Math.round(b * 0xFF / 0xF);
				imageData.data[pixelIndex++] = Math.round(a * 0xFF / 0xF);
			}
		break;
		case "rgb565be":
			for (let i = 0; i < buffer.length; i += 2) {
				let color = (buffer[i] << 8) | buffer[i + 1];
				let r = ((((color >> 11) & 0x1F) * 527) + 23) >> 6;
				let g = ((((color >> 5) & 0x3F) * 259) + 33) >> 6;
				let b = (((color & 0x1F) * 527) + 23) >> 6;
				imageData.data[pixelIndex++] = r;
				imageData.data[pixelIndex++] = g;
				imageData.data[pixelIndex++] = b;
				imageData.data[pixelIndex++] = 0xFF;
			}
		break;
		case "rgb565":
			for (let i = 0; i < buffer.length; i += 2) {
				let color = (buffer[i + 1] << 8) | buffer[i];
				let r = ((((color >> 11) & 0x1F) * 527) + 23) >> 6;
				let g = ((((color >> 5) & 0x3F) * 259) + 33) >> 6;
				let b = (((color & 0x1F) * 527) + 23) >> 6;
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
				imageData.data[pixelIndex++] = buffer[i + 0];
				imageData.data[pixelIndex++] = Math.round(buffer[i + 3] * 0xFF / 100);
			}
		break;
		default:
			console.error(`Unknown mode: ${mode}`);
		break;
	}

	ctx.putImageData(imageData, 0, 0);
}

export function downloadCanvasImage(canvas, filename) {
	let a = document.createElement('a');
	a.href = canvas.toDataURL('image/png');
	a.download = filename;
	a.click();
}

export function downloadBlob(blob, filename) {
	let url = URL.createObjectURL(blob);
	let a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}
