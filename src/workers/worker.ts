import * as Comlink from "comlink";
import { services } from "@/workers/services";
import { initComlinkDataTransfers } from "@/utils/comlink";

initComlinkDataTransfers();

Comlink.expose({
	getService(name: string): any {
		return Comlink.proxy(services[name]);
	}
});
