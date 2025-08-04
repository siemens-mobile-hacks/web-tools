import { BFC, IoReadWriteProgress } from "@sie-js/serial";
import { SerialService } from "./SerialService";
import { openSerialPort } from "@/utils/serial.js";

export interface PhoneDisplay {
	width: number;
	height: number;
	bufferWidth: number;
	bufferHeight: number;
}

export class BfcService extends SerialService {
	protocol(): string {
		return "BFC";
	}

	async connect(portIndex: number, limitBaudrate?: number): Promise<void> {
		const availablePorts = await navigator.serial.getPorts();
		if (!availablePorts[portIndex])
			throw new Error(`Invalid port index ${portIndex}`);
		this.handle = new BFC(await openSerialPort(availablePorts[portIndex]));
		await this.handle.connect();
		await this.handle.setBestBaudrate(limitBaudrate);
	}

	async getAllDisplays(): Promise<PhoneDisplay[]> {
		const displays: PhoneDisplay[] = [];
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

	async getDisplayBuffer(displayId: number, onProgress?: (e: IoReadWriteProgress) => void) {
		return this.handle.getDisplayBuffer(displayId, {
			onProgress,
			signal: this.getAbortSignal(),
		});
	}

	async getDeviceName() {
		const vendor = await this.handle.getVendorName();
		const model = await this.handle.getProductName();
		const version = await this.handle.getSwVersion();
		return `${vendor} ${model} v${version}`;
	}

	async disconnect(): Promise<void> {
		if (this.isConnected) {
			const port = this.handle.getSerialPort();
			await this.handle.disconnect();
			this.handle.detachSerialPort();
			this.handle = undefined;
			await port!.close();
		}
	}
}
