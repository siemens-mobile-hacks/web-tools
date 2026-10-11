import { connectWorkerConsole } from '@/utils/consoleRelay';
import { useDebugSettings } from '@/store/debugSettings';

type WorkerConstructor<T extends Worker> = new (options?: WorkerOptions) => T;

export function createWorker<T extends Worker>(
	WorkerModule: WorkerConstructor<T>,
	options?: WorkerOptions,
): T {
	const worker = new WorkerModule(options);
	const [, debugSettings] = useDebugSettings();
	const disconnectConsole = connectWorkerConsole(worker, debugSettings.filter());
	const terminate = worker.terminate.bind(worker);
	worker.terminate = () => {
		disconnectConsole();
		terminate();
	};
	return worker;
}
