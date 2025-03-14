import { BFC } from "@sie-js/serial";
import { SerialService } from "./SerialService";

export class BfcService extends SerialService {
	constructor(port) {
		super();
		this.port = port;
		this.handle = new BFC(port);
	}

	protocol() {
		return "BFC";
	}

	async connect(limitBaudrate) {
		await this.handle.connect();
		await this.handle.setBestBaudrate(limitBaudrate);
	}

	async getAllDisplays() {
		const displays = [];
		const displaysCount = await this.handle.getDisplayCount();
		for (let i = 1; i <= displaysCount; i++) {
			const displayInfo = await this.handle.getDisplayInfo(i);
			const bufferInfo = await this.handle.getDisplayBufferInfo(displayInfo.clientId);
			displays.push({
				width: displayInfo.width,
				height: displayInfo.height,
				bufferWidth: bufferInfo.width,
				bufferHeight: bufferInfo.height
			});
		}
		return displays;
	}

	async makeScreenshot(displayId) {
		return await this.handle.getDisplayBuffer(displayId, {
			onProgress: (value, total, elapsed) => this.sendEvent('screenshotProgress', { value, total, elapsed })
		});
	}

	async disconnect() {
		if (this.handle) {
			await this.handle.disconnect();
			this.handle.destroy();
			this.handle = null;
		}
		await this._closeSerialPort();
	}
}
