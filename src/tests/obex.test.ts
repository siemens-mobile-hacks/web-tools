// Tests for the OBEX client. Run with: npm test
//
// The mock phone simulates:
//  - AT mode (SiMoCo-style consumer cable flow)
//  - BFC mode with the AT tunnel on channel 0x17 (SGOLD on a service cable)
//  - OBEX wire protocol incl. connection-id validation the way x65/x75 enforce it
import { EventEmitter } from "node:events";
import { test } from "node:test";
import assert from "node:assert/strict";
import { before } from "node:test";
import { Obex, ObexOpcode, ObexHeaderId, OBEX_TARGET_FLEXMEM, detectPhonePlatform, ObexPacketWriter, OBEX_DELAYS } from "../utils/obex.js";
import { C60_TRACE_SESSION } from "./c60-trace.js";

// The mock phone answers instantly, the protocol delays just slow the suite down
before(() => {
	for (const key of Object.keys(OBEX_DELAYS) as (keyof typeof OBEX_DELAYS)[])
		OBEX_DELAYS[key] = 0;
});

const FLEXMEM_CONNECT_WITH_ID = Buffer.from([0xA0, 0x00, 0x0C, 0x10, 0x00, 0x08, 0x06, 0xCB, 0x00, 0x00, 0x01, 0x00]);
const FLEXMEM_CONNECT_NO_ID = Buffer.from([0xA0, 0x00, 0x07, 0x10, 0x00, 0x08, 0x06]);
const FOLDER_LISTING = Buffer.from(
	'<?xml version="1.0"?><folder-listing>' +
	'<folder name="Sounds" modified="20060101T121530" user-perm="RWD"/>' +
	'<file name="notes.txt" size="12" modified="20060203T040506" user-perm="R"/>' +
	'</folder-listing>');

// Real listing captured from a C60 (with CRLF formatting like the phone sends it)
const FOLDER_LISTING_HIDDEN = Buffer.from(
	'<?xml version="1.0"?>\r\n' +
	'<!DOCTYPE folder-listing SYSTEM "obex-folder-listing.dtd">\r\n' +
	'<folder-listing version="1.0">\r\n' +
	'    <folder name="PersistentData" modified="20040101T000200" user-perm="WD" group-perm="W" />\r\n' +
	'    <folder name="Data inbox" modified="20040101T000202" user-perm="RWD" group-perm="R" />\r\n' +
	'    <folder name="Internet" modified="20040101T043326" user-perm="RWD" group-perm="R" />\r\n' +
	'    <folder name="Cache" modified="20040101T043326" user-perm="WD" group-perm="R" />\r\n' +
	'    <folder name="Java" modified="20040101T043426" user-perm="RWD" group-perm="R" />\r\n' +
	'    <folder name="Sounds" modified="20040101T043444" user-perm="RWD" group-perm="R" />\r\n' +
	'    <folder name="tmp" modified="20250330T013600" user-perm="RWD" group-perm="R" />\r\n' +
	'    <folder name="Animations" modified="20250330T013606" user-perm="RWD" group-perm="R" />\r\n' +
	'    <folder name="Pictures" modified="20250330T013608" user-perm="RWD" group-perm="R" />\r\n' +
	'</folder-listing>');

const FOLDER_LISTING_HIDDEN_ATTR = Buffer.from(
	'<?xml version="1.0"?><folder-listing>' +
	'<folder name="telecom" user-perm="RWD"/>' +
	'<file name="secret.png" size="1" hidden="true"/>' +
	'<file name="normal.png" size="1" hidden="false"/>' +
	'</folder-listing>');

// BFC frame helpers, the same layout the @sie-js/serial BFC class produces.
// Responses are sent without the CRC flag, the library only verifies CRC when set.
const BFC_STATUS = 4;
const BFC_SINGLE = 0;

