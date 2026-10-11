export type ConsoleMethod = 'debug' | 'log' | 'info' | 'warn' | 'error';

export interface ConsoleMessage {
	method: ConsoleMethod;
	args: unknown[];
	timestamp: number;
}

type ConsoleMessageListener = (message: ConsoleMessage) => void;
interface ConsoleConnectMessage {
	type: typeof CONNECT_MESSAGE;
	port: MessagePort;
	debugFilter: string;
}

const isApp = typeof document !== 'undefined';
const CONNECT_MESSAGE = 'console-relay:connect';
const methods = ['debug', 'log', 'info', 'warn', 'error'] satisfies ConsoleMethod[];
const listeners = new Set<ConsoleMessageListener>();
const messages: ConsoleMessage[] = [];
const workerPorts = new Set<MessagePort>();
const MAX_MESSAGES = 1000;
const originalConsole: Record<ConsoleMethod, (...args: unknown[]) => void> = {
	debug: console.debug.bind(console),
	log: console.log.bind(console),
	info: console.info.bind(console),
	warn: console.warn.bind(console),
	error: console.error.bind(console),
};
let applyWorkerDebugFilter: ((filter: string) => void) | undefined;

if (isApp) {
	interceptConsole(publishConsoleMessage);
	window.addEventListener('error', (event) => {
		publishConsoleMessage({
			method: 'error',
			args: [event.error ?? event.message],
			timestamp: Date.now(),
		});
	});
	window.addEventListener('unhandledrejection', (event) => {
		publishConsoleMessage({
			method: 'error',
			args: [event.reason],
			timestamp: Date.now(),
		});
	});
} else {
	let port: MessagePort | undefined;
	const pendingMessages: ConsoleMessage[] = [];
	interceptConsole((message) => {
		if (port) {
			postConsoleMessage(port, message);
		} else {
			pendingMessages.push(message);
		}
	});
	self.addEventListener('message', (event: MessageEvent<ConsoleConnectMessage>) => {
		if (event.data.type !== CONNECT_MESSAGE)
			return;
		event.stopImmediatePropagation();
		port = event.data.port;
		applyWorkerDebugFilter?.(event.data.debugFilter);
		port.onmessage = (portEvent: MessageEvent<string>) => applyWorkerDebugFilter?.(portEvent.data);
		for (const message of pendingMessages)
			postConsoleMessage(port, message);
		pendingMessages.length = 0;
	});
}

export function setWorkerDebugFilterHandler(handler: (filter: string) => void): void {
	applyWorkerDebugFilter = handler;
}

export function broadcastWorkerDebugFilter(filter: string): void {
	for (const port of workerPorts)
		port.postMessage(filter);
}

export function getConsoleMessages(): readonly ConsoleMessage[] {
	return [...messages];
}

export function clearConsoleMessages(): void {
	messages.length = 0;
}

export function subscribeConsoleMessages(listener: ConsoleMessageListener): () => void {
	for (const message of messages)
		listener(message);
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function publishConsoleMessage(message: ConsoleMessage): void {
	messages.push(message);
	if (messages.length > MAX_MESSAGES)
		messages.shift();
	for (const listener of listeners)
		listener(message);
}

function interceptConsole(forward: ConsoleMessageListener): void {
	for (const method of methods) {
		Reflect.set(console, method, (...args: unknown[]) => {
			originalConsole[method](...args);
			forward({ method, args, timestamp: Date.now() });
		});
	}
}

function postConsoleMessage(port: MessagePort, message: ConsoleMessage): void {
	try {
		port.postMessage(message);
	} catch {
		port.postMessage({ ...message, args: message.args.map(String) } satisfies ConsoleMessage);
	}
}

export function connectWorkerConsole(worker: Worker, debugFilter: string): () => void {
	const channel = new MessageChannel();
	channel.port1.onmessage = (event: MessageEvent<ConsoleMessage>) => publishConsoleMessage(event.data);
	workerPorts.add(channel.port1);
	worker.postMessage({
		type: CONNECT_MESSAGE,
		port: channel.port2,
		debugFilter,
	} satisfies ConsoleConnectMessage, [channel.port2]);
	return () => {
		workerPorts.delete(channel.port1);
		channel.port1.close();
	};
}

function formatValue(value: unknown): string {
	if (typeof value === 'string')
		return value;
	if (value instanceof Error)
		return value.stack ?? value.message;
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

function formatArgs(args: readonly unknown[]): string {
	if (typeof args[0] !== 'string')
		return args.map(formatValue).join(' ');

	let nextArgument = 1;
	const formatted = args[0].replace(/%([%sdifoOc])/g, (token, specifier: string) => {
		if (specifier === '%')
			return '%';
		if (nextArgument >= args.length)
			return token;
		const value = args[nextArgument++];
		switch (specifier) {
			case 'c':
				return '';
			case 'd':
			case 'i':
				return String(Number.parseInt(String(value), 10));
			case 'f':
				return String(Number.parseFloat(String(value)));
			default:
				return formatValue(value);
		}
	});
	const remaining = args.slice(nextArgument).map(formatValue);
	return [formatted, ...remaining].join(' ');
}

export function formatConsoleMessage(message: ConsoleMessage): string {
	const time = new Date(message.timestamp);
	const timestamp = [time.getHours(), time.getMinutes(), time.getSeconds()]
		.map((value) => String(value).padStart(2, '0'))
		.join(':');
	return `${timestamp} ${formatArgs(message.args)}`;
}
