import { BfcService } from "@/workers/services/BfcService";
import { CgsnService } from "@/workers/services/CgsnService";
import { DwdService } from "@/workers/services/DwdService";
import { FFSService } from "@/workers/services/FFSService";

export const services: Record<string, any> = {
	'BFC': new BfcService(),
	'CGSN': new CgsnService(),
	'DWD': new DwdService(),
	'FFS': new FFSService(),
}
