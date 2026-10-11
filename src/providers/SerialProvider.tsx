/* @refresh reload */
import * as Comlink from 'comlink';
import type { PortInfo } from '@serialport/bindings-interface';
import { Accessor, batch, createContext, createEffect, createMemo, createSignal, onCleanup, onMount, ParentComponent, Setter, useContext } from 'solid-js';
import { WebSerialBinding } from 'serialport-bindings-webserial';
import { WebUSBBinding } from 'serialport-bindings-webusb';
import { SerialProtocol, SerialReadyState, serialWorker } from '@/workers/endpoints/serial';
import { BfcService } from "@/workers/services/BfcService.js";
import { CgsnService } from "@/workers/services/CgsnService.js";
import { DwdService } from "@/workers/services/DwdService.js";
import { ObexService } from "@/workers/services/ObexService.js";
import { FlasherService } from "@/workers/services/FlasherService.js";
import { SerialService } from "@/workers/services/SerialService";
import { useApp } from "@/providers/AppProvider";
import { BfbService } from "@/workers/services/BfbService";
import { getAutoSerialPortPath, getAvailableSerialTransports, getDefaultSerialTransport } from '@/utils/serial';
import type { SerialTransport } from '@/utils/serial';
import { makePersistedSignal } from '@/utils/store/makePersistedSignal';

interface SerialContext {
	bfb: Comlink.Remote<BfbService>;
	bfc: Comlink.Remote<BfcService>;
	cgsn: Comlink.Remote<CgsnService>;
	dwd: Comlink.Remote<DwdService>;
	obex: Comlink.Remote<ObexService>;
	flasher: Comlink.Remote<FlasherService>;
	ports: Accessor<PortInfo[]>;
	availableTransports: Accessor<SerialTransport[]>;
	transport: Accessor<SerialTransport | undefined>;
	setTransport: Setter<SerialTransport>;
	readyState: Accessor<SerialReadyState>;
	connectError: Accessor<Error | undefined>;
	protocol: Accessor<string>;
	// The connected phone's name
	device: Accessor<string | undefined>;

	getAdapter(type: string): typeof SerialService<any>;
	getLastUsedPort(type: string): string | undefined;
	isPortExists(path: string): boolean;
	connect(protocol: SerialProtocol, prevPortPath?: string, limitBaudrate?: number, data?: any): Promise<void>;
	disconnect(): Promise<void>;
	resetError(): void;
}

const SerialContext = createContext<SerialContext | undefined>(undefined);

export function useSerial(): SerialContext {
	const value = useContext(SerialContext);
	if (value === undefined)
		throw new Error("useSerial must be used within a <SerialProvider>!");
	return value;
}

