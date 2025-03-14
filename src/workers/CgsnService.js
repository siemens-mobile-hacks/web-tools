import { CGSN } from "@sie-js/serial";
import { SerialService } from "./SerialService";

export class CgsnService extends SerialService {
	abortController;

	constructor(port) {
		super();
		this.port = port;
		this.handle = new CGSN(port);
	}

	protocol() {
		return "CGSN";
	}

	async connect(limitBaudrate) {
		if (!await this.handle.connect())
			throw new Error(`Phone not connected or CGSN patch is not installed!`);
		await this.handle.setBestBaudrate(limitBaudrate);
	}

	async abort() {
		console.log('abort received!', this.abortController);
		if (this.abortController != null)
			this.abortController.abort();
	}

	async readMemory(addr, size) {
		this.abortController = new AbortController();
		return await this.handle.readMemory(addr, size, {
			signal: this.abortController.signal,
			onProgress: (value, total, elapsed) => this.sendEvent('memoryReadProgress', { value, total, elapsed })
		});
	}

	async getPhoneInfo() {
		let atc = this.handle.getAtChannel();

		let phoneModel;
		let phoneVendor;
		let phoneSwVersion;
		let phoneImei;

		let response;
		response = await atc.sendCommand("AT+CGSN");
		if (!response.success)
			return null;
		phoneImei = response.lines[0];

		response = await atc.sendCommand("AT+CGMI");
		if (!response.success)
			return null;
		phoneVendor = response.lines[0];

		response = await atc.sendCommand("AT+CGMM");
		if (!response.success)
			return null;
		phoneModel = response.lines[0];

		response = await atc.sendCommand("AT+CGMR");
		if (!response.success)
			return null;
		phoneSwVersion = response.lines[0].match(/^\s*(\d+)/)[0];

		console.info(`Detected phone ${phoneVendor} ${phoneModel}v${phoneSwVersion}`);

		let memoryRegions = [
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
			console.error(`Detected unknown phone! Memory regions maybe incorret.`);
			memoryRegions.push({
				name:	"RAM",
				addr:	0xA8000000,
				size:	0x00800000,
				descr:	'External RAM.',
			});
		}

		return { phoneVendor, phoneModel, phoneSwVersion, phoneImei, memoryRegions };
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
