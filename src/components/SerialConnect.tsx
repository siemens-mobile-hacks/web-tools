import { Component, createMemo, createSignal, For, on, Show } from 'solid-js';
import {
	Box,
	Button,
	Checkbox,
	CircularProgress,
	FormControl,
	FormControlLabel,
	FormGroup,
	InputLabel,
	MenuItem,
	Popover,
	Select,
	Stack,
	Typography
} from '@suid/material';
import { sprintf } from 'sprintf-js';
import UsbIcon from '@suid/icons-material/Usb';
import UsbOffIcon from '@suid/icons-material/UsbOff';
import ReportGmailerrorredIcon from '@suid/icons-material/ReportGmailerrorred';
import SettingsIcon from '@suid/icons-material/Settings';
import { useSerial } from '@/contexts/SerialProvider.js';
import { makePersisted } from "@solid-primitives/storage";
import { WebSerialPortInfo } from "serialport-bindings-webserial";
import { SerialProtocol, SerialReadyState } from '@/workers/SerialWorker.js';

const USB_DEVICES: Record<string, string> = {
	"067B:2303": "PL2303",
	"1A86:7523": "CH340",
	"0403:6001": "FT232",
	"10C4:EA60": "СР2102",
	"11F5:0004": "DCA-540",
	"11F5:1004": "DCA-540",
};

interface SerialConnectProps {
	protocol: SerialProtocol;
}

export const SerialConnect: Component<SerialConnectProps> = (props) => {
	const [currentBaudrate, setCurrentBaudrate] = makePersisted(createSignal<number>(0), { name: 'limitMaxBaudrate' });
	const [serialDebug, setSerialDebug] = makePersisted(createSignal<string[]>([]), { name: 'serialDebugFilter' });
	const [selectedSerialPort, setSelectedSerialPort] = createSignal<string>('webserial://any');
	const [showSettings, setShowSettings] = createSignal<boolean>(false);
	const [showSettingsAnchor, setShowSettingsAnchor] = createSignal<HTMLElement | null>(null);
	const serial = useSerial();

	const handleConnect = (): void => {
		const debugFilter = serialDebug().join(',');
		void serial.connect(props.protocol, currentSerialPort(), currentBaudrate(), debugFilter);
	};

	const handleDisconnect = (): void => {
		void serial.disconnect();
	};

	createMemo(on(
		[serial.readyState, serial.lastUsedPort],
		() => setSelectedSerialPort(serial.lastUsedPort() ?? 'webserial://any')
	));

	const toggleDebug = (type: string): void => {
		let debugFilter = [...serialDebug()];
		const value = debugFilter.includes(type);
		if (value) {
			debugFilter = debugFilter.filter((v) => v !== type);
		} else {
			debugFilter.push(type);
		}
		setSerialDebug(debugFilter);
	};

	const currentSerialPort = createMemo(on(
		[serial.ports, selectedSerialPort],
		() => serial.isPortExists(selectedSerialPort()) ? selectedSerialPort() : 'webserial://any'
	));

	const invalidProtocol = createMemo(() =>
		serial.protocol() !== props.protocol &&
		(serial.readyState() === SerialReadyState.CONNECTED || serial.readyState() === SerialReadyState.CONNECTING)
	);

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
				<Show when={serial.readyState() === SerialReadyState.CONNECTED}>
					<UsbIcon />
				</Show>

				<Show when={serial.readyState() === SerialReadyState.DISCONNECTED}>
					<UsbOffIcon />
				</Show>

				<Show when={serial.readyState() === SerialReadyState.CONNECTING || serial.readyState() === SerialReadyState.DISCONNECTING}>
					<CircularProgress size="1.5rem" />
				</Show>

				<Show when={serial.ports()}>
					<FormControl sx={{ minWidth: 120 }} size="small" disabled={serial.readyState() !== SerialReadyState.DISCONNECTED}>
						<InputLabel id="serial-port-selector-label">Port</InputLabel>
						<Select
							labelId="serial-port-selector-label"
							size="small"
							value={currentSerialPort()}
							id="serial-port-selector"
							label="Port"
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
							onClick={(e) => {
								setShowSettingsAnchor(e.currentTarget);
								setShowSettings(true);
							}}
							sx={{ minWidth: 0 }} disabled={serial.readyState() !== SerialReadyState.DISCONNECTED}
						>
							<SettingsIcon />
						</Button>
					</FormControl>

					<Popover
						open={showSettings()}
						anchorEl={showSettingsAnchor()}
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
								<FormControl size="small" disabled={serial.readyState() !== SerialReadyState.DISCONNECTED}>
									<InputLabel id="serial-baudrate-selector-label">Baudrate</InputLabel>
									<Select
										labelId="serial-baudrate-selector-label"
										size="small" value={currentBaudrate()} id="serial-baudrate-selector"
										label="Baudrate"
										onChange={(e) => setCurrentBaudrate(Number(e.target.value))}
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
										control={<Checkbox onChange={() => toggleDebug('atc')} checked={serialDebug().includes('atc')} />}
										label="AT debug"
									/>
								</FormGroup>

								<Show when={props.protocol === 'BFC'}>
									<FormGroup>
										<FormControlLabel
											control={<Checkbox onChange={() => toggleDebug('bfc')} checked={serialDebug().includes('bfc')} />}
											label="BFC debug"
										/>
									</FormGroup>
								</Show>

								<Show when={props.protocol === 'CGSN'}>
									<FormGroup>
										<FormControlLabel
											control={<Checkbox onChange={() => toggleDebug('cgsn')} checked={serialDebug().includes('cgsn')} />}
											label="CGSN debug"
										/>
									</FormGroup>
								</Show>
							</Box>
						</Box>
					</Popover>
				</Show>

				<Show when={serial.readyState() === SerialReadyState.DISCONNECTED || serial.readyState() === SerialReadyState.CONNECTING}>
					<FormControl variant="standard" sx={{ m: 1 }}>
						<Button variant="contained"
								disabled={serial.readyState() !== SerialReadyState.DISCONNECTED}
								onClick={handleConnect}>Connect</Button>
					</FormControl>
				</Show>

				<Show when={serial.readyState() === SerialReadyState.CONNECTED || serial.readyState() === SerialReadyState.DISCONNECTING}>
					<FormControl variant="standard" sx={{ m: 1 }}>
						<Button variant="contained" color="error"
								disabled={serial.readyState() !== SerialReadyState.CONNECTED}
								onClick={handleDisconnect}>Disconnect</Button>
					</FormControl>
				</Show>
			</Show>
		</Stack>
	);
}

function serialPortName(port: WebSerialPortInfo): string {
	const url = new URL(port.path);
	if (url.hostname === "usb") {
		const key = sprintf("%04X:%04X", port.vendorId, port.productId);
		if (key in USB_DEVICES)
			return `${USB_DEVICES[key]} #${url.searchParams.get("n")}`;
		return `USB ${key} #${url.searchParams.get("n")}`;
	} else if (url.hostname === "bluetooth") {
		return `BT #${url.searchParams.get("n")}`;
	}
	return `PORT #${url.searchParams.get("n")}`;
}
