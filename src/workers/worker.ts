import * as Comlink from "comlink";
import { CgsnService } from "@/workers/services/CgsnService.js";
import { BfcService } from "@/workers/services/BfcService.js";
import { DwdService } from "./services/DwdService";
import { FFSService } from "@/workers/services/FFSService";

const services: Record<string, any> = {
	'BFC': new BfcService(),
	'CGSN': new CgsnService(),
	'DWD': new DwdService(),
	'FFS': new FFSService(),
}

Comlink.expose({
	getService(name: string): any {
		return Comlink.proxy(services[name]);
	}
});
