import { Component, createEffect, createMemo, createSignal, For, on, Show } from 'solid-js';
import {
	Alert,
	Box,
	Button,
	Checkbox,
	FormControl,
	FormControlLabel,
	FormGroup,
	FormLabel,
	IconButton,
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
import type { PortInfo } from '@serialport/bindings-interface';
import { SerialProtocol, SerialReadyState } from '@/workers/endpoints/serial';
import { useTheme } from "@suid/material/styles";
import { ButtonLoadingText } from "@/components/UI/ButtonLoadingText";
import { PopperWithArrow } from "@/components/UI/PopperWithArrow";
import { getUSBDeviceName } from "@sie-js/serial";
import { getAutoSerialPortPath } from '@/utils/serial';
import {
	SERIALPORT_DEBUG_PATTERN,
	TRX_DEBUG_PATTERN,
} from '@/utils/debugChannels';
import { useDebugSettings } from '@/store/debugSettings';
import { makePersistedSignal } from '@/utils/store/makePersistedSignal';

interface SerialConnectProps {
	protocol: SerialProtocol;
}

export const SerialConnect: Component<SerialConnectProps> = (props) => {
	const theme = useTheme();
	const [currentBaudrate, setCurrentBaudrate] = makePersistedSignal(createSignal<number>(0), {
		name: 'limitMaxBaudrate' + props.protocol
	});
	const [, debugSettings] = useDebugSettings();
	const [selectedSerialPort, setSelectedSerialPort] = createSignal<string>('');
	const [settingsAnchor, setSettingsAnchor] = createSignal<HTMLButtonElement>();
	const serial = useSerial();

	let popperAnchorRef!: HTMLDivElement;

	const handleConnect = (): void => {
		void serial.connect(props.protocol, currentSerialPort(), currentBaudrate());
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
		<Stack
			alignItems="center"
			gap={1}
			direction="row"
			alignContent="center"
			sx={{ width: { xs: '100%', sm: 'auto' }, minWidth: 0 }}
		>
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
						<Button
							variant="contained"
							color="error"
							onClick={handleDisconnect}
							sx={{ height: 40 }}
						>
							Disconnect
						</Button>
					</Stack>
				}
			>
				<FormControl
					ref={popperAnchorRef}
					sx={{
						minWidth: 0,
						width: { xs: 'auto', sm: 160 },
						flexGrow: { xs: 1, sm: 0 },
						flexShrink: 1,
					}}
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

				<IconButton
					color="primary"
					title="Settings"
					aria-label="Settings"
					onClick={(event) => setSettingsAnchor(event.currentTarget)}
					disabled={serial.readyState() !== SerialReadyState.DISCONNECTED}
				>
					<SettingsIcon />
				</IconButton>

				<Show when={serial.readyState() === SerialReadyState.DISCONNECTED || serial.readyState() === SerialReadyState.CONNECTING}>
					<Button
						variant="contained"
						disabled={serial.readyState() !== SerialReadyState.DISCONNECTED || !serial.transport()}
						onClick={handleConnect}
						sx={{ height: 40 }}
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
						sx={{ height: 40 }}
					>
						<ButtonLoadingText loading={serial.readyState() === SerialReadyState.DISCONNECTING}>
							Disconnect
						</ButtonLoadingText>
					</Button>
				</Show>
			</Show>

			<Popover
				open={!!settingsAnchor()}
				anchorEl={settingsAnchor()}
				onClose={() => setSettingsAnchor(undefined)}
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
								size="small"
								value={currentBaudrate()}
								id="serial-baudrate-selector"
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

						<FormControl component="fieldset" variant="standard">
							<FormLabel component="legend">Debug logging</FormLabel>
							<FormGroup>
								<FormControlLabel
									control={
										<Checkbox
											checked={debugSettings.isChannelEnabled(TRX_DEBUG_PATTERN)}
											onChange={(_, checked) => debugSettings.setChannelEnabled(
												TRX_DEBUG_PATTERN,
												checked,
											)}
										/>
									}
									label="Protocol traffic"
								/>
								<FormControlLabel
									control={
										<Checkbox
											checked={debugSettings.isChannelEnabled(SERIALPORT_DEBUG_PATTERN)}
											onChange={(_, checked) => debugSettings.setChannelEnabled(
												SERIALPORT_DEBUG_PATTERN,
												checked,
											)}
										/>
									}
									label="Serial port internals"
								/>
							</FormGroup>
						</FormControl>
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
