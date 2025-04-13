import * as Comlink from "comlink";
import { BfcService } from "@/workers/services/BfcService.js";

Comlink.expose(new BfcService());
