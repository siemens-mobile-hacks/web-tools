import { DWD, IoReadWriteProgress } from "@sie-js/serial";
import { SerialService } from "./SerialService";
import { openSerialPort } from "@/utils/serial.js";

export class DwdService extends SerialService<DWD> {
	async connect(portIndex: number): Promise<void> {
		const availablePorts = await navigator.serial.getPorts();
		if (!availablePorts[portIndex])
			throw new Error(`Invalid port index ${portIndex}`);
		this.handle = new DWD(await openSerialPort(availablePorts[portIndex]));
		await this.handle.connect();
	}

	protocol(): string {
		return "DWD";
	}

	async getMemoryRegions() {
		return await this.handle.getMemoryRegions();
	}

	async getSWVersion() {
		return await this.handle.getSWVersion();
	}

	async readMemory(addr: number, size: number, onProgress: (e: IoReadWriteProgress) => void) {
		return this.handle.readMemory(addr, size, {
			onProgress,
			signal: this.getAbortSignal(),
		});
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
