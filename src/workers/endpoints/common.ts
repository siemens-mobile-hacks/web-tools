import * as Comlink from 'comlink';
import WorkerModule from '../worker?worker';
import { initComlinkDataTransfers } from "@/utils/comlink";
import { createWorker } from '@/workers/createWorker';

interface Common {
	getService(name: string): any;
}

export const commonWorker = Comlink.wrap<Common>(createWorker(WorkerModule));

initComlinkDataTransfers();
