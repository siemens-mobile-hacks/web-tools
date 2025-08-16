import { commonWorker } from "@/workers/endpoints/common";
import * as Comlink from "comlink";
import { FFSService } from "@/workers/services/FFSService";

export const ffsWorker: Comlink.Remote<FFSService> = await commonWorker.getService('FFS');
