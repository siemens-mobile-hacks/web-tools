import createDebug from "debug";
import { AsyncSerialPort, AtChannel, BFC } from "@sie-js/serial";

const debug = createDebug("obex");
const debugTrx = createDebug("obex:trx");

// Siemens FlexMem OBEX target UUID, the same one used by SiMoCo/siefs
export const OBEX_TARGET_FLEXMEM = Buffer.from([
	0x6b, 0x01, 0xcb, 0x31, 0x41, 0x06, 0x11, 0xd4,
	0x9a, 0x77, 0x00, 0x50, 0xda, 0x3f, 0x47, 0x1f,
]);

export const OBEX_VERSION_1_0 = 0x10;

export enum ObexOpcode {
	PUT = 0x02,
	GET = 0x03,
	CONNECT = 0x80,
	DISCONNECT = 0x81,
	PUT_FINAL = 0x82,
	GET_FINAL = 0x83,
	SETPATH = 0x85,
	ABORT = 0xFF,
}

export enum ObexHeaderId {
	NAME = 0x01,
	TYPE = 0x42,
	TARGET = 0x46,
	BODY = 0x48,
	END_OF_BODY = 0x49,
	WHO = 0x4A,
	APP_PARAMS = 0x4C,
	CONNECTION_ID = 0xCB,
	LENGTH = 0xC3,
}

export enum ObexResponse {
	CONTINUE = 0x90,
	SUCCESS = 0xA0,
	CREATED = 0xA1,
	NO_CONTENT = 0xA4,
}

// Valid OBEX response opcodes with the final bit (0x80) masked out.
// The phone sets the final bit on the last response of an exchange, e.g. 0xC3 = 0x43 Forbidden | final.
const OBEX_RESPONSE_CODES = new Set<number>([
	0x10,                          // Continue
	0x20, 0x21, 0x22, 0x23, 0x24, 0x25, // OK, Created, Accepted, ... No content
	0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x48, 0x49, 0x4A, 0x4B, 0x4C, 0x4D, 0x4F,
	0x50, 0x51, 0x52, 0x53, 0x54, 0x55,
	0x60, 0x61,
]);

function isObexResponseCode(byte: number): boolean {
	return OBEX_RESPONSE_CODES.has(byte & 0x7F);
}

const OBEX_ERROR_MESSAGES: Record<number, string> = {
	0x40: "Bad request",
	0x41: "Unauthorized",
	0x42: "Payment required",
	0x43: "Forbidden",
	0x44: "Not found",
	0x45: "Method not allowed",
	0x46: "Not acceptable",
	0x48: "Request timeout",
	0x49: "Conflict",
	0x4A: "Gone",
	0x4B: "Length required",
	0x4C: "Precondition failed",
	0x4D: "Requested entity too large",
	0x4F: "Unsupported media type",
	0x50: "Internal server error",
	0x51: "Not implemented",
	0x52: "Bad gateway",
	0x53: "Service unavailable",
	0x54: "Gateway timeout",
	0x55: "HTTP version not supported",
	0x60: "Database full",
	0x61: "Database locked",
};

export function obexResponseName(code: number): string {
	const base = code & 0x7F;
	return OBEX_ERROR_MESSAGES[base] ?? `Unknown response 0x${code.toString(16)}`;
}

enum ObexMode {
	NONE,
	AT,
	OBEX,
}

// Baudrates probed for the initial AT handshake, the same order as siefs
// Ordered by real-world likelihood: most data cables run at 115200, but freshly
// booted x55/EGOLD phones default to 19200, and 57600 is the DCA-510 default.
const AT_PROBE_SPEEDS = [115200, 57600, 19200, 230400, 9600];

// Max OBEX packet size we advertise in the CONNECT request, SiMoCo's value.
// The phone answers with its own limit and obexConnect() keeps the smaller of
// the two, so a high offer is free: phones that allow bigger packets need up
// to 8x fewer round trips than with siefs' conservative BLOCKSIZE + 6, while
// conservative phones (the C60 answers 474) still negotiate down safely.
const REQUESTED_MAX_PACKET_SIZE = 0x4006;

export type ObexResponsePacket = {
	code: number;
	packet: Buffer;
};

export type ObexDirEntry = {
	name: string;
	isDir: boolean;
	size: number;
	mtime?: Date;
	readable: boolean;
	writable: boolean;
	hidden: boolean;
};

export type ObexProgress = {
	percent: number;
	cursor: number;
	total: number;
	speed: number;
};

function splitPath(path: string): { dir: string[]; name: string } {
	const parts = path.split(/[\/\\]+/).filter((part) => part && part != ".");
	const name = parts.pop() ?? "";
	return { dir: parts, name };
}

