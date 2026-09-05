import debug from "debug";

// Captures all debug() output inside the worker (AT channel, OBEX, ...) into a
// ring buffer and forwards new lines to a listener, so pages can show a log window.
// Installs itself on import, but only in a worker context.

const MAX_LINES = 1000;

const lines: string[] = [];
let listener: ((line: string) => void) | undefined;

// Namespaces that are always logged, they contain every AT command, OBEX
// operation and flasher protocol traffic
const DEFAULT_NAMESPACES = "atc,obex,bfc,flasher,flasher:trx";

function pad(value: number, length: number = 2): string {
	return String(value).padStart(length, "0");
}

function timestamp(): string {
	const d = new Date();
	return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function formatArg(value: any): string {
	if (typeof value == "string")
		return value;
	if (Buffer.isBuffer(value) || value instanceof Uint8Array)
		return value.toString("hex");
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

// Resolves console-style printf specifiers, debug with colors disabled
// prepends the namespace to args[0] and appends its own "+Nms" diff
function formatLogArgs(args: any[]): string {
	const format = String(args[0] ?? "");
	const rest = args.slice(1);
	let index = 0;
	const resolved = format.replace(/%(?:(0)?(\d+))?([sdjifoOcxX%])/g, (match, zeroPad: string | undefined, width: string | undefined, conv: string) => {
		if (conv == "%")
			return "%";
		if (conv == "c")
			return "";
		const value = rest[index++];
		if (conv == "d" || conv == "i")
			return String(Math.round(Number(value)));
		if (conv == "f")
			return String(Number(value));
		if (conv == "x" || conv == "X") {
			// Hex with optional zero padding, e.g. %08X for memory addresses
			const hex = (Number(value) >>> 0).toString(16);
			const padded = width ? hex.padStart(Number(width), zeroPad ? "0" : " ") : hex;
			return conv == "X" ? padded.toUpperCase() : padded;
		}
		return formatArg(value);
	});
	return [resolved, ...rest.slice(index).map(formatArg)].join(" ");
}

if (typeof window == "undefined") {
	const debugAny = debug as any;
	debugAny.useColors = () => false;
	// The flasher log window is flasher-only: its namespace prefix is
	// dropped entirely, at the source. Other namespaces (atc, obex, bfc,
	// ... in the File Explorer log) keep the prefix. The "+Nms" diff
	// suffix is kept for all lines; the timestamp is added locally.
	debugAny.formatArgs = function (this: any, args: any[]): void {
		const diff = ` +${debugAny.humanize(this.diff)}`;
		const ns = String(this.namespace ?? "");
		if (ns.startsWith("flasher"))
			args[0] = `${args[0]}${diff}`;
		else
			args[0] = `${ns} ${args[0]}${diff}`;
	};
	debugAny.log = (...args: any[]) => {
		const line = `${timestamp()} ${formatLogArgs(args)}`;
		lines.push(line);
		if (lines.length > MAX_LINES)
			lines.splice(0, lines.length - MAX_LINES);
		listener?.(line);
	};
	debugAny.enable(DEFAULT_NAMESPACES);
}

export function getLogLines(): string[] {
	return lines;
}

export function setLogListener(callback?: (line: string) => void): void {
	listener = callback;
}

export function clearLog(): void {
	lines.length = 0;
}
