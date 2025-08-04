import debug from "debug";

export abstract class SerialService<T = any> {
	#handle?: T;
	#abortController?: AbortController;

	get handle(): T {
		if (!this.#handle)
			throw new Error(`${this.protocol()} is not connected!`);
		return this.#handle;
	}

	protected get isConnected(): boolean {
		return !!this.#handle;
	}

	protected set handle(value: T | undefined) {
		this.#handle = value;
	}

	setDebug(filter: string): void {
		debug.enable(filter);
	}

	abort(): void {
		if (this.#abortController)
			this.#abortController.abort();
	}

	getAbortSignal(): AbortSignal {
		this.#abortController = new AbortController();
		return this.#abortController.signal;
	}

	abstract connect(portIndex: number, limitBaudrate?: number): Promise<void>;
	abstract disconnect(): Promise<void>;
	abstract protocol(): string;
	abstract getDeviceName(): Promise<string | undefined>;
}
