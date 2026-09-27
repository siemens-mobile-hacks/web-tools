// Where a dump file starts in the flash, as V_KLay's OpenDocument decides it:
// from the "_From_XX" suffix of the file name (GetAddrFromFileName). A file
// without one is a dump of the whole flash and starts at offset 0 - any other
// default silently shifts every patch address against the dump.
import { getAddrFromFileName } from "@sie-js/flasher";

export function dumpStartOffset(fileName: string): number {
	return getAddrFromFileName(fileName) ?? 0;
}