// Protocol delays, overridable in tests to keep the suite fast
export const OBEX_DELAYS = {
	sqweReset: 200,    // after AT^SQWE=0
	modeSwitch: 300,   // after switching the wire to OBEX
	escape: 1000,      // between OBEX disconnect and the +++ escape
	flush: 200,        // input flush read timeout
};

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function strToUcs2be(str: string): Buffer {
	const le = Buffer.from(str, "utf16le");
	const be = Buffer.alloc(le.length);
	for (let i = 0; i < le.length; i += 2) {
		be[i] = le[i + 1];
		be[i + 1] = le[i];
	}
	return be;
}

export class ObexPacketWriter {
	private data: Buffer;
	private length = 3;

	constructor(opcode: number) {
		this.data = Buffer.alloc(64);
		this.data[0] = opcode;
	}

	getOpcode(): number {
		return this.data[0];
	}

	private ensureCapacity(extra: number): void {
		if (this.length + extra <= this.data.length)
			return;
		let size = this.data.length;
		while (size < this.length + extra)
			size *= 2;
		this.data = Buffer.concat([this.data.subarray(0, this.length), Buffer.alloc(size - this.length)]);
	}

	appendByte(value: number): void {
		this.ensureCapacity(1);
		this.data[this.length++] = value & 0xFF;
	}

	appendUint16(value: number): void {
		this.appendByte(value >> 8);
		this.appendByte(value & 0xFF);
	}

	appendHeader(headerId: ObexHeaderId, value: Buffer): void {
		this.ensureCapacity(value.length + 3);
		this.data[this.length++] = headerId;
		this.data[this.length++] = (value.length + 3) >> 8;
		this.data[this.length++] = (value.length + 3) & 0xFF;
		value.copy(this.data, this.length);
		this.length += value.length;
	}

	// Empty header, e.g. an empty NAME header used by SetPath to root
	appendEmptyHeader(headerId: ObexHeaderId): void {
		this.ensureCapacity(3);
		this.data[this.length++] = headerId;
		this.data[this.length++] = 0x00;
		this.data[this.length++] = 0x03;
	}

	// 4-byte value header, e.g. CONNECTION_ID or LENGTH
	appendUint32Header(headerId: ObexHeaderId, value: number): void {
		this.ensureCapacity(5);
		this.data[this.length++] = headerId;
		this.data[this.length++] = (value >> 24) & 0xFF;
		this.data[this.length++] = (value >> 16) & 0xFF;
		this.data[this.length++] = (value >> 8) & 0xFF;
		this.data[this.length++] = value & 0xFF;
	}

	// Null-terminated ASCII string, e.g. the TYPE header
 appendStringHeader(headerId: ObexHeaderId, str: string): void {
		this.appendHeader(headerId, Buffer.concat([Buffer.from(str, "latin1"), Buffer.from([0x00])]));
	}

	// Null-terminated UCS2-BE string, e.g. the NAME header
	appendUnicodeStringHeader(headerId: ObexHeaderId, str: string): void {
		this.appendHeader(headerId, Buffer.concat([strToUcs2be(str), Buffer.from([0x00, 0x00])]));
	}

	toBuffer(): Buffer {
		this.data[1] = this.length >> 8;
		this.data[2] = this.length & 0xFF;
		return this.data.subarray(0, this.length);
	}
}

export function parseObexHeaders(packet: Buffer): Map<ObexHeaderId, Buffer> {
	const result = new Map<ObexHeaderId, Buffer>();
	const totalLen = (packet[1] << 8) | packet[2];
	let pos = 3;
	while (pos < totalLen) {
		const headerId = packet[pos] as ObexHeaderId;
		switch (headerId & 0xC0) {
			case 0x00:
			case 0x40: {
				if (pos + 3 > totalLen)
					return result;
				const headerLen = (packet[pos + 1] << 8) | packet[pos + 2];
				if (headerLen < 3 || pos + headerLen > totalLen)
					return result;
				result.set(headerId, packet.subarray(pos + 3, pos + headerLen));
				pos += headerLen;
				break;
			}
			case 0x80: {
				if (pos + 2 > totalLen)
					return result;
				result.set(headerId, packet.subarray(pos + 1, pos + 2));
				pos += 2;
				break;
			}
			case 0xC0: {
				if (pos + 5 > totalLen)
					return result;
				result.set(headerId, packet.subarray(pos + 1, pos + 5));
				pos += 5;
				break;
			}
		}
	}
	return result;
}

function decodeXmlEntities(str: string): string {
	return str
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, "\"")
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, "&");
}

