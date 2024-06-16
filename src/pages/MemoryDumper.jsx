import { createSignal, onMount, onCleanup, createEffect, Show, For, createMemo } from 'solid-js';
import { format as dateFormat, intervalToDuration } from 'date-fns';
import {
	Box, Button, Dialog, DialogActions,
	DialogContent, DialogContentText, DialogTitle,
	InputLabel, LinearProgress, MenuItem, Select, Stack, TextField
} from '@suid/material';

import Radio from '@suid/material/Radio';
import RadioGroup from '@suid/material/RadioGroup';
import FormControlLabel from '@suid/material/FormControlLabel';
import FormControl from '@suid/material/FormControl';
import CheckCircleOutlineIcon from '@suid/icons-material/CheckCircleOutline';

import SerialConnect from '~/components/SerialConnect';

import { useSerial, SerialState } from '~/contexts/SerialProvider'
import { sprintf } from 'sprintf-js';
import { downloadBlob } from '~/utils';

const DEFAULT_MEMORY_PRESETS = [
	{
		name:	'Custom',
		addr:	0xA0000000,
		size:	128 * 1024,
		descr:	'Any custom memory region.',
	}
];

function MemoryDumperPopup(props) {
	return (
		<Dialog
			open={props.state == 'download' || props.state == 'save'}
			onClose={() => {}}
			maxWidth="sm"
			fullWidth={true}
		>
			<DialogTitle>
				{sprintf("%08X", props.memoryAddr)} … {sprintf("%08X", props.memoryAddr + props.memorySize - 1)}
			</DialogTitle>

			<DialogContent>
				<Show when={props.state == 'download'}>
					<Box sx={{ justifyContent: 'space-between', display: 'flex' }}>
						<Box sx={{ color: 'text.secondary' }}>
							{props.progress.value} / {props.progress.total}, {props.progress.speed}
						</Box>
						<Box sx={{ color: 'text.secondary' }}>
							{formatDuration(props.progress.estimated)}
						</Box>
					</Box>
					<LinearProgress variant="determinate" value={props.progress.pct || 0} />
				</Show>

				<Show when={props.state == 'save'}>
					<DialogContentText mt={1}>
						<Switch>
							<Match when={props.readResult.error}>
								<Box sx={{ color: 'error.main' }}>
									Due to an error, only <b>{formatSize(props.readResult.readed)}</b> from <b>{formatSize(props.memorySize)}</b> {' '}
									was successfully read.<br />
									You can save this partial read result as a file.
								</Box>
							</Match>
							<Match when={props.readResult.canceled}>
								<Box sx={{ color: 'error.main' }}>
									Due to an interruption, only <b>{formatSize(props.readResult.readed)}</b> from <b>{formatSize(props.memorySize)}</b> {' '}
									was successfully read.<br />
									You can save this partial read result as a file.
								</Box>
							</Match>
							<Match when={props.readResult.success}>
								<Stack alignItems="center" direction="row" gap={1} sx={{ color: 'success.main' }}>
									<CheckCircleOutlineIcon />
									<span>
										Memory was successfully read in {' '}
										<b>{formatDuration(props.progress.elapsed)}</b> at a speed of {props.progress.speed}.
									</span>
								</Stack>
							</Match>
						</Switch>
					</DialogContentText>
				</Show>
			</DialogContent>
			<DialogActions>
				<Show when={props.state == 'save'}>
					<Button color="success" onClick={props.onFileSave}>
						Save as file
					</Button>
					<Button color="error" onClick={props.onClose}>
						Cancel
					</Button>
				</Show>
				<Show when={props.state == 'download'}>
					<Button color="error" onClick={props.onCancel}>
						Cancel
					</Button>
				</Show>
			</DialogActions>
		</Dialog>
	);
}

