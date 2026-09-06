import * as Comlink from "comlink";
import { Obex, type ObexProgress } from "@/utils/obex";
import { SerialService } from "./SerialService";
import { openSerialPort } from "@/utils/serial.js";

export class ObexService extends SerialService<Obex> {
	protocol(): string {
		return "OBEX";
	}

	async connect(portIndex: number, limitBaudrate?: number): Promise<void> {
		const availablePorts = await navigator.serial.getPorts();
		if (!availablePorts[portIndex])
			throw new Error(`Invalid port index ${portIndex}`);
		this.handle = new Obex(await openSerialPort(availablePorts[portIndex]));
		await this.handle.connect(limitBaudrate);
	}

	async getDeviceName(): Promise<string | undefined> {
		return this.handle.getDeviceName();
	}

	getMaxPacketSize(): number {
		return this.handle.getMaxPacketSize();
	}

	getBaudrate(): number {
		return this.handle.getSerialPort().baudRate;
	}

	async getCapacity(): Promise<number> {
		return this.handle.getCapacity();
	}

	async getAvailable(): Promise<number> {
		return this.handle.getAvailable();
	}

	async readDir(path: string) {
		return this.handle.readDir(path);
	}

	async getFile(path: string, onProgress?: (e: ObexProgress) => void): Promise<Buffer> {
		const data = await this.handle.getFile(path, onProgress);
		return Comlink.transfer(data, [data.buffer]);
	}

	async putFile(path: string, data: Uint8Array, onProgress?: (e: ObexProgress) => void, overwrite = true): Promise<void> {
		await this.handle.putFile(path, data, onProgress, { overwrite });
	}

	async deleteFile(path: string): Promise<void> {
		await this.handle.deleteFile(path);
	}

	async mkdir(path: string): Promise<void> {
		await this.handle.mkdir(path);
	}

	async move(src: string, dest: string): Promise<void> {
		await this.handle.move(src, dest);
	}

	async disconnect(): Promise<void> {
		if (this.isConnected) {
			const port = this.handle.getSerialPort();
			await this.handle.disconnect();
			this.handle = undefined;
			await port.close();
		}
	}

	static getDebugFilters() {
		return [
			{
				name: "AT debug",
				filter: "atc",
			},
			{
				name: "BFC debug",
				filter: "bfc",
			},
			{
				name: "OBEX debug",
				filter: "obex",
			},
			{
				name: "OBEX debug (TRX)",
				filter: "obex:trx",
			}
		];
	}

	static getBaudrates() {
		return [
			{
				name: "Auto",
				value: 0,
			},
			{
				name: "921600",
				value: 921600,
			},
			{
				name: "460800",
				value: 460800,
			},
			{
				name: "230400",
				value: 230400,
			},
			{
				name: "115200",
				value: 115200,
			},
			{
				name: "57600",
				value: 57600,
			},
			{
				name: "19200",
				value: 19200,
			},
		];
	}
}