export function parseFolderListing(xml: string): ObexDirEntry[] {
	const entries: ObexDirEntry[] = [];
	const tagRegex = /<(file|folder)\b([^>]*)>/gi;
	let tag: RegExpExecArray | null;
	while ((tag = tagRegex.exec(xml)) !== null) {
		const isDir = tag[1].toLowerCase() == "folder";
		const attrs: Record<string, string> = {};
		const attrRegex = /([a-zA-Z-]+)="([^"]*)"/g;
		let attr: RegExpExecArray | null;
		while ((attr = attrRegex.exec(tag[2])) !== null)
			attrs[attr[1].toLowerCase()] = decodeXmlEntities(attr[2]);
		if (!attrs["name"])
			continue;

		let mtime: Date | undefined;
		const timeMatch = attrs["modified"]?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
		if (timeMatch)
			mtime = new Date(+timeMatch[1], +timeMatch[2] - 1, +timeMatch[3], +timeMatch[4], +timeMatch[5], +timeMatch[6]);

		const userPerms = attrs["user-perm"] ?? "RWD";
		const readable = /r/i.test(userPerms);
		entries.push({
			name: attrs["name"],
			isDir,
			size: attrs["size"] ? +attrs["size"] : 0,
			mtime,
			readable,
			writable: /w/i.test(userPerms),
			// System folders: the classic Siemens "telecom" tree, plus directories the
			// phone itself hides (no read permission, e.g. PersistentData/Cache report
			// user-perm="WD"). An explicit hidden="true" attribute wins too.
			hidden: attrs["hidden"]?.toLowerCase() == "true"
				|| (isDir && (!readable || attrs["name"].toLowerCase() == "telecom")),
		});
	}
	return entries;
}

// Explicit model lists, the same families the memory dumper knows about.
// SGOLD (x65 generation, PMB7850)
const SGOLD_MODELS = /^(C65|CX65|M65|S65|SL65|SK65|CX70|C72|C81|M81|S68)(F|C)?$/i;
// NewSGOLD (x75/x71 generation)
const NEW_SGOLD_MODELS = /^(S75|SL75|C75|CX75|M75|AX75|ME75|CF75|E71|EL71|M72|CL61|M77)(F|C)?$/i;

export function detectPhonePlatform(model: string | undefined): string {
	if (!model)
		return "unknown";
	const name = model.trim();
	if (SGOLD_MODELS.test(name))
		return "SGOLD";
	if (NEW_SGOLD_MODELS.test(name))
		return "NewSGOLD";
	return "EGOLD";
}

/**
 * OBEX client for Siemens phones, the connection is established the same way
 * SiMoCo and siefs do it: AT handshake -> AT^SQWE=0 -> AT^SQWE=3 -> raw OBEX.
 * SGOLD (x65) and NewSGOLD (x75) phones additionally use OBEX connection ids.
 */
export class Obex {
	private readonly port: AsyncSerialPort;
	private readonly atc: AtChannel;
	// SGOLD/NewSGOLD phones on service cables boot into BFC mode; the AT commands
	// needed to switch into OBEX mode are then tunneled through BFC channel 0x17
	private bfc: BFC | undefined;
	private mode: ObexMode = ObexMode.NONE;
	private connected = false;
	private maxPacketSize = REQUESTED_MAX_PACKET_SIZE;
	private deviceName: string | undefined;
	private phoneModel: string | undefined;
	private currentPath: string[] = [];
	private atSpeed = 0;
	// Connection id from the OBEX CONNECT response. SGOLD (x65) and NewSGOLD (x75)
	// phones return it and require it echoed in every following request (VSOFS "UseConnectID").
	private connectionId: number | undefined;
	private operationQueue: Promise<unknown> = Promise.resolve();

	// OBEX is a strict request/response protocol, serialize all operations
	private enqueue<T>(task: () => Promise<T>): Promise<T> {
		const result = this.operationQueue.then(task, task);
		this.operationQueue = result.catch(() => {});
		return result;
	}

	// Runs an operation optimistically. Only when it fails in a way that indicates a
	// dead session (timeout / garbage / port error, not a regular OBEX error response)
	// the full AT -> SQWE=3 -> CONNECT handshake is redone and the operation retried once.
	// Like siefs' handshake() before every operation, but with zero cost while healthy.
	private async enqueueRecovering<T>(task: () => Promise<T>): Promise<T> {
		return this.enqueue(async () => {
			try {
				return await task();
			} catch (e) {
				if (!this.connected || !this.isLinkDeadError(e))
					throw e;
				debug(`Session looks dead (${(e as Error).message}), rehandshaking...`);
				await this.rehandshake();
				return await task();
			}
		});
	}

	private isLinkDeadError(e: unknown): boolean {
		// File and directory names are quoted in error messages and must not match
		// the transport patterns: a file named "...timeout....vkp" would otherwise
		// look like a dead session and trigger a pointless rehandshake
		const msg = String((e as Error)?.message ?? e).replace(/"[^"]*"/g, "");
		return msg.includes("timeout")
			|| msg.includes("garbage")
			|| msg.includes("Serial port")
			|| msg.includes("port closed")
			|| msg.includes("Port is not open");
	}

	// Redo the whole connection dance without touching the serial port handle
	private async rehandshake(): Promise<void> {
		this.connected = false;
		this.setMode(ObexMode.NONE);
		await this.flushInput(OBEX_DELAYS.flush).catch(() => {});
		// Note: this.atSpeed would pin the probe to one speed, but after a dropped
		// session the phone may answer at a different one, so probe everything again
		await this.connect(0);
	}