function MemoryDumper() {
	let serial = useSerial();
	let [memoryPresets, setMemoryPresets] = createSignal(DEFAULT_MEMORY_PRESETS);
	let [customMemoryAddr, setCustomMemoryAddr] = createSignal('A0000000');
	let [customMemorySize, setCustomMemorySize] = createSignal('00020000');
	let [customMemoryAddrError, setCustomMemoryAddrError] = createSignal(false);
	let [customMemorySizeError, setCustomMemorySizeError] = createSignal(false);
	let [memoryPresetId, setMemoryPresetId] = createSignal(0);
	let [progressValue, setProgressValue] = createSignal(null);
	let [state, setState] = createSignal('idle');
	let [readResult, setReadResult] = createSignal(null);
	let [phone, setPhone] = createSignal(null);

	let memoryPreset = createMemo(() => memoryPresets()[memoryPresetId()]);
	let memoryAddr = createMemo(() => {
		if (memoryPresetId() != 0) {
			return memoryPreset().addr;
		} else {
			return parseInt(customMemoryAddr(), 16);
		}
	});
	let memorySize = createMemo(() => {
		if (memoryPresetId() != 0) {
			return memoryPreset().size;
		} else {
			return parseInt(customMemorySize(), 16);
		}
	});
	let cgsnReady = createMemo(() => {
		return serial.readyState() == SerialState.CONNECTED && serial.protocol() == "CGSN";
	});

	createEffect(async () => {
		if (cgsnReady()) {
			let response = await serial.cgsn.getPhoneInfo();
			setMemoryPresets([
				...DEFAULT_MEMORY_PRESETS,
				...response.memoryRegions,
			]);
			setPhone(`${response.phoneModel}v${response.phoneSwVersion}`);
		}
	});

	let onClose = () => {
		setState('idle');
		setReadResult(null);
	};

	let onCancel = () => {
		serial.cgsn.abort();
	};

	let onFileSave = () => {
		let buffer = readResult().buffer.slice(0, readResult().readed);
		let fileName = (phone() ? `${phone()}_` : "") +
			(memoryPresetId() != 0 ? memoryPreset().name + "_" : '') +
			sprintf("%08X_%08X.bin", memoryAddr(), buffer.length);
		let blob = new Blob([buffer.buffer], { type: 'application/octet-stream' });
		downloadBlob(blob, fileName);
	};

	let onCustomMemoryAddrChanged = (e) => {
		setCustomMemoryAddrError(!validateHex(e.target.value));
		setCustomMemoryAddr(e.target.value);
	};

	let onCustomMemorySizeChanged = (e) => {
		setCustomMemorySizeError(!validateHex(e.target.value));
		setCustomMemorySize(e.target.value);
	};

	let startReadMemory = async () => {
		if (memoryPresetId() == 0) {
			if (customMemorySizeError() || customMemoryAddrError())
				return;
		}

		let onProgress = ({ value, total, elapsed }) => {
			let speed = elapsed > 0 ? value / (elapsed / 1000) : 0;
			setProgressValue({
				pct:		value / total * 100,
				valueHex:	sprintf("%08X", memoryAddr() + value),
				totalHex:	sprintf("%08X", memoryAddr() + total),
				value:		`${+(value / 1024).toFixed(0)} kB`,
				total:		`${+(total / 1024).toFixed(0)} kB`,
				speed:		`${+(speed / 1024).toFixed(1)} kB/s`,
				estimated:	Math.round((total - value) / speed),
				elapsed:	Math.round(elapsed / 1000),
			});
		};

		onProgress({ value: 0, total: memorySize(), elapsed: 0 });
		setState('download');

		serial.cgsn.on('memoryReadProgress', onProgress);

		try {
			let buffer = await serial.cgsn.readMemory(memoryAddr(), memorySize());
			setReadResult(buffer);
		} catch (e) {
			console.error(e);
		} finally {
			serial.cgsn.off('memoryReadProgress', onProgress);
			setState('save');
		}
	};

	return (
		<Box>
			<SerialConnect protocol="CGSN" />

			<FormControl>
				<RadioGroup row value={memoryPresetId()} onChange={(e) => setMemoryPresetId(e.target.value)}>
					<For each={memoryPresets()}>{(mem, index) =>
						<FormControlLabel value={index()} control={<Radio />} label={mem.name} />
					}</For>
				</RadioGroup>
			</FormControl>

			<Box sx={{ color: 'text.secondary', mb: 2 }}>
				{memoryPreset().descr}
			</Box>

			<Stack alignItems="center" direction="row" gap={1}>
				<Show when={memoryPresetId() == 0}>
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

				<Show when={memoryPresetId() != 0}>
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
		</Box>
	);
}

function formatDuration(seconds) {
	let duration = intervalToDuration({ start: 0, end: seconds * 1000 })
	return [ duration.hours, duration.minutes || 0, duration.seconds || 0 ]
		.filter((v) => v != null)
		.map((num) => String(num).padStart(2, '0'))
		.join(':');
}

function validateHex(value) {
	if (!value.match(/^([A-F0-9]+)$/i))
		return false;
	let num = parseInt(value, 16);
	return num <= 0xFFFFFFFF;
}

function formatSize(size) {
	if (size > 1024 * 1024) {
		return +(size / 1024 / 1024).toFixed(2) + " Mb";
	} else {
		return +(size / 1024).toFixed(2) + " kB";
	}
}

export default MemoryDumper;
