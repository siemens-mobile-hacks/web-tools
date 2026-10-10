import { Component, createEffect, createMemo, createSignal, For, on, Show } from 'solid-js';
import {
	Alert,
	Box,
	Button,
	Checkbox,
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
import ReportGmailerrorredIcon from '@suid/icons-material/ReportGmailerrorred';
import SettingsIcon from '@suid/icons-material/Settings';
import { useSerial } from '@/providers/SerialProvider.js';
import { makePersisted } from "@solid-primitives/storage";
import type { PortInfo } from '@serialport/bindings-interface';
import { SerialProtocol, SerialReadyState } from '@/workers/endpoints/serial';
import { useTheme } from "@suid/material/styles";
import { ButtonLoadingText } from "@/components/UI/ButtonLoadingText";
import { PopperWithArrow } from "@/components/UI/PopperWithArrow";
import { getUSBDeviceName } from "@sie-js/serial";
import { getAutoSerialPortPath } from '@/utils/serial';

interface SerialConnectProps {
	protocol: SerialProtocol;
}

export const SerialConnect: Component<SerialConnectProps> = (props) => {
	const theme = useTheme();
	const [currentBaudrate, setCurrentBaudrate] = makePersisted(createSignal<number>(0), {
		name: 'limitMaxBaudrate' + props.protocol
	});
	const [serialDebug, setSerialDebug] = makePersisted(createSignal<string[]>([]), {
		name: 'serialDebugFilter'
	});
	const [selectedSerialPort, setSelectedSerialPort] = createSignal<string>('');
	const [showSettings, setShowSettings] = createSignal<boolean>(false);
	const serial = useSerial();

	let popperAnchorRef!: HTMLDivElement;
	let settingsAnchorRef!: HTMLButtonElement;

	const handleConnect = (): void => {
		const debugFilter = serialDebug().join(',');
		void serial.connect(props.protocol, currentSerialPort(), currentBaudrate(), debugFilter);
	};

	const handleDisconnect = (): void => {
		void serial.disconnect();
	};
	const handleTransportChange = (value: string): void => {
		if (value === 'webserial' || value === 'webusb')
			serial.setTransport(value);
	};
	const autoSerialPortPath = createMemo(() => {
		const transport = serial.transport();
		return transport ? getAutoSerialPortPath(transport) : '';
	});

	createEffect(on(
		[serial.readyState, () => serial.getLastUsedPort(props.protocol), serial.transport],
		([_, port, transport]) => {
			const autoPortPath = transport ? getAutoSerialPortPath(transport) : '';
			setSelectedSerialPort(port?.startsWith(`${transport}://`) ? port : autoPortPath);
		}
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

	const currentSerialPort = createMemo(() => {
		if (serial.isPortExists(selectedSerialPort()))
			return selectedSerialPort();
		return autoSerialPortPath();
	});

	const invalidProtocol = createMemo(() =>
		serial.protocol() !== props.protocol &&
		(serial.readyState() === SerialReadyState.CONNECTED || serial.readyState() === SerialReadyState.CONNECTING)
	);

	return (
		<Stack alignItems="center" gap={1} direction="row" alignContent="center">
			<Show
				when={!invalidProtocol()}
				fallback={
					<Stack alignItems="center" direction="row" gap={1}>
						<Typography color="error.main">
							<Stack alignItems="center" direction="row" gap={1}>
								<ReportGmailerrorredIcon />
								<Typography>Already connected to <b>{serial.protocol()}</b>.</Typography>
							</Stack>
						</Typography>
						<Button size="small" variant="contained" color="error" onClick={handleDisconnect}>Disconnect</Button>
					</Stack>
				}
			>
				<FormControl
					ref={popperAnchorRef}
					sx={{ minWidth: 120 }}
					size="small"
					disabled={serial.readyState() !== SerialReadyState.DISCONNECTED || !serial.transport()}
				>
					<InputLabel id="serial-port-selector-label">Port</InputLabel>
					<Select
						labelId="serial-port-selector-label"
						size="small"
						value={currentSerialPort()}
						id="serial-port-selector"
						label="Port"
						onChange={(e) => setSelectedSerialPort(e.target.value)}
					>
						<MenuItem value={autoSerialPortPath()}>
							Auto
						</MenuItem>
						<For each={serial.ports()}>{(port) => <MenuItem value={port.path}>{serialPortName(port)}</MenuItem>}</For>
					</Select>
				</FormControl>

				<PopperWithArrow
					open={!!serial.connectError()}
					placement="bottom"
					anchorEl={popperAnchorRef}
					arrowColor={theme.palette.error.dark}
				>
					<Alert
						severity="error"
						variant="filled"
						onClose={() => serial.resetError()}
					>
						ERROR: {serial.connectError()?.message}<br />
						Try reconnecting the data cable if you are sure that your phone is connected and online.
					</Alert>
				</PopperWithArrow>

				<Button
					ref={settingsAnchorRef}
					sx={{ minWidth: 0, padding: '6px' }}
					variant="outlined"
					title="Settings"
					onClick={() => setShowSettings(true)}
					disabled={serial.readyState() !== SerialReadyState.DISCONNECTED}
				>
					<SettingsIcon />
				</Button>

				<Show when={serial.readyState() === SerialReadyState.DISCONNECTED || serial.readyState() === SerialReadyState.CONNECTING}>
					<Button
						variant="contained"
						disabled={serial.readyState() !== SerialReadyState.DISCONNECTED || !serial.transport()}
						onClick={handleConnect}
					>
						<ButtonLoadingText loading={serial.readyState() === SerialReadyState.CONNECTING}>
							Connect
						</ButtonLoadingText>
					</Button>
				</Show>

				<Show when={serial.readyState() === SerialReadyState.CONNECTED || serial.readyState() === SerialReadyState.DISCONNECTING}>
					<Button
						variant="contained"
						color="error"
						disabled={serial.readyState() !== SerialReadyState.CONNECTED}
						onClick={handleDisconnect}
					>
						<ButtonLoadingText loading={serial.readyState() === SerialReadyState.DISCONNECTING}>
							Disconnect
						</ButtonLoadingText>
					</Button>
				</Show>
			</Show>

			<Popover
				open={showSettings()}
				anchorEl={settingsAnchorRef}
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

					<Stack pt={2} gap={2}>
						<FormControl
							size="small"
							disabled={serial.readyState() !== SerialReadyState.DISCONNECTED || serial.availableTransports().length === 0}
						>
							<InputLabel id="serial-transport-selector-label">Transport</InputLabel>
							<Select
								labelId="serial-transport-selector-label"
								id="serial-transport-selector"
								label="Transport"
								size="small"
								value={serial.transport() ?? ''}
								onChange={(e) => handleTransportChange(e.target.value)}
							>
								<For each={serial.availableTransports()}>{(transport) =>
									<MenuItem value={transport}>
										{transport === 'webusb' ? 'WebUSB' : 'WebSerial'}
									</MenuItem>
								}</For>
							</Select>
						</FormControl>

						<FormControl size="small" disabled={serial.readyState() !== SerialReadyState.DISCONNECTED}>
							<InputLabel id="serial-baudrate-selector-label">Baudrate</InputLabel>
							<Select
								labelId="serial-baudrate-selector-label"
								size="small" value={currentBaudrate()} id="serial-baudrate-selector"
								label="Baudrate"
								onChange={(e) => setCurrentBaudrate(Number(e.target.value))}
							>
								<For each={serial.getAdapter(props.protocol).getBaudrates()}>{(item) =>
									<MenuItem value={item.value}>
										{item.name}
									</MenuItem>
								}</For>
							</Select>
						</FormControl>

						<Box>
							<For each={serial.getAdapter(props.protocol).getDebugFilters()}>{(item) =>
								<FormGroup>
									<FormControlLabel
										control={
											<Checkbox
												onChange={() => toggleDebug(item.filter)}
												checked={serialDebug().includes(item.filter)}
											/>
										}
										label={item.name}
									/>
								</FormGroup>
							}</For>
						</Box>
					</Stack>
				</Box>
			</Popover>
		</Stack>
	);
}

function serialPortName(port: PortInfo): string {
	const url = new URL(port.path);
	const instance = url.searchParams.get('n') ?? url.searchParams.get('instance');
	const postfix = Number(instance ?? '') > 0 ? ` (${instance})` : '';
	if (port.vendorId && port.productId) {
		const vid = parseInt(port.vendorId, 16);
		const pid = parseInt(port.productId, 16);
		return getUSBDeviceName(vid, pid) ?? `USB ${sprintf("%04X:%04X", vid, pid)}${postfix}`;
	} else if (url.hostname === "bluetooth") {
		return `BT #${url.searchParams.get("n")}`;
	}
	return `PORT #${url.searchParams.get("n")}`;
}