	constructor(port: AsyncSerialPort) {
		this.port = port;
		this.atc = new AtChannel(port);
	}

	get isConnected(): boolean {
		return this.connected;
	}

	getMaxPacketSize(): number {
		return this.maxPacketSize;
	}

	getDeviceName(): string | undefined {
		return this.deviceName;
	}

	getPlatform(): string {
		return detectPhonePlatform(this.phoneModel);
	}

	getSerialPort(): AsyncSerialPort {
		return this.port;
	}

	private setMode(mode: ObexMode): void {
		if (this.mode == mode)
			return;
		this.mode = mode;
		switch (mode) {
			case ObexMode.NONE:
				debug("Mode: NONE");
				this.atc.stop();
				break;
			case ObexMode.AT:
				debug("Mode: AT");
				this.atc.start();
				break;
			case ObexMode.OBEX:
				debug("Mode: OBEX");
				this.atc.stop();
				break;
		}
	}

	private async flushInput(timeout = OBEX_DELAYS.flush): Promise<void> {
		while (true) {
			const byte = await this.port.read(1, timeout);
			if (!byte || byte.length == 0)
				return;
		}
	}

	private async readExact(size: number, deadline: number): Promise<Buffer> {
		const chunks: Buffer[] = [];
		let remaining = size;
		while (remaining > 0) {
			const left = deadline - Date.now();
			if (left <= 0)
				throw new Error("OBEX receive timeout.");
			const chunk = await this.port.read(remaining, Math.min(left, 2000));
			if (!chunk || chunk.length == 0)
				continue;
			chunks.push(chunk);
			remaining -= chunk.length;
		}
		return Buffer.concat(chunks);
	}

	async sendPacket(packet: Buffer): Promise<void> {
		debugTrx(`TX ${packet.toString("hex")}`);
		await this.port.write(packet);
	}

	async recvPacket(timeout = 15000): Promise<ObexResponsePacket> {
		const deadline = Date.now() + timeout;

		// Skip garbage left from the AT phase until a response opcode is found
		let opcode = -1;
		while (Date.now() < deadline) {
			const byte = await this.port.readByte(Math.max(1, Math.min(deadline - Date.now(), 500)));
			if (byte == -1)
				continue;
			if (isObexResponseCode(byte)) {
				opcode = byte;
				break;
			}
			debug(`Skipping garbage byte: 0x${byte.toString(16).padStart(2, "0")}`);
		}
		if (opcode == -1)
			throw new Error("OBEX response timeout.");

		const lenBytes = await this.readExact(2, deadline);
		const totalLen = (lenBytes[0] << 8) | lenBytes[1];
		if (totalLen < 3)
			throw new Error(`Invalid OBEX packet length: ${totalLen}.`);
		const rest = await this.readExact(totalLen - 3, deadline);
		const packet = Buffer.concat([Buffer.from([opcode]), lenBytes, rest]);
		debugTrx(`RX ${packet.toString("hex")}`);
		return { code: opcode, packet };
	}

	private aborting = false;

	private async request(packet: ObexPacketWriter, timeout?: number): Promise<ObexResponsePacket> {
		// SGOLD/NewSGOLD phones require the connection id header in every request after CONNECT
		if (this.connectionId !== undefined && packet.getOpcode() != ObexOpcode.CONNECT)
			packet.appendUint32Header(ObexHeaderId.CONNECTION_ID, this.connectionId);
		try {
			await this.sendPacket(packet.toBuffer());
		} catch (e) {
			// Sending failed (dead link) - aborting would fail the same way and used to
			// recurse infinitely here until the worker ran out of memory
			throw e;
		}
		try {
			return await this.recvPacket(timeout);
		} catch (e) {
			if (!this.aborting)
				await this.abortExchange().catch(() => {});
			throw e;
		}
	}

	private ensureSuccess(response: ObexResponsePacket, operation: string): void {
		if (response.code != ObexResponse.SUCCESS)
			throw new Error(`OBEX ${operation} failed: ${obexResponseName(response.code)}.`);
	}

	async abortExchange(): Promise<void> {
		if (this.aborting)
			return;
		this.aborting = true;
		try {
			const packet = new ObexPacketWriter(ObexOpcode.ABORT);
			const response = await this.request(packet, 3000);
			if (response.code != ObexResponse.SUCCESS)
				throw new Error(`OBEX abort failed: ${obexResponseName(response.code)}.`);
		} finally {
			this.aborting = false;
		}
	}

	private async detectAtSpeed(limitBaudrate: number): Promise<number> {
		const speeds = limitBaudrate ? [limitBaudrate] : AT_PROBE_SPEEDS;
		this.setMode(ObexMode.AT);
		for (const speed of speeds) {
			debug(`Probing AT handshake at ${speed} baud...`);
			await this.port.update({ baudRate: speed });
			// A freshly booted EGOLD phone may take a moment to bring its AT
			// interpreter up, so try harder on the first two speeds
			if (await this.atc.handshake(speed == speeds[0] || speed == speeds[1] ? 5 : 3))
				return speed;
		}
		this.setMode(ObexMode.NONE);
		throw new Error("Phone is not responding to AT commands! Check the cable and make sure the phone is turned on.");
	}

