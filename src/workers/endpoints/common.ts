import * as Comlink from "comlink";
import WorkerModule from '../worker?worker';
import { initComlinkDataTransfers } from "@/utils/comlink";

interface Common {
	getService(name: string): any;
}

initComlinkDataTransfers();

export const commonWorker = Comlink.wrap<Common>(new WorkerModule());
