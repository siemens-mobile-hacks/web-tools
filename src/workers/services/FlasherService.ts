import { SerialService } from "./SerialService";
import { openSerialPort } from "@/utils/serial.js";
import * as Comlink from "comlink";
import { Buffer } from "buffer";
import { AsyncSerialPortTransport } from "@sie-js/flasher/web";
import { PhoneDevice, PhoneInfo, parseVkd } from "@sie-js/flasher";

export interface FlasherConnectData {
	vkdText: string;
	phoneId: string;
	baudrate: number;
	dtr?: boolean;
	rts?: boolean;
	skipBootcore?: boolean;
	skipLoaderLoadUnload?: boolean;
	autoIgnition?: boolean;
}

export interface FlasherProgress {
	cursor: number;
	total: number;
	status?: string;
}

export interface FlasherMemoryArea {
	name: string;
	addr: number;
	size: number;
	isBootcore: boolean;
	isNoWrite: boolean;
	isNoRead: boolean;
}

export class FlasherService extends SerialService<PhoneDevice> {
	protocol(): string {
		return "FLSH";
	}

	async connect(portIndex: number, baudrate: number | undefined, data?: FlasherConnectData): Promise<void> {
		if (!data)
			throw new Error("Flasher requires the loader data for connecting.");

		const vkd = parseVkd(data.vkdText);
		const phone = vkd.phones.find((p) => p.id == data.phoneId) ?? vkd.phones[0];
		if (!phone)
			throw new Error("The selected loader file does not contain any phone definitions.");

		const availablePorts = await navigator.serial.getPorts();
		if (!availablePorts[portIndex])
			throw new Error(`Invalid port index ${portIndex}`);

		const serialPort = await openSerialPort(availablePorts[portIndex]);
		const transport = new AsyncSerialPortTransport(serialPort);
		const device = new PhoneDevice(transport, phone, vkd.boots, {
			dtr: data.dtr ?? true,
			rts: data.rts ?? true,
			skipBootcore: data.skipBootcore ?? true,
			skipLoaderLoadUnload: data.skipLoaderLoadUnload ?? false,
			autoIgnition: data.autoIgnition ?? true,
		});

		this.handle = device;
		await device.open(data.baudrate ?? baudrate ?? 115200);
	}

	// Re-queries the flash info from the phone (the "Refresh" button in V_KLay).
	async refreshFlashInfo(): Promise<PhoneInfo | undefined> {
		await this.handle.readFlashInfo();
		return this.handle.getFlashInfo();
	}

	// Number of communication errors corrected during the operations
	// (part of the V_KLay performance report).
	getErrorsCorrected(): number {
		return this.handle.errorsCorrectedCount;
	}

	getMemAreas(): FlasherMemoryArea[] {
		return this.handle.memAreas.map((a) => ({
			name: a.name,
			addr: a.addr,
			size: a.size,
			isBootcore: a.isBootcore,
			isNoWrite: a.isNoWrite,
			isNoRead: a.isNoRead,
		}));
	}

	getFullFlashInfo(): { addr: number; size: number } {
		return { addr: this.handle.getMemoryStart(), size: this.handle.getMemorySize() };
	}

	getFlashInfo(): PhoneInfo | undefined {
		return this.handle.getFlashInfo();
	}

	getBaudrate(): number {
		return this.handle.getBaudrate();
	}

	getUniqueName(): string {
		return this.handle.getUniqueName();
	}

	readFlash(offset: number, size: number, onProgress?: (p: FlasherProgress) => void) {
		const signal = this.getAbortSignal();
		this.handle.onProgress = (p) => onProgress?.(p);
		this.handle.isCanceled = () => signal.aborted;
		return this.handle.readFlash(offset, size).then((data) => {
			this.handle.onProgress = undefined;
			const result = Buffer.from(data);
			return Comlink.transfer(result, [result.buffer]);
		});
	}

	writeFlash(offset: number, data: Buffer, onProgress?: (p: FlasherProgress) => void): Promise<void> {
		const signal = this.getAbortSignal();
		this.handle.onProgress = (p) => onProgress?.(p);
		this.handle.isCanceled = () => signal.aborted;
		return this.handle.writeFlash(offset, data);
	}

	async read(offset: number, size: number, onProgress?: (p: FlasherProgress) => void): Promise<Buffer> {
		const signal = this.getAbortSignal();
		this.handle.onProgress = (p) => onProgress?.(p);
		this.handle.isCanceled = () => signal.aborted;
		const data = await this.handle.read(offset, size);
		this.handle.onProgress = undefined;
		const result_1 = Buffer.from(data);
		return Comlink.transfer(result_1, [result_1.buffer]);
	}

	// Marks the pages as changed; the flash itself is only programmed by
	// flush(), once per touched block.
	write(offset: number, data: Buffer, onProgress?: (p: FlasherProgress) => void): Promise<void> {
		const signal = this.getAbortSignal();
		this.handle.onProgress = (p) => onProgress?.(p);
		this.handle.isCanceled = () => signal.aborted;
		return this.handle.write(offset, data);
	}

	// Programs the pages marked by write() back to the phone.
	async flush(onProgress?: (p: FlasherProgress) => void): Promise<void> {
		const signal = this.getAbortSignal();
		this.handle.onProgress = (p) => onProgress?.(p);
		this.handle.isCanceled = () => signal.aborted;
		try {
			await this.handle.flush();
		} finally {
			this.handle.onProgress = undefined;
		}
	}

	async disconnect(): Promise<void> {
		if (this.isConnected) {
			const device = this.handle;
			this.handle = undefined;
			await device.disconnect().catch(() => {});
		}
	}

	async getDeviceName(): Promise<string | undefined> {
		if (!this.isConnected)
			return undefined;
		return this.handle.getUniqueName();
	}

	static getDebugFilters() {
		return [
			{
				name: "Flasher debug",
				filter: "flasher",
			},
		];
	}

	static getBaudrates() {
		return [
			{ name: "115200", value: 115200 },
			{ name: "230400", value: 230400 },
			{ name: "460800", value: 460800 },
			{ name: "614400", value: 614400 },
			{ name: "921600", value: 921600 },
			{ name: "1228800", value: 1228800 },
			{ name: "1600000", value: 1600000 },
		];
	}
}

