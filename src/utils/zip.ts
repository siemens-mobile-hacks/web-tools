// Minimal ZIP writer using the store (no compression) method.
// Enough for downloading folders/selections from the phone, where files are small
// and the bottleneck is the serial link, not the archive size.

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let k = 0; k < 8; k++)
			c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
		table[i] = c >>> 0;
	}
	return table;
})();

function crc32(buf: Uint8Array): number {
	let crc = 0xFFFFFFFF;
	for (let i = 0; i < buf.length; i++)
		crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
	return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(d: Date): { time: number; date: number } {
	const year = Math.max(1980, d.getFullYear());
	return {
		time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
		date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
	};
}

type ZipEntry = {
	name: Buffer;
	data: Buffer;
	crc: number;
	time: number;
	date: number;
	externalAttrs: number;
	offset: number;
};

const UTF8_FLAG = 0x0800;

export class ZipWriter {
	private entries: ZipEntry[] = [];
	private chunks: Buffer[] = [];
	private offset = 0;

	addFile(name: string, data: Uint8Array | Buffer, mtime: Date = new Date()): void {
		const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
		this.entries.push({
			name: Buffer.from(name, "utf8"),
			data: buffer,
			crc: crc32(buffer),
			...dosDateTime(mtime),
			externalAttrs: (0o100644 << 16) >>> 0,
			offset: this.offset,
		});
		this.writeLocalHeader(this.entries[this.entries.length - 1]);
		this.chunks.push(buffer);
		this.offset += buffer.length;
	}

	addDir(name: string, mtime: Date = new Date()): void {
		const entry: ZipEntry = {
			name: Buffer.from(name.endsWith("/") ? name : name + "/", "utf8"),
			data: Buffer.alloc(0),
			crc: 0,
			...dosDateTime(mtime),
			externalAttrs: ((0o40755 << 16) | 0x10) >>> 0,
			offset: this.offset,
		};
		this.entries.push(entry);
		this.writeLocalHeader(entry);
	}

	private writeLocalHeader(entry: ZipEntry): void {
		const header = Buffer.alloc(30);
		header.writeUInt32LE(0x04034B50, 0);
		header.writeUInt16LE(20, 4);             // version needed
		header.writeUInt16LE(UTF8_FLAG, 6);      // flags: UTF-8 names
		header.writeUInt16LE(0, 8);              // method: store
		header.writeUInt16LE(entry.time, 10);
		header.writeUInt16LE(entry.date, 12);
		header.writeUInt32LE(entry.crc, 14);
		header.writeUInt32LE(entry.data.length, 18);
		header.writeUInt32LE(entry.data.length, 22);
		header.writeUInt16LE(entry.name.length, 26);
		header.writeUInt16LE(0, 28);             // extra length
		this.chunks.push(header, entry.name);
		this.offset += header.length + entry.name.length;
	}

	build(): Buffer {
		const centralStart = this.offset;
		let centralSize = 0;
		for (const entry of this.entries) {
			const header = Buffer.alloc(46);
			header.writeUInt32LE(0x02014B50, 0);
			header.writeUInt16LE(20, 4);             // version made by
			header.writeUInt16LE(20, 6);             // version needed
			header.writeUInt16LE(UTF8_FLAG, 8);
			header.writeUInt16LE(0, 10);             // method: store
			header.writeUInt16LE(entry.time, 12);
			header.writeUInt16LE(entry.date, 14);
			header.writeUInt32LE(entry.crc, 16);
			header.writeUInt32LE(entry.data.length, 20);
			header.writeUInt32LE(entry.data.length, 24);
			header.writeUInt16LE(entry.name.length, 28);
			header.writeUInt16LE(0, 30);             // extra length
			header.writeUInt16LE(0, 32);             // comment length
			header.writeUInt16LE(0, 34);             // disk number
			header.writeUInt16LE(0, 36);             // internal attrs
			header.writeUInt32LE(entry.externalAttrs, 38);
			header.writeUInt32LE(entry.offset, 42);
			this.chunks.push(header, entry.name);
			centralSize += header.length + entry.name.length;
		}

		const eocd = Buffer.alloc(22);
		eocd.writeUInt32LE(0x06054B50, 0);
		eocd.writeUInt16LE(0, 4);                   // disk number
		eocd.writeUInt16LE(0, 6);                   // central dir disk
		eocd.writeUInt16LE(this.entries.length, 8);
		eocd.writeUInt16LE(this.entries.length, 10);
		eocd.writeUInt32LE(centralSize, 12);
		eocd.writeUInt32LE(centralStart, 16);
		eocd.writeUInt16LE(0, 20);                  // comment length
		this.chunks.push(eocd);

		return Buffer.concat(this.chunks);
	}
}