function bfcFrame(src: number, dst: number, type: number, payload: Buffer): Buffer {
	const frame = Buffer.alloc(6 + payload.length);
	frame.writeUInt8(dst, 0);
	frame.writeUInt8(src, 1);
	frame.writeUInt16BE(payload.length, 2);
	frame.writeUInt8(type, 4);
	frame.writeUInt8(frame[0] ^ frame[1] ^ frame[2] ^ frame[3] ^ frame[4], 5);
	payload.copy(frame, 6);
	return frame;
}

type WireMode = "at" | "bfc" | "obex";

class MockPhone {
	model: string;
	wireMode: WireMode;
	connectSendsConnectionId: boolean;
	enforceConnectionId: boolean;
	connectionId = 0x100;
	emitter = new EventEmitter();
	rxBuffer = Buffer.alloc(0);
	bfcFramesIn: Buffer[] = [];
	obexPacketsIn: Buffer[] = [];
	// Folder listing returned for GET requests, overridable per test
	listing: Buffer = FOLDER_LISTING;
	cbValidated = 0;
	cbRejected = 0;
	private bfcBuffer = Buffer.alloc(0);

	port: any;

	constructor(opts: {
		model?: string;
		wireMode?: WireMode;
		connectSendsConnectionId?: boolean;
		enforceConnectionId?: boolean;
	} = {}) {
		this.model = opts.model ?? "S65";
		this.wireMode = opts.wireMode ?? "at";
		this.connectSendsConnectionId = opts.connectSendsConnectionId ?? true;
		this.enforceConnectionId = opts.enforceConnectionId ?? true;
		const self = this;
		this.port = {
			baudRate: 115200,
			isOpen: true,
			on(event: string, cb: (...args: any[]) => void) { self.emitter.on(event, cb); return self.port; },
			off(event: string, cb: (...args: any[]) => void) { self.emitter.off(event, cb); return self.port; },
			async update(settings: { baudRate: number }) { self.port.baudRate = settings.baudRate; },
			async write(data: any) { self.handleWrite(Buffer.from(data)); },
			async read(size: number, timeout?: number) { return self.take(size, timeout); },
			async readByte(timeout?: number) {
				const chunk = await self.take(1, timeout);
				return chunk.length ? chunk[0] : -1;
			},
		};
	}

	private async take(size: number, timeout = 100): Promise<Buffer> {
		const deadline = Date.now() + (timeout || 100);
		while (this.rxBuffer.length < size) {
			if (Date.now() >= deadline)
				return Buffer.alloc(0);
			await new Promise((resolve) => setTimeout(resolve, 5));
		}
		const out = this.rxBuffer.subarray(0, size);
		this.rxBuffer = this.rxBuffer.subarray(size);
		return out;
	}

	private push(data: Buffer): void {
		this.rxBuffer = Buffer.concat([this.rxBuffer, data]);
	}

	// Makes the phone ignore everything, like no phone being attached at all
	silence(): void {
		this.handleWrite = () => {};
	}

	private handleWrite(data: Buffer): void {
		switch (this.wireMode) {
			case "at": return this.handleAt(data);
			case "bfc": return this.handleBfc(data);
			case "obex": return this.handleObex(data);
		}
	}

	// ---------------------------------------------------------------- AT mode
	private handleAt(data: Buffer): void {
		const cmd = data.toString().trim();
		let reply = "\r\nOK\r\n";
		if (cmd == "AT+CGMI") reply = "\r\nSIEMENS\r\nOK\r\n";
		if (cmd == "AT+CGMM") reply = `\r\n${this.model}\r\nOK\r\n`;
		if (cmd == "AT+CGMR") reply = "\r\n43\r\nOK\r\n";
		if (cmd.includes("SQWE=3"))
			this.wireMode = "obex";
		this.emitter.emit("data", Buffer.from(reply));
	}

