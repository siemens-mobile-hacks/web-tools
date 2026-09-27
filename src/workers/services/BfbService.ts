import * as Comlink from "comlink";
import { BFB, BFB_BAUD_RATES, IoReadWriteProgress } from "@sie-js/serial";
import { openSerialPort } from "@/utils/serial.js";
import { SerialService } from "./SerialService";

export class BfbService extends SerialService<BFB> {
	protocol(): string {
		return "BFB";
	}

	async connect(portIndex: number, limitBaudrate?: number): Promise<void> {
		const availablePorts = await navigator.serial.getPorts();
		if (!availablePorts[portIndex])
			throw new Error(`Invalid port index ${portIndex}`);
		this.handle = new BFB(await openSerialPort(availablePorts[portIndex]));
		await this.handle.connect();
		await this.handle.setBestBaudrate(limitBaudrate);
	}

	async getAllDisplays() {
		const display = await this.handle.getDisplaySize();
		return [{
			width: display.width,
			height: display.height,
			bufferWidth: display.width,
			bufferHeight: display.height,
		}];
	}

	async getDisplayBuffer(_displayId: number, onProgress?: (e: IoReadWriteProgress) => void) {
		const response = await this.handle.getDisplayBuffer({
			onProgress,
			progressInterval: 300,
			signal: this.getAbortSignal(),
		});
		const result = {
			...response,
			displayWidth: response.width,
			displayHeight: response.height,
		};
		return Comlink.transfer(result, [response.buffer]);
	}

	async getMemoryRegions() {
		return await this.handle.getMemoryRegions();
	}

	async readMemory(addr: number, size: number, onProgress: (e: IoReadWriteProgress) => void) {
		const response = await this.handle.readMemory(addr, size, {
			onProgress,
			progressInterval: 300,
			signal: this.getAbortSignal(),
		});
		return Comlink.transfer(response, [response.buffer]);
	}

	async getDeviceName() {
		const model = await this.handle.getPhoneModel();
		const version = await this.handle.getFirmwareVersion();
		return `SIEMENS ${model} v${version}`;
	}

	async disconnect(): Promise<void> {
		if (this.isConnected) {
			const port = this.handle.getSerialPort();
			await this.handle.disconnect();
			this.handle = undefined;
			await port!.close();
		}
	}

	static getDebugFilters() {
		return [
			{
				name: "AT debug",
				filter: "atc",
			},
			{
				name: "BFB debug",
				filter: "bfb",
			},
			{
				name: "BFB debug (TRX)",
				filter: "bfb:trx",
			},
		];
	}

	static getBaudrates() {
		return [
			{
				name: "Maximum",
				value: 0,
			},
			...Object.keys(BFB_BAUD_RATES).map(Number).sort((a, b) => b - a).map((value) => ({
				name: `≤ ${value}`,
				value,
			})),
		];
	}
}