export const SerialProvider: ParentComponent = (props) => {
	const app = useApp();
	const [currentProtocol, setCurrentProtocol] = createSignal('none');
	const [readyState, setReadyState] = createSignal<SerialReadyState>(SerialReadyState.DISCONNECTED);
	const [connectError, setConnectError] = createSignal<Error | undefined>();
	const [device, setDevice] = createSignal<string | undefined>();
	const [ports, setPorts] = createSignal<PortInfo[]>([]);
	const [lastUsedPorts, setLastUsedPorts] = makePersistedSignal(createSignal<Record<string, string>>({}), { name: "lastUsedPorts" });
	const availableTransports = createMemo(getAvailableSerialTransports);
	const defaultTransport = getDefaultSerialTransport(availableTransports()) ?? 'webserial';
	const [preferredTransport, setTransport] = makePersistedSignal(createSignal<SerialTransport>(defaultTransport), {
		name: 'serialTransport'
	});
	const transport = createMemo(() => {
		const available = availableTransports();
		return available.includes(preferredTransport()) ? preferredTransport() : getDefaultSerialTransport(available);
	});

	let portListRequestId = 0;
	const monitorNewPorts = () => {
		const requestId = ++portListRequestId;
		const selectedTransport = transport();
		if (!selectedTransport) {
			setPorts([]);
			return;
		}
		const binding = selectedTransport === 'webusb' ? WebUSBBinding : WebSerialBinding;
		void binding.list().then((availablePorts) => {
			if (requestId === portListRequestId)
				setPorts(availablePorts);
		});
	};

	const connect = async (protocol: SerialProtocol, prevPortPath?: string, limitBaudrate?: number, data?: any): Promise<void> => {
		try {
			setConnectError(undefined);
			const selectedTransport = transport();
			let selectedPortPath: string | undefined;
			if (selectedTransport && prevPortPath?.startsWith(`${selectedTransport}://`)) {
				selectedPortPath = prevPortPath;
			} else if (selectedTransport) {
				selectedPortPath = getAutoSerialPortPath(selectedTransport);
			}
			await serialWorker.connect(protocol, selectedPortPath, limitBaudrate, data);
		} catch (e) {
			setConnectError(e instanceof Error ? e : new Error(String(e)));
			monitorNewPorts();
		}
	};

	const disconnect = async (): Promise<void> => {
		await serialWorker.disconnect();
		setConnectError(undefined);
		app.setStatus(undefined);
	};

	const isPortExists = (path: string): boolean => {
		const selectedTransport = transport();
		if (selectedTransport && path === getAutoSerialPortPath(selectedTransport))
			return true;
		for (const port of ports()) {
			if (port.path === path)
				return true;
		}
		return false;
	};

	const resetError = () => {
		setConnectError(undefined);
	};

	const onReadyStateChange = (readyState: SerialReadyState) => setReadyState(readyState);
	const onProtocolChange = (protocol: SerialProtocol) => setCurrentProtocol(protocol);
	const onSerialPortChange = (portPath: string) => {
		setLastUsedPorts((prev) => ({
			...prev,
			[currentProtocol()]: portPath,
		}));
		monitorNewPorts();
	};
	// Batched, so that the effects putting the device into a status of their own run after the name alone is set
	const onDeviceChange = (deviceName?: string) => batch(() => {
		setDevice(deviceName);
		app.setStatus(deviceName);
	});

	createEffect(() => {
		transport();
		setPorts([]);
		monitorNewPorts();
	});

	onMount(() => {
		serialWorker.on('deviceChange', onDeviceChange);
		serialWorker.on('readyStateChange', onReadyStateChange);
		serialWorker.on('protocolChange', onProtocolChange);
		serialWorker.on('serialPortChange', onSerialPortChange);
		if ('serial' in navigator) {
			navigator.serial.addEventListener("connect", monitorNewPorts);
			navigator.serial.addEventListener("disconnect", monitorNewPorts);
		}
		if ('usb' in navigator) {
			navigator.usb.addEventListener("connect", monitorNewPorts);
			navigator.usb.addEventListener("disconnect", monitorNewPorts);
		}
	});

	onCleanup(() => {
		serialWorker.off('deviceChange', onDeviceChange);
		serialWorker.off('readyStateChange', onReadyStateChange);
		serialWorker.off('protocolChange', onProtocolChange);
		serialWorker.off('serialPortChange', onSerialPortChange);
		if ('serial' in navigator) {
			navigator.serial.removeEventListener("connect", monitorNewPorts);
			navigator.serial.removeEventListener("disconnect", monitorNewPorts);
		}
		if ('usb' in navigator) {
			navigator.usb.removeEventListener("connect", monitorNewPorts);
			navigator.usb.removeEventListener("disconnect", monitorNewPorts);
		}
		void disconnect();
	});

	return (
		<SerialContext.Provider value={{
			bfb: serialWorker.getService("BFB"),
			bfc: serialWorker.getService("BFC"),
			cgsn: serialWorker.getService("CGSN"),
			dwd: serialWorker.getService("DWD"),
			obex: serialWorker.getService("OBEX"),
			flasher: serialWorker.getService("FLSH"),
			availableTransports,
			transport,
			setTransport,
			getAdapter(type: string) {
				switch (type) {
					case "BFB":
						return BfbService;
					case "BFC":
						return BfcService;
					case "CGSN":
						return CgsnService;
					case "DWD":
						return DwdService;
					case "OBEX":
						return ObexService;
					case "FLSH":
						return FlasherService;
				}
				throw new Error("Unknown protocol: " + currentProtocol());
			},
			getLastUsedPort(type: string) {
				return lastUsedPorts()[type];
			},
			ports,
			isPortExists,
			readyState,
			connectError,
			protocol: currentProtocol,
			device,

			connect,
			disconnect,
			resetError,
		}}>
			{props.children}
		</SerialContext.Provider>
	);
}