	// --------------------------------------------------------------- BFC mode
	private handleBfc(data: Buffer): void {
		this.bfcBuffer = Buffer.concat([this.bfcBuffer, data]);
		while (true) {
			if (this.bfcBuffer.length < 6)
				return;
			// find a frame start with a valid xor byte
			let start = -1;
			for (let i = 0; i + 6 <= this.bfcBuffer.length; i++) {
				const chk = this.bfcBuffer[i] ^ this.bfcBuffer[i + 1] ^ this.bfcBuffer[i + 2] ^ this.bfcBuffer[i + 3] ^ this.bfcBuffer[i + 4];
				if (chk == this.bfcBuffer[i + 5]) { start = i; break; }
			}
			if (start < 0) {
				this.bfcBuffer = Buffer.alloc(0);
				return;
			}
			if (start > 0)
				this.bfcBuffer = this.bfcBuffer.subarray(start);
			const payloadLen = this.bfcBuffer.readUInt16BE(2);
			const frameLen = 6 + payloadLen + ((this.bfcBuffer[4] & 0x20) ? 2 : 0); // CRC flag adds 2 bytes
			if (this.bfcBuffer.length < frameLen)
				return;
			const frame = this.bfcBuffer.subarray(0, frameLen);
			this.bfcBuffer = this.bfcBuffer.subarray(frameLen);
			this.handleBfcFrame(frame);
		}
	}

	private handleBfcFrame(frame: Buffer): void {
		const dst = frame[0];
		const src = frame[1];
		const type = frame[4] & 0x0F;
		const payload = frame.subarray(6, 6 + frame.readUInt16BE(2));
		this.bfcFramesIn.push(frame);

		// Authentication requests on any channel: [0x80, 0x11] -> [0x43, 0x11]
		if (type == BFC_STATUS && payload.length == 2 && payload[0] == 0x80 && payload[1] == 0x11) {
			this.emitter.emit("data", bfcFrame(dst, src, BFC_STATUS, Buffer.from([0x43, 0x11])));
			return;
		}

		// Software info channel 0x11, reply [status][cstring]
		if (dst == 0x11 && type == BFC_SINGLE) {
			const swInfo = (cmd: number, value: string) => Buffer.concat([Buffer.from([cmd]), Buffer.from(value + "\0", "latin1")]);
			const replies: Record<number, Buffer> = {
				0x0B: swInfo(0x0B, "50"),       // sw version
				0x0C: swInfo(0x0C, "SIEMENS"),  // vendor
				0x0D: swInfo(0x0D, this.model), // product
			};
			const reply = replies[payload[0]];
			if (reply)
				this.emitter.emit("data", bfcFrame(dst, src, BFC_SINGLE, reply));
			return;
		}

		// AT tunnel channel 0x17
		if (dst == 0x17 && type == BFC_SINGLE) {
			const cmd = payload.toString();
			if (cmd.includes("SQWE=3")) {
				this.wireMode = "obex";
				this.emitter.emit("data", bfcFrame(dst, src, BFC_SINGLE, Buffer.from("\r\nOK\r\n")));
				return;
			}
			this.emitter.emit("data", bfcFrame(dst, src, BFC_SINGLE, Buffer.from("\r\nOK\r\n")));
			return;
		}
	}

	// -------------------------------------------------------------- OBEX mode
	private hasConnectionId(pkt: Buffer): boolean {
		for (let i = 3; i + 5 <= pkt.length; i++)
			if (pkt[i] == ObexHeaderId.CONNECTION_ID && pkt.readUInt32BE(i + 1) == this.connectionId)
				return true;
		return false;
	}

