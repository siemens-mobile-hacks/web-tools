// Martech Box fullflashes (.mfl): "MRT", the model code, 2 filler bytes, then the flash and 16 zeros,
// run-length encoded and enciphered, then 2 more filler bytes. The loader ignores the filler bytes.

const MiB = 1024 * 1024;
const HEADER_SIZE = 9;
const FOOTER_SIZE = 2;
const PADDING_SIZE = 16;
// Martech's writer fills them with Random(255), this converter with its signature
const FILLER = [0x89, 0x59];
const SIEMENS = [...'SIEMENS'].map((char) => char.charCodeAt(0));

export interface MflModel {
	code: string;
	name: string;
	size: number;
}

// The models Martech's software writes fullflashes of, by the names it shows for them and the names
// the phones report, which are of 4 characters at most
export const MFL_MODELS: MflModel[] = [
	{ code: 'A31F', name: 'A31', size: 16 * MiB },
	{ code: 'A50F', name: 'A50', size: 4 * MiB },
	{ code: 'A51F', name: 'A51', size: 4 * MiB },
	{ code: 'A52F', name: 'A52', size: 4 * MiB },
	{ code: 'C55F', name: 'A55/C55/2128', size: 8 * MiB },
	{ code: 'A57F', name: 'A57', size: 8 * MiB },
	{ code: 'A60I', name: 'A60/A62', size: 8 * MiB },
	{ code: 'A65G', name: 'A65', size: 16 * MiB },
	{ code: 'A70G', name: 'A70', size: 4 * MiB },
	{ code: 'A75F', name: 'A75', size: 8 * MiB },
	{ code: 'AF5F', name: 'AF51', size: 16 * MiB },
	{ code: 'AL2F', name: 'AL21', size: 16 * MiB },
	{ code: 'AX2F', name: 'AX72', size: 16 * MiB },
	{ code: 'AX7F', name: 'AX75', size: 16 * MiB },
	{ code: 'C45F', name: 'C45', size: 4 * MiB },
	{ code: 'C60M', name: 'C60', size: 16 * MiB },
	{ code: 'C65G', name: 'C65/CV65', size: 32 * MiB },
	{ code: 'C72F', name: 'C72', size: 32 * MiB },
	{ code: 'C75F', name: 'C75', size: 32 * MiB },
	{ code: 'C81F', name: 'C81', size: 64 * MiB },
	{ code: 'C11F', name: 'CF110/C110', size: 16 * MiB },
	{ code: 'F62F', name: 'CF62/CF65', size: 16 * MiB },
	{ code: 'F75F', name: 'CF75', size: 32 * MiB },
	{ code: 'X65G', name: 'CX65/CX70/M65', size: 32 * MiB },
	{ code: 'X75F', name: 'CX75', size: 32 * MiB },
	{ code: 'L71F', name: 'EL71', size: 64 * MiB },
	{ code: 'LL1F', name: 'L71', size: 64 * MiB },
	{ code: 'M46H', name: 'M46', size: 6 * MiB },
	{ code: 'M50F', name: 'M50/MT50', size: 6 * MiB },
	{ code: 'M55K', name: 'M55', size: 16 * MiB },
	{ code: 'M75F', name: 'M75', size: 32 * MiB },
	{ code: 'M81F', name: 'M81', size: 64 * MiB },
	{ code: 'MC3F', name: 'MC35i/MC35', size: 4 * MiB },
	{ code: 'MC6M', name: 'MC60', size: 16 * MiB },
	{ code: 'E75F', name: 'ME75', size: 32 * MiB },
	{ code: 'S45F', name: 'S45/ME45', size: 6 * MiB },
	{ code: 'S46F', name: 'S46', size: 6 * MiB },
	{ code: 'S55H', name: 'S55/S57/SL55', size: 12 * MiB },
	{ code: 'S65G', name: 'S65/SV65/S66', size: 32 * MiB },
	{ code: 'S68F', name: 'S68', size: 64 * MiB },
	{ code: 'S75F', name: 'S75', size: 64 * MiB },
	{ code: 'SK6G', name: 'SK65', size: 32 * MiB },
	{ code: 'SL4F', name: 'SL45/SL42', size: 6 * MiB },
	{ code: 'L65G', name: 'SL65', size: 32 * MiB },
	{ code: 'SL7F', name: 'SL75', size: 96 * MiB },
	{ code: 'SP6F', name: 'SP65', size: 32 * MiB },
	{ code: 'SX1F', name: 'SX1', size: 8 * MiB },
	{ code: 'TC3F', name: 'TC35i/TC35', size: 2 * MiB },
];

