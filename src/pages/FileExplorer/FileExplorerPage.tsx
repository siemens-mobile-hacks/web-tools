import * as Comlink from 'comlink';
import { useLocation, useNavigate } from '@solidjs/router';
import { Component, createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from 'solid-js';
import { format as dateFormat } from 'date-fns/format';
import {
	Alert,
	Box,
	Breadcrumbs,
	Button,
	Checkbox,
	IconButton,
	LinearProgress,
	Link,
	Paper,
	Stack,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Typography
} from '@suid/material';
import DeleteIcon from '@suid/icons-material/Delete';
import CreateNewFolderIcon from '@suid/icons-material/CreateNewFolder';
import DriveFileRenameOutlineIcon from '@suid/icons-material/DriveFileRenameOutline';
import FolderIcon from '@suid/icons-material/Folder';
import InsertDriveFileIcon from '@suid/icons-material/InsertDriveFile';
import DownloadIcon from '@suid/icons-material/Download';
import UploadFileIcon from '@suid/icons-material/UploadFile';
import DriveFolderUploadIcon from '@suid/icons-material/DriveFolderUpload';
import ArrowUpwardIcon from '@suid/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@suid/icons-material/ArrowDownward';
import RefreshIcon from '@suid/icons-material/Refresh';
import ClearIcon from '@suid/icons-material/Clear';
import ContentCopyIcon from '@suid/icons-material/ContentCopy';
import OpenInNewIcon from '@suid/icons-material/OpenInNew';
import { SerialConnect } from '@/components/SerialConnect.js';
import { useSerial } from '@/providers/SerialProvider.js';
import { SerialReadyState, serialWorker } from '@/workers/endpoints/serial';
import { PageTitle } from '@/components/Layout/PageTitle';
import { downloadBlob, formatSize } from '@/utils';
import { createFilePreviewUrl, prepareFilePreview } from '@/utils/filePreview';
import { ZipWriter } from '@/utils/zip';
import type { ObexDirEntry, ObexProgress } from '@/utils/obex';
import { useTheme } from '@suid/material/styles';
import { useApp } from '@/providers/AppProvider';

type FlexMemStats = {
	capacity: number;
	available: number;
	maxPacketSize: number;
};

type TransferState = {
	kind: 'download' | 'upload';
	name: string;
	percent: number;
	cursor: number;
	total: number;
	speed: number;
	filesDone?: number;
	filesTotal?: number;
};

type SortKey = 'name' | 'size' | 'mtime' | 'access';

// Enough for the browser to display common phone files inline instead of downloading
const MIME_TYPES: Record<string, string> = {
	bmp: 'image/bmp',
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	svg: 'image/svg+xml',
	txt: 'text/plain',
	log: 'text/plain',
	ini: 'text/plain',
	xml: 'text/xml',
	html: 'text/html',
	htm: 'text/html',
	css: 'text/css',
	json: 'application/json',
	vcf: 'text/vcard',
	pdf: 'application/pdf',
};

function guessMimeType(fileName: string): string {
	const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
	return MIME_TYPES[ext] ?? 'application/octet-stream';
}

const escapeHtml = (s: string): string =>
	s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

type OpenFileProgressTab = { update: (e: ObexProgress) => void };

// Paints a progress page into the freshly opened tab so it doesn't sit blank
// while the file is transferred over the slow serial link
const initOpenFileTab = (win: Window | null, name: string): OpenFileProgressTab | undefined => {
	if (!win)
		return undefined;
	const doc = win.document;
	doc.title = name;
	doc.body.innerHTML = `
		<style>
			:root { color-scheme: light dark; }
			body {
				margin: 0;
				min-height: 100vh;
				display: flex;
				align-items: center;
				justify-content: center;
				font-family: system-ui, Roboto, sans-serif;
				background: #fafafa;
				color: rgba(0, 0, 0, 0.87);
			}
			@media (prefers-color-scheme: dark) {
				body { background: #121212; color: rgba(255, 255, 255, 0.87); }
			}
			.card { width: min(360px, 80vw); text-align: center; }
			.name { font-weight: 500; margin-bottom: 16px; overflow-wrap: anywhere; }
			.bar { height: 6px; border-radius: 3px; overflow: hidden; background: rgba(128, 128, 128, 0.3); }
			.fill { height: 100%; width: 0; border-radius: 3px; background: #1976d2; transition: width 0.2s ease; }
			.fill.indeterminate { width: 40%; animation: slide 1.2s ease-in-out infinite; }
			@keyframes slide {
				0% { margin-left: -40%; }
				100% { margin-left: 100%; }
			}
			.label { margin-top: 8px; font-size: 0.8rem; opacity: 0.7; }
		</style>
		<div class="card">
			<div class="name">${escapeHtml(name)}</div>
			<div class="bar"><div class="fill indeterminate" id="open-file-fill"></div></div>
			<div class="label" id="open-file-label">Waiting for data…</div>
		</div>`;
	const fill = doc.getElementById('open-file-fill');
	const label = doc.getElementById('open-file-label');
	if (!fill || !label)
		return undefined;
	return {
		update: (e) => {
			if (e.percent >= 0) {
				fill.classList.remove('indeterminate');
				fill.style.width = `${Math.min(100, e.percent)}%`;
				label.textContent = `${Math.floor(e.percent)}% — ${formatSize(e.cursor)} / ${formatSize(e.total)} — ${formatSize(e.speed)}/s`;
			} else {
				label.textContent = `${formatSize(e.cursor)} — ${formatSize(e.speed)}/s`;
			}
		}
	};
};

export const FileExplorerPage: Component = () => {
	const serial = useSerial();
	const app = useApp();
	const location = useLocation();
	const navigate = useNavigate();
	const [entries, setEntries] = createSignal<ObexDirEntry[]>([]);
	const [displayedDir, setDisplayedDir] = createSignal<string[] | undefined>(undefined);
	const [isLoading, setIsLoading] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const [transfer, setTransfer] = createSignal<TransferState | undefined>(undefined);
	const [stats, setStats] = createSignal<FlexMemStats | undefined>(undefined);
	const [baudrate, setBaudrate] = createSignal<number>(0);
	const [selected, setSelected] = createSignal<Set<string>>(new Set());
	const [sortKey, setSortKey] = createSignal<SortKey>('name');
	const [sortDir, setSortDir] = createSignal<1 | -1>(1);
	const [logLines, setLogLines] = createSignal<string[]>([]);
	const [deviceName, setDeviceName] = createSignal<string | undefined>(undefined);
	const theme = useTheme();

	const [stickToLogBottom, setStickToLogBottom] = createSignal(true);

	let fileInputRef!: HTMLInputElement;
	let directoryInputRef!: HTMLInputElement;
	let logPreElement: HTMLPreElement | undefined;
	let isPointerPressedInsideLog = false;

	// Blob URLs of opened files, revoked when the page is left
	const openedObjectUrls: string[] = [];

	const MAX_LOG_LINES = 1000;
	const appendLogLine = (line: string): void => {
		setLogLines((prev) => {
			const next = [...prev, line];
			if (next.length > MAX_LOG_LINES)
				next.splice(0, next.length - MAX_LOG_LINES);
			return next;
		});
	};

	const copyLogToClipboard = (): void => {
		const text = logLines().join('\n');
		void navigator.clipboard?.writeText(text);
	};

	const scrollLogToBottom = (): void => {
		if (logPreElement)
			logPreElement.scrollTop = logPreElement.scrollHeight;
	};

	const updateLogStickiness = (): void => {
		if (!logPreElement)
			return;
		if (isPointerPressedInsideLog) {
			setStickToLogBottom(false);
			return;
		}
		const distanceFromBottom = logPreElement.scrollHeight - logPreElement.scrollTop - logPreElement.clientHeight;
		setStickToLogBottom(distanceFromBottom <= 24);
	};

	// Auto-scroll only while the log is already at the bottom
	createEffect(() => {
		logLines();
		if (stickToLogBottom())
			queueMicrotask(scrollLogToBottom);
	});

	onMount(async () => {
		// Registered early so the preview worker is ready when a file is opened
		void prepareFilePreview();
		const history = await serial.logs.getLog();
		if (history.length)
			setLogLines(history);
		queueMicrotask(scrollLogToBottom);
		await serial.logs.setListener(Comlink.proxy(appendLogLine));
	});

	onCleanup(() => {
		void serial.logs.setListener(undefined);
		for (const url of openedObjectUrls)
			URL.revokeObjectURL(url);
	});

	// Safety net: a pointerdown inside the log can be released outside it, in that case
	// pointerup never fires on the element and stickiness would stay disabled forever
	const onWindowPointerUp = (): void => {
		if (!isPointerPressedInsideLog)
			return;
		isPointerPressedInsideLog = false;
		updateLogStickiness();
	};
	window.addEventListener('pointerup', onWindowPointerUp);
	onCleanup(() => window.removeEventListener('pointerup', onWindowPointerUp));

	const obexReady = createMemo<boolean>(() => {
		return serial.readyState() === SerialReadyState.CONNECTED && serial.protocol() === "OBEX";
	});

	// Current directory is part of the URL, so browser back/forward and deep links work
	const path = createMemo<string[]>(() => {
		const raw = new URLSearchParams(location.search).get("path");
		if (!raw)
			return [];
		return raw.split("/").filter(Boolean).map(decodeURIComponent);
	});

	const errorWrap = <T extends (...args: any[]) => Promise<void>>(callback: T): ((...args: Parameters<T>) => Promise<void>) => {
		return async (...args: Parameters<T>): Promise<void> => {
			try {
				setError(null);
				await callback(...args);
			} catch (e) {
				setError((e as Error).message);
			}
		};
	};

	const refreshStats = async (): Promise<void> => {
		const speed = await serial.obex.getBaudrate().catch(() => 0);
		setBaudrate(speed);
		const capacity = await serial.obex.getCapacity();
		const available = await serial.obex.getAvailable();
		const maxPacketSize = await serial.obex.getMaxPacketSize();
		setStats({ capacity, available, maxPacketSize });
	};

	const loadDir = errorWrap(async (targetPath: string[] = []): Promise<void> => {
		setIsLoading(true);
		try {
			const list = await serial.obex.readDir("/" + targetPath.join("/"));
			list.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
			setEntries(list);
			setSelected(new Set<string>());
			setDisplayedDir(targetPath);
		} finally {
			setIsLoading(false);
		}
	});

	// Pushes a new history entry, the URL effect below performs the actual listing
	const navigateTo = (targetPath: string[]): void => {
		if (isBusy())
			return;
		const qs = targetPath.length
			? `?path=${targetPath.map(encodeURIComponent).join("/")}`
			: "";
		if (qs == location.search)
			return;
		navigate(`/file-explorer${qs}`);
	};

	const filePath = (name: string): string => "/" + [...path(), name].join("/");

	const toggleSort = (key: SortKey): void => {
		if (key == sortKey()) {
			setSortDir(sortDir() == 1 ? -1 : 1);
		} else {
			setSortKey(key);
			setSortDir(1);
		}
	};

	// Display order: directories first, then the selected column in the selected direction
	const sortedEntries = createMemo<ObexDirEntry[]>(() => {
		const key = sortKey();
		const dir = sortDir();
		return [...entries()].sort((a, b) => {
			const dirDiff = Number(b.isDir) - Number(a.isDir);
			if (dirDiff != 0)
				return dirDiff;
			let result: number;
			switch (key) {
				case 'size':
					result = a.size - b.size;
					break;
				case 'mtime':
					result = (a.mtime?.getTime() ?? 0) - (b.mtime?.getTime() ?? 0);
					break;
				case 'access':
					result = (Number(a.readable) * 2 + Number(a.writable)) - (Number(b.readable) * 2 + Number(b.writable));
					break;
				default:
					result = a.name.localeCompare(b.name);
			}
			return result * dir;
		});
	});

	const isSelected = (entry: ObexDirEntry): boolean => selected().has(entry.name);
	const selectedEntries = createMemo<ObexDirEntry[]>(() => entries().filter(isSelected));
	const isAllSelected = createMemo(() => entries().length > 0 && selected().size == entries().length);

	const toggleSelected = (entry: ObexDirEntry): void => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(entry.name))
				next.delete(entry.name);
			else
				next.add(entry.name);
			return next;
		});
	};

	const toggleSelectAll = (): void => {
		setSelected((prev) => prev.size == entries().length ? new Set<string>() : new Set<string>(entries().map((e) => e.name)));
	};

	const makeProgressHandler = (kind: 'download' | 'upload', name: string) => {
		return Comlink.proxy((e: ObexProgress) => {
			setTransfer({
				kind,
				name,
				percent: e.percent,
				cursor: e.cursor,
				total: e.total,
				speed: e.speed
			});
		});
	};

	const downloadFile = errorWrap(async (entry: ObexDirEntry): Promise<void> => {
		setTransfer({ kind: 'download', name: entry.name, percent: -1, cursor: 0, total: entry.size, speed: 0 });
		try {
			const data = await serial.obex.getFile(filePath(entry.name), makeProgressHandler('download', entry.name));
			downloadBlob(new Blob([new Uint8Array(data)]), entry.name);
		} finally {
			setTransfer(undefined);
		}
	});

	// Opens a file in a new browser tab, viewable types are displayed inline.
	// The tab must be opened synchronously with the click, otherwise popup blockers
	// kill it once the download has taken a while. It shows a progress page while
	// the file is transferred over serial and is redirected once the download finishes.
	const openFile = errorWrap(async (entry: ObexDirEntry): Promise<void> => {
		const win = window.open('about:blank', '_blank');
		const tab = initOpenFileTab(win, entry.name);
		setTransfer({ kind: 'download', name: entry.name, percent: -1, cursor: 0, total: entry.size, speed: 0 });
		try {
			const onProgress = Comlink.proxy((e: ObexProgress) => {
				setTransfer({
					kind: 'download',
					name: entry.name,
					percent: e.percent,
					cursor: e.cursor,
					total: e.total,
					speed: e.speed
				});
				tab?.update(e);
			});
			const data = await serial.obex.getFile(filePath(entry.name), onProgress);
			const blob = new Blob([new Uint8Array(data)], { type: guessMimeType(entry.name) });
			const previewUrl = await createFilePreviewUrl(blob, entry.name);
			if (win && previewUrl) {
				// Real URL ending with the file name: "Save as" keeps the name
				// and the tab can be reloaded
				win.location.href = previewUrl;
			} else if (win && blob.type != 'application/octet-stream') {
				// Browser can display it (image, text, pdf, ...), but no preview
				// worker: fall back to a blob URL ("Save as" won't know the name)
				const url = URL.createObjectURL(blob);
				openedObjectUrls.push(url);
				win.location.href = url;
			} else {
				// No inline view: download via an anchor with the download attribute,
				// which carries the file name
				win?.close();
				downloadBlob(blob, entry.name);
			}
		} catch (e) {
			win?.close();
			throw e;
		} finally {
			setTransfer(undefined);
		}
	});

	// Recursively adds an entry (file or directory) to the zip
	const addEntryToZip = async (zip: ZipWriter, root: string, entry: ObexDirEntry, counters: { bytes: number }): Promise<void> => {
		if (entry.isDir) {
			zip.addDir(`${root}/${entry.name}`, entry.mtime);
			const children = await serial.obex.readDir(`${root}/${entry.name}`);
			children.sort((a, b) => a.name.localeCompare(b.name));
			for (const child of children)
				await addEntryToZip(zip, `${root}/${entry.name}`, child, counters);
			return;
		}

		const onProgress = Comlink.proxy((e: ObexProgress) => {
			setTransfer((prev) => prev && {
				...prev,
				cursor: counters.bytes + e.cursor,
				percent: prev.total > 0 ? Math.min(100, ((counters.bytes + e.cursor) / prev.total) * 100) : -1,
				speed: e.speed,
			});
		});
		const data = await serial.obex.getFile(`${root}/${entry.name}`, onProgress);
		zip.addFile(`${root}/${entry.name}`, data, entry.mtime);
		counters.bytes += data.length;
	};

	const downloadSelection = errorWrap(async (list: ObexDirEntry[]): Promise<void> => {
		if (!list.length)
			return;

		// A single selected file is downloaded as-is, everything else becomes a zip
		if (list.length == 1 && !list[0].isDir) {
			await downloadFile(list[0]);
			return;
		}

		const zipName = list.length == 1
			? `${list[0].name}.zip`
			: `${path().length ? path()[path().length - 1] : 'Phone'}.zip`;
		setTransfer({ kind: 'download', name: zipName, percent: -1, cursor: 0, total: 0, speed: 0 });
		const counters = { bytes: 0 };
		try {
			const zip = new ZipWriter();
			for (const entry of list)
				await addEntryToZip(zip, "", entry, counters);
			downloadBlob(new Blob([new Uint8Array(zip.build())]), zipName);
		} finally {
			setTransfer(undefined);
		}
	});

	const uploadFile = errorWrap(async (file: File): Promise<void> => {
		await uploadFiles([file]);
	});

	const uploadFiles = errorWrap(async (files: File[]): Promise<void> => {
		if (!files.length)
			return;

		const totalSize = files.reduce((sum, file) => sum + file.size, 0);

		// Warn before starting if the phone clearly can't fit the upload
		const s = stats();
		if (s && totalSize > s.available && !confirm('Not enough free space, are you sure you want to continue?'))
			return;

		setTransfer({
			kind: 'upload',
			name: files.length > 1 ? `${files.length} files` : files[0].name,
			percent: -1,
			cursor: 0,
			total: totalSize,
			speed: 0,
			filesDone: 0,
			filesTotal: files.length,
		});

		const createdDirs = new Set<string>();
		let uploadedSize = 0;

		try {
			for (const [index, file] of files.entries()) {
				// webkitRelativePath is set for directory uploads, e.g. "Sounds/midi/theme.mid"
				const relPathParts = (file.webkitRelativePath || file.name).split('/').filter(Boolean);
				const fileName = relPathParts.pop()!;
				const dirParts = [...path(), ...relPathParts];

				const dirPath = "/" + dirParts.join("/");
				if (dirParts.length && !createdDirs.has(dirPath)) {
					await serial.obex.mkdir(dirPath);
					createdDirs.add(dirPath);
				}

				const data = new Uint8Array(await file.arrayBuffer());
				const onProgress = Comlink.proxy((e: ObexProgress) => {
					setTransfer((prev) => prev && {
						...prev,
						name: fileName,
						cursor: uploadedSize + e.cursor,
						total: totalSize,
						speed: e.speed,
						percent: totalSize > 0 ? Math.min(100, ((uploadedSize + e.cursor) / totalSize) * 100) : -1,
						filesDone: index,
					});
				});

				await serial.obex.putFile(`/${[...dirParts, fileName].join("/")}`, data, onProgress);
				uploadedSize += file.size;
				setTransfer((prev) => prev && { ...prev, filesDone: index + 1 });
			}
			await loadDir(path());
			await refreshStats();
		} finally {
			setTransfer(undefined);
		}
	});

	const deleteRecursive = async (target: string, entry: ObexDirEntry): Promise<void> => {
		if (entry.isDir) {
			const children = await serial.obex.readDir(target);
			for (const child of children)
				await deleteRecursive(`${target}/${child.name}`, child);
		}
		await serial.obex.deleteFile(target);
	};

	const deleteEntry = errorWrap(async (entry: ObexDirEntry): Promise<void> => {
		if (!confirm(`Delete "${entry.name}"${entry.isDir ? ' and everything inside it' : ''}?`))
			return;
		setIsLoading(true);
		try {
			await deleteRecursive(filePath(entry.name), entry);
			await loadDir(path());
			await refreshStats();
		} finally {
			setIsLoading(false);
		}
	});

	const deleteSelected = errorWrap(async (): Promise<void> => {
		const list = selectedEntries();
		if (!list.length)
			return;
		const message = list.length == 1
			? `Delete "${list[0].name}"${list[0].isDir ? ' and everything inside it' : ''}?`
			: `Delete ${list.length} selected items and everything inside them?`;
		if (!confirm(message))
			return;
		setIsLoading(true);
		try {
			for (const entry of list)
				await deleteRecursive(filePath(entry.name), entry);
			await loadDir(path());
			await refreshStats();
		} finally {
			setIsLoading(false);
		}
	});

	const renameEntry = errorWrap(async (entry: ObexDirEntry): Promise<void> => {
		const newName = prompt(`Rename "${entry.name}" to:`, entry.name)?.trim();
		if (!newName || newName == entry.name)
			return;
		setIsLoading(true);
		try {
			await serial.obex.move(filePath(entry.name), filePath(newName));
			await loadDir(path());
		} finally {
			setIsLoading(false);
		}
	});

	const createDirectory = errorWrap(async (): Promise<void> => {
		const name = prompt('New folder name:')?.trim();
		if (!name)
			return;
		setIsLoading(true);
		try {
			await serial.obex.mkdir(filePath(name));
			await loadDir(path());
			await refreshStats();
		} finally {
			setIsLoading(false);
		}
	});

	const isBusy = createMemo(() => isLoading() || !!transfer());

	// F2 renames the single selected entry
	const onKeyDown = (e: KeyboardEvent): void => {
		if (e.key != 'F2')
			return;
		const list = selectedEntries();
		if (list.length != 1 || isBusy())
			return;
		e.preventDefault();
		void renameEntry(list[0]);
	};

	onMount(() => window.addEventListener('keydown', onKeyDown));
	onCleanup(() => window.removeEventListener('keydown', onKeyDown));

	const onDeviceChange = (device?: string) => setDeviceName(device);
	onMount(() => serialWorker.on('deviceChange', onDeviceChange));
	onCleanup(() => serialWorker.off('deviceChange', onDeviceChange));

	// Connection speed and free space are shown in the title bar right after the phone name
	createEffect(() => {
		const name = deviceName();
		if (!name)
			return;
		const s = stats();
		const parts = [name];
		if (baudrate())
			parts.push(`${baudrate()} baud`);
		if (s)
			parts.push(`${formatSize(s.available)} free`);
		app.setStatus(parts.join(' · '));
	});

	createEffect(on(obexReady, (ready) => {
		setEntries([]);
		setError(null);
		setStats(undefined);
		setBaudrate(0);
		setDisplayedDir(undefined);
		if (!ready)
			return;

		void refreshStats().catch((e) => setError((e as Error).message));
	}));

	// Loads the directory from the URL whenever it changes (navigation, back/forward, connect).
	// The OBEX queue serializes concurrent requests, so this is safe even during a transfer.
	createEffect(() => {
		const target = path();
		if (!obexReady())
			return;
		if (target.join("/") == displayedDir()?.join("/"))
			return;
		void loadDir(target);
	});

	const sortIcon = (key: SortKey) => {
		if (key != sortKey())
			return <></>;
		return sortDir() == 1 ? <ArrowUpwardIcon sx={{ fontSize: 16 }} /> : <ArrowDownwardIcon sx={{ fontSize: 16 }} />;
	};

	const sortableHeader = (key: SortKey, label: string, extra: { align?: 'left' | 'right' | 'center'; padding?: 'checkbox' } = {}) => (
		<TableCell align={extra.align} padding={extra.padding}>
			<Link
				component="button"
				onClick={() => toggleSort(key)}
				sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, whiteSpace: 'nowrap', fontWeight: 'bold' }}
			>
				{label}
				{sortIcon(key)}
			</Link>
		</TableCell>
	);

	return (
		<Box>
			<PageTitle>File Explorer</PageTitle>

			<Box mb={2}>
				{/* Progress lives next to the connect controls so an active transfer
				  doesn't add a line and shift the file list down */}
				<Stack direction="row" alignItems="center" gap={1}>
					<SerialConnect protocol="OBEX" />
					<Show when={transfer()}>
						<Stack direction="row" alignItems="center" gap={1} sx={{ minWidth: 0, flexGrow: 1 }}>
							<Typography variant="body2" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
								{transfer()!.kind == 'download' ? 'Downloading' : 'Uploading'}: {transfer()!.name}
								<Show when={transfer()!.filesTotal}>
									{' '}({transfer()!.filesDone} / {transfer()!.filesTotal})
								</Show>
							</Typography>
							<Box sx={{ flexGrow: 1, minWidth: 80 }}>
								<LinearProgress
									variant={transfer()!.percent >= 0 ? 'determinate' : 'indeterminate'}
									value={transfer()!.percent >= 0 ? transfer()!.percent : undefined}
								/>
							</Box>
							<Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
								{formatSize(transfer()!.cursor)}{transfer()!.total > 0 ? ` / ${formatSize(transfer()!.total)}` : ''}, {formatSize(transfer()!.speed)}/s
							</Typography>
						</Stack>
					</Show>
				</Stack>
			</Box>

			<Stack spacing={2} sx={{ maxWidth: 900 }}>
				{/* Status window: logs AT commands and OBEX operations, also while connecting */}
				<Box sx={{ position: 'relative' }}>
					<Show when={logLines().length}>
						<IconButton
							size="small"
							title="Copy to clipboard"
							sx={{
								position: 'absolute',
								top: 0,
								right: 32,
								zIndex: 1,
								bgcolor: theme.palette.mode === 'light' ? theme.palette.grey[100] : theme.palette.grey[900],
							}}
							onClick={copyLogToClipboard}
						>
							<ContentCopyIcon sx={{ fontSize: 14 }} />
						</IconButton>
						<IconButton
							size="small"
							title="Clear"
							sx={{
								position: 'absolute',
								top: 0,
								right: 0,
								zIndex: 1,
								bgcolor: theme.palette.mode === 'light' ? theme.palette.grey[100] : theme.palette.grey[900],
							}}
							onClick={() => {
								setLogLines([]);
								void serial.logs.clear();
							}}
						>
							<ClearIcon sx={{ fontSize: 14 }} />
						</IconButton>
					</Show>
					<Box
						component="pre"
						aria-live="polite"
						ref={(el) => (logPreElement = el as HTMLPreElement)}
						onScroll={updateLogStickiness}
						onPointerDown={(e) => {
							isPointerPressedInsideLog = true;
							setStickToLogBottom(false);
							// Capture the pointer, so pointerup is delivered here even when released outside the log
							e.currentTarget.setPointerCapture?.(e.pointerId);
						}}
						onPointerUp={() => {
							isPointerPressedInsideLog = false;
							updateLogStickiness();
						}}
						onPointerCancel={() => {
							isPointerPressedInsideLog = false;
							updateLogStickiness();
						}}
						sx={{
							background: theme.palette.mode === 'light' ? theme.palette.grey[100] : theme.palette.grey[900],
							color: theme.palette.text.primary,
							p: 1,
							borderRadius: 1,
							height: `calc(3 * 1.4 * 0.75rem + 16px)`,
							overflow: 'auto',
							whiteSpace: 'pre-wrap',
							wordBreak: 'break-all',
						// keep text readable under the overlapping clear button
						pr: 4,
							m: 0,
							fontSize: '0.75rem',
							lineHeight: 1.4,
							fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
						}}
					>
						{logLines().join('\n')}
					</Box>
				</Box>

				<Show
					when={obexReady()}
					fallback={
						<Alert severity="info">
							Connect to your phone via serial to access its filesystem over OBEX.
						</Alert>
					}
				>
					{/* Current path and navigation */}
					<Stack direction="row" alignItems="center" gap={1}>
						<Box sx={{ flexGrow: 1, minWidth: 200 }}>
							<Breadcrumbs>
								<Link component="button" onClick={() => navigateTo([])}>Phone</Link>
								<For each={path()}>{(part, index) =>
									<Show
										when={index() < path().length - 1}
										fallback={<Typography color="text.primary">{part}</Typography>}
									>
										<Link component="button" onClick={() => navigateTo(path().slice(0, index() + 1))}>
											{part}
										</Link>
									</Show>
								}</For>
							</Breadcrumbs>
						</Box>

						<IconButton
							title="Up"
							disabled={!path().length || isBusy()}
							onClick={() => navigateTo(path().slice(0, -1))}
						>
							<ArrowUpwardIcon />
						</IconButton>

						<IconButton
							title="Refresh"
							disabled={isBusy()}
							onClick={() => {
								void loadDir(path());
								void refreshStats().catch((e) => setError((e as Error).message));
							}}
						>
							<RefreshIcon />
						</IconButton>
					</Stack>

					{/* Actions: kept on their own row so long paths don't wrap them */}
					<Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
						<IconButton
							title="New folder"
							disabled={isBusy()}
							onClick={() => void createDirectory()}
						>
							<CreateNewFolderIcon />
						</IconButton>

						<Button
							variant="outlined"
							startIcon={<DownloadIcon />}
							disabled={isBusy() || !selectedEntries().length}
							onClick={() => void downloadSelection(selectedEntries())}
						>
							Download selected{selectedEntries().length > 1 ? ` (${selectedEntries().length})` : ''}
						</Button>

						<Button
							variant="outlined"
							color="error"
							startIcon={<DeleteIcon />}
							disabled={isBusy() || !selectedEntries().length}
							onClick={() => void deleteSelected()}
						>
							Delete selected{selectedEntries().length > 1 ? ` (${selectedEntries().length})` : ''}
						</Button>

						<Button
							variant="contained"
							component="label"
							startIcon={<UploadFileIcon />}
							disabled={isBusy()}
						>
							Upload File
							<input
								ref={fileInputRef}
								type="file"
								hidden
								onChange={(e) => {
									const file = e.currentTarget.files?.[0];
									e.currentTarget.value = "";
									if (file)
										void uploadFile(file);
								}}
							/>
						</Button>

						<Button
							variant="outlined"
							component="label"
							startIcon={<DriveFolderUploadIcon />}
							disabled={isBusy()}
						>
							Upload folder
							<input
								ref={directoryInputRef}
								type="file"
								webkitdirectory
								multiple
								hidden
								onChange={(e) => {
									const files = Array.from(e.currentTarget.files ?? []);
									e.currentTarget.value = "";
									if (files.length)
										void uploadFiles(files);
								}}
							/>
						</Button>
					</Stack>

					<Show when={isLoading() && !transfer()}>
						<LinearProgress />
					</Show>

					<Show when={error()}>
						<Alert severity="error">{error()}</Alert>
					</Show>

					<TableContainer component={Paper}>
						<Table size="small">
							<TableHead>
								<TableRow>
									<TableCell padding="checkbox">
										<Checkbox
											size="small"
											checked={isAllSelected()}
											indeterminate={!isAllSelected() && !!selected().size}
											disabled={isBusy() || !entries().length}
											onChange={toggleSelectAll}
										/>
									</TableCell>
									{sortableHeader('name', 'Name')}
									{sortableHeader('size', 'Size', { align: 'right' })}
									{sortableHeader('mtime', 'Modified')}
									{sortableHeader('access', 'Access', { align: 'center' })}
									<TableCell padding="checkbox" />
								</TableRow>
							</TableHead>
							<TableBody>
								<Show when={path().length}>
									<TableRow hover>
										<TableCell padding="checkbox" />
										<TableCell colSpan={4}>
											<Stack direction="row" alignItems="center" gap={1}>
												<ArrowUpwardIcon />
												<Link component="button" onClick={() => navigateTo(path().slice(0, -1))}>
													..
												</Link>
											</Stack>
										</TableCell>
										<TableCell padding="checkbox" />
									</TableRow>
								</Show>
								<For each={sortedEntries()}>{(entry) =>
									<TableRow hover selected={isSelected(entry)} sx={entry.hidden ? { opacity: 0.55 } : undefined}>
										<TableCell padding="checkbox">
											<Checkbox
												size="small"
												checked={isSelected(entry)}
												disabled={isBusy()}
												onChange={() => toggleSelected(entry)}
											/>
										</TableCell>
										<TableCell>
											<Stack direction="row" alignItems="center" gap={1}>
												<Show when={entry.isDir} fallback={<InsertDriveFileIcon />}>
													<FolderIcon />
												</Show>
												<Show
													when={entry.isDir}
													fallback={
														<Link
															component="button"
															title="Open in new tab"
															sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
															onClick={() => void openFile(entry)}
															onAuxClick={(e: MouseEvent) => {
																// Middle click opens the file as well
																if (e.button == 1) {
																	e.preventDefault();
																	void openFile(entry);
																}
															}}
														>
															{entry.name}
															<OpenInNewIcon sx={{ fontSize: 12 }} />
														</Link>
													}
												>
													<Link component="button" onClick={() => navigateTo([...path(), entry.name])}>
														{entry.name}
													</Link>
												</Show>
											</Stack>
										</TableCell>
										<TableCell align="right">{entry.isDir ? '' : formatSize(entry.size)}</TableCell>
										<TableCell>{entry.mtime ? dateFormat(entry.mtime, 'dd.MM.yyyy HH:mm') : ''}</TableCell>
										<TableCell align="center">
											{[entry.readable && 'R', entry.writable && 'W'].filter(Boolean).join(' ')}
										</TableCell>
										<TableCell padding="checkbox" sx={{ whiteSpace: 'nowrap' }}>
											<Stack direction="row" alignItems="center" sx={{ flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
												<IconButton
													size="small"
													title={entry.isDir ? 'Download (zip)' : 'Download'}
													disabled={isBusy()}
													onClick={() => void downloadSelection([entry])}
												>
													<DownloadIcon />
												</IconButton>
												<IconButton
													size="small"
													title="Rename"
													disabled={isBusy()}
													onClick={() => void renameEntry(entry)}
												>
													<DriveFileRenameOutlineIcon />
												</IconButton>
												<IconButton
													size="small"
													title="Delete"
													disabled={isBusy()}
													onClick={() => void deleteEntry(entry)}
												>
													<DeleteIcon />
												</IconButton>
											</Stack>
										</TableCell>
									</TableRow>
								}</For>
								<Show when={!entries().length && !isLoading()}>
									<TableRow>
										<TableCell colSpan={6} align="center">
											<Typography color="text.secondary">Folder is empty</Typography>
										</TableCell>
									</TableRow>
								</Show>
							</TableBody>
						</Table>
					</TableContainer>
				</Show>
			</Stack>
		</Box>
	);
}

export default FileExplorerPage;