	private async readAtDeviceName(): Promise<string | undefined> {
		const send = async (cmd: string): Promise<string | undefined> => {
			const response = await this.atc.sendCommand(cmd);
			return response.success ? response.lines[0] : undefined;
		};
		try {
			const vendor = await send("AT+CGMI");
			const model = await send("AT+CGMM");
			if (model)
				this.phoneModel = model;
			const name = [vendor, model].filter(Boolean).join(" ");
			if (!name)
				return undefined;
			const version = await send("AT+CGMR");
			const match = version?.match(/^\s*(\d+)/);
			return match ? `${name} v${match[1]}` : name;
		} catch (e) {
			debug(`Can't read phone info: ${e}`);
			return undefined;
		}
	}

	async connect(limitBaudrate: number = 0): Promise<void> {
		if (this.mode == ObexMode.OBEX)
			throw new Error("OBEX already connected.");
		if (!this.port?.isOpen)
			throw new Error("Serial port closed.");

		// Try a plain AT connection first
		const atSpeed = await this.detectAtSpeed(limitBaudrate).catch(() => 0);
		if (atSpeed) {
			this.atSpeed = atSpeed;
			this.bfc = undefined;
			debug(`Phone found in AT mode at ${atSpeed} baud.`);
			this.deviceName = await this.readAtDeviceName();
			await this.sendModeSwitchCommands(async (cmd) => {
				const response = await this.atc.sendCommandNumeric(cmd);
				return response.success ? "" : "AT command failed";
			});
		} else {
			// No AT at any speed: the phone is most likely a SGOLD/NewSGOLD sitting in
			// BFC mode on a service cable. Tunnel the mode switch through BFC, the
			// phone then leaves BFC mode and speaks raw OBEX on the wire.
			debug(`No AT response, trying BFC...`);
			const bfc = new BFC(this.port);
			await bfc.connect();
			this.atSpeed = this.port.baudRate;
			this.bfc = bfc;
			try {
				this.deviceName = await this.readBfcDeviceName(bfc);
				// CR terminated, like the BFC library itself sends AT commands
				const err = await bfc.sendAT("AT^SQWE=0\r", 2000).then(
					(response) => response.match(/\r\nOK\r\n/) ? "" : `AT^SQWE=0 failed: ${response.trim()}`,
					(e) => `AT^SQWE=0 failed: ${(e as Error).message}`);
				if (err)
					throw new Error(`Can't reset phone mode: ${err}`);
				await sleep(OBEX_DELAYS.sqweReset);
				// The phone may switch the wire to OBEX without answering first,
				// so a timeout here is not fatal
				await bfc.sendAT("AT^SQWE=3\r", 1000).catch(() => {});

				// The phone now speaks raw OBEX on the wire. Detach the BFC frame
				// parser (handleSerialClose removes the data listeners without
				// sending anything) so it stops consuming OBEX bytes.
				await (bfc as any).handleSerialClose?.();
			} catch (e) {
				await bfc.disconnect().catch(() => {});
				throw e;
			}
		}

		this.setMode(ObexMode.OBEX);
		await sleep(OBEX_DELAYS.modeSwitch);
		debug(`Detected platform: ${this.getPlatform()}`);
		await this.obexConnect();
	}

	// Reset any previously switched mode and enter raw OBEX mode, like SiMoCo/VSOFS do
	private async sendModeSwitchCommands(send: (cmd: string) => Promise<string>): Promise<void> {
		const err = await send("AT^SQWE=0");
		if (err)
			throw new Error(`Can't reset phone mode (AT^SQWE=0): ${err}`);
		await sleep(OBEX_DELAYS.sqweReset);
		const err2 = await send("AT^SQWE=3");
		if (err2)
			throw new Error(`Can't enter OBEX mode (AT^SQWE=3): ${err2}. Maybe the phone doesn't support FlexMem access.`);
	}

	private async readBfcDeviceName(bfc: BFC): Promise<string | undefined> {
		try {
			const vendor = await bfc.getVendorName();
			const model = await bfc.getProductName();
			if (model)
				this.phoneModel = model;
			const name = [vendor, model].filter(Boolean).join(" ");
			if (!name)
				return undefined;
			const version = await bfc.getSwVersion();
			return version ? `${name} v${version}` : name;
		} catch (e) {
			debug(`Can't read phone info via BFC: ${e}`);
			return undefined;
		}
	}

