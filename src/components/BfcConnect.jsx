import { on, createSignal, createMemo, createEffect } from 'solid-js';
import { sprintf } from 'sprintf-js';

import FormControl from '@suid/material/FormControl';
import Stack from '@suid/material/Stack';
import Button from '@suid/material/Button';
import CircularProgress from '@suid/material/CircularProgress';
import LinearProgress from '@suid/material/LinearProgress';
import MenuItem from '@suid/material/MenuItem';
import Select from '@suid/material/Select';
import InputLabel from '@suid/material/InputLabel';
import ListSubheader from '@suid/material/ListSubheader';

import UsbIcon from '@suid/icons-material/Usb';
import UsbOffIcon from '@suid/icons-material/UsbOff';
import TvIcon from '@suid/icons-material/Tv';

import { useBFC, BfcState } from '~/contexts/BfcProvider';

const USB_DEVICES = {
	"067B:2303":	"PL2303",
	"1A86:7523":	"CH340",
	"0403:6001"		"FT232",
	"10C4:EA60":	"СР2102",
	"11F5:0004":	"DCA-540",
	"11F5:1004":	"DCA-540",
};

function BfcConnect(props) {
	let [currentBaudrate, setCurrentBaudrate] = createSignal('auto');
	let [selectedSerialPort, setSelectedSerialPort] = createSignal('webserial://any');
	let bfc = useBFC();

	let handleConnect = () => {
		bfc.connect(currentSerialPort());
	};

	let handleDisconnect = () => {
		bfc.disconnect();
	};

	createEffect(() => {
		if (bfc.readyState() == BfcState.CONNECTED)
			setSelectedSerialPort(bfc.lastUsedPort());
	});

	let currentSerialPort = createMemo(on(
		[bfc.ports, selectedSerialPort],
		() => bfc.portIsExists(selectedSerialPort()) ? selectedSerialPort() : 'webserial://any'
	));

	return (
		<>
			<Show when={bfc.readyState() == BfcState.CONNECTED}>
				<UsbIcon />
			</Show>

			<Show when={bfc.readyState() == BfcState.DISCONNECTED}>
				<UsbOffIcon />
			</Show>

			<Show when={bfc.readyState() == BfcState.CONNECTING || bfc.readyState() == BfcState.DISCONNECTING}>
				<CircularProgress size="1.5rem" />
			</Show>

			<Show when={bfc.ports()}>
				<FormControl sx={{ m: 1, minWidth: 120 }} size="small" disabled={bfc.readyState() != BfcState.DISCONNECTED}>
					<InputLabel htmlFor="serial-port-selector">Port</InputLabel>
					<Select size="small" value={currentSerialPort()} id="serial-port-selector" label="Port"
						onChange={(e) => setSelectedSerialPort(e.target.value)}
					>
						<MenuItem value="webserial://any">
							Auto
						</MenuItem>
						<For each={bfc.ports()}>{(port) => <MenuItem value={port.path}>{serialPortName(port)}</MenuItem>}</For>
					</Select>
				</FormControl>
			</Show>

			<Show when={bfc.readyState() == BfcState.DISCONNECTED || bfc.readyState() == BfcState.CONNECTING}>
				<FormControl variant="standard" sx={{ m: 1 }}>
					<Button variant="contained"
						disabled={bfc.readyState() != BfcState.DISCONNECTED}
						onClick={handleConnect}>Connect</Button>
				</FormControl>
			</Show>

			<Show when={bfc.readyState() == BfcState.CONNECTED || bfc.readyState() == BfcState.DISCONNECTING}>
				<FormControl variant="standard" sx={{ m: 1 }}>
					<Button variant="contained" color="error"
						disabled={bfc.readyState() != BfcState.CONNECTED}
						onClick={handleDisconnect}>Disconnect</Button>
				</FormControl>
			</Show>
		</>
	);
}

function serialPortName(port) {
	let url = new URL(port.path);
	if (url.pathname == "//usb") {
		let key = sprintf("%04X:%04X", port.vendorId, port.productId);
		if ((key in USB_DEVICES))
			return `${USB_DEVICES[key]} #${url.searchParams.get("n")}`;
		return `USB ${key} #${url.searchParams.get("n")}`;
	} else if (url.pathname == "//bluetooth") {
		return `BT #${url.searchParams.get("n")}`;
	}
	return `PORT #${url.searchParams.get("n")}`;
}

export default BfcConnect;
