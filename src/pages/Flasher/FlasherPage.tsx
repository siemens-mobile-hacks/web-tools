import { Component, For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import {
	Alert, Box, Button, Checkbox, CircularProgress, Divider, FormControl, FormControlLabel,
	InputLabel, LinearProgress, MenuItem, Menu, ListSubheader, Paper,
	Select, Stack, TextField, Typography,
} from '@suid/material';
import UploadFileIcon from '@suid/icons-material/UploadFile';
import SaveIcon from '@suid/icons-material/Save';
import DownloadIcon from '@suid/icons-material/Download';
import DeleteIcon from '@suid/icons-material/Delete';
import ArrowDropDownIcon from '@suid/icons-material/ArrowDropDown';
import CompareArrowsIcon from '@suid/icons-material/CompareArrows';
import SettingsBackupRestoreIcon from '@suid/icons-material/SettingsBackupRestore';
import { sprintf } from 'sprintf-js';
import * as Comlink from 'comlink';
import { useSerial } from '@/providers/SerialProvider.js';
import { useApp } from '@/providers/AppProvider.js';
import { makePersisted } from "@solid-primitives/storage";
import HistoryIcon from '@suid/icons-material/History';
import { SerialProtocol, SerialReadyState, serialWorker } from '@/workers/endpoints/serial';
import { FlasherMemoryArea, FlasherProgress } from '@/workers/services/FlasherService';
import { PageTitle } from '@/components/Layout/PageTitle';
import { showToast } from '@/components/App/Toaster';
import { LogWindow } from '@/components/UI/LogWindow';
import { Buffer } from 'buffer';
import { downloadBlob, formatSize, validateHex } from '@/utils.js';
import { getAddrFromFileName, makeDumpFileName, parseVkd, phoneDisplayName, PhoneInfo, VkdFile,
	diffBuffers, diffEraseStats, diffRegionPreviews, DiffRegionPreview } from '@/flasher/core';
import { vkpCanonicalize, vkpNormalize, vkpParse, VkpParseResult } from '@sie-js/vkp';
import { applyVkpToDevice, hexPreview, VkpApplyResult, VkpMismatchInfo } from '@/flasher/core/vkp';
import { FullFlashDevice } from '@/flasher/core/fullflash';
import { VkpEditor } from '@/pages/Flasher/VkpEditor';
import { PatchHistory } from '@/pages/Flasher/PatchHistory';
import {
	PatchLogContext, addPatchHistoryEntry, dumpModelFromFileName, newPatchHistoryId, vkpPatchTitle,
} from '@/pages/Flasher/history';

interface LoaderEntry {
	file: string;
	name: string;
	releaseDate: string;
	copyright: string;
}

type FlasherMode = 'phone' | 'file' | 'history';

export const FlasherPage: Component = () => {
	const serial = useSerial();
	const [mode, setMode] = createSignal<FlasherMode>('phone');
	// While a phone connection is open, switching between the phone and the
	// fullflash file device is disabled (like the "Work with" combo in
	// V_KLay); the History tab stays reachable.
	const deviceModeLocked = createMemo(() => serial.readyState() !== SerialReadyState.DISCONNECTED);

	return (
		<Stack sx={{ p: 2, maxWidth: 1100, mx: 'auto' }} spacing={2} alignItems="flex-start">
			<PageTitle>Flasher/Patcher</PageTitle>
			<Typography variant="body2" color="text.secondary" pb={2}>
				A reimplementation of V_KLay.
				Read and write the phone flash memory over a DCA-510 cable,
				work with fullflash dumps, apply VKP patches and browse their history.
			</Typography>

			<Stack direction="row" sx={{ borderBottom: 1, borderColor: 'divider', width: '100%' }} flexWrap="wrap">
				<For each={[
					{ value: 'phone' as FlasherMode, label: 'Phone (WebSerial)' },
					{ value: 'file' as FlasherMode, label: 'Fullflash file (.bin)' },
					{ value: 'history' as FlasherMode, label: 'History', icon: true },
				]}>{(tab) =>
					<Button
						variant="text"
						startIcon={tab.icon ? <HistoryIcon /> : undefined}
						disabled={tab.value == 'file' && deviceModeLocked()}
						onClick={() => setMode(tab.value)}
						sx={{
							borderRadius: 0,
							borderBottom: 2,
							borderColor: mode() == tab.value ? 'primary.main' : 'transparent',
							color: mode() == tab.value ? 'primary.main' : 'text.secondary',
							px: 2,
						}}
					>
						{tab.label}
					</Button>
				}</For>
			</Stack>

			{/* The device tabs stay mounted (hidden) so their working state —
			the buffer, the opened dump, the connection panel — survives a visit
			of the History tab, like the V_KLay pages keep their documents. */}
			<Box sx={{ display: mode() == 'phone' ? 'block' : 'none', width: '100%' }}>
				<PhoneFlasher />
			</Box>
			<Box sx={{ display: mode() == 'file' ? 'block' : 'none', width: '100%' }}>
				<FileFlasher />
			</Box>
			<Show when={mode() == 'history'}>
				<PatchHistory />
			</Show>
		</Stack>
	);
};

// ---------------------------------------------------------------------
// Phone mode

const PhoneFlasher: Component = () => {
	const serial = useSerial();
	const app = useApp();
	const [loaders, setLoaders] = createSignal<LoaderEntry[]>([]);
	const [vkd, setVkd] = createSignal<VkdFile | undefined>();
	const [vkdText, setVkdText] = createSignal<string>('');
	// Remembered selections, like V_KLay stores them in the registry.
	const [vkdName, setVkdName] = makePersisted(createSignal<string>(''), { name: 'flasher.loader' });
	// Custom .vkd drivers added by the user: file name -> file text.
	const [customVkds, setCustomVkds] = makePersisted(createSignal<Record<string, string>>({}), { name: 'flasher.customLoaders' });
	const [phoneId, setPhoneId] = makePersisted(createSignal<string>(''), { name: 'flasher.phone' });
	const [baudrate, setBaudrate] = makePersisted(createSignal<number>(115200), { name: 'flasher.baudrate' });
	const [dtr, setDtr] = makePersisted(createSignal<boolean>(true), { name: 'flasher.dtr' });
	const [rts, setRts] = makePersisted(createSignal<boolean>(true), { name: 'flasher.rts' });
	const [skipBootcore, setSkipBootcore] = makePersisted(createSignal<boolean>(true), { name: 'flasher.skipBootcore' });
	const [skipLoader, setSkipLoader] = makePersisted(createSignal<boolean>(false), { name: 'flasher.skipLoader' });
	const [autoIgnition, setAutoIgnition] = makePersisted(createSignal<boolean>(true), { name: 'flasher.autoIgnition' });
	const [flashInfo, setFlashInfo] = createSignal<string>('');
	// Top bar info, like in the File Explorer: device name from the
	// deviceChange event plus the actual baudrate and the flash details.
	const [deviceName, setDeviceName] = createSignal<string>();
	const [connBaudrate, setConnBaudrate] = createSignal(0);
	const [flashInfoDetails, setFlashInfoDetails] = createSignal<string>();
	// The structured flash info of the connected phone (model, IMEI),
	// used for the patch history log.
	const [phoneInfo, setPhoneInfo] = createSignal<PhoneInfo | undefined>();
	const [areas, setAreas] = createSignal<FlasherMemoryArea[]>([]);
	const [buffer, setBuffer] = createSignal<Buffer | undefined>();
	const [bufferName, setBufferName] = createSignal<string>('');
	const [bufferLastFrom, setBufferLastFrom] = createSignal<number | undefined>();
	// Patch text injected into the VKP editor by the compare tool.
	const [phonePatchImport, setPhonePatchImport] = createSignal<{ text: string; name?: string } | undefined>();
	// V_KLay Flasher tab fields: "From Address" and "Size" are shared by the
	// Read Memory and Write Memory operations; the buffer has its own offset.
	// The addresses are flash-relative, formatted like V_KLay: 0x00000000.
	const [fromText, setFromText] = createSignal<string>('');
	const [fromError, setFromError] = createSignal(false);
	const [sizeText, setSizeText] = createSignal<string>('');
	const [sizeError, setSizeError] = createSignal(false);
	const [offsetText, setOffsetText] = createSignal<string>('0x00000000');
	const [offsetError, setOffsetError] = createSignal(false);

	const memoryAddr = createMemo(() => parseHexField(fromText()));
	const memorySize = createMemo(() => parseHexField(sizeText()));
	const bufferOffset = createMemo(() => {
		const value = parseHexField(offsetText());
		return isNaN(value) ? 0 : value;
	});

	// Combo presets from the driver memory areas (like V_KLay fills the
	// From/Size/Offset combos in OnDeviceChanged): relative 0x addresses.
	const fromPresets = createMemo(() => {
		const base = areas()[0]?.addr ?? 0;
		return areas().map((a) => ({
			value: hexField(a.addr - base),
			label: sprintf('0x%08X (%s%s)', a.addr - base, a.name, a.isBootcore ? ', bootcore' : ''),
			size: a.size,
			name: a.name,
		}));
	});
	const sizePresets = createMemo(() => areas().map((a) => ({
		value: hexField(a.size),
		label: sprintf('0x%08X (%s)', a.size, a.name),
		name: a.name,
	})));
	const offsetPresets = createMemo(() => {
		const base = areas()[0]?.addr ?? 0;
		return [
			{ value: hexField(0), label: sprintf('0x%08X (start)', 0) },
			...areas().slice(1).map((a) => ({
				value: hexField(a.addr - base),
				label: sprintf('0x%08X (%s)', a.addr - base, a.name),
			})),
		];
	});

	// Helper info under the fields: the name of the matching area.
	const fromHelper = createMemo(() =>
		fromPresets().find((p) => p.value.toLowerCase() == fromText().trim().toLowerCase())?.name ?? '');
	const sizeHelper = createMemo(() =>
		sizePresets().find((p) => p.value.toLowerCase() == sizeText().trim().toLowerCase())?.name ?? '');

	// Selecting a From preset also selects the matching Size preset
	// (OnCbnSelendokFlasherFrom in V_KLay).
	const applyFromPreset = (preset: { value: string; size?: number }): void => {
		setFromText(preset.value);
		if (preset.size !== undefined)
			setSizeText(hexField(preset.size));
	};
	const [progress, setProgress] = createSignal<FlasherProgress | undefined>();
	const [busy, setBusy] = createSignal(false);
	const [error, setError] = createSignal<string | undefined>();
	const [status, setStatus] = createSignal<string | undefined>();

	const protocol = 'FLSH' as SerialProtocol;
	const connected = createMemo(() =>
		serial.readyState() === SerialReadyState.CONNECTED && serial.protocol() === protocol);
	const connecting = createMemo(() =>
		serial.readyState() === SerialReadyState.CONNECTING && serial.protocol() === protocol);

	// Load the built-in loaders manifest
	createEffect(async () => {
		try {
			const manifest = await fetch(import.meta.env.BASE_URL + 'flasher/loaders/manifest.json');
			setLoaders(await manifest.json());
		} catch (e) {
			console.error(e);
		}
	});

	// Restore the last used driver (built-in or custom) after a page reload.
	createEffect(() => {
		const name = vkdName();
		if (vkd() || !name)
			return;
		const entry = loaders().find((l) => l.file == name);
		if (entry)
			void loadBuiltinLoader(entry);
		else if (customVkds()[name] !== undefined)
			activateVkdText(name, customVkds()[name]);
	});

	// After a driver is loaded, keep the remembered phone model when the
	// driver still contains it (V_KLay remembers the phone in the registry).
	const applyLoadedVkd = (parsed: VkdFile): void => {
		const remembered = phoneId();
		setPhoneId(parsed.phones.some((p) => p.id == remembered)
			? remembered
			: parsed.phones[0].id);
	};

	// Parses a driver text and activates it; on a parse error the current
	// driver is unloaded and the error is shown.
	const activateVkdText = (name: string, text: string): boolean => {
		try {
			const parsed = parseVkd(text);
			if (!parsed.phones.length)
				throw new Error('No phone definitions found in the file.');
			setVkdName(name);
			setVkd(parsed);
			setVkdText(text);
			applyLoadedVkd(parsed);
			setError(undefined);
			return true;
		} catch (e: any) {
			setVkd(undefined);
			setError(`Failed to parse ${name}: ${e.message}`);
			return false;
		}
	};

	const loadBuiltinLoader = async (entry: LoaderEntry) => {
		try {
			const response = await fetch(import.meta.env.BASE_URL + 'flasher/loaders/' + encodeURIComponent(entry.file));
			activateVkdText(entry.file, await response.text());
		} catch (e: any) {
			setVkd(undefined);
			setError(`Failed to load ${entry.file}: ${e.message}`);
		}
	};

	const customVkdNames = createMemo(() => Object.keys(customVkds()).sort((a, b) => a.localeCompare(b)));
	const isCustomVkd = (name: string): boolean => customVkds()[name] !== undefined;

	const unloadVkd = (): void => {
		setVkdName('');
		setVkd(undefined);
		setVkdText('');
	};

	// Adds the picked .vkd file to the stored custom drivers and activates it.
	const onAddCustomVkd = async (file: File): Promise<void> => {
		const name = file.name;
		const lower = name.toLowerCase();
		if (customVkdNames().some((n) => n.toLowerCase() == lower) ||
			loaders().some((l) => l.file.toLowerCase() == lower)) {
			setError(`The driver "${name}" is already in the list.`);
			return;
		}
		const text = await file.text();
		if (activateVkdText(name, text))
			setCustomVkds({ ...customVkds(), [name]: text });
	};

	const onDeleteCustomVkd = (): void => {
		const name = vkdName();
		if (!isCustomVkd(name))
			return;
		const rest = { ...customVkds() };
		delete rest[name];
		setCustomVkds(rest);
		unloadVkd();
	};

	// A cancelled connection attempt ends with a transport error from the aborted
	// boot sequence; it should not be reported to the user as a failure.
	let connectCancelled = false;

	const onConnect = () => {
		const currentVkd = vkd();
		if (!currentVkd)
			return;
		setError(undefined);
		setStatus('Connecting... Please, shortly press the Power button on the phone if asked.');
		connectCancelled = false;
		void serial.connect(protocol, undefined, undefined, 'flasher', {
			vkdText: vkdText(),
			phoneId: phoneId(),
			baudrate: baudrate(),
			dtr: dtr(),
			rts: rts(),
			skipBootcore: skipBootcore(),
			skipLoaderLoadUnload: skipLoader(),
			autoIgnition: autoIgnition(),
		}).catch((e) => {
			if (!connectCancelled)
				setError(e.message);
			setStatus(undefined);
		});
	};

	// Cancels a pending connection: closing the port aborts the boot sequence
	// and the worker returns to the disconnected state.
	const onCancelConnect = (): void => {
		connectCancelled = true;
		setStatus(undefined);
		void serial.disconnect();
	};

	const onRefreshFlashInfo = async () => {
		setBusy(true);
		try {
			const info = await serial.flasher.refreshFlashInfo();
			applyFlashInfo(info);
		} catch (e: any) {
			setError(e.message);
		} finally {
			setBusy(false);
		}
	};

	const onDisconnect = () => {
		void serial.disconnect().then(() => {
			setFlashInfo('');
			setFlashInfoDetails(undefined);
			setPhoneInfo(undefined);
			setConnBaudrate(0);
			setAreas([]);
			setStatus(undefined);
		});
	};

	const onDeviceChange = (device?: string) => setDeviceName(device);
	onMount(() => serialWorker.on('deviceChange', onDeviceChange));
	onCleanup(() => serialWorker.off('deviceChange', onDeviceChange));

	// Stores the flash info both for the panel (full text) and for the top bar
	// (only the details, the device name is already in the top bar).
	const applyFlashInfo = (info: any): void => {
		setPhoneInfo(info);
		setFlashInfo(formatFlashInfo(info));
		const { details } = formatFlashInfoParts(info);
		setFlashInfoDetails(details);
	};

	// Connection info in the top bar, like in the File Explorer:
	// "SIEMENS S75 IMEI ... · 115200 baud · Flash 0001:227E, regions: ...".
	createEffect(() => {
		const name = deviceName();
		if (!name)
			return;
		const parts = [name];
		if (connBaudrate())
			parts.push(`${connBaudrate()} baud`);
		if (flashInfoDetails())
			parts.push(flashInfoDetails()!);
		app.setStatus(parts.join(' · '));
	});

	// Drop the stale connection info when the phone is gone.
	createEffect(() => {
		if (connected())
			return;
		setConnBaudrate(0);
		setFlashInfoDetails(undefined);
	});

	// After connect: query the memory areas and flash info, select the
	// fullflash entry in the From/Size combos (V_KLay: SetCurSel(0)).
	createEffect(async () => {
		if (!connected())
			return;
		try {
			setConnBaudrate(await serial.flasher.getBaudrate().catch(() => 0));
			const areas = await serial.flasher.getMemAreas();
			setAreas(areas);
			if (areas.length) {
				setFromText(hexField(0));
				setSizeText(hexField(areas[0].size));
			}
			const info = await serial.flasher.getFlashInfo();
			applyFlashInfo(info);
		} catch (e: any) {
			setError(e.message);
		} finally {
			// Drop the "Connecting..." hint once the connection (including the
			// initial flash info query) has finished, successfully or not.
			setStatus(undefined);
		}
	});

	// Performance report after an operation (MakePerformanceReport in V_KLay):
	// elapsed time, average speed and the count of corrected communication errors.
	// Live speed for the progress display (exponential moving average).
	let perfSample = { time: 0, bytes: 0 };
	const [speed, setSpeed] = createSignal(0);
	const resetSpeed = (): void => {
		perfSample = { time: 0, bytes: 0 };
		setSpeed(0);
	};
	const trackSpeed = (p: FlasherProgress): void => {
		const now = Date.now();
		if (!perfSample.time) {
			perfSample = { time: now, bytes: p.cursor };
			return;
		}
		const dt = (now - perfSample.time) / 1000;
		const db = p.cursor - perfSample.bytes;
		if (dt >= 0.3 && db >= 0) {
			const inst = db / dt;
			setSpeed((prev) => (prev ? prev * 0.7 + inst * 0.3 : inst));
			perfSample = { time: now, bytes: p.cursor };
		}
	};
	const [eta, setEta] = createSignal<{ elapsed: number; remaining: number | undefined }>({ elapsed: 0, remaining: undefined });
	const [opStart, setOpStart] = createSignal(0);
	const onProgress = (p: FlasherProgress): void => {
		setProgress(p);
		trackSpeed(p);
		// Elapsed time and time left, like the V_KLay progress dialog.
		const start = opStart();
		if (start) {
			const elapsed = (Date.now() - start) / 1000;
			const remaining = p.cursor > 0
				? elapsed * (p.total - p.cursor) / p.cursor
				: undefined;
			setEta({ elapsed, remaining });
		}
	};

	const perfReport = async (label: string, bytes: number, t0: number): Promise<void> => {
		const seconds = (Date.now() - t0) / 1000;
		const errors = await serial.flasher.getErrorsCorrected().catch(() => 0);
		const speed = bytes && seconds > 0 ? `, ${formatSize(bytes / seconds)}/s` : '';
		const message = `${label} in ${seconds.toFixed(1)}s${speed}` +
			(errors ? `, ${errors} errors corrected` : '') + '.';
		setStatus(message);
		// The operation result stays visible until dismissed.
		showToast('success', message);
	};

	// V_KLay OnBnClickedMemoryLoad: read From+Size into the buffer.
	const onReadMemory = async () => {
		const addr = memoryAddr();
		const size = memorySize();
		if (isNaN(addr) || isNaN(size) || size <= 0) {
			setError('Invalid From address or Size.');
			return;
		}
		const preset = fromPresets().find((p) => p.value.toLowerCase() == fromText().trim().toLowerCase());
		setBusy(true);
		setError(undefined);
		setProgress(undefined);
		resetSpeed();
		setOpStart(Date.now());
		setEta({ elapsed: 0, remaining: undefined });
		const t0 = Date.now();
		try {
			const data = await serial.flasher.readMemory(addr, size,
				Comlink.proxy(onProgress));
			setBuffer(Buffer.from(data));
			setOffsetText(hexField(0));
			setBufferName(preset?.name ?? sprintf('0x%08X', addr));
			setBufferLastFrom(addr);
			await perfReport('Memory read', size, t0);
		} catch (e: any) {
			setError(e.message);
			showToast('error', `Memory read failed: ${e.message}`);
			// The read did not finish: drop the incomplete buffer so a
			// partial dump can never be saved or written to the phone.
			setBuffer(undefined);
			setBufferName('');
			setBufferLastFrom(undefined);
		} finally {
			setProgress(undefined);
			setBusy(false);
		}
	};

	// V_KLay OnBnClickedMemoryWrite: write the buffer (minus offset) to From,
	// limited by Size; when the buffer holds less data, the size is reduced
	// (V_KLay asks for confirmation in that case).
	const onWriteMemory = async () => {
		const buf = buffer();
		if (!buf) {
			setError('There is nothing to write. Read the memory or open a file first.');
			return;
		}
		const addr = memoryAddr();
		const size = memorySize();
		const offset = bufferOffset();
		if (isNaN(addr) || isNaN(size) || size <= 0) {
			setError('Invalid From address or Size.');
			return;
		}
		if (offset > buf.length) {
			setError('The buffer offset is bigger than the buffer.');
			return;
		}
		let data = buf.subarray(offset, offset + size);
		if (!data.length) {
			setError('Nothing to write: the buffer offset equals the buffer size.');
			return;
		}
		if (data.length < size) {
			if (!confirm('The data in the buffer (minus the offset) is less than the selected Size.\n' +
				`Reduce the size to ${formatSize(data.length)} and write all the data from the buffer?`))
				return;
		}
		if (!confirm(`Write ${formatSize(data.length)} from address ${sprintf('0x%08X', addr)} ` +
			`(buffer offset ${sprintf('0x%X', offset)}) to the phone flash?`))
			return;
		setBusy(true);
		setError(undefined);
		setProgress(undefined);
		resetSpeed();
		setOpStart(Date.now());
		setEta({ elapsed: 0, remaining: undefined });
		const t0 = Date.now();
		try {
			await serial.flasher.writeMemory(addr, data,
				Comlink.proxy(onProgress));
			setBufferLastFrom(addr);
			await perfReport('Memory written', data.length, t0);
		} catch (e: any) {
			setError(e.message);
			showToast('error', `Memory write failed: ${e.message}`);
		} finally {
			setProgress(undefined);
			setBusy(false);
		}
	};

	const onRestoreBootcore = async () => {
		if (!confirm('Restore the bootcore to its original state?\n\n' +
			'After this operation the phone will no longer boot into the service mode ' +
			'and you will not be able to use the flasher until you boot it again!'))
			return;
		setBusy(true);
		setError(undefined);
		try {
			await serial.flasher.restoreBootcore();
			setStatus('Bootcore restored successfully.');
		} catch (e: any) {
			setError(e.message);
		} finally {
			setBusy(false);
		}
	};

	// The default name uses the V_KLay scheme:
	// {DeviceName}_{YYYY-MM-DD_HH-MM-SS}_From_{XX}.bin
	const dumpDeviceName = (): string => {
		const phone = vkd()?.phones.find((p) => p.id == phoneId());
		return phone ? phoneDisplayName(phone) : 'Mem';
	};

	// The device description for the patch history (V_KLay DoPatchLogging
	// passes the unique device name, the patch file and the /a or /u flag
	// to its log script; the web app logs into localStorage instead).
	const patchLogContext = (): PatchLogContext => {
		const phone = vkd()?.phones.find((p) => p.id == phoneId());
		const info = phoneInfo();
		return {
			source: 'phone',
			model: phone ? phoneDisplayName(phone) : (info?.model ?? ''),
			// Only the x65-family loaders report the IMEI (flash info v3).
			imei: info?.kind == 'v3' ? info.imei : '',
			deviceName: dumpDeviceName(),
			info: info ? formatFlashInfo(info) : (vkdName() ? `Driver: ${vkdName()}` : ''),
		};
	};

	const onSaveBuffer = () => {
		const buf = buffer();
		if (!buf)
			return;
		const addr = !isNaN(memoryAddr()) ? memoryAddr() : (bufferLastFrom() ?? 0);
		downloadBlob(new Blob([new Uint8Array(buf)]), makeDumpFileName(dumpDeviceName(), addr));
	};

	// V_KLay's OpenDocument: when a dump is opened, the phone model is
	// auto-detected from the file name ("S55_..." selects the S55 phone).
	const detectPhoneByName = async (fileName: string): Promise<void> => {
		const base = fileName.replace(/\.(bin|fls|ful)$/i, '').replace(/\s+/g, '_');
		const matches = (name: string) =>
			name && base.toUpperCase().startsWith(name.replace(/\s+/g, '_').toUpperCase() + '_');

		// Try the currently loaded driver first.
		const current = vkd()?.phones.find((p) => matches(p.name));
		if (current) {
			if (current.id != phoneId())
				setPhoneId(current.id);
			return;
		}

		// Then the built-in drivers (e.g. "S55/SL55" matches S55_... and SL55_...).
		for (const entry of loaders()) {
			if (!entry.name.split('/').some(matches))
				continue;
			if (vkdName() == entry.file)
				return;
			await loadBuiltinLoader(entry);
			const phone = vkd()?.phones.find((p) => matches(p.name)) ?? vkd()?.phones[0];
			if (phone)
				setPhoneId(phone.id);
			return;
		}
	};

	const onLoadFile = async (file: File) => {
		const data = Buffer.from(await file.arrayBuffer());
		// V_KLay OpenDocument: the address comes from the file name
		// (GetAddrFromFileName), the size from the file length.
		const addr = getAddrFromFileName(file.name) ?? 0;
		setBuffer(data);
		setFromText(hexField(addr));
		setSizeText(hexField(data.length));
		setOffsetText(hexField(0));
		setBufferLastFrom(addr);
		setBufferName(file.name.replace(/\.bin$/i, ''));
		if (!connected())
			await detectPhoneByName(file.name);
	};

	return (
		<>
			{/* Protocol log (boots, loader commands, retries) at the top, like in the File Explorer */}
			<Box sx={{ width: '100%' }}>
				<LogWindow height={`calc(3 * 1.4 * 0.75rem + 16px)`} emptyMessage="Log output" />
			</Box>
			<Stack spacing={2} sx={{ width: '100%' }} direction="row" flexWrap="wrap">
			<Stack spacing={2} sx={{ flex: '1 1 420px', minWidth: 340 }}>
				{/* Loader selection */}
				<Paper variant="outlined" sx={{ p: 2 }}>
					<Stack spacing={2}>
						<Typography variant="h6">1. Connect to phone</Typography>
						{/* Status messages: connecting hint, operation results */}
						<Show when={status()}>
							<Alert severity="info">{status()}</Alert>
						</Show>
						<Show when={!connected()}>
							<Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
								<FormControl size="small" sx={{ minWidth: 200, flex: '1 1 200px' }} disabled={!!connected()}>
									<InputLabel>Driver</InputLabel>
									<Select
										label="Driver"
										value={vkdName()}
										onChange={(e) => {
											const value = e.target.value;
											const entry = loaders().find((l) => l.file == value);
											if (entry)
												void loadBuiltinLoader(entry);
											else if (isCustomVkd(value))
												activateVkdText(value, customVkds()[value]);
											else if (!value)
												unloadVkd();
										}}
									>
										<MenuItem value="">
											<em>Select a driver...</em>
										</MenuItem>
										<For each={loaders()}>{(l) =>
											<MenuItem value={l.file}>{l.name}</MenuItem>
										}</For>
										<Show when={customVkdNames().length}>
											<ListSubheader>Custom</ListSubheader>
											<For each={customVkdNames()}>{(name) =>
												<MenuItem value={name}>{name}</MenuItem>
											}</For>
										</Show>
									</Select>
								</FormControl>
								<Button
									variant="outlined"
									color="error"
									title="Delete the selected custom driver"
									disabled={!isCustomVkd(vkdName())}
									onClick={onDeleteCustomVkd}
									sx={{ minWidth: 0, px: 1.5 }}
								>
									<DeleteIcon />
								</Button>
								<Button component="label" variant="outlined" startIcon={<UploadFileIcon />}>
									Custom .vkd
									<input type="file" accept=".vkd,.ini,.txt" hidden onChange={(e) => {
										const file = e.target.files?.[0];
										e.target.value = '';
										if (file)
											void onAddCustomVkd(file);
									}} />
								</Button>
							</Stack>
							<Show when={vkd()}>
								<FormControl size="small" sx={{ minWidth: 240 }}>
									<InputLabel>Phone model</InputLabel>
									<Select label="Phone model" value={phoneId()} onChange={(e) => setPhoneId(e.target.value)}>
										<For each={vkd()!.phones}>{(p) =>
											<MenuItem value={p.id}>{phoneDisplayName(p)}</MenuItem>
										}</For>
									</Select>
								</FormControl>
								<Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
									<FormControl size="small" sx={{ minWidth: 130 }}>
										<InputLabel>Baudrate</InputLabel>
										<Select label="Baudrate" value={baudrate()} onChange={(e) => setBaudrate(Number(e.target.value))}>
											<For each={[
												[115200, '115200'], [230400, '230400'], [460800, '460800'],
												[614400, '614400'], [921600, '921600'], [1228800, '1228800'], [1600000, '1600000'],
											]}>{([value, name]) => <MenuItem value={value}>{name}</MenuItem>}</For>
										</Select>
									</FormControl>
									<FormControlLabel control={<Checkbox checked={dtr()} onChange={(_, checked) => setDtr(checked)} />} label="DTR" />
									<FormControlLabel control={<Checkbox checked={rts()} onChange={(_, checked) => setRts(checked)} />} label="RTS" />
									<FormControlLabel control={<Checkbox checked={autoIgnition()} onChange={(_, checked) => setAutoIgnition(checked)} />} label="Autoignition" />
									<FormControlLabel control={<Checkbox checked={skipBootcore()} onChange={(_, checked) => setSkipBootcore(checked)} />} label="Skip bootcore" />
									<FormControlLabel control={<Checkbox checked={skipLoader()} onChange={(_, checked) => setSkipLoader(checked)} />} label="Loader already in RAM" />
								</Stack>
								<Show when={vkd()!.phones.find((p) => p.id == phoneId())?.comments} keyed>
									{(comments) => <Alert severity="info">{comments}</Alert>}
								</Show>
								<Show
									when={!connecting()}
									fallback={
										<Button
											variant="outlined"
											color="error"
											title="Abort the connection attempt"
											onClick={onCancelConnect}
											startIcon={<CircularProgress size="1em" color="inherit" />}
										>
											Cancel
										</Button>
									}
								>
									<Button variant="contained" onClick={onConnect} disabled={serial.readyState() !== SerialReadyState.DISCONNECTED}>
										Connect
									</Button>
								</Show>
							</Show>
						</Show>
						<Show when={connected()}>
							<Typography variant="body2" color="text.secondary">
								Connected. Loader is in the phone memory.
							</Typography>
							<Stack direction="row" spacing={1} alignItems="center">
								<Typography sx={{ flexGrow: 1 }}><b>{flashInfo() || 'Connected'}</b></Typography>
								<Stack spacing={1} sx={{ minWidth: 160 }}>
									<Button
										variant="outlined"
										fullWidth
										disabled={busy()}
										onClick={() => void onRefreshFlashInfo()}
									>
										Refresh
									</Button>
									<Show
										when={!busy()}
										fallback={
											<Button
												variant="outlined"
												color="error"
												fullWidth
												title="Abort the running operation"
												onClick={() => void serial.flasher.abort()}
											>
												Cancel
											</Button>
										}
									>
										<Button variant="contained" color="error" fullWidth onClick={onDisconnect}>Disconnect</Button>
									</Show>
								</Stack>
							</Stack>
							<Show when={!flashInfo() || flashInfo() == 'Connected (no flash info)'}>
								<Alert severity="info">
									This loader does not report the flash info (optInfoCmdDisable or an old loader).
									Make sure MCUMemGeometry is set in the .vkd driver for this phone,
									otherwise reading and writing will not work.
								</Alert>
							</Show>
						</Show>
						{/* Operation progress: memory read/write, bootcore restore */}
						<Show when={busy()}>
							<Stack spacing={1} alignItems="center">
								<Show when={progress()} fallback={<CircularProgress size={24} />} keyed>
									{(p) => (
										<Stack width="100%" spacing={1}>
											<Typography variant="body2">
												{Math.round(p.cursor / p.total * 100)}%
												<Show when={speed()}> — {formatSize(speed())}/s</Show>
												<Show when={eta().remaining !== undefined}>
													{' '}[{formatEta(eta().elapsed)} elapsed, {formatEta(eta().remaining!)} left]
												</Show>
											</Typography>
											<LinearProgress variant="determinate" value={Math.round(p.cursor / p.total * 100)} />
											<Typography variant="body2" color="text.secondary">
												{formatSize(p.cursor)} / {formatSize(p.total)}
											</Typography>
										</Stack>
									)}
								</Show>
							</Stack>
						</Show>
					</Stack>
				</Paper>

				{/* Memory of the phone: the V_KLay Flasher tab layout */}
				<Show when={connected()}>
					<Paper variant="outlined" sx={{ p: 2 }}>
						<Stack spacing={2}>
							<Typography variant="h6">2. Phone memory</Typography>
							<Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
								<EditableCombo
									label="From Address"
									value={fromText()}
									error={fromError()}
									helperText={fromHelper()}
									items={fromPresets()}
									onSelect={applyFromPreset}
									onChange={(v) => {
										setFromText(v);
										setFromError(isNaN(parseHexField(v)));
									}}
								/>
								<EditableCombo
									label="Size"
									value={sizeText()}
									error={sizeError()}
									helperText={sizeHelper()}
									items={sizePresets()}
									onChange={(v) => {
										setSizeText(v);
										setSizeError(isNaN(parseHexField(v)));
									}}
								/>
							</Stack>
							<Stack direction="row" spacing={1} flexWrap="wrap">
								<Button
									variant="contained"
									disabled={busy() || isNaN(memoryAddr()) || isNaN(memorySize()) || memorySize() <= 0}
									onClick={() => void onReadMemory()}
								>
									Read Memory
								</Button>
								<Button
									variant="contained"
									color="warning"
									disabled={busy() || !buffer() || isNaN(memoryAddr()) || isNaN(memorySize()) || memorySize() <= 0}
									onClick={() => void onWriteMemory()}
								>
									Write Memory
								</Button>
							</Stack>
							<Divider />
							<Stack direction="row" spacing={1} flexWrap="wrap">
								<Button variant="outlined" color="warning" startIcon={<SettingsBackupRestoreIcon />} disabled={busy()} onClick={() => void onRestoreBootcore()}>
									Restore bootcore
								</Button>
							</Stack>
						</Stack>
					</Paper>
				</Show>

				{/* Buffer of the program */}
				<Show when={buffer()}>
					<Paper variant="outlined" sx={{ p: 2, width: '100%' }}>
						<Stack spacing={2}>
							<Typography variant="h6">3. Buffer of the program</Typography>
							<Typography variant="body2">
								{bufferName()!}: {formatSize(buffer()!.length)}
							</Typography>
							<Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
								<EditableCombo
									label="Use From Offset"
									value={offsetText()}
									error={offsetError()}
									items={offsetPresets()}
									onChange={(v) => {
										setOffsetText(v);
										setOffsetError(isNaN(parseHexField(v || '0')));
									}}
								/>
								<Typography variant="body2" sx={{ alignSelf: 'center' }}>
									to write: {formatSize(Math.max(0, buffer()!.length - bufferOffset()))}
								</Typography>
								<Show when={bufferLastFrom() !== undefined}>
									<Typography variant="body2" sx={{ alignSelf: 'center' }} color="text.secondary">
										last accessed: {sprintf('0x%08X', bufferLastFrom()!)}
									</Typography>
								</Show>
							</Stack>
							<Stack direction="row" spacing={1} flexWrap="wrap">
								<Button variant="outlined" startIcon={<SaveIcon />} disabled={busy()} onClick={onSaveBuffer}>
									Save File ...
								</Button>
								<Button component="label" variant="outlined" startIcon={<DownloadIcon />}>
									Open File ...
									<input type="file" accept=".bin,.fls,.ful" hidden onChange={(e) => {
										const file = e.target.files?.[0];
										if (file)
											void onLoadFile(file);
									}} />
								</Button>
							</Stack>
							<DumpCompare
								buffer={buffer}
								baseAddr={() => bufferLastFrom() ?? 0}
								onGeneratePatch={(text, name) => setPhonePatchImport({ text, name })}
							/>
						</Stack>
					</Paper>
				</Show>
			</Stack>

			{/* Status panel */}
			<Stack spacing={2} sx={{ flex: '1 1 420px', minWidth: 340 }}>
				<Show when={error()}>
					<Alert severity="error" onClose={() => setError(undefined)}>{error()}</Alert>
				</Show>
				{/* VKP patches: inspection is always possible, applying needs a connection */}
				<VkpPanel
					readMemory={connected() ? async (addr, size) => Buffer.from(await serial.flasher.readMemory(
						addr - (areas()[0]?.addr ?? addr), size)) : undefined}
					writeMemory={connected() ? async (addr, data) => {
						await serial.flasher.writeMemory(addr - (areas()[0]?.addr ?? addr), data);
					} : undefined}
					flashStart={() => areas()[0]?.addr ?? 0}
					flashSize={() => areas()[0]?.size ?? 0}
					onError={setError}
					import={phonePatchImport}
					logContext={patchLogContext}
				/>
			</Stack>
			</Stack>
		</>
	);
};

// ---------------------------------------------------------------------
// File mode

const FileFlasher: Component = () => {
	const [buffer, setBuffer] = createSignal<Buffer | undefined>();
	const [fileName, setFileName] = createSignal<string>('');
	const [filePatchImport, setFilePatchImport] = createSignal<{ text: string; name?: string } | undefined>();
	const [error, setError] = useSignalError();
	// Partial dump support (like the V_KLay file device): the "From address"
	// field places the dump anywhere in the memory map, "Size" limits the
	// used part of the file (e.g. an EEPROM-only dump).
	const [addrText, setAddrText] = createSignal<string>('400000');
	const [sizeText, setSizeText] = createSignal<string>('');
	const [addrError, setAddrError] = createSignal(false);
	const [sizeError, setSizeError] = createSignal(false);

	const bufferAddr = createMemo(() => {
		const text = addrText().trim();
		if (!validateHex(text))
			return 0;
		return parseInt(text, 16);
	});

	const bufferSize = createMemo(() => {
		const buf = buffer();
		if (!buf)
			return 0;
		const text = sizeText().trim();
		if (!text)
			return buf.length;
		if (!validateHex(text))
			return buf.length;
		return Math.min(buf.length, parseInt(text, 16));
	});

	const device = () => {
		const buf = buffer();
		return buf ? new FullFlashDevice(buf.subarray(0, bufferSize()), bufferAddr()) : undefined;
	};

	const onLoadFile = async (file: File) => {
		const data = Buffer.from(await file.arrayBuffer());
		setBuffer(data);
		setAddrText((getAddrFromFileName(file.name) ?? 0x400000).toString(16).toUpperCase());
		setSizeText('');
		setFileName(file.name);
		setError(undefined);
	};

	const onSaveFile = () => {
		const buf = buffer();
		if (!buf)
			return;
		downloadBlob(new Blob([new Uint8Array(buf)]),
			makeDumpFileName(fileName().replace(/\.bin$/i, '') || 'Mem', bufferAddr()));
	};

	// The device description for the patch history: a dump file instead of a
	// real phone; the model is guessed from the dump file name.
	const patchLogContext = (): PatchLogContext => ({
		source: 'file',
		model: dumpModelFromFileName(fileName()),
		imei: '',
		deviceName: fileName().replace(/\.(bin|fls|ful)$/i, ''),
		info: buffer() ? sprintf('Dump 0x%08X + %s', bufferAddr(), formatSize(bufferSize())) : '',
	});

	return (
		<Stack spacing={2} sx={{ width: '100%' }}>
			<Paper variant="outlined" sx={{ p: 2 }}>
				<Stack spacing={2}>
					<Typography variant="h6">Fullflash file</Typography>
					<Stack direction="row" spacing={1} flexWrap="wrap">
						<Button component="label" variant="outlined" startIcon={<UploadFileIcon />}>
							Open .bin file
							<input type="file" accept=".bin,.fls,.ful" hidden onChange={(e) => {
								const file = e.target.files?.[0];
								if (file)
									void onLoadFile(file);
							}} />
						</Button>
						<Show when={buffer()}>
							<Button variant="outlined" startIcon={<SaveIcon />} onClick={onSaveFile}>Save</Button>
						</Show>
					</Stack>
					<Show when={buffer()}>
						<Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
							<TextField
								size="small"
								label="From address"
								value={addrText()}
								error={addrError()}
								sx={{ width: 160, '& .MuiInputBase-input': { fontFamily: 'monospace' } }}
								onChange={(e) => {
									setAddrText(e.currentTarget.value);
									setAddrError(!validateHex(e.currentTarget.value.trim() || '0'));
								}}
							/>
							<TextField
								size="small"
								label="Size (file: full)"
								value={sizeText()}
								error={sizeError()}
								sx={{ width: 180, '& .MuiInputBase-input': { fontFamily: 'monospace' } }}
								onChange={(e) => {
									setSizeText(e.currentTarget.value);
									setSizeError(!!e.currentTarget.value.trim() && !validateHex(e.currentTarget.value.trim()));
								}}
							/>
							<Typography variant="body2" sx={{ alignSelf: 'center' }}>
								{sprintf('0x%08X', bufferAddr())} + {formatSize(bufferSize())} of {formatSize(buffer()!.length)}
							</Typography>
						</Stack>
					</Show>
				</Stack>
			</Paper>
			<Show when={buffer()}>
				<Paper variant="outlined" sx={{ p: 2, width: '100%' }}>
					<Stack spacing={2}>
						<Typography variant="h6">Compare dumps</Typography>
						<DumpCompare
							buffer={buffer}
							baseAddr={() => bufferAddr()}
							onGeneratePatch={(text, name) => setFilePatchImport({ text, name })}
						/>
					</Stack>
				</Paper>
			</Show>
			<VkpPanel
				readMemory={buffer() ? async (addr, size) => {
					// FullFlashDevice takes absolute addresses.
					const dev = device()!;
					return Buffer.from(await dev.read(addr, size));
				} : undefined}
				writeMemory={buffer() ? async (addr, data) => {
					const dev = device()!;
					await dev.write(addr, data);
					await dev.flush();
				} : undefined}
				flashStart={() => bufferAddr()}
				flashSize={() => buffer()?.length ?? 0}
				onError={setError}
				import={filePatchImport}
				logContext={patchLogContext}
			/>
			<Show when={error()}>
				<Alert severity="error" onClose={() => setError(undefined)}>{error()}</Alert>
			</Show>
		</Stack>
	);
};

// ---------------------------------------------------------------------
// VKP patch panel

interface VkpPanelProps {
	// Device access; when undefined, the patch can only be inspected.
	readMemory?: (addr: number, size: number) => Promise<Buffer>;
	writeMemory?: (addr: number, data: Buffer) => Promise<void>;
	flashStart: () => number;
	flashSize: () => number;
	onError: (msg: string | undefined) => void;
	// External patch injection (e.g. from the dump compare tool).
	import?: () => { text: string; name?: string } | undefined;
	// Device description for the patch history log (V_KLay DoPatchLogging).
	logContext?: () => PatchLogContext;
}

const VkpPanel: Component<VkpPanelProps> = (props) => {
	const [patchText, setPatchText] = createSignal<string>('');
	const [patchName, setPatchName] = createSignal<string>('');
	const [vkp, setVkp] = createSignal<VkpParseResult | undefined>();
	const [result, setResult] = createSignal<VkpApplyResult | undefined>();
	const [busy, setBusy] = createSignal(false);

	const canOperate = createMemo(() => !!props.readMemory && !!props.writeMemory);
	const writesCount = createMemo(() => vkp()?.writes.length ?? 0);

	// Patch generated by other tools (compare) lands in the editor.
	createEffect(() => {
		const imported = props.import?.();
		if (!imported)
			return;
		setPatchText(imported.text);
		if (imported.name)
			setPatchName(imported.name);
	});

	const loadPatchFile = async (file: File) => {
		const raw = Buffer.from(await file.arrayBuffer());
		let text: string;
		try {
			text = vkpNormalize(raw);
		} catch {
			text = raw.toString('utf8');
		}
		setPatchText(text);
		setPatchName(file.name);
		parse(text);
	};

	const parse = (text: string) => {
		setResult(undefined);
		if (!text.trim()) {
			setVkp(undefined);
			props.onError(undefined);
			return;
		}
		try {
			const parsed = vkpParse(text, { allowEmptyOldData: true });
			setVkp(parsed);
			if (!parsed.errors.length)
				props.onError(undefined);
		} catch (e: any) {
			setVkp(undefined);
			props.onError(`VKP parse error: ${e.message}`);
		}
	};

	// Free editing, like in V_KLay: the patch is re-parsed while typing.
	let parseTimer: ReturnType<typeof setTimeout> | undefined;
	createEffect(() => {
		const text = patchText();
		if (parseTimer)
			clearTimeout(parseTimer);
		parseTimer = setTimeout(() => parse(text), 300);
	});
	onCleanup(() => {
		if (parseTimer)
			clearTimeout(parseTimer);
	});

	const savePatchFile = () => {
		const text = patchText();
		if (!text)
			return;
		// VKP files are canonically cp1251 with CRLF line endings.
		downloadBlob(new Blob([new Uint8Array(vkpCanonicalize(text))], { type: 'text/plain' }), patchName() || 'patch.vkp');
	};

	// V_KLay's msgNoOldInPatch message box (PatchDataConvert): writes without
	// old data - the undo will be impossible (when undoing, such writes are
	// skipped). When confirmed, a repair patch is saved before anything is
	// written.
	const noOldMessage = (revert: boolean): string => revert
		? 'You cannot do a complete undo of this patch, because some or all writes in the patch have no old data!\n\n'
			+ 'Do you want to continue and undo the writes where the old data is available?\n\n'
			+ 'YES - to write the old data anyway, but before this a repair patch will be saved.\n'
			+ 'Later you can load it and press Undo to restore the original data.\n'
			+ 'DO NOT USE THE CURRENT PATCH FOR APPLY IN THIS CASE!\n'
			+ 'NO - to cancel undoing the patch.'
		: 'If you apply this patch you cannot undo it later, because some or all writes in the patch have no old data!\n\n'
			+ 'Do you want to continue?\n\n'
			+ 'YES - to write the new data anyway, but before this a repair patch will be saved.\n'
			+ 'Later you can load it and press Undo to restore the original data.\n'
			+ 'DO NOT USE THE CURRENT PATCH FOR UNDO IN THIS CASE!\n'
			+ 'NO - to cancel applying the patch.';

	// V_KLay's msgErrHeader + msgOldExist + msgApplyDescr/msgUndoDescr message
	// box, shown once after the whole patch was converted
	// (PatchDataTest_ShowNoOldWarning).
	const mismatchMessage = (info: VkpMismatchInfo, revert: boolean): string => {
		const byte = (v?: number) => v === undefined ? '??' : sprintf('0x%02X', v);
		const counts = revert
			? `The new data of ${info.mismatchCount} from ${info.totalWrites} writes of the patch is not found in the flash.`
			: `The old data of ${info.mismatchCount} from ${info.totalWrites} writes of the patch is not found in the flash.`;
		return `Error at address ${sprintf('0x%08X', info.addr)}:\n`
			+ `Data in phone memory: ${byte(info.deviceByte)}, old data in patch: ${byte(info.oldByte)}, new data in patch: ${byte(info.newByte)}.\n`
			+ (info.line ? `Line: ${info.line}.\n` : '') + '\n'
			+ `WARNING!\n${counts}\n`
			+ 'May be a similar patch has been applied or you have a wrong version of the flash.\n\n'
			+ (revert
				? 'Do you want to write the old data of the patch (do undo) anyway?\n\n'
					+ 'YES - to write the old data anyway, but before this a repair patch will be saved. Later you can load it and Undo all the changes made by undoing this patch.\n'
					+ 'DO NOT USE THE CURRENT PATCH FOR APPLY IN THIS CASE!\n'
				: 'Do you want to apply the patch anyway?\n\n'
					+ 'YES - to write the new data anyway, but before this a repair patch will be saved. Later you can load it and Undo all the changes made by applying this patch.\n'
					+ 'DO NOT USE THE CURRENT PATCH FOR UNDO IN THIS CASE!\n')
			+ 'NO - to cancel.';
	};

	// V_KLay's "Save Repair Patch As..." dialog (RepairPatchGetFileName +
	// RepairPatchSave). The File System Access API is the closest browser
	// analog; it needs a recent user gesture, so after long flash reads it
	// falls back to a plain download. Cancelling aborts the operation, like
	// V_KLay does by default (o_bIsRepairPatchCanSkip=FALSE).
	const saveRepairPatchFile = async (text: string, fileName: string): Promise<string | false | undefined> => {
		const data = vkpCanonicalize(text);
		try {
			if (typeof (window as any).showSaveFilePicker == 'function') {
				const handle = await (window as any).showSaveFilePicker({
					suggestedName: fileName,
					types: [{ description: 'VKP patch', accept: { 'text/plain': ['.vkp'] } }],
				});
				const writable = await handle.createWritable();
				await writable.write(new Uint8Array(data));
				await writable.close();
				return handle.name || fileName;
			}
		} catch (e: any) {
			if (e?.name == 'AbortError')
				return false;
			// Not supported / no user activation left: fall back to a download.
		}
		if (!confirm('A repair patch must be saved before the data is written.\n'
			+ `Save it as "${fileName}" now?\n\n`
			+ 'Later you can open it and press Undo to restore the original data.\n'
			+ 'Cancelling aborts the operation.'))
			return false;
		downloadBlob(new Blob([new Uint8Array(data)], { type: 'text/plain' }), fileName);
		return fileName;
	};

	const run = async (revert: boolean, dryRun: boolean) => {
		const currentVkp = vkp();
		if (!currentVkp || !currentVkp.valid || !canOperate())
			return;
		if (!dryRun && !confirm(revert ? 'Undo the patch?' : 'Apply the patch?'))
			return;
		setBusy(true);
		props.onError(undefined);
		try {
			const device = {
				read: (addr: number, size: number) => props.readMemory!(addr, size),
				write: (addr: number, data: Uint8Array) => props.writeMemory!(addr, Buffer.from(data)),
				flush: async () => {},
				getMemoryStart: () => props.flashStart(),
				getMemorySize: () => props.flashSize(),
			} as any;
			const res = await applyVkpToDevice(device, currentVkp, {
				revert,
				dryRun,
				patchName: patchName() || undefined,
				patchText: patchText(),
				toolName: 'Siemens Mobile Web Tools',
			// V_KLay PatchDataConvert: the warnings are confirmed with message
			// boxes (also in the test mode, like V_KLay), and in a real run the
			// repair patch is saved before anything is written.
				confirmNoOld: () => confirm(noOldMessage(revert)),
				confirmMismatch: (info: VkpMismatchInfo) => confirm(mismatchMessage(info, revert)),
				...(dryRun ? {} : { saveRepairPatch: saveRepairPatchFile }),
			});
			setResult(res);
			if (res.repairPatch?.savedAs)
				showToast('success', `Repair patch saved: ${res.repairPatch.savedAs}`);
			// Log every successfully applied/undone patch into the history
			// (the V_KLay DoPatchLogging analog). Tests (dry runs), no-op results
			// and failed runs are not logged, exactly like in V_KLay.
			if (!res.dryRun && res.ok && !res.empty && !res.alreadyDone) {
				const context = props.logContext?.();
				if (context) {
					try {
						addPatchHistoryEntry({
							id: newPatchHistoryId(),
							date: new Date().toISOString(),
							action: res.action,
							source: context.source,
							model: context.model,
							imei: context.imei,
							deviceName: context.deviceName,
							info: context.info,
							patchName: patchName(),
							patchTitle: vkpPatchTitle(patchText()),
							writes: currentVkp.writes.length,
							written: res.written,
							text: patchText(),
						});
					} catch (e: any) {
						showToast('error', `Failed to log the patch in the history: ${e.message}`);
					}
				}
			}
		} catch (e: any) {
			props.onError(e.message);
		} finally {
			setBusy(false);
		}
	};

	return (
		<Paper variant="outlined" sx={{ p: 2, width: '100%' }}>
			<Stack spacing={2}>
				<Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
					<Typography variant="h6">VKP patch</Typography>
					<Show when={!canOperate()}>
						<Typography variant="caption" color="text.secondary">
							Connect the phone or open a dump to apply
						</Typography>
					</Show>
				</Stack>
				<Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
					<Button component="label" variant="outlined" startIcon={<UploadFileIcon />}>
						Open .vkp
						<input type="file" accept=".vkp,.txt" hidden onChange={(e) => {
							const file = e.target.files?.[0];
							if (file)
								void loadPatchFile(file);
						}} />
					</Button>
					<Button variant="outlined" startIcon={<SaveIcon />} disabled={!patchText().trim()} onClick={savePatchFile}>
						Save
					</Button>
					<Show when={patchName() || writesCount()}>
						<Typography variant="body2" sx={{ alignSelf: 'center' }}>
							<Show when={patchName()}>{patchName()}: </Show>
							{writesCount()} writes
						</Typography>
					</Show>
				</Stack>
				{/* Free-editable patch text (like the V_KLay patch page) */}
				<VkpEditor
					value={patchText()}
					onInput={setPatchText}
					minRows={6}
					maxRows={20}
					placeholder={'Paste or edit a VKP patch here, e.g.\n; My patch\n0x402BB4: F0F0F0F0 F1F1F1F1'}
				/>
				<Show when={vkp()} keyed>
					{(v) => (
						<Stack spacing={1}>
							<Show when={v.errors.length}>
								<Alert severity="error">
									{v.errors.length} parse errors:
									<For each={v.errors.slice(0, 3)}>{(e) => (
										<Box component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
											{e.message}
											{codeFrameSafe(e, patchText())}
										</Box>
									)}</For>
									<Show when={v.errors.length > 3}>
										<div>...and {v.errors.length - 3} more</div>
									</Show>
								</Alert>
							</Show>
							<Show when={v.warnings.length}>
								<Alert severity="warning">
									{v.warnings.length} warnings:
									<For each={v.warnings.slice(0, 3)}>{(w) => (
										<Box component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
											{w.message}
											{codeFrameSafe(w, patchText())}
										</Box>
									)}</For>
									<Show when={v.warnings.length > 3}>
										<div>...and {v.warnings.length - 3} more</div>
									</Show>
								</Alert>
							</Show>
						</Stack>
					)}
				</Show>
				<Stack direction="row" spacing={1} flexWrap="wrap">
					<Button
						variant="outlined"
						disabled={busy() || !vkp()?.valid || !canOperate()}
						onClick={() => void run(false, true)}
					>
						Test
					</Button>
					<Button
						variant="contained"
						disabled={busy() || !vkp()?.valid || !canOperate()}
						onClick={() => void run(false, false)}
					>
						Apply
					</Button>
					<Button
						variant="outlined"
						color="warning"
						disabled={busy() || !vkp()?.valid || !canOperate()}
						onClick={() => void run(true, false)}
					>
						Undo
					</Button>
				</Stack>
				<Show when={result()} keyed>
					{(res) => (
						<Alert severity={res.cancelled ? 'warning' : res.ok ? (res.alreadyDone ? 'info' : 'success') : 'error'}>
							{res.dryRun ? 'Test: ' : ''}
							{res.cancelled
								? 'Cancelled. Nothing was written.'
								: res.alreadyDone
									? (res.action == 'apply' ? 'The patch is already applied.' : 'The patch is not applied.')
									: res.ok
										? `${res.action == 'apply' ? 'Applied' : 'Undone'} successfully (${formatSize(res.written)} written).`
										: 'Finished with errors:'}
							<For each={res.reports.filter((r) => r.status == 'error').slice(0, 4)}>{(r) =>
								<div>{sprintf('%08X: %s', r.addr, r.reason)}</div>
							}</For>
							{/* V_KLay: "Repair Patch is saved in file: ..." (msgRepairIn) */}
							<Show when={res.repairPatch} keyed>
								{(rp) => (
									<div>
										{rp.savedAs
											? `Repair patch saved in file: ${rp.savedAs}.`
											: 'A repair patch was generated (the original data differs from the old data of the patch).'}
										{' '}Undo it to restore the original data.
										<Button
											size="small"
											variant="text"
											onClick={() => downloadBlob(new Blob([new Uint8Array(vkpCanonicalize(rp.text))], { type: 'text/plain' }), rp.fileName)}
										>
											Save repair patch ...
										</Button>
									</div>
								)}
							</Show>
						</Alert>
					)}
				</Show>
			</Stack>
		</Paper>
	);
};

// ---------------------------------------------------------------------
// Dump comparison: diff two dumps byte by byte to debug read differences
// (e.g. our read vs a V_KLay read, or two reads of the same phone).

const DumpCompare: Component<{
	buffer: () => Buffer | undefined;
	baseAddr: () => number;
	// Base for the generated VKP patch addresses. Defaults to baseAddr:
	// patches are written as offsets from the flash start, like V_KLay does.
	patchBase?: () => number;
	onGeneratePatch?: (text: string, name: string) => void;
}> = (props) => {
	const [otherName, setOtherName] = createSignal<string>('');
	const [other, setOther] = createSignal<Buffer | undefined>();
	const [result, setResult] = createSignal<{
		regions: DiffRegionPreview[];
		stats: { aToFF: number; ffToA: number; changed: number };
		totalBytes: number;
		sameLength: boolean;
	} | undefined>();
	const [compareError, setCompareError] = createSignal<string | undefined>();

	const onOpenFile = async (file: File) => {
		const data = Buffer.from(await file.arrayBuffer());
		setOther(data);
		setOtherName(file.name);
		compare();
	};

	const compare = () => {
		const a = props.buffer();
		const b = other();
		if (!a || !b)
			return;
		const regions = diffBuffers(a, b);
		const stats = diffEraseStats(a, b, regions);
		setResult({
			regions: diffRegionPreviews(a, b, regions),
			stats,
			totalBytes: regions.reduce((acc, r) => acc + r.length, 0),
			sameLength: a.length == b.length,
		});
	};

	// Converts the differences into a VKP patch (old = current buffer,
	// new = the compared file) and hands it to the patch editor.
	const generatePatch = () => {
		const a = props.buffer();
		const b = other();
		const res = result();
		if (!a || !b || !res)
			return;
		// Large differences produce a huge patch: ask, but always allow.
		if (res.totalBytes > 64 * 1024) {
			if (!confirm(`The dumps differ in ${formatSize(res.totalBytes)}.\n` +
				`Generating a patch will produce a very large patch.\n\nContinue?`))
				return;
		}
		setCompareError(undefined);

		const base = (props.patchBase?.() ?? props.baseAddr());
		const lines: string[] = [
			`; Generated by the dump compare tool ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
			`; old: current buffer, new: ${otherName()}`,
		];
		const CHUNK = 16;
		const regions = diffBuffers(a, b);
		for (const region of regions) {
			const end = Math.min(region.addr + region.length, Math.min(a.length, b.length));
			for (let off = region.addr; off < end; off += CHUNK) {
				const chunkEnd = Math.min(off + CHUNK, end);
				const oldHex = a.subarray(off, chunkEnd).toString("hex").toUpperCase();
				const newHex = b.subarray(off, chunkEnd).toString("hex").toUpperCase();
				lines.push(`0x${(base + off).toString(16).toUpperCase()}: ${oldHex} ${newHex}`);
			}
		}

		const pad = (n: number) => String(n).padStart(2, "0");
		const d = new Date();
		const name = `Patch_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
			`_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.vkp`;
		props.onGeneratePatch?.(lines.join("\n") + "\n", name);
	};

	return (
		<Stack spacing={1} width="100%">
			<Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
				<Button component="label" variant="outlined" size="small" startIcon={<CompareArrowsIcon />}>
					Compare with file ...
					<input type="file" accept=".bin,.fls,.ful" hidden onChange={(e) => {
						const file = e.target.files?.[0];
						if (file)
							void onOpenFile(file);
					}} />
				</Button>
				<Show when={otherName()}>
					<Typography variant="body2">{otherName()}</Typography>
				</Show>
				<Show when={result()?.regions.length && props.onGeneratePatch}>
					<Button variant="outlined" size="small" onClick={generatePatch}>
						Generate Patch
					</Button>
				</Show>
			</Stack>
			<Show when={compareError()}>
				<Alert severity="error">{compareError()}</Alert>
			</Show>
			<Show when={result()} keyed>
				{(res) => (
					<Stack spacing={1}>
						<Show when={!res.regions.length}>
							<Alert severity="success">The dumps are identical ({formatSize(props.buffer()!.length)} compared).</Alert>
						</Show>
						<Show when={res.regions.length}>
							<Alert severity={res.stats.aToFF && res.stats.ffToA ? 'info' : 'warning'}>
								{res.regions.length} differing region(s), {formatSize(res.totalBytes)} of bytes differ.
								{' '}Erased (data → FF): {res.stats.aToFF}, filled (FF → data): {res.stats.ffToA},
								changed: {res.stats.changed}.
								<Show when={!res.sameLength}>
									<br />Note: the dumps have different lengths (only the common part is compared).
								</Show>
							</Alert>
							<Box sx={{ maxHeight: 360, overflow: 'auto', width: '100%' }}>
								<For each={res.regions}>{(region) => (
									<Box sx={{ py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
										<Typography variant="body2">
											<b>{sprintf('0x%08X', props.baseAddr() + region.addr)}</b>
											{' '}({formatSize(region.length)}{region.length > 32 ? ', first 32 bytes' : ''})
										</Typography>
										<Typography variant="caption" component="div" sx={{ wordBreak: 'break-all' }}>
											ours: {region.a || '<empty>'}
										</Typography>
										<Typography variant="caption" component="div" sx={{ wordBreak: 'break-all' }}>
											other: {region.b || '<empty>'}
										</Typography>
									</Box>
								)}</For>
							</Box>
						</Show>
					</Stack>
				)}
			</Show>
		</Stack>
	);
};

// ---------------------------------------------------------------------
// Editable text field with a preset dropdown (like the V_KLay combo boxes:
// free text entry + a list of the memory area presets).

interface EditableComboItem {
	value: string;
	label: string;
	size?: number;
}

const EditableCombo: Component<{
	label: string;
	value: string;
	error?: boolean;
	helperText?: string;
	items: EditableComboItem[];
	onChange: (value: string) => void;
	onSelect?: (item: EditableComboItem) => void;
	width?: number;
}> = (props) => {
	const [open, setOpen] = createSignal(false);
	let anchorEl: HTMLDivElement | undefined;

	return (
		<div ref={anchorEl} style={{ flex: '1 1 180px', 'min-width': '170px' }}>
			<Stack direction="row" alignItems="stretch">
				<TextField
					size="small"
					label={props.label}
					value={props.value}
					error={props.error}
					helperText={props.helperText}
					sx={{
						width: props.width ?? '100%',
						'& .MuiInputBase-input': { fontFamily: 'monospace' },
						'& fieldset': { borderTopRightRadius: 0, borderBottomRightRadius: 0 },
					}}
					onChange={(e) => props.onChange(e.currentTarget.value)}
				/>
				<Button
					size="small"
					variant="outlined"
					disabled={!props.items.length}
					title="Presets"
					sx={{
						minWidth: 34,
						px: 0,
						height: 40,
						borderTopLeftRadius: 0,
						borderBottomLeftRadius: 0,
						ml: '-1px',
					}}
					onClick={() => setOpen(true)}
				>
					<ArrowDropDownIcon />
				</Button>
			</Stack>
			<Menu anchorEl={anchorEl} open={open()} onClose={() => setOpen(false)}>
				<For each={props.items}>{(item) =>
					<MenuItem onClick={() => {
						setOpen(false);
						props.onChange(item.value);
						props.onSelect?.(item);
					}}>
						{item.label}
					</MenuItem>
				}</For>
			</Menu>
		</div>
	);
};

// V_KLay-style hex field helpers: values are formatted as 0x00000000,
// user input may have an optional 0x prefix.
function hexField(value: number): string {
	return '0x' + (value >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

function parseHexField(text: string): number {
	const value = text.trim().toLowerCase().replace(/^0x/, '');
	if (!validateHex(value))
		return NaN;
	return parseInt(value, 16);
}

// Compact duration for the progress display: mm:ss or h:mm:ss.
function formatEta(seconds: number): string {
	seconds = Math.max(0, Math.round(seconds));
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	const pad = (n: number) => String(n).padStart(2, '0');
	return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// ---------------------------------------------------------------------
// Helpers

// Renders the error location inside the editable patch text (like V_KLay
// reports "Line %1" errors). The editor is always available: a patch can be
// created, pasted and edited from scratch, with or without a connected phone
// or an opened dump.
function codeFrameSafe(err: any, text: string): string {
	try {
		const frame = typeof err?.codeFrame == "function" ? err.codeFrame(text) : undefined;
		return frame ? "\n" + frame : "";
	} catch {
		return "";
	}
}

function useSignalError() {
	const [error, setError] = createSignal<string | undefined>();
	return [error, setError] as const;
}

function formatFlashInfoParts(info: any): { title: string; details?: string } {
	if (!info)
		return { title: 'Connected (no flash info)' };
	if (info.kind == 'v3') {
		const regions = (info.regions ?? []).map((r: any) =>
			`${r.blocksCount}x${formatSize(r.eraseSize)}`).join(', ');
		return {
			title: `${info.manufacturer} ${info.model} IMEI ${info.imei}`,
			details: `Flash ${sprintf('%04X:%04X', info.flashVID, info.flashPID)}, regions: ${regions}`,
		};
	}
	if (info.kind == 'v1') {
		return { title: `${info.manufacturer} ${info.model} ${info.langPack} fw${(info.fwVersion ?? 0).toString(16)}` };
	}
	return { title: 'Connected' };
}

function formatFlashInfo(info: any): string {
	const { title, details } = formatFlashInfoParts(info);
	return details ? `${title}; ${details}` : title;
}

export default FlasherPage;
