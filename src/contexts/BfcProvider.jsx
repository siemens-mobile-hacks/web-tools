/* @refresh reload */
import { createContext, useContext, createSignal, createEffect, onMount, onCleanup } from 'solid-js';
import { SerialPortStream } from '@serialport/stream';
import { WebSerialPort, WebSerialBinding } from 'serialport-bindings-webserial';
import { createStoredSignal } from '../storage';

import { BFC } from '@sie-js/serial';

const BfcState = {
	DISCONNECTED:	0,
	CONNECTED:		1,
	CONNECTING:		2,
	DISCONNECTING:	3
};

let BfcContext = createContext();
let port;
let bfcBus;
let bfcChannel;

function useBFC() {
	let value = useContext(BfcContext);
	if (value === undefined)
		throw new Error("useBFC must be used within a <BfcProvider>!");
	return value;
}

async function findPortInfo(nativePort) {
	let allPortsList = await WebSerialBinding.list();
	for (let port of allPortsList) {
		if (port.nativePort == nativePort)
			return port;
	}
	return null;
}

function BfcProvider(props) {
	let [readyState, setReadyState] = createSignal(false);
	let [connectError, setConnectError] = createSignal(null);
	let [ports, setPorts] = createSignal([]);
	let [lastUsedPort, setLastUsedPort] = createStoredSignal("lastUsedPort", null);

	let port;
	let bfc;
	let recheckTimer;

	let monitorNewPorts = async () => {
		setPorts(await WebSerialBinding.list());
	};

	let connect = async (serialPortURI) => {
		if (readyState() == BfcState.CONNECTED)
			return;

		setReadyState(BfcState.CONNECTING);
		try {
			// Open serial port
			port = await openSerialPort(serialPortURI);

			monitorNewPorts();

			if (port.port && 'getNativePort' in port.port) {
				let portPath = await WebSerialBinding.getPortPath(await port.port.getNativePort());
				setLastUsedPort(portPath);
			}

			// Connect to BFC
			bfc = new BFC(port);
			await bfc.connect();
			await bfc.setBestBaudrate();

			// For debug
			window.BFC = bfc;
			window.Buffer = Buffer;

			setReadyState(BfcState.CONNECTED);
			setConnectError(null);
		} catch (e) {
			console.error(e);
			await disconnect();
			setConnectError(e);
			monitorNewPorts();
		}
	};

	let disconnect = async () => {
		if (readyState() == BfcState.DISCONNECTED)
			return;

		setReadyState(BfcState.DISCONNECTING);
		try {
			if (bfc) {
				await bfc.disconnect();
				bfc.destroy();
				bfc = null;
			}

			if (port) {
				await port.close();
				port = null;
			}
		} catch (e) {
			console.error(e);
		} finally {
			setConnectError(null);
			setReadyState(BfcState.DISCONNECTED);
		}
	};

	let portIsExists = (path) => {
		if (path == 'webserial://any')
			return true;
		for (let port of ports()) {
			if (port.path == path)
				return true;
		}
		return false;
	};

	onMount(() => {
		if (navigator.serial) {
			navigator.serial.addEventListener("connect", monitorNewPorts);
			navigator.serial.addEventListener("disconnect", monitorNewPorts);
			monitorNewPorts();
		}
	});

	onCleanup(() => {
		if (navigator.serial) {
			navigator.serial.removeEventListener("connect", monitorNewPorts);
			navigator.serial.removeEventListener("disconnect", monitorNewPorts);
		}
		disconnect()
	});

	let state = {
		get api() {
			if (!bfc)
				throw new Error(`BFC is closed!`);
			return bfc;
		},
		ports,
		lastUsedPort,
		portIsExists,
		readyState,
		connectError,
		connect,
		disconnect
	};

	return (
		<BfcContext.Provider value={state}>
			{props.children}
		</BfcContext.Provider>
	);
}

function openSerialPort(serialPortURI) {
	return new Promise((resolve, reject) => {
		let port = new SerialPortStream({
			binding: WebSerialBinding,
			path: serialPortURI || 'webserial://any',
			baudRate: 115200,
			highWaterMark: 512 * 1024,
			webSerialOpenOptions: {
				bufferSize: 4 * 1024
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

export { useBFC, BfcState };
export default BfcProvider;
