import * as Comlink from 'comlink';
import { createEffect, createMemo, createSignal, For, JSX, Match, Show, Switch } from 'solid-js';
import { intervalToDuration } from 'date-fns/intervalToDuration';
import {
	Alert,
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
	FormControl,
	FormControlLabel,
	Grid,
	LinearProgress,
	Link,
	List,
	ListItem,
	Radio,
	RadioGroup,
	Stack,
	TextField
} from '@suid/material';
import CheckCircleOutlineIcon from '@suid/icons-material/CheckCircleOutline';
import { SerialConnect } from '../../components/SerialConnect';
import { useSerial } from '../../contexts/SerialProvider';
import { sprintf } from 'sprintf-js';
import { downloadBlob } from '../../utils';
import { SerialReadyState } from "../../workers/SerialWorker";
import { MemoryRegion } from "../../workers/services/CgsnService";
import { CgsnReadMemoryResponse, IoReadWriteProgress } from "../../../../node-sie-serial/src";

type MemoryDownloadState = 'idle' | 'download' | 'save';

interface ProgressInfo {
	percent: number;
	cursorHex: string;
	totalHex: string;
	cursor: string;
	total: string;
	speed: string;
	remaining: number;
	elapsed: number;
}

const DEFAULT_MEMORY_PRESETS: MemoryRegion[] = [
	{
		name: 'Custom',
		addr: 0xA0000000,
		size: 128 * 1024,
		descr: 'Any custom memory region.',
	}
];

function formatDuration(seconds: number): string {
	const duration = intervalToDuration({ start: 0, end: seconds * 1000 });
	return [duration.hours, duration.minutes || 0, duration.seconds || 0]
		.filter((v) => v != null)
		.map((num) => String(num).padStart(2, '0'))
		.join(':');
}

function validateHex(value: string): boolean {
	if (!value.match(/^([A-F0-9]+)$/i))
		return false;
	const num = parseInt(value, 16);
	return num <= 0xFFFFFFFF;
}

function formatSize(size: number): string {
	if (size > 1024 * 1024) {
		return +(size / 1024 / 1024).toFixed(2) + " Mb";
	} else {
		return +(size / 1024).toFixed(2) + " kB";
	}
}

interface MemoryDumperPopupProps {
	memoryAddr: number;
	memorySize: number;
	progress?: ProgressInfo;
	readResult?: CgsnReadMemoryResponse;
	state: MemoryDownloadState;
	onClose: () => void;
	onCancel: () => void;
	onFileSave: () => void;
}

function MemoryDumperPopup(props: MemoryDumperPopupProps): JSX.Element {
	return (
		<Dialog
			open={props.state === 'download' || props.state === 'save'}
			onClose={() => {}}
			maxWidth="sm"
			fullWidth={true}
		>
			<DialogTitle>
				{sprintf("%08X", props.memoryAddr)} … {sprintf("%08X", props.memoryAddr + props.memorySize - 1)}
			</DialogTitle>

			<DialogContent>
				<Show when={props.state === 'download' && props.progress}>
					<Box sx={{ justifyContent: 'space-between', display: 'flex' }}>
						<Box sx={{ color: 'text.secondary' }}>
							{props.progress?.cursor} / {props.progress?.total}, {props.progress?.speed}
						</Box>
						<Box sx={{ color: 'text.secondary' }}>
							{formatDuration(props.progress?.remaining || 0)}
						</Box>
					</Box>
					<LinearProgress variant="determinate" value={props.progress?.percent || 0} />
				</Show>

				<Show when={props.state === 'save' && props.readResult}>
					<DialogContentText>
						<Switch>
							<Match when={props.readResult?.error}>
								<Box sx={{ color: 'error.main' }}>
									Due to an error, only <b>{formatSize(props.readResult?.buffer?.length ?? 0)}</b> from <b>{formatSize(props.memorySize)}</b> {' '}
									was successfully read.<br />
									You can save this partial read result as a file.
								</Box>
							</Match>
							<Match when={props.readResult?.canceled}>
								<Box sx={{ color: 'error.main' }}>
									Due to an interruption, only <b>{formatSize(props.readResult?.buffer?.length ?? 0)}</b> from <b>{formatSize(props.memorySize)}</b> {' '}
									was successfully read.<br />
									You can save this partial read result as a file.
								</Box>
							</Match>
							<Match when={props.readResult?.success}>
								<Stack alignItems="center" direction="row" gap={1} sx={{ color: 'success.main' }}>
									<CheckCircleOutlineIcon />
									<span>
										Memory was successfully read in {' '}
										<b>{formatDuration(props.progress?.elapsed || 0)}</b> at a speed of {props.progress?.speed}.
									</span>
								</Stack>
							</Match>
						</Switch>
					</DialogContentText>
				</Show>
			</DialogContent>
			<DialogActions>
				<Show when={props.state === 'save'}>
					<Button color="success" onClick={props.onFileSave}>
						Save as file
					</Button>
					<Button color="error" onClick={props.onClose}>
						Cancel
					</Button>
				</Show>
				<Show when={props.state === 'download'}>
					<Button color="error" onClick={props.onCancel}>
						Cancel
					</Button>
				</Show>
			</DialogActions>
		</Dialog>
	);
}

