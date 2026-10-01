import * as Comlink from "comlink";
import { Buffer } from "buffer";
import { FFS, type FFSEntry, type FFSStatFs, type Platform } from "@sie-js/ffs";
import { analyzeFlashLayout, parseInfoTables } from "@sie-js/fw";

export type FFSInfo = {
	platform: Platform;
	model?: string;
	// As a phone connected over OBEX is named, e.g. "SIEMENS S75v40"
	deviceName?: string;
	imei?: string;
	// What was found broken while opening, and left out
	warnings: readonly string[];
};

export type FFSImage = {
	data: Uint8Array<ArrayBuffer>;
	// The changes() it has
	changes: number;
};

// x65flasher puts a 16 byte header before the fullflash, which FFS.open() skips
const X65FLASHER_MAGIC = [0x46, 0x42, 0x4B];
const X65FLASHER_HEADER_SIZE = 16;

// The Buffer polyfill looks for a Buffer by calling a function for every byte, which takes up to a
// third of a second on a fullflash. This looks for its first byte natively instead.
function withNativeIndexOf(buffer: Buffer): Buffer {
	const indexOf = buffer.indexOf.bind(buffer) as (...args: unknown[]) => number;
	buffer.indexOf = ((value: unknown, byteOffset: unknown = 0, ...rest: unknown[]): number => {
		if (!(value instanceof Uint8Array) || !value.length || typeof byteOffset != "number" || byteOffset < 0)
			return indexOf(value, byteOffset, ...rest);
		const find = (from: number): number => Uint8Array.prototype.indexOf.call(buffer, value[0], from);
		for (let at = find(byteOffset); at >= 0; at = find(at + 1)) {
			let i = 1;
			while (i < value.length && buffer[at + i] === value[i])
				i++;
			if (i === value.length)
				return at;
		}
		return -1;
	}) as Buffer["indexOf"];
	return buffer;
}

// The firmware's version is known of SGOLD phones, not of EGOLD ones. It is found as getFullFlashInfo()
// finds it, without the rest of what that reads, which takes up to a second and more on the Buffer polyfill.
// The version has two digits, as the phone tells it over OBEX.
function deviceName(data: Uint8Array, model?: string): string | undefined {
	if (X65FLASHER_MAGIC.every((byte, i) => data[i] === byte))
		data = data.subarray(X65FLASHER_HEADER_SIZE);
	const buffer = withNativeIndexOf(Buffer.from(data.buffer, data.byteOffset, data.length));
	const layout = analyzeFlashLayout(buffer);
	const firmware = layout && parseInfoTables(buffer, layout.addressRanges).firmware;
	if (firmware)
		return `${firmware.vendor} ${firmware.model}v${String(firmware.svn).padStart(2, "0")}`;
	return model && `SIEMENS ${model}`;
}

// The names a path leads through, with "." and ".." resolved as the library resolves them
function splitPath(path: string): string[] {
	const names: string[] = [];
	for (const name of path.split("/")) {
		if (name == "..") {
			names.pop();
		} else if (name && name != ".") {
			names.push(name);
		}
	}
	return names;
}

// The filesystem of an opened fullflash. Writes change a copy of it, which save() returns.
export class FFSService {
	private ffs?: FFS;
	// Counts the changes made to the fullflash, so that a save tells which of them it has
	private changes = 0;

	async open(file: File): Promise<FFSInfo> {
		const data = new Uint8Array(await file.arrayBuffer());
		this.ffs = FFS.open(data);
		this.changes = 0;
		return {
			platform: this.ffs.platform,
			model: this.ffs.model,
			deviceName: deviceName(data, this.ffs.model),
			imei: this.ffs.imei,
			warnings: this.ffs.warnings,
		};
	}

	private get handle(): FFS {
		if (!this.ffs)
			throw new Error("No fullflash is open");
		return this.ffs;
	}

	getChanges(): number {
		return this.changes;
	}

	readDir(path: string): FFSEntry[] {
		return this.handle.readDir(path);
	}

	// A copy of the file, which is handed over to the page
	readFile(path: string): Uint8Array {
		const data = this.handle.readFile(path);
		return Comlink.transfer(data, [data.buffer]);
	}

	statfs(path: string): FFSStatFs {
		return this.handle.statfs(path);
	}

	writeFile(path: string, data: Uint8Array): void {
		this.handle.writeFile(path, data);
		this.changes++;
	}

	// Creates the parents as well, an existing directory is left as it is
	mkdir(path: string, timestamp?: Date): void {
		let current = "";
		for (const name of splitPath(path)) {
			current += `/${name}`;
			if (!this.handle.stat(current)?.isDirectory) {
				this.handle.mkdir(current, timestamp);
				this.changes++;
			}
		}
	}

	remove(path: string): void {
		this.handle.remove(path);
		this.changes++;
	}

	// Within a partition, keeping the timestamps and attributes
	move(src: string, dest: string): void {
		this.handle.rename(src, dest);
		this.changes++;
	}

	// A copy of the fullflash with its changes, which is handed over to the page
	save(): FFSImage {
		const image = { data: this.handle.save() as Uint8Array<ArrayBuffer>, changes: this.changes };
		return Comlink.transfer(image, [image.data.buffer]);
	}

	close(): void {
		this.ffs = undefined;
	}
}