	private handleObex(pkt: Buffer): void {
		// The raw mode-escape sequences sent after the OBEX DISCONNECT are not
		// OBEX requests - a real phone's escape detector just consumes them
		if (pkt.equals(Buffer.from([ObexOpcode.DISCONNECT, 0x00, 0x03]))) {
			this.wireMode = "at";
			return;
		}
		if (pkt.equals(Buffer.from("+++")))
			return;

		this.obexPacketsIn.push(pkt);
		const opcode = pkt[0];
		const isObexRequest = [
			ObexOpcode.GET, ObexOpcode.GET_FINAL,
			ObexOpcode.PUT, ObexOpcode.PUT_FINAL,
			ObexOpcode.SETPATH, ObexOpcode.ABORT,
		].includes(opcode);
		if (isObexRequest && this.enforceConnectionId) {
			if (this.hasConnectionId(pkt)) {
				this.cbValidated++;
			} else {
				this.cbRejected++;
				this.push(Buffer.from([0xC3, 0x00, 0x03])); // Forbidden, like a real x65
				return;
			}
		}

		switch (opcode) {
			case ObexOpcode.CONNECT:
				this.push(this.connectSendsConnectionId ? FLEXMEM_CONNECT_WITH_ID : FLEXMEM_CONNECT_NO_ID);
				break;
			case ObexOpcode.SETPATH:
				this.push(Buffer.from([0xA0, 0x00, 0x03]));
				break;
			case ObexOpcode.GET_FINAL: {
				const body = this.listing;
				const p1 = Buffer.concat([Buffer.from([0x90, 0x00, 0x00, 0x48]),
					Buffer.from([(body.length + 3) >> 8, (body.length + 3) & 0xFF]), body]);
				p1[1] = p1.length >> 8;
				p1[2] = p1.length & 0xFF;
				const p2 = Buffer.from([0xA0, 0x00, 0x03]);
				this.push(Buffer.concat([p1, p2]));
				break;
			}
			case ObexOpcode.PUT_FINAL:
				this.push(Buffer.from([0xA0, 0x00, 0x03]));
				break;
			default:
				this.push(Buffer.from([0xA0, 0x00, 0x03]));
		}
	}
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

test("detects SGOLD models", () => {
	for (const model of ["C65", "CX65", "M65", "S65", "SL65", "SK65", "CX70", "C72", "C81", "M81", "S68"])
		assert.equal(detectPhonePlatform(model), "SGOLD", model);
});

test("detects NewSGOLD models", () => {
	for (const model of ["S75", "SL75", "C75", "CX75", "M75", "AX75", "ME75", "CF75", "E71", "EL71", "M72", "CL61", "M77"])
		assert.equal(detectPhonePlatform(model), "NewSGOLD", model);
});

test("detects legacy and unknown models", () => {
	for (const model of ["C60", "S55", "SL45", "MC60", "C65v"])
		assert.equal(detectPhonePlatform(model), "legacy", model);
	assert.equal(detectPhonePlatform(undefined), "unknown");
});

// ---------------------------------------------------------------------------
// Packet encoding
// ---------------------------------------------------------------------------

test("CONNECT packet matches the siefs layout", () => {
	const p = new ObexPacketWriter(ObexOpcode.CONNECT);
	p.appendByte(0x10);
	p.appendByte(0x00);
	p.appendUint16(2054);
	p.appendHeader(ObexHeaderId.TARGET, OBEX_TARGET_FLEXMEM);
	assert.equal(p.toBuffer().toString("hex"),
		"80001a10000806" + "460013" + "6b01cb31410611d49a770050da3f471f");
});

test("SETPATH root/up/down packets match the siefs layout", () => {
	let p = new ObexPacketWriter(ObexOpcode.SETPATH);
	p.appendByte(0x02);
	p.appendByte(0x00);
	p.appendEmptyHeader(ObexHeaderId.NAME);
	assert.equal(p.toBuffer().toString("hex"), "8500080200010003");

	p = new ObexPacketWriter(ObexOpcode.SETPATH);
	p.appendByte(0x03);
	p.appendByte(0x00);
	assert.equal(p.toBuffer().toString("hex"), "8500050300");

	p = new ObexPacketWriter(ObexOpcode.SETPATH);
	p.appendByte(0x02);
	p.appendByte(0x00);
	p.appendUnicodeStringHeader(ObexHeaderId.NAME, "test");
	const b = p.toBuffer();
	assert.equal(b.subarray(3, 5).toString("hex"), "0200");
	assert.equal(b.subarray(5, 8).toString("hex"), "01000d");
	assert.equal(b.subarray(8).toString("hex"), "00740065007300740000");
});

test("PUT body chunks fit the negotiated packet size with a connection id", () => {
	const maxPacketSize = 2054;
	const maxBody = maxPacketSize - 6 - 5;
	const p = new ObexPacketWriter(ObexOpcode.PUT);
	p.appendHeader(ObexHeaderId.BODY, Buffer.alloc(maxBody));
	p.appendUint32Header(ObexHeaderId.CONNECTION_ID, 0x100);
	assert.equal(p.toBuffer().length, maxPacketSize);
});

test("folder listing: system folders without read permission are hidden (C60 capture)", async () => {
	const phone = new MockPhone({ wireMode: "at", model: "C60", enforceConnectionId: false });
	phone.listing = FOLDER_LISTING_HIDDEN;
	const obex = new Obex(phone.port);
	await obex.connect(115200);
	const entries = await obex.readDir("/");
	const byName = Object.fromEntries(entries.map((e) => [e.name, e]));
	// WD-only folders are the phone's system areas
	assert.equal(byName["PersistentData"].hidden, true, "PersistentData should be hidden");
	assert.equal(byName["Cache"].hidden, true, "Cache should be hidden");
	// everything readable is a normal folder
	for (const name of ["Data inbox", "Internet", "Java", "Sounds", "tmp", "Animations", "Pictures"])
		assert.equal(byName[name].hidden, false, name);
	// the read flag is still reported correctly for the info column
	assert.equal(byName["PersistentData"].readable, false);
	assert.equal(byName["Sounds"].readable, true);
	await obex.disconnect();
});

test("folder listing: telecom and hidden XML attribute are hidden", async () => {
	const phone = new MockPhone({ wireMode: "at", model: "S65" });
	phone.listing = FOLDER_LISTING_HIDDEN_ATTR;
	const obex = new Obex(phone.port);
	await obex.connect(115200);
	const entries = await obex.readDir("/");
	const byName = Object.fromEntries(entries.map((e) => [e.name, e]));
	assert.equal(byName["telecom"].hidden, true);        // Siemens system folder
	assert.equal(byName["secret.png"].hidden, true);     // XML hidden attribute
	assert.equal(byName["normal.png"].hidden, false);
	await obex.disconnect();
});

// ---------------------------------------------------------------------------
// Full session over the AT transport
// ---------------------------------------------------------------------------

async function connectAndReadDir(phone: MockPhone) {
	const obex = new Obex(phone.port);
	await obex.connect(115200);
	const entries = await obex.readDir("/");
	await obex.disconnect();
	return { obex, entries };
}

test("AT transport: SGOLD phone with connection id", async () => {
	const phone = new MockPhone({ wireMode: "at", model: "S65" });
	const { obex, entries } = await connectAndReadDir(phone);
	assert.equal(obex.getPlatform(), "SGOLD");
	assert.equal(obex.getDeviceName(), "SIEMENS S65 v43");
	assert.deepEqual(entries.map((e) => e.name), ["Sounds", "notes.txt"]);
	assert.equal(entries[0].isDir, true);
	assert.equal(entries[1].size, 12);
	// every request after CONNECT carried the negotiated connection id
	assert.ok(phone.cbValidated >= 2);
	assert.equal(phone.cbRejected, 0);
});

test("AT transport: legacy phone ignores the connection id even when the phone sends one", async () => {
	// The C60 regression: legacy phones may include a CB header in CONNECT,
	// but requests must not echo it
	const phone = new MockPhone({ wireMode: "at", model: "C60", connectSendsConnectionId: true, enforceConnectionId: false });
	const { obex, entries } = await connectAndReadDir(phone);
	assert.equal(obex.getPlatform(), "legacy");
	assert.equal(entries.length, 2);
	// Only request packets must not echo the id; the final DISCONNECT keeps the
	// siefs-style hardcoded CB 00000001 on legacy phones
	for (const pkt of phone.obexPacketsIn.filter((p) => p[0] != ObexOpcode.CONNECT && p[0] != ObexOpcode.DISCONNECT))
		assert.ok(!pkt.includes(ObexHeaderId.CONNECTION_ID), `legacy request must not carry CB: ${pkt.toString("hex")}`);
	const disconnectPkt = phone.obexPacketsIn.find((p) => p[0] == ObexOpcode.DISCONNECT);
	assert.equal(disconnectPkt?.toString("hex"), "810008cb00000001");
});

test("AT transport: NewSGOLD phone with connection id", async () => {
	const phone = new MockPhone({ wireMode: "at", model: "S75" });
	const { obex, entries } = await connectAndReadDir(phone);
	assert.equal(obex.getPlatform(), "NewSGOLD");
	assert.equal(entries.length, 2);
	assert.ok(phone.cbValidated >= 2);
	assert.equal(phone.cbRejected, 0);
});

// ---------------------------------------------------------------------------
// Full session over the BFC transport (SGOLD on a service cable)
// ---------------------------------------------------------------------------

test("BFC transport: phone boots in BFC mode and switches to OBEX", async () => {
	const phone = new MockPhone({ wireMode: "bfc", model: "SL65" });
	const obex = new Obex(phone.port);
	await obex.connect(0);

	assert.equal(obex.getPlatform(), "SGOLD");
	assert.equal(obex.getDeviceName(), "SIEMENS SL65 v50");

	// the mode switch went through the BFC AT tunnel with CR-terminated commands
	const atCommands = phone.bfcFramesIn
		.filter((f) => f[0] == 0x17)
		.map((f) => f.subarray(6, 6 + f.readUInt16BE(2)).toString());
	assert.ok(atCommands.some((c) => c.includes("AT^SQWE=0\r")), `SQWE=0 with CR missing in ${JSON.stringify(atCommands)}`);
	assert.ok(atCommands.some((c) => c.includes("AT^SQWE=3\r")), `SQWE=3 with CR missing in ${JSON.stringify(atCommands)}`);

	// the OBEX session works and echoes the connection id
	const entries = await obex.readDir("/");
	assert.deepEqual(entries.map((e) => e.name), ["Sounds", "notes.txt"]);
	assert.ok(phone.cbValidated >= 2);
	assert.equal(phone.cbRejected, 0);
	await obex.disconnect();
});

test("BFC transport: AT probe failure surfaces a readable error when the phone is gone", async () => {
	const phone = new MockPhone({ wireMode: "at", model: "S65" });
	// a phone that answers nothing at all
	phone.silence();
	const obex = new Obex(phone.port);
	await assert.rejects(() => obex.connect(115200), /not responding|not found|failed/i);
});

// ---------------------------------------------------------------------------
// Real-device replay: C60 over a DCA-510 cable (captured session)
// ---------------------------------------------------------------------------

// Mock phone that replays a recorded TX/RX session. AT answers come from the
// trace header (identity and mode switch), every later write must match the
// recorded request byte-for-byte and gets the recorded response back.
class ReplayPhone {
	trace: [string, string][];
	pos = 0;
	wireMode: "at" | "obex" = "at";
	emitter = new EventEmitter();
	rxBuffer = Buffer.alloc(0);
	mismatches: string[] = [];
	writes: Buffer[] = [];