	private async obexConnect(): Promise<void> {
		// Re-advertise the full local offer instead of whatever the previous
		// (possibly dead) session negotiated down to
		this.maxPacketSize = REQUESTED_MAX_PACKET_SIZE;
		const packet = new ObexPacketWriter(ObexOpcode.CONNECT);
		packet.appendByte(OBEX_VERSION_1_0);
		packet.appendByte(0x00); // flags
		packet.appendUint16(this.maxPacketSize);
		packet.appendHeader(ObexHeaderId.TARGET, OBEX_TARGET_FLEXMEM);

		const response = await this.request(packet, 10000);
		if (response.code != ObexResponse.SUCCESS)
			throw new Error(`OBEX connect failed: ${obexResponseName(response.code)}.`);

		if (response.packet.length >= 7) {
			const negotiated = (response.packet[5] << 8) | response.packet[6];
			if (negotiated)
				this.maxPacketSize = Math.min(this.maxPacketSize, negotiated);
		}

		// CONNECT response: [opcode][len][version][flags][maxlen][headers...].
		// x65/x75 (SGOLD/NewSGOLD) phones send a Connection-ID header that must be echoed
		// in all subsequent requests. Legacy phones (EGOLD etc.) may also include one,
		// but echoing it back confuses them - VSOFS enables UseConnectID for x65/x75 only.
		this.connectionId = undefined;
		const platform = this.getPlatform();
		if ((platform == "SGOLD" || platform == "NewSGOLD")
			&& response.packet.length >= 12 && response.packet[7] == ObexHeaderId.CONNECTION_ID)
			this.connectionId = response.packet.readUInt32BE(8);

		this.currentPath = [];
		this.connected = true;
		debug(`OBEX connected, max packet size: ${this.maxPacketSize}` +
			(this.connectionId !== undefined ? `, connection id: ${this.connectionId}` : ''));
	}

	async disconnect(): Promise<void> {
		if (this.mode != ObexMode.OBEX)
			return;
		if (this.connected) {
			this.connected = false;
			const packet = new ObexPacketWriter(ObexOpcode.DISCONNECT);
			// siefs sends a hardcoded connection id 1 for legacy phones;
			// for x65/x75 request() appends the real negotiated id
			if (this.connectionId === undefined)
				packet.appendUint32Header(ObexHeaderId.CONNECTION_ID, 1);
			try {
				await this.request(packet, 3000);
			} catch (e) {
				debug(`OBEX disconnect error: ${e}`);
			}
		}

		if (this.port?.isOpen && !this.bfc) {
			// Leave OBEX mode and escape back to AT mode, the same way siefs does
			try {
				await this.flushInput();
				await this.port.write(Buffer.from([ObexOpcode.DISCONNECT, 0x00, 0x03]));
				await this.flushInput();
				await sleep(OBEX_DELAYS.escape);
				await this.port.write("+++");
				await this.flushInput();
			} catch (e) {
				debug(`Mode reset error: ${e}`);
			}
		}

		this.setMode(ObexMode.NONE);
	}

	private async setPathRoot(): Promise<void> {
		const packet = new ObexPacketWriter(ObexOpcode.SETPATH);
		packet.appendByte(0x02); // flags: don't create
		packet.appendByte(0x00); // constants
		packet.appendEmptyHeader(ObexHeaderId.NAME);
		const response = await this.request(packet);
		this.ensureSuccess(response, "setpath");
	}

	private async setPathUp(): Promise<void> {
		const packet = new ObexPacketWriter(ObexOpcode.SETPATH);
		packet.appendByte(0x03); // flags: go up + don't create
		packet.appendByte(0x00); // constants
		const response = await this.request(packet);
		this.ensureSuccess(response, "setpath");
	}

	private async setPathDown(name: string, create: boolean): Promise<void> {
		const packet = new ObexPacketWriter(ObexOpcode.SETPATH);
		packet.appendByte(create ? 0x00 : 0x02); // flags
		packet.appendByte(0x00); // constants
		packet.appendUnicodeStringHeader(ObexHeaderId.NAME, name);
		const response = await this.request(packet);
		this.ensureSuccess(response, `setpath to "${name}"`);
	}

	async setPath(path: string, create: boolean = false): Promise<void> {
		const parts = path.split(/[\/\\]+/).filter((part) => part && part != ".");

		// Longest common prefix with the current directory
		let common = 0;
		while (common < parts.length && common < this.currentPath.length && this.currentPath[common] == parts[common])
			common++;

		if (common == parts.length && this.currentPath.length == parts.length)
			return; // already there

		// Going to the root first is cheaper than walking up more than half the depth
		if (this.currentPath.length - common > this.currentPath.length / 2) {
			await this.setPathRoot();
			this.currentPath = [];
			common = 0;
		} else {
			while (this.currentPath.length > common) {
				await this.setPathUp();
				this.currentPath.pop();
			}
		}

		for (let i = common; i < parts.length; i++) {
			await this.setPathDown(parts[i], create);
			this.currentPath.push(parts[i]);
		}
	}

	getCurrentPath(): string {
		return "/" + this.currentPath.join("/");
	}

