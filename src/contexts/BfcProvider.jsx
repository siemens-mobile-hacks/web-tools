/* @refresh reload */
import { createContext, useContext, createSignal, onMount, onCleanup } from 'solid-js';
import { SerialPortStream } from '@serialport/stream';
import WebSerialBinding from 'serialport-bindings-webserial';

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

function BfcProvider(props) {
	let [readyState, setReadyState] = createSignal(false);
	let [connectError, setConnectError] = createSignal(null);

	let port;
	let bfc;

	let connect = async () => {
		if (readyState() == BfcState.CONNECTED)
			return;

		if (!navigator.serial) {
			setConnectError(new Error(`Your browser is not supporting WebSerial API.`));
			return;
		}

		setReadyState(BfcState.CONNECTING);
		try {
			// Open serial port
			port = await openSerialPort();

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

	onCleanup(() => disconnect());

	let state = {
		get api() {
			if (!bfc)
				throw new Error(`BFC is closed!`);
			return bfc;
		},
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

function openSerialPort() {
	return new Promise((resolve, reject) => {
		let port = new SerialPortStream({
			binding: WebSerialBinding,
			path: 'webserial://any',
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
