/* @refresh reload */
import * as Comlink from 'comlink';
import { Accessor, createContext, createSignal, onCleanup, onMount, ParentComponent, useContext } from 'solid-js';
import { WebSerialBinding, WebSerialPortInfo } from 'serialport-bindings-webserial';
import { SerialProtocol, SerialReadyState, serialWorker } from '@/workers/SerialWorker.js';
import { makePersisted } from "@solid-primitives/storage";
import { BfcService } from "@/workers/services/BfcService.js";
import { CgsnService } from "@/workers/services/CgsnService.js";

interface SerialContext {
	bfc: Comlink.Remote<BfcService>;
	cgsn: Comlink.Remote<CgsnService>;
	ports: Accessor<WebSerialPortInfo[]>;
	lastUsedPort: Accessor<string | undefined>;
	readyState: Accessor<SerialReadyState>;
	connectError: Accessor<Error | undefined>;
	protocol: Accessor<string>;

	isPortExists: (path: string) => boolean;
	connect: (protocol: SerialProtocol, prevPortPath?: string, limitBaudrate?: number, debug?: string) => Promise<void>;
	disconnect: () => Promise<void>;
}

const SerialContext = createContext<SerialContext | undefined>(undefined);

export function useSerial(): SerialContext {
	const value = useContext(SerialContext);
	if (value === undefined)
		throw new Error("useSerial must be used within a <SerialProvider>!");
	return value;
}

export const SerialProvider: ParentComponent = (props) => {
	const [currentProtocol, setCurrentProtocol] = createSignal('none');
	const [readyState, setReadyState] = createSignal<SerialReadyState>(SerialReadyState.DISCONNECTED);
	const [connectError, setConnectError] = createSignal<Error | undefined>();
	const [ports, setPorts] = createSignal<WebSerialPortInfo[]>([]);
	const [lastUsedPort, setLastUsedPort] = makePersisted(createSignal<string | undefined>(), { name: "lastUsedPort" });

	const monitorNewPorts = () => {
		WebSerialBinding.list().then(setPorts);
	};

	const connect = async (protocol: SerialProtocol, prevPortPath?: string, limitBaudrate?: number, debug?: string): Promise<void> => {
		try {
			await serialWorker.connect(protocol, prevPortPath, limitBaudrate, debug);
			setConnectError(undefined);
		} catch (e) {
			setConnectError(e as Error);
			monitorNewPorts();
		}
	};

	const disconnect = async (): Promise<void> => {
		await serialWorker.disconnect();
		setConnectError(undefined);
	};

	const isPortExists = (path: string): boolean => {
		if (path === 'webserial://any')
			return true;
		for (const port of ports()) {
			if (port.path === path)
				return true;
		}
		return false;
	};

	const onReadyStateChange = (readyState: SerialReadyState) => setReadyState(readyState);
	const onProtocolChange = (protocol: SerialProtocol) => setCurrentProtocol(protocol);
	const onSerialPortChange = (portPath: string) => {
		setLastUsedPort(portPath);
		monitorNewPorts();
	};

	onMount(() => {
		serialWorker.on('readyStateChange', onReadyStateChange);
		serialWorker.on('protocolChange', onProtocolChange);
		serialWorker.on('serialPortChange', onSerialPortChange);
		if (navigator.serial) {
			navigator.serial.addEventListener("connect", monitorNewPorts);
			navigator.serial.addEventListener("disconnect", monitorNewPorts);
			monitorNewPorts();
		}
	});

	onCleanup(() => {
		serialWorker.off('readyStateChange', onReadyStateChange);
		serialWorker.off('protocolChange', onProtocolChange);
		serialWorker.off('serialPortChange', onSerialPortChange);
		if (navigator.serial) {
			navigator.serial.removeEventListener("connect", monitorNewPorts);
			navigator.serial.removeEventListener("disconnect", monitorNewPorts);
		}
		void disconnect();
	});

	return (
		<SerialContext.Provider value={{
			bfc: serialWorker.getService("BFC"),
			cgsn: serialWorker.getService("CGSN"),
			ports,
			lastUsedPort,
			isPortExists,
			readyState,
			connectError,
			protocol: currentProtocol,

			connect,
			disconnect,
		}}>
			{props.children}
		</SerialContext.Provider>
	);
}
