import { clearLog, getLogLines, setLogListener } from "@/workers/logCapture";

export class LogService {
	getLog(): string[] {
		return getLogLines();
	}

	// The callback must be a Comlink proxy on the caller side
	setListener(callback?: (line: string) => void): void {
		setLogListener(callback);
	}

	clear(): void {
		clearLog();
	}
}
