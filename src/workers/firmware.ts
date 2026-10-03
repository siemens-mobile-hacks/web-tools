import {
	convertFirmware,
	unpackFirmware,
	type FirmwareMode,
	type FirmwareRequest,
	type FirmwareResponse,
	type FirmwareResult,
} from './services/FirmwareService';
import { convertFullFlash } from './services/FullFlashService';

const processors: Record<FirmwareMode, (request: FirmwareRequest) => Promise<FirmwareResult>> = {
	unpack: ({ file }) => unpackFirmware(file),
	convert: ({ file }) => convertFirmware(file),
	fullflash: ({ file, save }) => convertFullFlash(file, save),
};

self.onmessage = async (event: MessageEvent<FirmwareRequest>) => {
	let response: FirmwareResponse;
	try {
		response = await processors[event.data.mode](event.data);
	} catch (error) {
		response = { error: error instanceof Error ? error.message : String(error) };
	}
	self.postMessage(response);
};
