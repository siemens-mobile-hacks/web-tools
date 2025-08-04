import * as Comlink from 'comlink';
import { Component, createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import { Alert, Box, Button, FormControl, FormControlLabel, Radio, RadioGroup, Stack, TextField } from '@suid/material';
import { SerialConnect } from '@/components/SerialConnect.js';
import { useSerial } from '@/providers/SerialProvider.js';
import { sprintf } from 'sprintf-js';
import { downloadBlob, formatSize, validateHex } from '@/utils.js';
import { SerialProtocol, SerialReadyState } from "@/workers/SerialWorker.js";
import { MemoryRegion } from "@/workers/services/CgsnService.js";
import { IoReadWriteProgress } from "@sie-js/serial";
import { useParams } from "@solidjs/router";
import { MemoryDumperPopup } from "@/pages/MemoryDumper/MemoryDumperPopup";
import { MemoryDumperHelp } from "@/pages/MemoryDumper/MemoryDumperHelp";
import { Title } from "@/components/Layout/Title";

export type MemoryDumperState = 'idle' | 'download' | 'save';

export interface MemoryDumperResult {
	error?: string;
	buffer?: Buffer;
	canceled: boolean;
}

export interface MemoryDumperProgress {
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

const MEMORY_REGION_DESCR: Record<string, string> = {
	BROM:	'Built-in 1st stage bootloader firmware.',
	TCM:	'Built-in memory in the CPU, used for IRQ handlers.',
	SRAM:	'Built-in memory in the CPU.',
	RAM:	'External RAM.',
	FLASH:	'NOR flash.',
};

export const MemoryDumperPage: Component = () => {
	const params = useParams();
	const protocol = (params.protocol?.toUpperCase() ?? "CGSN") as SerialProtocol;
	const serial = useSerial();
	const [memoryPresets, setMemoryPresets] = createSignal<MemoryRegion[]>(DEFAULT_MEMORY_PRESETS);
	const [customMemoryAddr, setCustomMemoryAddr] = createSignal<string>('A0000000');
	const [customMemorySize, setCustomMemorySize] = createSignal<string>('00020000');
	const [customMemoryAddrError, setCustomMemoryAddrError] = createSignal<boolean>(false);
	const [customMemorySizeError, setCustomMemorySizeError] = createSignal<boolean>(false);
	const [memoryPresetId, setMemoryPresetId] = createSignal<number>(0);
	const [progressValue, setProgressValue] = createSignal<MemoryDumperProgress | undefined>();
	const [state, setState] = createSignal<MemoryDumperState>('idle');
	const [readResult, setReadResult] = createSignal<MemoryDumperResult | undefined>();
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
	const serialReady = createMemo<boolean>(() => {
		return serial.readyState() === SerialReadyState.CONNECTED && serial.protocol() === protocol;
	});

	createEffect(async () => {
		if (serialReady()) {
			switch (protocol) {
				case "CGSN": {
					const response = await serial.cgsn.getPhoneInfo();
					setMemoryPresets([
						...DEFAULT_MEMORY_PRESETS,
						...response?.memoryRegions ?? [],
					]);
					setPhone(`${response?.phoneModel ?? "??"}v${response?.phoneSwVersion ?? "??"}`);
					break;
				}
				case "DWD": {
					const swInfo = await serial.dwd.getSWVersion();
					const memoryRegions = await serial.dwd.getMemoryRegions();
					setMemoryPresets([
						...DEFAULT_MEMORY_PRESETS,
						...memoryRegions.map((region) => {
							return { ...region, descr: MEMORY_REGION_DESCR[region.name] ?? "Unknown memory region." };
						})
					]);
					setPhone(swInfo.sw);
					break;
				}
			}
		}
	});

	const onClose = (): void => {
		setState('idle');
		setReadResult(undefined);
		setProgressValue(undefined);
	};

	const onCancel = (): void => {
		switch (protocol) {
			case "CGSN":
				void serial.cgsn.abort();
				break;
			case "DWD":
				void serial.dwd.abort();
				break;
		}
	};

	const onFileSave = (): void => {
		const result = readResult();
		if (!result?.buffer)
			return;

		const buffer = result.buffer.subarray(0, result.buffer.length);
		const fileName = (phone() ? `${phone()}_` : "") +
			(memoryPresetId() !== 0 ? memoryPreset().name + "_" : '') +
			sprintf("%08X_%08X.bin", memoryAddr(), buffer.length);
		const blob = new Blob([buffer as BlobPart], { type: 'application/octet-stream' });
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
			switch (protocol) {
				case "CGSN": {
					const response = await serial.cgsn.readMemory(memoryAddr(), memorySize(), Comlink.proxy(onProgress));
					setReadResult({
						buffer: response.buffer,
						canceled: response.canceled ?? false,
					});
					break;
				}
				case "DWD": {
					const response = await serial.dwd.readMemory(memoryAddr(), memorySize(), Comlink.proxy(onProgress));
					setReadResult({
						buffer: response.buffer,
						canceled: response.canceled,
					});
					break;
				}
			}
		} catch (e) {
			console.error(e);
		} finally {
			setState('save');
		}
	};

	return (
		<Box mt={1}>
			<Title>Memory Dumper</Title>
			<SerialConnect protocol={protocol} />

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
				<Button variant="outlined" onClick={startReadMemory} disabled={!serialReady()}>
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
				<MemoryDumperHelp protocol={protocol} />
			</Alert>
		</Box>
	);
}