	port: any;

	constructor(trace: [string, string][]) {
		this.trace = trace;
		const self = this;
		this.port = {
			baudRate: 115200,
			isOpen: true,
			on(event: string, cb: (...args: any[]) => void) { self.emitter.on(event, cb); return self.port; },
			off(event: string, cb: (...args: any[]) => void) { self.emitter.off(event, cb); return self.port; },
			async update() {},
			async write(data: any) { self.handleWrite(Buffer.from(data)); },
			async read(size: number, timeout?: number) { return self.take(size, timeout); },
			async readByte(timeout?: number) {
				const chunk = await self.take(1, timeout);
				return chunk.length ? chunk[0] : -1;
			},
		};
	}

	private async take(size: number, timeout = 100): Promise<Buffer> {
		const deadline = Date.now() + (timeout || 100);
		while (this.rxBuffer.length < size) {
			if (Date.now() >= deadline)
				return Buffer.alloc(0);
			await new Promise((resolve) => setTimeout(resolve, 5));
		}
		const out = this.rxBuffer.subarray(0, size);
		this.rxBuffer = this.rxBuffer.subarray(size);
		return out;
	}

	private push(data: Buffer): void {
		this.rxBuffer = Buffer.concat([this.rxBuffer, data]);
	}

	private nextTraceResponse(request: Buffer): Buffer | undefined {
		while (this.pos < this.trace.length) {
			const [dir, hex] = this.trace[this.pos];
			if (dir == "TX") {
				const expected = Buffer.from(hex, "hex");
				if (!expected.equals(request))
					throw new Error(`replay desync at trace pos ${this.pos}: expected ${expected.toString("hex")}, got ${request.toString("hex")}`);
				this.pos++;
				continue;
			}
			this.pos++;
			return Buffer.from(hex, "hex");
		}
		throw new Error("replay desync: trace exhausted");
	}