	// GET with a body assembled from BODY/END-OF-BODY headers
	private async getWithBody(packet: ObexPacketWriter, onProgress?: (e: ObexProgress) => void): Promise<Buffer> {
		const report = this.createProgressReporter(onProgress);
		const chunks: Buffer[] = [];
		let received = 0;
		let total = 0;
		let first = true;
		while (true) {
			const response = await this.request(packet);
			if (response.code == ObexResponse.NO_CONTENT)
				return Buffer.alloc(0);
			if (response.code != ObexResponse.CONTINUE && response.code != ObexResponse.SUCCESS)
				throw new Error(`OBEX GET failed: ${obexResponseName(response.code)}.`);

			const headers = parseObexHeaders(response.packet);
			if (first) {
				const lengthHeader = headers.get(ObexHeaderId.LENGTH);
				if (lengthHeader?.length == 4)
					total = lengthHeader.readUInt32BE(0);
				first = false;
			}

			const body = headers.get(ObexHeaderId.BODY) ?? headers.get(ObexHeaderId.END_OF_BODY);
			if (body?.length) {
				chunks.push(body);
				received += body.length;
				report.report(received, total);
			}

			if (response.code == ObexResponse.SUCCESS)
				return Buffer.concat(chunks);

			packet = new ObexPacketWriter(ObexOpcode.GET_FINAL);
		}
	}

	// Throttled progress callback, speed is calculated between reports
	private createProgressReporter(onProgress?: (e: ObexProgress) => void) {
		if (!onProgress)
			return { report: (_cursor: number, _total: number) => {} };
		let lastTime = Date.now();
		let lastCursor = 0;
		return {
			report(cursor: number, total: number) {
				const now = Date.now();
				const dt = (now - lastTime) / 1000;
				if (dt < 0.2 && !(total > 0 && cursor >= total))
					return;
				const speed = dt > 0 ? (cursor - lastCursor) / dt : 0;
				lastTime = now;
				lastCursor = cursor;
				onProgress({
					percent: total > 0 ? Math.min(100, (cursor / total) * 100) : -1,
					cursor,
					total,
					speed,
				});
			}
		};
	}

	// Download a file by its absolute path
	async getFile(path: string, onProgress?: (e: ObexProgress) => void): Promise<Buffer> {
		return this.enqueueRecovering(async () => {
			const { dir, name } = splitPath(path);
			await this.setPath(dir.join("/"));
			debug(`getFile(${path})`);
			const packet = new ObexPacketWriter(ObexOpcode.GET_FINAL);
			packet.appendUnicodeStringHeader(ObexHeaderId.NAME, name);
			const data = await this.getWithBody(packet, onProgress);
			debug(`getFile(${path}) done, ${data.length} bytes`);
			return data;
		});
	}

	// Upload a file by its absolute path. The FlexMem server appends to an existing
	// file instead of replacing it, so by default the target is deleted first, the
	// same workaround siefs uses for truncate. overwrite=false keeps the raw PUT
	// behavior (an existing file grows), e.g. for trace replays of new-file uploads.
	async putFile(path: string, data: Uint8Array, onProgress?: (e: ObexProgress) => void, { overwrite = true }: { overwrite?: boolean } = {}): Promise<void> {
		return this.enqueueRecovering(async () => {
			debug(`putFile(${path}, ${data.byteLength} bytes${overwrite ? ", overwrite" : ""})`);
			const { dir, name } = splitPath(path);
			await this.setPath(dir.join("/"));

			if (overwrite) {
				const packet = new ObexPacketWriter(ObexOpcode.PUT_FINAL);
				packet.appendUnicodeStringHeader(ObexHeaderId.NAME, name);
				const response = await this.request(packet);
				if (response.code != ObexResponse.SUCCESS && (response.code & 0x7F) != 0x44) {
					// The phone refused the delete with a regular response: system folders
					// like /Java forbid deletes while still allowing uploads. The directory
					// listing decides what to do - a name that isn't there is a new file and
					// the PUT below just creates it, an existing one can't be replaced and
					// uploading anyway would append to and corrupt it.
					const exists = (await this.listCurrentDir()).some((e) => e.name == name);
					if (exists)
						throw new Error(`OBEX delete of existing "${name}" failed: ${obexResponseName(response.code)}.`);
					debug(`Delete of "${name}" was refused (${obexResponseName(response.code)}), but it is not in the directory, uploading as a new file`);
				}
			}

			const buffer = Buffer.from(data);
			// packet overhead: opcode+len (3) + BODY header (3) + CONNECTION_ID header (5)
			const maxBodySize = this.maxPacketSize - 6 - (this.connectionId !== undefined ? 5 : 0);

			// Initial PUT with the file name, the server replies CONTINUE when ready to accept the body
			const packet = new ObexPacketWriter(ObexOpcode.PUT);
			packet.appendUnicodeStringHeader(ObexHeaderId.NAME, name);
			const response = await this.request(packet);
			if (response.code != ObexResponse.CONTINUE)
				throw new Error(`OBEX PUT failed: ${obexResponseName(response.code)}.`);

			const report = this.createProgressReporter(onProgress);
			report.report(0, buffer.length);

			let offset = 0;
			while (true) {
				const chunk = buffer.subarray(offset, offset + maxBodySize);
				offset += chunk.length;
				const isLast = offset >= buffer.length;

				const bodyPacket = new ObexPacketWriter(isLast ? ObexOpcode.PUT_FINAL : ObexOpcode.PUT);
				bodyPacket.appendHeader(isLast ? ObexHeaderId.END_OF_BODY : ObexHeaderId.BODY, chunk);
				const chunkResponse = await this.request(bodyPacket);
				report.report(offset, buffer.length);

				if (isLast) {
					if (chunkResponse.code != ObexResponse.SUCCESS)
						throw new Error(`OBEX PUT failed: ${obexResponseName(chunkResponse.code)}.`);
					debug(`putFile(${path}) done, ${buffer.length} bytes`);
					return;
				}
				if (chunkResponse.code != ObexResponse.CONTINUE)
					throw new Error(`OBEX PUT failed: ${obexResponseName(chunkResponse.code)}.`);
			}
		});
	}

