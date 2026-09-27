import * as Comlink from "comlink";
import { BfcService } from "@/workers/services/BfcService";
import { CgsnService } from "@/workers/services/CgsnService";
import { DwdService } from "@/workers/services/DwdService";
import { FFSService } from "@/workers/services/FFSService";
import { ObexService } from "@/workers/services/ObexService";
import { LogService } from "@/workers/services/LogService";
import { FlasherService } from "@/workers/services/FlasherService";
import { BfbService } from "@/workers/services/BfbService";

export const services: Record<string, any> = {
	'BFB': new BfbService(),
	'BFC': new BfcService(),
	'CGSN': new CgsnService(),
	'DWD': new DwdService(),
	'FFS': new FFSService(),
	'OBEX': new ObexService(),
	'FLSH': new FlasherService(),
	'LOG': new LogService(),
}
