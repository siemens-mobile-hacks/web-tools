/* @refresh reload */
import { createContext, useContext, createSignal, createEffect, onMount, onCleanup } from 'solid-js';
import { WebSerialBinding } from 'serialport-bindings-webserial';
import { createStoredSignal } from '~/storage';
import { SerialState } from '~/workers/SerialWorker';
import worker from '~/workers/SerialWorkerClient';

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

	let bfc;
	let cgsn;

	let monitorNewPorts = async () => {
		setPorts(await WebSerialBinding.list());
	};

	let connect = async (protocol, prevPortPath, limitBaudrate) => {
		try {
			let [, portPath, portIndex] = await getSerialPort(prevPortPath);

			monitorNewPorts();
			setLastUsedPort(portPath);

			await worker.sendRequest("connect", { protocol, portIndex, limitBaudrate });
			setConnectError(null);
		} catch (e) {
			setConnectError(e);
			monitorNewPorts();
		}
	};

	let disconnect = async () => {
		await worker.sendRequest("disconnect", {});
		setConnectError(null);
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

	let onReadyStateChanged = (e) => setReadyState(e.readyState);
	let onCurrentProtocolChanged = (e) => setCurrentProtocol(e.currentProtocol);

	onMount(() => {
		worker.on('readyState', onReadyStateChanged);
		worker.on('currentProtocol', onCurrentProtocolChanged);

		if (navigator.serial) {
			navigator.serial.addEventListener("connect", monitorNewPorts);
			navigator.serial.addEventListener("disconnect", monitorNewPorts);
			monitorNewPorts();
		}
	});

	onCleanup(() => {
		worker.off('readyState', onReadyStateChanged);
		worker.off('currentProtocol', onCurrentProtocolChanged);

		if (navigator.serial) {
			navigator.serial.removeEventListener("connect", monitorNewPorts);
			navigator.serial.removeEventListener("disconnect", monitorNewPorts);
		}
		disconnect()
	});

	let state = {
		bfc: worker.getApiProxy("BFC"),
		cgsn: worker.getApiProxy("CGSN"),
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

async function getSerialPort(portPath) {
	// Try to get previously used port
	let portIndex = 0;
	for (let p of await WebSerialBinding.list()) {
		if (p.path === portPath)
			return [ p.nativePort, p.path, portIndex ];
		portIndex++;
	}

	// Request new port if not found
	let webSerialPort = await navigator.serial.requestPort({ });
	portIndex = 0;
	for (let p of await WebSerialBinding.list()) {
		if (p.nativePort === webSerialPort)
			return [ p.nativePort, p.path, portIndex ];
		portIndex++;
	}

	throw new Error(`Can't get SerialPort, internal error.`);
}

export { useSerial, SerialState };
export default SerialProvider;