	// Delete a file or an empty directory
	async deleteFile(path: string): Promise<void> {
		return this.enqueueRecovering(async () => {
			debug(`delete(${path})`);
			const { dir, name } = splitPath(path);
			await this.setPath(dir.join("/"));
			const packet = new ObexPacketWriter(ObexOpcode.PUT_FINAL);
			packet.appendUnicodeStringHeader(ObexHeaderId.NAME, name);
			const response = await this.request(packet);
			this.ensureSuccess(response, `delete "${name}"`);
		});
	}

	// Rename/move an entry. Siemens-specific "move" application parameters, the same
	// encoding as siefs obex_move(): TLVs 0x34="move", 0x35=source, 0x36=destination.
	// Both are absolute paths from the FlexMem root, the phone resolves them itself
	// (siefs does not cd before moving either).
	async move(src: string, dest: string): Promise<void> {
		return this.enqueueRecovering(async () => {
			debug(`move(${src} -> ${dest})`);
			const params = Buffer.concat([
				Buffer.from([0x34, 0x04]),
				Buffer.from("move", "latin1"),
				Buffer.from([0x35, strToUcs2be(src).length]),
				strToUcs2be(src),
				Buffer.from([0x36, strToUcs2be(dest).length]),
				strToUcs2be(dest),
			]);

			const packet = new ObexPacketWriter(ObexOpcode.PUT_FINAL);
			packet.appendHeader(ObexHeaderId.APP_PARAMS, params);
			const response = await this.request(packet);
			this.ensureSuccess(response, `rename "${src}"`);
		});
	}

	// Create a directory with all missing parents
	async mkdir(path: string): Promise<void> {
		return this.enqueueRecovering(async () => {
			debug(`mkdir(${path})`);
			await this.setPath(path, true);
		});
	}

	// Folder listing of the directory setPath() currently points to. Used inside
	// queued operations (readDir would deadlock on the operation queue)
	private async listCurrentDir(): Promise<ObexDirEntry[]> {
		const packet = new ObexPacketWriter(ObexOpcode.GET_FINAL);
		packet.appendStringHeader(ObexHeaderId.TYPE, "x-obex/folder-listing");
		const body = await this.getWithBody(packet);
		return parseFolderListing(body.toString("utf8"));
	}

	async readDir(path: string): Promise<ObexDirEntry[]> {
		return this.enqueueRecovering(async () => {
			debug(`readDir(${path})`);
			await this.setPath(path);
			const result = await this.listCurrentDir();
			debug(`readDir(${path}) done, ${result.length} entries`);
			return result;
		});
	}

	// Siemens specific info request: 0x01 = capacity, 0x02 = free space
	private async getInfo(requestType: number): Promise<number> {
		debug(`getInfo(${requestType == 0x01 ? "capacity" : "available"})`);
		const packet = new ObexPacketWriter(ObexOpcode.GET_FINAL);
		packet.appendHeader(ObexHeaderId.APP_PARAMS, Buffer.from([0x32, 0x01, requestType]));
		const response = await this.request(packet);
		this.ensureSuccess(response, "info request");

		const params = parseObexHeaders(response.packet).get(ObexHeaderId.APP_PARAMS);
		if (params && params.length >= 4 && params[0] == 0x32) {
			const valueLen = params[1];
			let value = 0;
			for (let i = 0; i < valueLen; i++)
				value = (value << 8) + params[2 + i];
			return value;
		}
		return 0;
	}

	async getCapacity(): Promise<number> {
		return this.enqueueRecovering(() => this.getInfo(0x01));
	}

	async getAvailable(): Promise<number> {
		return this.enqueueRecovering(() => this.getInfo(0x02));
	}
}
