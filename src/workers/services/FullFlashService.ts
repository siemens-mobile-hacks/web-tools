import { decodeMfl, detectMflModels, encodeMfl, MFL_MODELS, mflHeader } from '@/utils/mfl';
import type { FirmwareOutput, FirmwareResult, FirmwareSave } from './FirmwareService';

const MiB = 1024 * 1024;

interface FullFlashFormat {
	name: string;
	extension: string;
	detect?: (data: Uint8Array, fileName: string) => boolean;
	// The flash in address order, the phone model the file names, and why the flash may be wrong
	decode: (data: Uint8Array<ArrayBuffer>) => { flash: Uint8Array<ArrayBuffer>; model?: string; warning?: string };
	// The phone models a file of the flash can be for, and the one to choose: the source's, or the one detected
	describe?: (flash: Uint8Array<ArrayBuffer>, model?: string) => Pick<FirmwareOutput, 'models' | 'model' | 'error'>;
	encode: (flash: Uint8Array<ArrayBuffer>, model?: string) => Blob;
}

// Raw fullflashes have no signature: any file the other formats don't recognize is one
const BIN: FullFlashFormat = {
	name: 'Raw fullflash (V_Klay, Siemens Web Tools)',
	extension: 'bin',
	decode: (flash) => ({ flash }),
	encode: (flash) => new Blob([flash], { type: 'application/octet-stream' }),
};

const FORMATS: FullFlashFormat[] = [
	BIN,
	{
		name: 'Martech Box',
		extension: 'mfl',
		// Also the MFL files decodeMfl refuses, which are no raw fullflashes either
		detect: (data, fileName) => /\.mfl$/i.test(fileName) || String.fromCharCode(...data.subarray(0, 2)) === 'MR',
		decode: (data) => {
			const { code, model, flash, warning } = decodeMfl(data);
			return { flash, model: model?.name ?? code, warning };
		},
		describe: describeMfl,
		encode: (flash, name) => {
			const model = MFL_MODELS.find((item) => item.name === name && item.size === flash.length);
			if (!model)
				throw new Error(`Martech has no phone model ${name} with a ${formatSize(flash.length)} fullflash.`);
			return new Blob([mflHeader(model.code), encodeMfl(flash)], { type: 'application/octet-stream' });
		},
	},
];

function formatSize(size: number): string {
	return `${+(size / MiB).toFixed(2)} MiB`;
}

function describeMfl(flash: Uint8Array<ArrayBuffer>, name?: string): Pick<FirmwareOutput, 'models' | 'model' | 'error'> {
	const models = MFL_MODELS.filter((model) => model.size === flash.length);
	if (!models.length)
		throw new Error(`Martech has no phone model with a ${formatSize(flash.length)} fullflash.`);
	let candidates = models.filter((model) => model.name === name);
	if (!candidates.length)
		candidates = models.length === 1 ? models : detectMflModels(flash).filter((model) => models.includes(model));
	let error: string | undefined;
	if (!candidates.length) {
		error = 'Could not detect the phone model.';
	} else if (candidates.length > 1) {
		error = `The fullflash names several phone models: ${candidates.map((model) => model.name).join(', ')}.`;
	}
	return {
		models: models.map((model) => model.name),
		model: candidates.length === 1 ? candidates[0].name : undefined,
		error,
	};
}

// The files the fullflash converts to, or with save, the one file saved
export async function convertFullFlash(file: File, save?: FirmwareSave): Promise<FirmwareResult> {
	const data = new Uint8Array(await file.arrayBuffer());
	const source = FORMATS.find((format) => format.detect?.(data, file.name)) ?? BIN;
	const { flash, model, warning } = source.decode(data);
	const baseName = file.name.replace(/\.[^.]+$/, '');
	const outputs = FORMATS.map((format) => ({
		format,
		output: {
			name: `${baseName}.${format.extension}`,
			format: `${format.name} (.${format.extension})`,
			info: [],
			blocks: [],
		} satisfies FirmwareOutput,
	}));

	if (save) {
		const target = outputs.find(({ output }) => output.name === save.name);
		if (!target)
			throw new Error(`There is no ${save.name} to save.`);
		return {
			type: source.name,
			files: [{ ...target.output, blob: target.format.encode(flash, save.model) }],
		};
	}
	return {
		type: model ? `${source.name} · ${model}` : source.name,
		warning,
		// The source's format too, so that every file gets the same choice of formats
		files: outputs.map(({ format, output }) => {
			try {
				return { ...output, ...format.describe?.(flash, model), deferred: true };
			} catch (error) {
				return { ...output, error: error instanceof Error ? error.message : String(error) };
			}
		}),
	};
}
