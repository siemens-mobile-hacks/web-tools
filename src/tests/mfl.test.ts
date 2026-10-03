import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { decodeMfl, detectMflModels, encodeMfl, mflHeader } from '../utils/mfl.js';

const MiB = 1024 * 1024;

// The tests on Martech's own files read the .mfl files in the directories MFL_TEST_FILES lists
const files = (process.env.MFL_TEST_FILES?.split(path.delimiter).filter(Boolean) ?? [])
	.flatMap((dir) => fs.readdirSync(dir, { recursive: true }).map((file) => path.join(dir, String(file))))
	.filter((file) => file.endsWith('.mfl'));

function encode(flash: Uint8Array<ArrayBuffer>, code: string): Uint8Array {
	return Buffer.concat([mflHeader(code), encodeMfl(flash)]);
}

// Erased runs of every length around the 255 bytes a count holds, between other data
function sampleFlash(size: number): Uint8Array<ArrayBuffer> {
	const flash = new Uint8Array(size);
	for (let offset = 0, run = 0; offset < size; run = (run + 1) % 600) {
		flash[offset++] = offset & 0x7F;
		flash.fill(0xFF, offset, offset + run);
		offset += run;
	}
	return flash;
}

test('mfl: matches the reference encoder', () => {
	const flash = new Uint8Array([0x01, 0xFF, 0x02, ...Array(300).fill(0xFF), 0x03, 0xFF]);
	assert.equal(Buffer.from(encodeMfl(flash)).toString('hex'), '6eb4ad83d177276e9a89967ab6a7b466ad1e72df707c3c5b8bbbaa8959');
	assert.equal(Buffer.from(mflHeader('S75F')).toString('hex'), Buffer.from('MRTS75F').toString('hex') + '8959');
});

test('mfl: round trip', () => {
	for (const size of [0, 1, 1000, 4 * MiB, 6 * MiB, 12 * MiB, 16 * MiB]) {
		const flash = sampleFlash(size);
		const file = encode(flash, 'TEST');
		const decoded = decodeMfl(file);
		assert.equal(decoded.code, 'TEST');
		assert.ok(Buffer.from(decoded.flash).equals(flash), `${size} bytes`);
	}
});

// The cipher works byte by byte, so one byte of a flash without 0xFF changes the file's byte at
// its place in Martech's order
test('mfl: Martech\'s order of the flash', () => {
	const places: [size: number, [address: number, offset: number][]][] = [
		[4 * MiB, [[0, 0]]],
		[6 * MiB, [[4 * MiB, 0], [0, 2 * MiB]]],
		[12 * MiB, [[4 * MiB, 0], [0, 8 * MiB]]],
		[16 * MiB, [[8 * MiB, 0], [2 * MiB, 8 * MiB], [0, 14 * MiB]]],
	];
	for (const [size, parts] of places) {
		const flash = new Uint8Array(size);
		const blank = encodeMfl(flash);
		for (const [address, offset] of parts) {
			flash.fill(0);
			flash[address] = 1;
			const body = encodeMfl(flash);
			assert.equal(body.findIndex((byte, i) => byte !== blank[i]), offset, `${size} bytes, address ${address}`);
		}
	}
});

test('mfl: damaged files', () => {
	const file = encode(sampleFlash(1000), 'TEST');
	assert.throws(() => decodeMfl(file.subarray(0, file.length - 10)), /damaged/);
	assert.throws(() => decodeMfl(Buffer.from('MRTM55X')), /not supported/);
	for (const header of ['MR2S75F', 'MRTs75F', 'MRTS75'])
		assert.throws(() => decodeMfl(Buffer.concat([Buffer.from(header.padEnd(7, '\0')), file.subarray(7)])), /unsupported format/);
	// More than any model's flash
	assert.throws(() => decodeMfl(encode(new Uint8Array(97 * MiB).fill(0xFF), 'SL7F')), /damaged/);
});

test('mfl: files that may be wrong', () => {
	const flash = new Uint8Array(4 * MiB);
	const file = encode(flash, 'C45F');
	const decoded = decodeMfl(file);
	assert.equal(decoded.model?.name, 'C45');
	assert.equal(decoded.warning, undefined);
	assert.equal(decodeMfl(encode(new Uint8Array(8 * MiB), 'A55F')).model?.code, 'C55F');
	// Another generation of the model's dumps
	assert.equal(decodeMfl(encode(new Uint8Array(16 * MiB), 'C60K')).warning, undefined);

	// Cut within zeros, which then pass for the padding
	const cut = decodeMfl(Buffer.concat([file.subarray(0, MiB), file.subarray(-2)]));
	assert.ok(cut.flash.length < MiB);
	assert.match(cut.warning!, /fullflash of C45 has 4 MiB/);
	assert.match(decodeMfl(encode(flash, 'ZZZQ')).warning!, /no phone model with the code ZZZQ/);
	assert.match(decodeMfl(encode(new Uint8Array(16 * MiB), 'M55H')).warning!, /old format/);
});

test('mfl: phone model detection', () => {
	const flash = new Uint8Array(4 * MiB);
	const table = (offset: number, name: string) =>
		Buffer.from(`${name}\0\0\0\0\0\0\0\0SIEMENS`).copy(flash, offset);
	table(0x1000, 'BC75');
	assert.deepEqual(detectMflModels(flash), []);
	table(0x2000, 'EL71');
	table(0x3000, 'CX70');
	table(0x4000, 'C110');
	assert.deepEqual(detectMflModels(flash).map((model) => model.code), ['C11F', 'X65G', 'L71F']);
});

test('mfl: Martech files', { skip: !files.length && 'MFL_TEST_FILES has no .mfl files' }, () => {
	for (const file of files) {
		const data = fs.readFileSync(file);
		const { code, flash } = decodeMfl(data);
		// EGOLD flashes start with the C166 reset vector, a JMPS
		if (flash.length === 16 * MiB)
			assert.equal(flash[0], 0xFA, file);
		assert.deepEqual(detectMflModels(flash).map((model) => model.code), [code], file);

		// The filler bytes are all that differs
		const encoded = encode(flash, code);
		for (const offset of [7, 8, data.length - 2, data.length - 1])
			encoded[offset] = data[offset];
		assert.ok(data.equals(encoded), file);
	}
});
