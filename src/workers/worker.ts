import * as Comlink from "comlink";
import { CgsnService } from "@/workers/services/CgsnService.js";
import { BfcService } from "@/workers/services/BfcService.js";
import { SerialService } from "./services/SerialService";
import { DwdService } from "./services/DwdService";

const services: Record<string, SerialService> = {
	'BFC': new BfcService(),
	'CGSN': new CgsnService(),
	'DWD': new DwdService(),
}

Comlink.expose({
	getService(name: string): any {
		return Comlink.proxy(services[name]);
	}
});
