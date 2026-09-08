import {
	convertFirmware,
	unpackFirmware,
	type FirmwareRequest,
	type FirmwareResponse,
} from './services/FirmwareService';

self.onmessage = async (event: MessageEvent<FirmwareRequest>) => {
	let response: FirmwareResponse;
	try {
		const process = event.data.mode === 'unpack' ? unpackFirmware : convertFirmware;
		response = await process(event.data.file);
	} catch (error) {
		response = { error: error instanceof Error ? error.message : String(error) };
	}
	self.postMessage(response);
};