	private handleWrite(data: Buffer): void {
		if (this.wireMode == "at") {
			const cmd = data.toString().trim();
			let reply = "\r\nOK\r\n";
			if (cmd == "AT+CGMI") reply = "\r\nSIEMENS\r\nOK\r\n";
			if (cmd == "AT+CGMM") reply = "\r\nC60\r\nOK\r\n";
			if (cmd == "AT+CGMR") reply = "\r\n26\r\nOK\r\n";
			if (cmd.includes("SQWE=3")) this.wireMode = "obex";
			this.emitter.emit("data", Buffer.from(reply));
			return;
		}

		this.writes.push(data);
		const response = this.nextTraceResponse(data);
		if (response)
			this.push(response);
	}
}

test("replay: full C60 session from a real DCA-510 capture", async () => {
	const phone = new ReplayPhone(C60_TRACE_SESSION);
	const obex = new Obex(phone.port);
	await obex.connect(115200);

	assert.equal(obex.getPlatform(), "legacy");
	assert.equal(obex.getDeviceName(), "SIEMENS C60 v26");
	assert.equal(obex.getMaxPacketSize(), 474);

	// The operations must run in the recorded order: the client navigates with
	// cached SETPATH state, so a different order produces different packets.
	assert.equal((await obex.readDir("/")).length, 9);
	assert.equal(await obex.getCapacity(), 0x1E0000);
	assert.equal(await obex.getAvailable(), 0x1B0A32);
	assert.equal((await obex.readDir("/Java")).length, 1);
	assert.equal((await obex.readDir("/Java/jam")).length, 0);
	assert.equal((await obex.readDir("/")).length, 9);
	assert.equal((await obex.readDir("/Data inbox")).length, 0);
	assert.equal((await obex.readDir("/")).length, 9);

	const persistent = await obex.readDir("/PersistentData");
	assert.equal(persistent.length, 5);
	const sms = await obex.readDir("/PersistentData/SMS");
	assert.equal(sms.length, 1);
	assert.equal(sms[0].name, "SMS.dat");

	// the capture ends with the full SMS.dat download: 17802 bytes
	const data = await obex.getFile("/PersistentData/SMS/SMS.dat");
	assert.equal(data.length, 17802);

	// every client request matched the recorded session byte-for-byte
	assert.deepEqual(phone.mismatches, []);
	await obex.disconnect();
});
