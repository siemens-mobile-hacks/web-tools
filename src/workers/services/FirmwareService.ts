import { Buffer } from 'buffer';
import { firmwareFileName } from './firmwareFileName.js';
import {
	detectExeType,
	extractFromExe,
	getXbiExtension,
	getXbiWriteBlocks,
	isXbi,
	parseXbi,
	type XbiInfo,
} from '@sie-js/fw';

export type FirmwareMode = 'unpack' | 'convert';

export interface FirmwareBlock {
	addr: number;
	size: number;
	kind: 'data' | 'erased' | 'untouched';
}

export interface FirmwareOutput {
	name: string;
	blob?: Blob;
	info: [string, string][];
	hashArea?: string;
	blocks: FirmwareBlock[];
	error?: string;
}

export interface FirmwareRequest {
	file: File;
	mode: FirmwareMode;
}

export interface FirmwareResult {
	type: string;
	files: FirmwareOutput[];
}

export type FirmwareResponse = FirmwareResult | { error: string };

function getPayloadExtension(payload: Buffer, xbi?: XbiInfo): string {
	if (xbi)
		return getXbiExtension(xbi);
	if (payload.subarray(0, 4).equals(Buffer.from('504b0304', 'hex')))
		return 'zip';
	if (payload.subarray(0, 13).toString() === '[MapFileInfo]')
		return 'map';
	return 'bin';
}

function buildFirmwareBlocks(
	flashSize: number,
	writes: { addr: number; size: number }[],
	eraseRegions: NonNullable<XbiInfo['eraseRegions']>,
): FirmwareBlock[] {
	const firstAddress = writes[0]?.addr ?? eraseRegions[0]?.from ?? 0;
	const base = firstAddress - (firstAddress & 0x0FFFFFFF);
	const boundaries = [
		{ offset: 0, writeDelta: 0, eraseDelta: 0 },
		{ offset: flashSize, writeDelta: 0, eraseDelta: 0 },
	];
	for (const write of writes) {
		const offset = write.addr & 0x0FFFFFFF;
		boundaries.push(
			{ offset, writeDelta: 1, eraseDelta: 0 },
			{ offset: offset + write.size, writeDelta: -1, eraseDelta: 0 },
		);
	}
	for (const region of eraseRegions) {
		const start = region.from & 0x0FFFFFFF;
		const end = (region.to & 0x0FFFFFFF) + 1;
		if (end <= start || end > flashSize)
			throw new Error('The XBI contains an invalid erase region.');
		boundaries.push(
			{ offset: start, writeDelta: 0, eraseDelta: 1 },
			{ offset: end, writeDelta: 0, eraseDelta: -1 },
		);
	}
	boundaries.sort((a, b) => a.offset - b.offset);
	const blocks: FirmwareBlock[] = [];
	let cursor = 0;
	let activeWrites = 0;
	let activeErases = 0;
	for (const boundary of boundaries) {
		if (boundary.offset > cursor) {
			let kind: FirmwareBlock['kind'] = 'untouched';
			if (activeWrites > 0) {
				kind = 'data';
			} else if (activeErases > 0) {
				kind = 'erased';
			}
			const previous = blocks.at(-1);
			if (previous?.kind === kind) {
				previous.size += boundary.offset - cursor;
			} else {
				blocks.push({ addr: base + cursor, size: boundary.offset - cursor, kind });
			}
			cursor = boundary.offset;
		}
		activeWrites += boundary.writeDelta;
		activeErases += boundary.eraseDelta;
	}
	return blocks;
}

export function formatFirmwareInfo(xbi: XbiInfo): [string, string][] {
	const rows: [string, string][] = [['type', getXbiExtension(xbi)]];
	const hex = (value: number) => value.toString(16).toUpperCase().padStart(8, '0');
	for (const [key, value] of Object.entries(xbi)) {
		if (key === 'dataChunks' || key === 'hashArea' || key === 'unknown' || value === undefined)
			continue;
		switch (key) {
			case 'dll':
				rows.push([key, String(value).replace(/[\x00\x01]/g, '')]);
				break;
			case 'mapInfo':
				for (const [index, map] of (value as Buffer[]).entries())
					rows.push([`${key}[${index}]`, map.toString('hex')]);
				break;
			case 'dataFlash':
			case 'eraseRegions':
				for (const [index, region] of (value as { from: number; to: number }[]).entries())
					rows.push([`${key}[${index}]`, `${hex(region.from)}-${hex(region.to)}`]);
				break;
			case 'splitInfo': {
				const splitInfo = value as NonNullable<XbiInfo['splitInfo']>;
				rows.push([key, `${hex(splitInfo.addr)} (ID: ${hex(splitInfo.id)})`]);
				break;
			}
			case 'statisticAddr':
				rows.push([key, hex(value as number)]);
				break;
			case 'flashSize':
				rows.push([key, `${value} (${Number(value) / 1024 / 1024} MiB)`]);
				break;
			default: {
				let text: string;
				if (Buffer.isBuffer(value)) {
					text = value.toString('hex');
				} else if (typeof value === 'object') {
					text = JSON.stringify(value);
				} else {
					text = String(value);
				}
				rows.push([key, text]);
				break;
			}
		}
	}
	for (const [command, value] of Object.entries(xbi.unknown)) {
		const id = Number(command).toString(16).toUpperCase().padStart(2, '0');
		rows.push([`unknown[0x${id}]`, value.toString('hex')]);
	}
	return rows;
}

