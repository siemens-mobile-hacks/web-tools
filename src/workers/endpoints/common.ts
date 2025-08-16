import * as Comlink from "comlink";
import WorkerModule from '../worker?worker';

interface Common {
	getService(name: string): any;
}

export const commonWorker = Comlink.wrap<Common>(new WorkerModule());
