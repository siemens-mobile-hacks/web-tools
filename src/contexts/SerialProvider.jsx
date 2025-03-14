/* @refresh reload */
import { createContext, useContext, createSignal, createEffect, onMount, onCleanup } from 'solid-js';
import { WebSerialBinding } from 'serialport-bindings-webserial';
import { createStoredSignal } from '~/storage';
import { SerialState } from '~/workers/SerialWorker';
import worker from '~/workers/SerialWorkerClient';

const SerialContext = createContext();

function useSerial() {
	const value = useContext(SerialContext);
	if (value === undefined)
		throw new Error("useSerial must be used within a <SerialProvider>!");
	return value;
}

function SerialProvider(props) {
	const [currentProtocol, setCurrentProtocol] = createSignal('none');
	const [readyState, setReadyState] = createSignal(false);
	const [connectError, setConnectError] = createSignal(null);
	const [ports, setPorts] = createSignal([]);
	const [lastUsedPort, setLastUsedPort] = createStoredSignal("lastUsedPort", null);

	const monitorNewPorts = async () => {
		setPorts(await WebSerialBinding.list());
	};

	const connect = async (protocol, prevPortPath, limitBaudrate) => {
		try {
			const [, portPath, portIndex] = await getSerialPort(prevPortPath);

			monitorNewPorts();
			setLastUsedPort(portPath);

			await worker.sendRequest("connect", { protocol, portIndex, limitBaudrate });
			setConnectError(null);
		} catch (e) {
			setConnectError(e);
			monitorNewPorts();
		}
	};

	const disconnect = async () => {
		await worker.sendRequest("disconnect", {});
		setConnectError(null);
	};

	const portIsExists = (path) => {
		if (path == 'webserial://any')
			return true;
		for (const port of ports()) {
			if (port.path == path)
				return true;
		}
		return false;
	};

	const enableDebug = (filter) => {
		worker.enableDebug(filter);
	};

	const onReadyStateChanged = (e) => setReadyState(e.readyState);
	const onCurrentProtocolChanged = (e) => setCurrentProtocol(e.currentProtocol);

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

	const state = {
		bfc: worker.getApiProxy("BFC"),
		cgsn: worker.getApiProxy("CGSN"),
		ports,
		lastUsedPort,
		portIsExists,
		readyState,
		connectError,
		connect,
		disconnect,
		enableDebug,
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
	for (const p of await WebSerialBinding.list()) {
		if (p.path === portPath)
			return [ p.nativePort, p.path, portIndex ];
		portIndex++;
	}

	// Request new port if not found
	const webSerialPort = await navigator.serial.requestPort({ });
	portIndex = 0;
	for (const p of await WebSerialBinding.list()) {
		if (p.nativePort === webSerialPort)
			return [ p.nativePort, p.path, portIndex ];
		portIndex++;
	}

	throw new Error(`Can't get SerialPort, internal error.`);
}

export { useSerial, SerialState };
export default SerialProvider;
