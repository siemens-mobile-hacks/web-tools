import { AtCommandResponse, CGSN, IoReadWriteProgress } from "@sie-js/serial";
import { SerialService } from "./SerialService";
import { openSerialPort } from "@/utils/serial.js";

export interface MemoryRegion {
	name: string;
	addr: number;
	size: number;
	descr: string;
}

export interface PhoneInfo {
	phoneVendor: string;
	phoneModel: string;
	phoneSwVersion: string;
	phoneImei: string;
	memoryRegions: MemoryRegion[];
}

export class CgsnService extends SerialService<CGSN> {
	async connect(portIndex: number, limitBaudrate?: number): Promise<void> {
		const availablePorts = await navigator.serial.getPorts();
		if (!availablePorts[portIndex])
			throw new Error(`Invalid port index ${portIndex}`);
		this.handle = new CGSN(await openSerialPort(availablePorts[portIndex]));
		if (!await this.handle.connect())
			throw new Error(`Phone not connected or CGSN patch is not installed!`);
		await this.handle.setBestBaudRate(limitBaudrate);
	}

	protocol(): string {
		return "CGSN";
	}

	async getPhoneInfo(): Promise<PhoneInfo | undefined> {
		const atc = this.handle.getAtChannel();

		let response: AtCommandResponse;
		let phoneModel: string;
		let phoneVendor: string;
		let phoneSwVersion: string;
		let phoneImei: string;

		response = await atc.sendCommand("AT+CGSN");
		if (!response.success)
			return undefined;
		phoneImei = response.lines[0];

		response = await atc.sendCommand("AT+CGMI");
		if (!response.success)
			return undefined;
		phoneVendor = response.lines[0];

		response = await atc.sendCommand("AT+CGMM");
		if (!response.success)
			return undefined;
		phoneModel = response.lines[0];

		response = await atc.sendCommand("AT+CGMR");
		if (!response.success)
			return undefined;
		const match = response.lines[0].match(/^\s*(\d+)/);
		if (!match)
			return undefined;
		phoneSwVersion = match[0];

		console.info(`Detected phone ${phoneVendor} ${phoneModel}v${phoneSwVersion}`);

		const memoryRegions: MemoryRegion[] = [
			{
				name:	"BROM",
				addr:	0x00400000,
				size:	0x00008000,
				descr:	'Built-in 1st stage bootloader firmware.',
			}, {
				name:	"TCM",
				addr:	0x00000000,
				size:	0x00004000,
				descr:	'Built-in memory in the CPU, used for IRQ handlers.',
			}, {
				name:	"SRAM",
				addr:	0x00080000,
				size:	0x00018000,
				descr:	'Built-in memory in the CPU.',
			}
		];

		if (phoneModel.match(/^(E71|EL71|M72|CL61)(F|C|)$/i)) {
			memoryRegions.push({
				name:	"RAM",
				addr:	0xA8000000,
				size:	0x01000000,
				descr:	'External RAM.',
			});
			memoryRegions.push({
				name:	"VMALLOC",
				addr:	0xAC000000,
				size:	0x01800000,
				descr:	'Virtual memory for malloc().',
			});
		} else if (phoneModel.match(/^(C81|M81|S68)(F|C|)$/i)) {
			memoryRegions.push({
				name:	"RAM",
				addr:	0xA8000000,
				size:	0x01000000,
				descr:	'External RAM.',
			});
			memoryRegions.push({
				name:	"VMALLOC",
				addr:	0xAC000000,
				size:	0x00E00000,
				descr:	'Virtual memory for malloc().',
			});
		} else if (phoneModel.match(/^(S75|SL75|CX75|M75|SK65)(F|C|)$/i)) {
			memoryRegions.push({
				name:	"RAM",
				addr:	0xA8000000,
				size:	0x01000000,
				descr:	'External RAM.',
			});
		} else if (phoneModel.match(/^(CX70|C65|CX65|M65|S65|SL65|ME75|CF75|C75|C72)(F|C|)$/i)) {
			memoryRegions.push({
				name:	"RAM",
				addr:	0xA8000000,
				size:	0x00800000,
				descr:	'External RAM.',
			});
		} else {
			console.error(`Detected unknown phone! Memory regions maybe incorrect.`);
			memoryRegions.push({
				name:	"RAM",
				addr:	0xA8000000,
				size:	0x00800000,
				descr:	'External RAM.',
			});
		}

		return { phoneVendor, phoneModel, phoneSwVersion, phoneImei, memoryRegions };
	}

	async getDeviceName() {
		const atc = this.handle.getAtChannel();

		let response: AtCommandResponse;
		let phoneModel: string;
		let phoneVendor: string;
		let phoneSwVersion: string;

		response = await atc.sendCommand("AT+CGMI");
		if (!response.success)
			return undefined;
		phoneVendor = response.lines[0];

		response = await atc.sendCommand("AT+CGMM");
		if (!response.success)
			return undefined;
		phoneModel = response.lines[0];

		response = await atc.sendCommand("AT+CGMR");
		if (!response.success)
			return undefined;
		const match = response.lines[0].match(/^\s*(\d+)/);
		if (!match)
			return undefined;
		phoneSwVersion = match[0];

		return `${phoneVendor} ${phoneModel} v${phoneSwVersion}`;
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
