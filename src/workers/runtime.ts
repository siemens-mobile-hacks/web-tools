import { setWorkerDebugFilterHandler } from '@/utils/consoleRelay';
import createDebug from 'debug';
import { DEFAULT_DEBUG_FILTER } from '@/utils/debugChannels';

applyDebugFilter(DEFAULT_DEBUG_FILTER);
setWorkerDebugFilterHandler(applyDebugFilter);

function applyDebugFilter(filter: string): void {
	createDebug.enable(filter);
}
