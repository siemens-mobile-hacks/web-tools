import { on, createSignal, createMemo, createEffect } from 'solid-js';
import { sprintf } from 'sprintf-js';
import debug from "debug";

import FormControl from '@suid/material/FormControl';
import Button from '@suid/material/Button';
import CircularProgress from '@suid/material/CircularProgress';
import MenuItem from '@suid/material/MenuItem';
import Select from '@suid/material/Select';
import InputLabel from '@suid/material/InputLabel';

import UsbIcon from '@suid/icons-material/Usb';
import UsbOffIcon from '@suid/icons-material/UsbOff';
import ReportGmailerrorredIcon from '@suid/icons-material/ReportGmailerrorred';
import SettingsIcon from '@suid/icons-material/Settings';

import { useSerial, SerialState } from '~/contexts/SerialProvider';
import { createStoredSignal } from '~/storage';
import { Box, Checkbox, FormControlLabel, FormGroup, Popover, Stack, Typography } from '@suid/material';

const USB_DEVICES = {
	"067B:2303":	"PL2303",
	"1A86:7523":	"CH340",
	"0403:6001":	"FT232",
	"10C4:EA60":	"СР2102",
	"11F5:0004":	"DCA-540",
	"11F5:1004":	"DCA-540",
};

function SerialConnect(props) {
	let [currentBaudrate, setCurrentBaudrate] = createStoredSignal('limitMaxBaudrate', 0);
	let [serialDebug, setSerialDebug] = createStoredSignal('serialDebug', false);
	let [selectedSerialPort, setSelectedSerialPort] = createSignal('webserial://any');
	let [showSettings, setShowSettings] = createSignal(false);
	let showSettingsAnchor;
	let serial = useSerial();

	let handleConnect = () => {
		serial.connect(props.protocol, currentSerialPort(), currentBaudrate());
	};

	let handleDisconnect = () => {
		serial.disconnect();
	};

	createEffect(() => {
		setSelectedSerialPort(serial.lastUsedPort());
	});

	createEffect(() => {
		let debugFilter = serialDebug() ? 'cgsn,bfc' : '';
		console.log(debugFilter);
		debug.enable(debugFilter);
		serial.enableDebug(debugFilter);
	});

	let currentSerialPort = createMemo(on(
		[serial.ports, selectedSerialPort],
		() => serial.portIsExists(selectedSerialPort()) ? selectedSerialPort() : 'webserial://any'
	));

	let invalidProtocol = createMemo(() => serial.protocol() != props.protocol && (serial.readyState() == SerialState.CONNECTED || serial.readyState() == SerialState.CONNECTING));

	return (
		<Stack alignItems="center" gap={1} direction="row">
			<Show when={invalidProtocol()}>
				<Stack alignItems="center" direction="row" gap={1}>
					<Typography color="error.main">
						<Stack alignItems="center" direction="row" gap={1}>
							<ReportGmailerrorredIcon />
							<Typography>Already connected to <b>{serial.protocol()}</b>.</Typography>
						</Stack>
					</Typography>
					<Button size="small" variant="contained" color="error" onClick={handleDisconnect}>Disconnect</Button>
				</Stack>
			</Show>

			<Show when={!invalidProtocol()}>
				<Show when={serial.readyState() == SerialState.CONNECTED}>
					<UsbIcon />
				</Show>

				<Show when={serial.readyState() == SerialState.DISCONNECTED}>
					<UsbOffIcon />
				</Show>

				<Show when={serial.readyState() == SerialState.CONNECTING || serial.readyState() == SerialState.DISCONNECTING}>
					<CircularProgress size="1.5rem" />
				</Show>

				<Show when={serial.ports()}>
					<FormControl sx={{ minWidth: 120 }} size="small" disabled={serial.readyState() != SerialState.DISCONNECTED}>
						<InputLabel htmlFor="serial-port-selector">Port</InputLabel>
						<Select size="small" value={currentSerialPort()} id="serial-port-selector" label="Port"
							onChange={(e) => setSelectedSerialPort(e.target.value)}
						>
							<MenuItem value="webserial://any">
								Auto
							</MenuItem>
							<For each={serial.ports()}>{(port) => <MenuItem value={port.path}>{serialPortName(port)}</MenuItem>}</For>
						</Select>
					</FormControl>

					<FormControl variant="standard">
						<Button variant="outlined" title="Settings"
							onClick={() => setShowSettings(true)}
							sx={{ minWidth: 0 }} disabled={serial.readyState() != SerialState.DISCONNECTED}
							ref={showSettingsAnchor}
						>
							<SettingsIcon />
						</Button>
					</FormControl>

					<Popover
						open={showSettings()}
						anchorEl={showSettingsAnchor}
						onClose={() => setShowSettings(false)}
						anchorOrigin={{
							vertical: 'bottom',
							horizontal: 'left',
						}}
					>
						<Box p={2}>
							<Typography variant="h6">
								Advanced settings
							</Typography>

							<Box pt={2}>
								<FormControl size="small" disabled={serial.readyState() != SerialState.DISCONNECTED}>
									<InputLabel htmlFor="serial-baudrate-selector">Baudrate</InputLabel>
									<Select size="small" value={currentBaudrate()} id="serial-baudrate-selector" label="Baudrate"
										onChange={(e) => setCurrentBaudrate(e.target.value)}
									>
										<MenuItem value={0}>
											Maximum
										</MenuItem>
										<MenuItem value={921600}>
											{'≤ 921600'}
										</MenuItem>
										<MenuItem value={230400}>
											{'≤ 230400'}
										</MenuItem>
										<MenuItem value={115200}>
											{'≤ 115200'}
										</MenuItem>
									</Select>
								</FormControl>
								<FormGroup>
									<FormControlLabel
										control={<Checkbox onChange={(e) => setSerialDebug(!serialDebug())} />} checked={serialDebug()}
										label="Serial debug"
									/>
								</FormGroup>
							</Box>
						</Box>
					</Popover>
				</Show>

				<Show when={serial.readyState() == SerialState.DISCONNECTED || serial.readyState() == SerialState.CONNECTING}>
					<FormControl variant="standard" sx={{ m: 1 }}>
						<Button variant="contained"
							disabled={serial.readyState() != SerialState.DISCONNECTED}
							onClick={handleConnect}>Connect</Button>
					</FormControl>
				</Show>

				<Show when={serial.readyState() == SerialState.CONNECTED || serial.readyState() == SerialState.DISCONNECTING}>
					<FormControl variant="standard" sx={{ m: 1 }}>
						<Button variant="contained" color="error"
							disabled={serial.readyState() != SerialState.CONNECTED}
							onClick={handleDisconnect}>Disconnect</Button>
					</FormControl>
				</Show>
			</Show>
		</Stack>
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

export default SerialConnect;
