import { AsyncSerialPort } from '@sie-js/serial';
import { WebSerialBinding } from 'serialport-bindings-webserial';
import { WEBUSB_SERIAL_FILTERS, WebUSBBinding } from 'serialport-bindings-webusb';

export type SerialTransport = 'webserial' | 'webusb';

export function getAvailableSerialTransports(): SerialTransport[] {
	const transports: SerialTransport[] = [];
	if ('serial' in navigator)
		transports.push('webserial');
	if ('usb' in navigator)
		transports.push('webusb');
	return transports;
}

export function getDefaultSerialTransport(availableTransports: SerialTransport[]): SerialTransport | undefined {
	const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
	const prefersWebUSB = /Android/.test(navigator.userAgent) || isIOS;
	if (prefersWebUSB && availableTransports.includes('webusb'))
		return 'webusb';
	return availableTransports[0];
}

export function getAutoSerialPortPath(transport: SerialTransport): string {
	return `${transport}://any`;
}

export async function resolveSerialPortPath(path: string): Promise<string> {
	if (path.startsWith('webserial://')) {
		if (!('serial' in navigator))
			throw new Error('WebSerial is not supported by this browser.');
		if (path !== getAutoSerialPortPath('webserial')) {
			const ports = await WebSerialBinding.list();
			const existingPort = ports.find((port) => port.path === path);
			if (existingPort)
				return existingPort.path;
		}

		const selectedPort = await navigator.serial.requestPort({});
		const port = (await WebSerialBinding.list()).find((item) => item.nativePort === selectedPort);
		if (port)
			return port.path;
	} else if (path.startsWith('webusb://')) {
		if (!('usb' in navigator))
			throw new Error('WebUSB is not supported by this browser.');
		if (path !== getAutoSerialPortPath('webusb')) {
			const ports = await WebUSBBinding.list();
			const existingPort = ports.find((port) => port.path === path);
			if (existingPort)
				return existingPort.path;
		}

		const selectedDevice = await navigator.usb.requestDevice({
			filters: [...WEBUSB_SERIAL_FILTERS],
		});
		const port = (await WebUSBBinding.list()).find((item) => item.nativeDevice === selectedDevice);
		if (port)
			return port.path;
	} else {
		throw new Error(`Unsupported serial port path: ${path}`);
	}

	throw new Error(`Can't resolve serial port path.`);
}

export async function openSerialPort(path: string): Promise<AsyncSerialPort> {
	let port: AsyncSerialPort;
	if (path.startsWith('webusb://')) {
		port = new AsyncSerialPort({
			binding: WebUSBBinding,
			path,
			baudRate: 115200,
			highWaterMark: 512 * 1024,
		});
	} else if (path.startsWith('webserial://')) {
		port = new AsyncSerialPort({
			binding: WebSerialBinding,
			path,
			baudRate: 115200,
			highWaterMark: 512 * 1024,
			webSerialOpenOptions: {
				bufferSize: 16 * 1024,
			},
		});
	} else {
		throw new Error(`Unsupported serial port path: ${path}`);
	}
	await port.open();
	return port;
}
