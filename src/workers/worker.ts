import * as Comlink from "comlink";
import { CgsnService } from "@/workers/services/CgsnService.js";
import { BfcService } from "@/workers/services/BfcService.js";
import { SerialService } from "./services/SerialService";

const services: Record<string, SerialService> = {
	'BFC': new BfcService(),
	'CGSN': new CgsnService(),
}

Comlink.expose({
	getService(name: string): any {
		return Comlink.proxy(services[name]);
	}
});