export default function MemoryDumperPage(): JSX.Element {
	const serial = useSerial();
	const [memoryPresets, setMemoryPresets] = createSignal<MemoryRegion[]>(DEFAULT_MEMORY_PRESETS);
	const [customMemoryAddr, setCustomMemoryAddr] = createSignal<string>('A0000000');
	const [customMemorySize, setCustomMemorySize] = createSignal<string>('00020000');
	const [customMemoryAddrError, setCustomMemoryAddrError] = createSignal<boolean>(false);
	const [customMemorySizeError, setCustomMemorySizeError] = createSignal<boolean>(false);
	const [memoryPresetId, setMemoryPresetId] = createSignal<number>(0);
	const [progressValue, setProgressValue] = createSignal<ProgressInfo | undefined>();
	const [state, setState] = createSignal<MemoryDownloadState>('idle');
	const [readResult, setReadResult] = createSignal<CgsnReadMemoryResponse | undefined>();
	const [phone, setPhone] = createSignal<string | undefined>();

	const memoryPreset = createMemo<MemoryRegion>(() => memoryPresets()[memoryPresetId()]);
	const memoryAddr = createMemo<number>(() => {
		if (memoryPresetId() !== 0) {
			return memoryPreset().addr;
		} else {
			return parseInt(customMemoryAddr(), 16);
		}
	});
	const memorySize = createMemo<number>(() => {
		if (memoryPresetId() !== 0) {
			return memoryPreset().size;
		} else {
			return parseInt(customMemorySize(), 16);
		}
	});
	const cgsnReady = createMemo<boolean>(() => {
		return serial.readyState() === SerialReadyState.CONNECTED && serial.protocol() === "CGSN";
	});

	createEffect(async () => {
		if (cgsnReady()) {
			const response = await serial.cgsn.getPhoneInfo();
			setMemoryPresets([
				...DEFAULT_MEMORY_PRESETS,
				...response?.memoryRegions ?? [],
			]);
			setPhone(`${response?.phoneModel ?? "??"}v${response?.phoneSwVersion ?? "??"}`);
		}
	});

	const onClose = (): void => {
		setState('idle');
		setReadResult(undefined);
	};

	const onCancel = (): void => {
		void serial.cgsn.abort();
	};

	const onFileSave = (): void => {
		const result = readResult();
		if (!result || !result.success)
			return;

		const buffer = result.buffer.subarray(0, result.buffer.length);
		const fileName = (phone() ? `${phone()}_` : "") +
			(memoryPresetId() !== 0 ? memoryPreset().name + "_" : '') +
			sprintf("%08X_%08X.bin", memoryAddr(), buffer.length);
		const blob = new Blob([new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)], { type: 'application/octet-stream' });
		downloadBlob(blob, fileName);
	};

	const onCustomMemoryAddrChanged = (e: { target: { value: string } }): void => {
		setCustomMemoryAddrError(!validateHex(e.target.value));
		setCustomMemoryAddr(e.target.value);
	};

	const onCustomMemorySizeChanged = (e: { target: { value: string } }): void => {
		setCustomMemorySizeError(!validateHex(e.target.value));
		setCustomMemorySize(e.target.value);
	};

	const startReadMemory = async (): Promise<void> => {
		if (memoryPresetId() === 0) {
			if (customMemorySizeError() || customMemoryAddrError())
				return;
		}

		const onProgress = (e: IoReadWriteProgress): void => {
			setProgressValue({
				percent: e.cursor / e.total * 100,
				cursorHex: sprintf("%08X", memoryAddr() + e.cursor),
				totalHex: sprintf("%08X", memoryAddr() + e.total),
				cursor: `${+(e.cursor / 1024).toFixed(0)} kB`,
				total: `${+(e.total / 1024).toFixed(0)} kB`,
				speed: `${+(e.speed / 1024).toFixed(1)} kB/s`,
				remaining: e.remaining,
				elapsed: Math.round(e.elapsed / 1000),
			});
		};

		setState('download');

		try {
			setReadResult(await serial.cgsn.readMemory(memoryAddr(), memorySize(), Comlink.proxy(onProgress)));
		} catch (e) {
			console.error(e);
		} finally {
			setState('save');
		}
	};

	return (
		<Box>
			<Show when={serial.connectError()}>
				<Grid item xs={12} mt={1} mb={2} order={0}>
					<Alert severity="error">
						ERROR: {serial.connectError()?.message}<br />
						Try reconnecting the data cable if you are sure that your phone is connected and online.
					</Alert>
				</Grid>
			</Show>

			<SerialConnect protocol="CGSN" />

			<FormControl>
				<RadioGroup row value={memoryPresetId()} onChange={(e) => setMemoryPresetId(Number(e.target.value))}>
					<For each={memoryPresets()}>{(mem, index) =>
						<FormControlLabel value={index()} control={<Radio />} label={mem.name} />
					}</For>
				</RadioGroup>
			</FormControl>

			<Box sx={{ color: 'text.secondary', mb: 2 }}>
				{memoryPreset().descr}
			</Box>

			<Stack alignItems="center" direction="row" gap={1}>
				<Show when={memoryPresetId() === 0}>
					<TextField
						error={customMemoryAddrError()}
						size="small" label="Address (HEX)" variant="outlined"
						value={customMemoryAddr()} onChange={onCustomMemoryAddrChanged}
					/>
					<TextField
						error={customMemorySizeError()}
						size="small" label="Size (HEX)" variant="outlined"
						value={customMemorySize()} onChange={onCustomMemorySizeChanged}
					/>
				</Show>

				<Show when={memoryPresetId() !== 0}>
					<TextField
						size="small" label="Address (HEX)" variant="outlined"
						value={sprintf("%08X", memoryAddr())} disabled={true}
					/>
					<TextField
						error={customMemorySizeError()}
						size="small" label="Size (HEX)" variant="outlined"
						value={sprintf("%08X (%s)", memorySize(), formatSize(memorySize()))} disabled={true}
					/>
				</Show>
			</Stack>

			<Stack alignItems="center" direction="row" gap={1} sx={{ mt: 2 }}>
				<Button variant="outlined" onClick={startReadMemory} disabled={!cgsnReady()}>
					Read memory
				</Button>
			</Stack>

			<MemoryDumperPopup
				memoryAddr={memoryAddr()}
				memorySize={memorySize()}
				progress={progressValue()}
				readResult={readResult()}
				state={state()}
				onClose={onClose}
				onCancel={onCancel}
				onFileSave={onFileSave}
			/>

			<Alert severity="info" sx={{ mt: 2 }}>
				<b>TIPS & TRICKS:</b>

				<List sx={{ listStyleType: 'disc' }}>
					<ListItem sx={{ display: 'list-item' }}>
						<Link href="https://siemens-mobile-hacks.github.io/reverse-engineering/arm-debugger.html" target="_blank" rel="noopener">
							CGSN patch is required.
						</Link>
					</ListItem>
					<ListItem sx={{ display: 'list-item' }}>
						You can achieve maximum speed using a DCA-540 or DCA-510 data cables.
					</ListItem>
					<ListItem sx={{ display: 'list-item' }}>
						Bluetooth is also possible, but has the worst speed.
					</ListItem>
					<ListItem sx={{ display: 'list-item' }}>
						It is better to read memory before ArmDebugger is used.
					</ListItem>
					<ListItem sx={{ display: 'list-item' }}>
						<Link href="https://siemens-mobile-hacks.github.io/reverse-engineering/memory-dump" target="_blank" rel="noopener">
							Read more about memory dumping.
						</Link>
					</ListItem>
				</List>
			</Alert>
		</Box>
	);
}