function extractPayloads(buffer: Buffer): Buffer[] {
	const payloads = extractFromExe(buffer);
	if (!payloads?.some((payload) => payload?.length))
		throw new Error('Could not extract firmware from this EXE. The file may be damaged or unsupported.');
	return payloads;
}

async function processPayloads(
	payloads: Buffer[],
	baseName: string,
	processPayload: (payload: Buffer, name: string) => Promise<FirmwareOutput>,
	include: (payload: Buffer) => boolean = () => true,
): Promise<FirmwareOutput[]> {
	const files: FirmwareOutput[] = [];
	for (const [index, payload] of payloads.entries()) {
		if (!payload?.length || !include(payload))
			continue;

		const name = baseName + (payloads.length > 1 ? `_${index + 1}` : '');
		const output = await processPayload(payload, name);
		const originalName = output.name;
		for (let suffix = 2; files.some((file) => file.name === output.name); suffix++)
			output.name = originalName.replace(/(\.[^.]+)$/, `_${suffix}$1`);
		files.push(output);
	}
	return files;
}

function getFlashSize(xbi: XbiInfo): number {
	const flashSize = xbi.flashSize;
	if (!flashSize || flashSize > 0x10000000)
		throw new Error('The XBI flash size is missing or unsupported.');
	return flashSize;
}

function readXbi(payload: Buffer, xbi: XbiInfo, flashSize: number, flash?: Buffer): FirmwareBlock[] {
	const writes: { addr: number; size: number }[] = [];
	for (const { addr, data } of getXbiWriteBlocks(payload, xbi)) {
		if (!data.length)
			continue;
		const offset = addr & 0x0FFFFFFF;
		if (offset + data.length > flashSize)
			throw new Error('The XBI contains data outside its declared flash size.');
		writes.push({ addr, size: data.length });
		if (flash)
			data.copy(flash, offset);
	}
	return buildFirmwareBlocks(flashSize, writes, xbi.eraseRegions ?? []);
}

export async function unpackFirmware(file: File): Promise<FirmwareResult> {
	const buffer = Buffer.from(await file.arrayBuffer());
	const exeType = detectExeType(buffer);
	if (isXbi(buffer) || !exeType)
		throw new Error('Select a Siemens update or service EXE.');

	const payloads = extractPayloads(buffer);
	const files = await processPayloads(payloads, file.name.replace(/\.[^.]+$/, ''), unpackPayload);
	return {
		type: `${exeType} EXE`,
		files,
	};
}

async function unpackPayload(payload: Buffer, name: string): Promise<FirmwareOutput> {
	const output: FirmwareOutput = { name: `${name}.bin`, info: [], blocks: [] };
	output.blob = new Blob([new Uint8Array(payload)], { type: 'application/octet-stream' });

	try {
		const xbi = parseXbi(payload, true);
		const extension = getPayloadExtension(payload, xbi);
		output.info = xbi ? formatFirmwareInfo(xbi) : [['type', extension]];
		output.hashArea = xbi?.hashArea?.toString('hex');
		if (!xbi) {
			output.name = await firmwareFileName(payload, extension, name);
			return output;
		}

		output.name = await firmwareFileName(payload, extension, name, xbi);
		if (!xbi.valid)
			return output;

		try {
			const flashSize = getFlashSize(xbi);
			const flash = extension === 'xfs' ? Buffer.alloc(flashSize, 0xFF) : undefined;
			output.blocks = readXbi(payload, xbi, flashSize, flash);
			if (flash)
				output.name = await firmwareFileName(payload, extension, name, xbi, flash);
		} catch {}
	} catch (error) {
		output.error = error instanceof Error ? error.message : String(error);
	}
	return output;
}

export async function convertFirmware(file: File): Promise<FirmwareResult> {
	const buffer = Buffer.from(await file.arrayBuffer());
	const directXbi = isXbi(buffer);
	const exeType = directXbi ? undefined : detectExeType(buffer);
	if (!directXbi && !exeType)
		throw new Error('Unsupported file. Select a Siemens update/service EXE or XBI firmware.');

	const payloads = directXbi ? [buffer] : extractPayloads(buffer);
	const files = await processPayloads(payloads, file.name.replace(/\.[^.]+$/, ''), convertPayload, isXbi);
	if (!files.length)
		throw new Error('This EXE contains no XBI firmware to convert. Use the unpack tab to extract its files.');
	return {
		type: directXbi ? 'XBI' : `${exeType} EXE`,
		files,
	};
}

async function convertPayload(payload: Buffer, name: string): Promise<FirmwareOutput> {
	const output: FirmwareOutput = { name: `${name}.bin`, info: [], blocks: [] };
	try {
		const xbi = parseXbi(payload, true);
		const extension = getPayloadExtension(payload, xbi);
		output.info = xbi ? formatFirmwareInfo(xbi) : [['type', extension]];
		output.hashArea = xbi?.hashArea?.toString('hex');
		if (!xbi?.valid || !xbi.dataChunks.length)
			throw new Error('The XBI contains invalid or missing flash data.');

		const flashSize = getFlashSize(xbi);
		const flash = Buffer.alloc(flashSize, 0xFF);
		output.blocks = readXbi(payload, xbi, flashSize, flash);
		output.name = `${await firmwareFileName(payload, extension, name, xbi, flash)}.bin`;
		output.blob = new Blob([flash], { type: 'application/octet-stream' });
	} catch (error) {
		output.error = error instanceof Error ? error.message : String(error);
	}
	return output;
}
