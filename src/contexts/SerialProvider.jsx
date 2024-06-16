/* @refresh reload */
import { createContext, useContext, createSignal, createEffect, onMount, onCleanup } from 'solid-js';
import { SerialPortStream } from '@serialport/stream';
import { WebSerialBinding } from 'serialport-bindings-webserial';
import { createStoredSignal } from '~/storage';

import { BFC, CGSN } from '@sie-js/serial';

const SerialState = {
	DISCONNECTED:	0,
	CONNECTED:		1,
	CONNECTING:		2,
	DISCONNECTING:	3
};

let SerialContext = createContext();

function useSerial() {
	let value = useContext(SerialContext);
	if (value === undefined)
		throw new Error("useSerial must be used within a <SerialProvider>!");
	return value;
}

function SerialProvider(props) {
	let [currentProtocol, setCurrentProtocol] = createSignal('none');
	let [readyState, setReadyState] = createSignal(false);
	let [connectError, setConnectError] = createSignal(null);
	let [ports, setPorts] = createSignal([]);
	let [lastUsedPort, setLastUsedPort] = createStoredSignal("lastUsedPort", null);

	let port;
	let bfc;
	let cgsn;

	let monitorNewPorts = async () => {
		setPorts(await WebSerialBinding.list());
	};

	let connect = async (protocol, serialPortURI, maximumSpeed) => {
		if (readyState() == SerialState.CONNECTED)
			return;

		setCurrentProtocol(protocol);
		setReadyState(SerialState.CONNECTING);
		try {
			// Open serial port
			port = await openSerialPort(serialPortURI);

			monitorNewPorts();

			if (port.port && 'getNativePort' in port.port) {
				let portPath = await WebSerialBinding.getPortPath(await port.port.getNativePort());
				setLastUsedPort(portPath);
			}

			switch (currentProtocol()) {
				case "BFC":
					// Connect to BFC
					bfc = new BFC(port);
					await bfc.connect();
					await bfc.setBestBaudrate(maximumSpeed);

					// For debug
					window.BFC = bfc;
					window.Buffer = Buffer;
				break;

				case "CGSN":
					// Connect to CGSN
					cgsn = new CGSN(port);
					if (!await cgsn.connect())
						throw new Error(`CGSN connection error.`);
					await cgsn.setBestBaudrate(maximumSpeed);

					// For debug
					window.CGSN = cgsn;
					window.Buffer = Buffer;
				break;
			}

			setReadyState(SerialState.CONNECTED);
			setConnectError(null);
		} catch (e) {
			console.error(`BFC connection error`, e);
			await disconnect();
			setConnectError(e);
			monitorNewPorts();
		}
	};

	let disconnect = async () => {
		if (readyState() == SerialState.DISCONNECTED)
			return;

		setReadyState(SerialState.DISCONNECTING);

		switch (currentProtocol()) {
			case "BFC":
				if (bfc) {
					await bfc.disconnect();
					bfc.destroy();
					bfc = null;
				}
			break;

			case "CGSN":
				if (cgsn) {
					await cgsn.disconnect();
					cgsn.destroy();
					cgsn = null;
				}
			break;
		}

		try {
			if (port?.isOpen) {
				await port.close();
			}
		} catch (e) {
			console.error(`Port close error`, e);
		} finally {
			port = null;
		}

		setConnectError(null);
		setReadyState(SerialState.DISCONNECTED);
		setCurrentProtocol('none');
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
		get bfc() {
			if (!bfc)
				throw new Error(`BFC is closed!`);
			return bfc;
		},
		get cgsn() {
			if (!cgsn)
				throw new Error(`CGSN is closed!`);
			return cgsn;
		},
		ports,
		lastUsedPort,
		portIsExists,
		readyState,
		connectError,
		connect,
		disconnect,
		protocol: currentProtocol,
	};

	return (
		<SerialContext.Provider value={state}>
			{props.children}
		</SerialContext.Provider>
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

export { useSerial, SerialState };
export default SerialProvider;