// Martech's software refuses the files of these codes as an old format
const OLD_CODES = ['C60I', 'C60J', 'MC6I', 'MC6J', 'M55H', 'M55I', 'M55J', 'C65F', 'S65F', 'X65F'];

// Codes Martech's software reads as the phones of other codes
const CODE_ALIASES: Record<string, string> = { A55F: 'C55F' };

const MAX_SIZE = Math.max(...MFL_MODELS.map((model) => model.size));

// Martech stores the EGOLD flashes of these sizes in parts, the one at address 0 last. The size alone
// tells them, as every model of these sizes is an EGOLD one.
const LAYOUTS: Record<number, [number, number][]> = {
	[6 * MiB]: [[4 * MiB, 6 * MiB], [0, 4 * MiB]],
	[12 * MiB]: [[4 * MiB, 12 * MiB], [0, 4 * MiB]],
	[16 * MiB]: [[8 * MiB, 16 * MiB], [2 * MiB, 8 * MiB], [0, 2 * MiB]],
};

function rol(value: number, bits: number): number {
	value &= 0xFF;
	return ((value << bits) | (value >> (8 - bits))) & 0xFF;
}

function ror(value: number, bits: number): number {
	return rol(value, 8 - bits);
}

// The cipher's state steps before every byte of the stream
function crypt(data: Uint8Array, decrypt: boolean): void {
	let a = 0x8A;
	let b = 0x34;
	let c = 0x9D;
	for (let i = 0; i < data.length; i++) {
		a = ((a + 3) ^ c) & 0xFF;
		b = (b + 0x62 + a) & 0xFF;
		c = (c - b) & 0xFF;
		let x = data[i];
		if (decrypt) {
			x = ror((x ^ c) - 0x62, 2);
			x = rol(x + c, 3) ^ b;
			data[i] = rol(x, 1);
		} else {
			x = ror(ror(x, 1) ^ b, 3);
			x = rol(x - c, 2) + 0x62;
			data[i] = x ^ c;
		}
	}
}

// 0xFF and a count n stand for n bytes of 0xFF, any other byte for itself
function rleDecode(stream: Uint8Array): Uint8Array<ArrayBuffer> {
	let size = 0;
	for (let i = 0; i < stream.length; i++) {
		if (stream[i] !== 0xFF) {
			size++;
		} else if (stream[++i]) {
			size += stream[i];
		} else {
			throw new Error('The MFL file is damaged.');
		}
	}
	if (size > MAX_SIZE + PADDING_SIZE)
		throw new Error('The MFL file is damaged.');
	const data = new Uint8Array(size);
	for (let i = 0, offset = 0; i < stream.length; i++) {
		if (stream[i] === 0xFF) {
			data.fill(0xFF, offset, offset + stream[++i]);
			offset += stream[i];
		} else {
			data[offset++] = stream[i];
		}
	}
	return data;
}

function rleEncode(data: Uint8Array): Uint8Array {
	// Single 0xFF bytes between others take the most room
	const stream = new Uint8Array(data.length + Math.ceil(data.length / 2));
	let size = 0;
	for (let i = 0; i < data.length;) {
		if (data[i] === 0xFF) {
			let count = 1;
			while (count < 0xFF && data[i + count] === 0xFF)
				count++;
			stream[size++] = 0xFF;
			stream[size++] = count;
			i += count;
		} else {
			stream[size++] = data[i++];
		}
	}
	return stream.subarray(0, size);
}

