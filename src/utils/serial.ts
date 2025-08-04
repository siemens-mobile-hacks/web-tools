import { AsyncSerialPort } from "@sie-js/serial";
import { SerialPortStream } from "@serialport/stream";
import { WebSerialBinding, WebSerialBindingInterface } from "serialport-bindings-webserial";

export async function openSerialPort(webSerialPort: SerialPort): Promise<AsyncSerialPort> {
	const port = new AsyncSerialPort(
		new SerialPortStream<WebSerialBindingInterface>({
			binding: WebSerialBinding,
			path: 'webserial://any',
			webSerialPort,
			baudRate: 115200,
			highWaterMark: 512 * 1024,
			webSerialOpenOptions: {
				bufferSize: 16 * 1024
			},
			autoOpen: false
		})
	);
	await port.open();
	return port;
}

export async function getSerialPort(portPath?: string): Promise<{ port: SerialPort; path: string; index: number; }> {
	if (!navigator.serial) {
		const errorMsg = [
			`WebSerial is not supported!`,
			`Please use Chromium based desktop browsers (Google Chrome, Microsoft Edge, Opera)`,
			`or «WebSerial for Firefox» plugin for Firefox.`
		];
		throw new Error(errorMsg.join(" "));
	}

	// Try to get previously used port
	let portIndex = 0;
	for (const p of await WebSerialBinding.list()) {
		if (p.path === portPath)
			return { port: p.nativePort, path: p.path, index: portIndex };
		portIndex++;
	}

	// Request new port if not found
	const webSerialPort = await navigator.serial.requestPort({});
	portIndex = 0;
	for (const p of await WebSerialBinding.list()) {
		if (p.nativePort === webSerialPort)
			return { port: p.nativePort, path: p.path, index: portIndex };
		portIndex++;
	}

	throw new Error(`Can't get SerialPort, internal error.`);
}
