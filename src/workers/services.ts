import * as Comlink from "comlink";
import { BfcService } from "@/workers/services/BfcService";
import { CgsnService } from "@/workers/services/CgsnService";
import { DwdService } from "@/workers/services/DwdService";
import { FFSService } from "@/workers/services/FFSService";
import { ObexService } from "@/workers/services/ObexService";
import { LogService } from "@/workers/services/LogService";

export const services: Record<string, any> = {
	'BFC': new BfcService(),
	'CGSN': new CgsnService(),
	'DWD': new DwdService(),
	'FFS': new FFSService(),
	'OBEX': new ObexService(),
	'LOG': new LogService(),
}