// Between address order and the order Martech stores the flash in
function reorder(data: Uint8Array<ArrayBuffer>, toMartech: boolean): Uint8Array<ArrayBuffer> {
	const layout = LAYOUTS[data.length];
	if (!layout)
		return data;
	const result = new Uint8Array(data.length);
	let offset = 0;
	for (const [start, end] of layout) {
		if (toMartech) {
			result.set(data.subarray(start, end), offset);
		} else {
			result.set(data.subarray(offset, offset + end - start), start);
		}
		offset += end - start;
	}
	return result;
}

function formatSize(size: number): string {
	return `${+(size / MiB).toFixed(2)} MiB`;
}

export interface DecodedMfl {
	code: string;
	// By the code's first 3 characters: the 4th is the generation of Martech's dumps of the model
	model?: MflModel;
	flash: Uint8Array<ArrayBuffer>;
	// Why the flash may be wrong
	warning?: string;
}

export function decodeMfl(data: Uint8Array): DecodedMfl {
	const code = String.fromCharCode(...data.subarray(3, 7));
	if (!/^MRT[A-Z0-9]{4}$/.test(String.fromCharCode(...data.subarray(0, 7))))
		throw new Error('The MFL file is damaged or of an unsupported format.');
	if (code.endsWith('X'))
		throw new Error(`Martech ${code} files are not supported.`);
	const stream = new Uint8Array(data.subarray(HEADER_SIZE, -FOOTER_SIZE));
	crypt(stream, true);
	const plain = rleDecode(stream);
	const size = plain.length - PADDING_SIZE;
	if (size < 0 || plain.subarray(size).some((byte) => byte !== 0))
		throw new Error('The MFL file is damaged.');

	const prefix = (CODE_ALIASES[code] ?? code).slice(0, 3);
	const model = MFL_MODELS.find((item) => item.code.startsWith(prefix));
	let warning: string | undefined;
	if (OLD_CODES.includes(code)) {
		warning = `Martech's software refuses ${code} files as an old format. The fullflash may be wrong.`;
	} else if (!model) {
		warning = `Martech's software has no phone model with the code ${code}. The fullflash may be wrong.`;
	} else if (size !== model.size) {
		warning = `The file holds ${formatSize(size)}, and the fullflash of ${model.name} has ${formatSize(model.size)}. It may be damaged.`;
	}
	return { code, model, flash: reorder(plain.subarray(0, size), false), warning };
}

export function mflHeader(code: string): Uint8Array<ArrayBuffer> {
	const header = new Uint8Array(HEADER_SIZE);
	header.set([...`MRT${code}`].map((char) => char.charCodeAt(0)));
	header.set(FILLER, HEADER_SIZE - FILLER.length);
	return header;
}

// The file after the header, the same for all models
export function encodeMfl(flash: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
	const stream = rleEncode(reorder(flash, true));
	const body = new Uint8Array(stream.length + PADDING_SIZE + FOOTER_SIZE);
	body.set(stream);
	crypt(body.subarray(0, -FOOTER_SIZE), false);
	body.set(FILLER, body.length - FOOTER_SIZE);
	return body;
}

// The models named in the firmware's info tables: the name, at least 4 NULs, "SIEMENS"
export function detectMflModels(flash: Uint8Array): MflModel[] {
	const names = new Set<string>();
	for (let pos = flash.indexOf(SIEMENS[0]); pos >= 0; pos = flash.indexOf(SIEMENS[0], pos + 1)) {
		if (!SIEMENS.every((byte, i) => flash[pos + i] === byte))
			continue;
		let end = pos;
		while (end > 0 && flash[end - 1] === 0)
			end--;
		const name = String.fromCharCode(...flash.subarray(Math.max(0, end - 5), end))
			.match(/(?<![A-Za-z0-9])[A-Z][A-Z0-9]{1,3}$/)?.[0];
		if (name && pos - end >= 4)
			names.add(name);
	}
	return MFL_MODELS.filter((model) => model.name.split('/').some((name) => names.has(name)));
}
