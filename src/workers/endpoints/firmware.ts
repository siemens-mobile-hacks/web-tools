import FirmwareWorkerModule from '@/workers/firmware?worker';
import { createWorker } from '@/workers/createWorker';

export function createFirmwareWorker(): Worker {
	return createWorker(FirmwareWorkerModule);
}
