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

const MEMORY_PRESETS = [
	{
		name:	'Custom',
		addr:	0xA0000000,
		size:	128 * 1024,
		sizes:	[],
		descr:	'Any custom memory region.',
	}, {
		name:	'RAM',
		addr:	0xA8000000,
		sizes:	[16 * 1024 * 1024, 8 * 1024 * 1024],
		descr:	'External RAM. See "Total Size" in Developer > MOPI > System Memory. Select the closest value.',
	}, {
		name:	'SRAM',
		addr:	0x00080000,
		sizes:	[96 * 1024],
		descr:	'Built-in memory in the CPU, used by low-level firmware components.',
	}, {
		name:	'TCM',
		addr:	0x00000000,
		sizes:	[16 * 1024],
		descr:	'Built-in memory in the CPU, used for IRQ handlers.',
	}, {
		name:	'VMALLOC #1',
		addr:	0xAC000000,
		sizes:	[16 * 1024 * 1024],
		descr:	'Virtual memory for malloc(). Only ELKA or NSG.',
	}, {
		name:	'VMALLOC #2',
		addr:	0xAD000000,
		sizes:	[16 * 1024 * 1024],
		descr:	'Virtual memory for malloc(). Only ELKA or NSG.',
	}, {
		name:	'BROM',
		addr:	0x00400000,
		sizes:	[32 * 1024],
		descr:	'Built-in 1st stage bootloader firmware in the CPU (ROM).',
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
	let [customMemoryAddr, setCustomMemoryAddr] = createSignal('A0000000');
	let [customMemorySize, setCustomMemorySize] = createSignal('00020000');
	let [customMemoryAddrError, setCustomMemoryAddrError] = createSignal(false);
	let [customMemorySizeError, setCustomMemorySizeError] = createSignal(false);
	let [presetMemorySize, setPresetMemorySize] = createSignal(0);
	let [memoryPresetId, setMemoryPresetId] = createSignal(0);
	let [progressValue, setProgressValue] = createSignal(null);
	let [state, setState] = createSignal('idle');
	let [readResult, setReadResult] = createSignal(null);
	let [phone, setPhone] = createSignal(null);
	let abortController;

	let memoryPreset = createMemo(() => MEMORY_PRESETS[memoryPresetId()]);
	let memoryAddr = createMemo(() => {
		if (memoryPresetId() != 0) {
			return memoryPreset().addr;
		} else {
			return parseInt(customMemoryAddr(), 16);
		}
	});
	let memorySize = createMemo(() => {
		if (memoryPresetId() != 0) {
			return presetMemorySize();
		} else {
			return parseInt(customMemorySize(), 16);
		}
	});
	let cgsnReady = createMemo(() => {
		return serial.readyState() == SerialState.CONNECTED && serial.protocol() == "CGSN";
	});

	createEffect(async () => {
		let response;
		if (cgsnReady()) {
			let phoneModel, phoneSwVer;

			response = await serial.cgsn.atc.sendCommand("AT+CGMM");
			if (response.success)
				phoneModel = response.lines[0];

			response = await serial.cgsn.atc.sendCommand("AT+CGMR");
			if (response.success)
				phoneSwVer = response.lines[0];

			if (phoneModel && phoneSwVer) {
				setPhone(`${phoneModel}v${phoneSwVer}`);
			}
		}
	});

	createEffect(() => {
		if (memoryPreset().sizes.length > 0) {
			setPresetMemorySize(memoryPreset().sizes[0]);
		}
	});

	let onClose = () => {
		setState('idle');
		setReadResult(null);
	};

	let onCancel = () => {
		abortController.abort();
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
		let onProgress = (value, total, elapsed) => {
			let speed = elapsed > 0 ? value / (elapsed / 1000) : 0;
			setProgressValue({
				pct:		value / total * 100,
				valueHex:	sprintf("%08X", memoryAddr() + value),
				totalHex:	sprintf("%08X", memoryAddr() + total),
				value:		`${+(value / 1024).toFixed(0)} Kb`,
				total:		`${+(total / 1024).toFixed(0)} Kb`,
				speed:		`${+(speed / 1024).toFixed(1)} Kb/s`,
				estimated:	Math.round((total - value) / speed),
				elapsed:	Math.round(elapsed / 1000),
			});
		};

		onProgress(0, memorySize(), 0);
		setState('download');

		try {
			abortController = new AbortController();
			let buffer = await serial.cgsn.readMemory(memoryAddr(), memorySize(), {
				signal: abortController.signal,
				onProgress,
			});
			setReadResult(buffer);
		} catch (e) {
			console.error(e);
		} finally {
			setState('save');
		}
	};

	return (
		<Box>
			<SerialConnect protocol="CGSN" />

			<FormControl>
				<RadioGroup row value={memoryPresetId()} onChange={(e) => setMemoryPresetId(e.target.value)}>
					<For each={MEMORY_PRESETS}>{(mem, index) =>
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
				</Show>

				<Show when={memoryPresetId() != 0}>
					<FormControl sx={{ minWidth: 230 }} size="small" disabled={memoryPreset().sizes.length == 1}>
						<InputLabel htmlFor="size-selector">Size</InputLabel>
						<Select value={memorySize()} onChange={(e) => setPresetMemorySize(e.target.value)} size="small" id="size-selector" label="Size">
							<For each={memoryPreset().sizes}>{(size) =>
								<MenuItem value={size}>{formatSize(size)}</MenuItem>
							}</For>
						</Select>
					</FormControl>
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
