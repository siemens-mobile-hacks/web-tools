import debug from "debug";
import { SerialPortStream } from "@serialport/stream";
import WebSerialBinding from "serialport-bindings-webserial";
import { recursiveMap } from "~/utils";
import { BfcService } from "./BfcService";
import { CgsnService } from "./CgsnService";

export const SerialState = {
	DISCONNECTED:	0,
	CONNECTED:		1,
	CONNECTING:		2,
	DISCONNECTING:	3
};

let currentProtocol = 'none';
let readyState = SerialState.DISCONNECTED;
let service;

onmessage = async (e) => {
	let { requestId, method, data } = e.data;
	try {
		switch (method) {
			case "debug":
				debug.enable(data.filter);
				sendResponse(requestId, true);
			break;

			case "connect":
				sendResponse(requestId, await handleConnect(data.protocol, data.portIndex, data.limitBaudrate));
			break;

			case "disconnect":
				sendResponse(requestId, await handleDisconnect());
			break;

			case "rpc":
				if (readyState != SerialState.CONNECTED || data.protocol != service.protocol())
					throw new Error(`${data.protocol} is not connected!`);
				sendResponse(requestId, await handleProxy(service, data.method, data.methodArguments));
			break;

			default:
				throw new Error(`Unknown API method: ${method}`);
		}
	} catch (e) {
		sendResponse(requestId, e);
	}
};

async function handleConnect(protocol, portIndex, limitBaudrate) {
	if (readyState == SerialState.CONNECTED)
		await handleDisconnect();

	setCurrentProtocol(protocol);
	setReadyState(SerialState.CONNECTING);

	try {
		let availablePorts = await navigator.serial.getPorts();
		if (!availablePorts[portIndex])
			throw new Error(`Invalid port index ${portIndex}`);

		let port = await openSerialPort(availablePorts[portIndex]);
		switch (currentProtocol) {
			case "BFC":
				service = new BfcService(port);
				await service.connect();
			break;

			case "CGSN":
				service = new CgsnService(port);
				await service.connect();
			break;
		}

		setReadyState(SerialState.CONNECTED);
		return true;
	} catch (error) {
		console.error(`[SerialWorker] connect error`, error);
		await handleDisconnect();
		return error;
	}
}

async function handleDisconnect() {
	if (readyState == SerialState.DISCONNECTED)
		return true;

	setReadyState(SerialState.DISCONNECTING);

	if (service) {
		await service.disconnect();
		service = null;
	}

	setReadyState(SerialState.DISCONNECTED);
	setCurrentProtocol('none');

	return true;
}

async function handleProxy(api, method, methodArguments) {
	recursiveMap(methodArguments, (value) => {
		if (typeof value == 'object' && '__type__' in value && value.__type__ == 'function-proxy') {
			let event = `function-proxy-${value.id}`;
			let callback = (...args) => {
				postMessage({ event, args: args });
			};
			return callback;
		}
		return value;
	});
	return await api[method](...methodArguments);
}

function setCurrentProtocol(proto) {
	if (currentProtocol != proto) {
		currentProtocol = proto;
		postMessage({ event: 'currentProtocol', currentProtocol });
	}
}

function setReadyState(state) {
	if (readyState != state) {
		readyState = state;
		postMessage({ event: 'readyState', readyState });
	}
}

function sendResponse(requestId, response) {
	postMessage({ requestId, response });
}

function openSerialPort(webSerialPort) {
	return new Promise((resolve, reject) => {
		let port = new SerialPortStream({
			binding: WebSerialBinding,
			path: 'webserial://any',
			webSerialPort,
			baudRate: 115200,
			highWaterMark: 512 * 1024,
			webSerialOpenOptions: {
				bufferSize: 16 * 1024
			}
		});

		let onOpen = () => {
			port.off('open', onOpen);
			port.off('error', onError);
			resolve(port);
		};

		let onError = (err) => {
			port.off('open', onOpen);
			port.off('error', onError);
			reject(err);
		};

		port.once('open', onOpen);
		port.once('error', onError);
	});
}
