import * as Comlink from 'comlink';
import { useBeforeLeave, useLocation, useNavigate } from '@solidjs/router';
import { batch, Component, createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from 'solid-js';
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
	ToggleButton,
	ToggleButtonGroup,
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
import { useSerial } from '@/providers/SerialProvider.js';
import { SerialReadyState } from '@/workers/endpoints/serial';
import { PageTitle } from '@/components/Layout/PageTitle';
import { downloadBlob, formatSize } from '@/utils';
import { createFilePreviewUrl, isScripted, prepareFilePreview } from '@/utils/filePreview';
import JSZip from 'jszip';
import { useTheme } from '@suid/material/styles';
import { attributeLetters, attributeNames, type DiskInfo, type FileSystem, type FileSystemEntry, type FileSystemProgress } from '@/pages/FileExplorer/FileSystem';
import { ObexFS } from '@/pages/FileExplorer/ObexFS';
import type { FullFlashFS } from '@/pages/FileExplorer/FullFlashFS';
import { ObexStatusBar } from '@/pages/FileExplorer/ObexStatusBar';
import { FullFlashStatusBar } from '@/pages/FileExplorer/FullFlashStatusBar';
import { FullFlashNotices } from '@/pages/FileExplorer/FullFlashNotices';

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

type SortKey = 'name' | 'size' | 'mtime' | 'attributes';

type Source = 'phone' | 'fullflash';

// A directory's entries as they were read, or why they could not be
type Listing = {
	fs: FileSystem;
	dir: string[];
	entries?: FileSystemEntry[];
	error?: string;
};

const toPath = (names: string[]): string => "/" + names.join("/");

// The order the phones list their disks in, which the root's directories are
const DISK_ORDER = ['Data', 'Cache', 'Config'];

const diskRank = (entry: FileSystemEntry): number => {
	const rank = DISK_ORDER.indexOf(entry.name);
	return rank < 0 ? DISK_ORDER.length : rank;
};

const isFileExplorer = (pathname: string): boolean => /\/file-explorer\/?$/.test(pathname);

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

type OpenFileProgressTab = { update: (e: FileSystemProgress) => void };

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
	const location = useLocation();
	const navigate = useNavigate();
	const [listing, setListing] = createSignal<Listing | undefined>(undefined);
	// Of the loads and changes under way
	const [pending, setPending] = createSignal(0);
	const [error, setError] = createSignal<string | null>(null);
	const [transfer, setTransfer] = createSignal<TransferState | undefined>(undefined);
	const [selected, setSelected] = createSignal<Set<string>>(new Set());
	const [sortKey, setSortKey] = createSignal<SortKey>('name');
	const [sortDir, setSortDir] = createSignal<1 | -1>(1);
	const [logLines, setLogLines] = createSignal<string[]>([]);
	const [fullflash, setFullflash] = createSignal<FullFlashFS | undefined>(undefined);
	// Of the file system and the disk it was read for, as a fullflash's partitions are disks of their own
	const [diskInfo, setDiskInfo] = createSignal<{ fs: FileSystem; disk: string; info: DiskInfo } | undefined>(undefined);
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

	// Source and current directory are part of the URL, so browser back/forward and deep links work
	const source = createMemo<Source>(() => {
		return new URLSearchParams(location.search).get("source") == "fullflash" ? "fullflash" : "phone";
	});

	// One for each connection, so that nothing read over the one before is taken for the phone's
	const phoneFS = createMemo<ObexFS | undefined>(() => obexReady() ? new ObexFS(serial.obex) : undefined);

	// Undefined until the phone is connected or a fullflash is opened
	const fs = createMemo<FileSystem | undefined>(() => {
		if (source() == 'fullflash')
			return fullflash();
		return phoneFS();
	});

	// URLSearchParams decodes the names navigateTo() encodes
	const path = createMemo<string[]>(() => {
		const raw = new URLSearchParams(location.search).get("path");
		if (!raw)
			return [];
		return raw.split("/").filter(Boolean);
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

	const isLoading = (): boolean => pending() > 0;

	// The listing of the current file system, which the page shows
	const shownListing = createMemo<Listing | undefined>(() => listing()?.fs == fs() ? listing() : undefined);
	const entries = createMemo<FileSystemEntry[]>(() => shownListing()?.entries ?? []);
	// An operation's, else the shown listing's
	const shownError = (): string | undefined => error() ?? shownListing()?.error;
	const displayedDir = (): string[] | undefined => shownListing()?.dir;

	const disk = createMemo<DiskInfo | undefined>(() => {
		const fileSystem = fs();
		const cached = diskInfo();
		return fileSystem && cached?.fs == fileSystem && cached.disk == fileSystem.diskOf(toPath(path())) ? cached.info : undefined;
	});

	// Nothing is written to a directory that could not be listed, or to a disk that can't be changed
	const isReadOnly = (): boolean => !shownListing()?.entries || !!disk()?.readOnly;

	// Whether the page still shows the file system and the directory, or its disk, which loads and
	// changes that finish after the user has moved on must leave alone
	const isShown = (fileSystem: FileSystem, dir: string[]): boolean => fs() == fileSystem && toPath(path()) == toPath(dir);
	const isDiskShown = (fileSystem: FileSystem, dir: string[]): boolean =>
		fs() == fileSystem && fileSystem.diskOf(toPath(path())) == fileSystem.diskOf(toPath(dir));

	// Tells of the disk the directory is on
	const refreshDisk = async (fileSystem: FileSystem, dir: string[]): Promise<void> => {
		try {
			const info = await fileSystem.getDiskInfo(toPath(dir));
			if (isDiskShown(fileSystem, dir))
				setDiskInfo({ fs: fileSystem, disk: fileSystem.diskOf(toPath(dir)), info });
		} catch (e) {
			if (isDiskShown(fileSystem, dir))
				setError((e as Error).message);
		}
	};

	// Lists the directory, and tells of its disk when that is another than the one told of, or when
	// the directory was changed. A directory that can't be listed is shown empty, with the error.
	const loadDir = async (fileSystem: FileSystem, dir: string[], isChanged = false): Promise<void> => {
		setPending((count) => count + 1);
		try {
			let list: FileSystemEntry[] | undefined;
			let listError: string | undefined;
			try {
				list = await fileSystem.readDir(toPath(dir));
			} catch (e) {
				listError = (e as Error).message;
			}
			if (!isShown(fileSystem, dir))
				return;
			batch(() => {
				setListing({ fs: fileSystem, dir, entries: list, error: listError });
				setSelected(new Set<string>());
			});
			selectionAnchor = undefined;
			if (list && (isChanged || !disk()))
				await refreshDisk(fileSystem, dir);
		} finally {
			setPending((count) => count - 1);
		}
	};

	// Changes the current directory, which is listed again afterwards, also when the change failed
	// midway, since what it did before is done
	const changeDir = async (change: (fileSystem: FileSystem, dir: string[]) => Promise<void>): Promise<void> => {
		const fileSystem = fs()!;
		const dir = path();
		setPending((count) => count + 1);
		try {
			await change(fileSystem, dir);
		} finally {
			await loadDir(fileSystem, dir, true);
			setPending((count) => count - 1);
		}
	};

	// Pushes a new history entry, the URL effect below performs the actual listing
	const navigateTo = (targetPath: string[], targetSource = source()): void => {
		if (isBusy())
			return;
		const params: string[] = [];
		if (targetSource == 'fullflash')
			params.push("source=fullflash");
		if (targetPath.length)
			params.push(`path=${targetPath.map(encodeURIComponent).join("/")}`);
		const qs = params.length ? `?${params.join("&")}` : "";
		if (qs == location.search)
			return;
		navigate(`/file-explorer${qs}`);
	};

	const switchSource = (_: unknown, value: Source | null): void => {
		// null when the selected button is clicked again
		if (value)
			navigateTo([], value);
	};

	// A fullflash that finishes opening after the page was left is closed right away
	let isDisposed = false;
	onCleanup(() => {
		isDisposed = true;
		void fullflash()?.close();
	});

	// The one opened next opens at its root
	const changeFullflash = (opened?: FullFlashFS): void => {
		if (isDisposed)
			return void opened?.close();
		if (source() == 'fullflash')
			setError(null);
		if (!opened)
			navigateTo([]);
		setFullflash(opened);
	};

	// An open that fails once the user has switched to the phone is no error of the phone's
	const showFullflashError = (message: string): void => {
		if (source() == 'fullflash')
			setError(message);
	};

	// The changes to a fullflash are lost when the page is left, which the user is asked about. Browser
	// back and forward give the steps alone, and have changed the location already.
	useBeforeLeave((e) => {
		const opened = fullflash();
		const destination = typeof e.to == 'number' ? window.location.pathname : new URL(e.to, window.location.href).pathname;
		if (opened && !e.defaultPrevented && !isFileExplorer(destination) && !opened.mayDiscard())
			e.preventDefault();
	});

	const onBeforeUnload = (e: BeforeUnloadEvent): void => {
		if (fullflash()?.isModified())
			e.preventDefault();
	};
	onMount(() => window.addEventListener('beforeunload', onBeforeUnload));
	onCleanup(() => window.removeEventListener('beforeunload', onBeforeUnload));

	const filePath = (name: string): string => "/" + [...path(), name].join("/");

	const toggleSort = (key: SortKey): void => {
		if (key == sortKey()) {
			setSortDir(sortDir() == 1 ? -1 : 1);
		} else {
			setSortKey(key);
			setSortDir(1);
		}
	};

	// Display order: directories first, then the selected column in the selected direction, and by name
	// where that column is equal. The phone's disks, which are directories of the root, come first by
	// name, in the phone's order.
	const sortedEntries = createMemo<FileSystemEntry[]>(() => {
		const key = sortKey();
		const dir = sortDir();
		const isRoot = !displayedDir()?.length;
		const byName = (a: FileSystemEntry, b: FileSystemEntry): number =>
			(isRoot && a.isDir ? diskRank(a) - diskRank(b) : 0) || a.name.localeCompare(b.name);
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
				case 'attributes':
					result = attributeLetters(a).localeCompare(attributeLetters(b));
					break;
				default:
					result = byName(a, b);
			}
			return result * dir || byName(a, b);
		});
	});

	const isSelected = (entry: FileSystemEntry): boolean => selected().has(entry.name);
	const selectedEntries = createMemo<FileSystemEntry[]>(() => entries().filter(isSelected));
	const isAllSelected = createMemo(() => entries().length > 0 && selected().size == entries().length);

	// Last entry clicked without shift and the state that click gave it. Shift-clicks
	// extend the selection from this anchor, in the order the list is displayed in
	let selectionAnchor: { name: string; select: boolean } | undefined;

	const selectOnly = (entry: FileSystemEntry): void => {
		selectionAnchor = { name: entry.name, select: true };
		setSelected(new Set([entry.name]));
	};

	// Applies the anchor's selection state to every entry between the anchor and
	// the clicked one (in display order), like desktop file managers do
	const selectRange = (entry: FileSystemEntry): void => {
		const anchor = selectionAnchor;
		if (!anchor)
			return selectOnly(entry);
		const list = sortedEntries();
		const from = list.findIndex((e) => e.name == anchor.name);
		const to = list.findIndex((e) => e.name == entry.name);
		if (from < 0 || to < 0)
			return selectOnly(entry);
		const [start, end] = from < to ? [from, to] : [to, from];
		setSelected((prev) => {
			const next = new Set(prev);
			for (let i = start; i <= end; i++) {
				if (anchor.select)
					next.add(list[i].name);
				else
					next.delete(list[i].name);
			}
			return next;
		});
	};

	const toggleSelected = (entry: FileSystemEntry, shiftKey = false): void => {
		if (shiftKey)
			return selectRange(entry);
		const select = !selected().has(entry.name);
		selectionAnchor = { name: entry.name, select };
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(entry.name))
				next.delete(entry.name);
			else
				next.add(entry.name);
			return next;
		});
	};

	// Row clicks select like in a desktop file manager: a plain click selects a
	// single entry, ctrl toggles one, shift extends from the anchor. Clicks on
	// interactive elements (file links, buttons, the checkbox) are left alone.
	const onRowClick = (entry: FileSystemEntry, e: MouseEvent): void => {
		if (isBusy())
			return;
		if (e.target instanceof Element && e.target.closest('button, a, input, label'))
			return;
		if (e.shiftKey)
			selectRange(entry);
		else if (e.ctrlKey || e.metaKey)
			toggleSelected(entry);
		else
			selectOnly(entry);
	};

	// SUID delivers the checkbox change as a plain Event, but at runtime it is the
	// input's click event, which carries the mouse modifier keys
	const isShiftClick = (e: Event): boolean => (e as MouseEvent).shiftKey ?? false;

	const toggleSelectAll = (): void => {
		selectionAnchor = undefined;
		setSelected((prev) => prev.size == entries().length ? new Set<string>() : new Set<string>(entries().map((e) => e.name)));
	};

	const makeProgressHandler = (kind: 'download' | 'upload', name: string) => {
		return (e: FileSystemProgress): void => {
			setTransfer({
				kind,
				name,
				percent: e.percent,
				cursor: e.cursor,
				total: e.total,
				speed: e.speed
			});
		};
	};

	const downloadFile = errorWrap(async (entry: FileSystemEntry): Promise<void> => {
		setTransfer({ kind: 'download', name: entry.name, percent: -1, cursor: 0, total: entry.size, speed: 0 });
		try {
			const data = await fs()!.readFile(filePath(entry.name), makeProgressHandler('download', entry.name));
			downloadBlob(new Blob([new Uint8Array(data)]), entry.name);
		} finally {
			setTransfer(undefined);
		}
	});

	// Opens a file in a new browser tab, viewable types are displayed inline.
	// The tab must be opened synchronously with the click, otherwise popup blockers
	// kill it once the download has taken a while. It shows a progress page while
	// the file is transferred and is redirected once the download finishes.
	const openFile = errorWrap(async (entry: FileSystemEntry): Promise<void> => {
		const win = window.open('about:blank', '_blank');
		// The file, or a page it links to, gets no hold on this one
		if (win)
			win.opener = null;
		const tab = initOpenFileTab(win, entry.name);
		setTransfer({ kind: 'download', name: entry.name, percent: -1, cursor: 0, total: entry.size, speed: 0 });
		try {
			const onProgress = (e: FileSystemProgress): void => {
				setTransfer({
					kind: 'download',
					name: entry.name,
					percent: e.percent,
					cursor: e.cursor,
					total: e.total,
					speed: e.speed
				});
				tab?.update(e);
			};
			const data = await fs()!.readFile(filePath(entry.name), onProgress);
			const blob = new Blob([new Uint8Array(data)], { type: guessMimeType(entry.name) });
			const previewUrl = await createFilePreviewUrl(blob, entry.name);
			if (win && previewUrl) {
				// Real URL ending with the file name: "Save as" keeps the name
				// and the tab can be reloaded
				win.location.href = previewUrl;
			} else if (win && blob.type != 'application/octet-stream' && !isScripted(blob.type)) {
				// Browser can display it (image, text, pdf, ...), but no preview
				// worker: fall back to a blob URL ("Save as" won't know the name).
				// A blob URL can't keep scripts from running on this origin.
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

	// Recursively adds an entry (file or directory) to the zip. remoteRoot is the
	// absolute path of the directory containing the entry, zipRoot the matching
	// path inside the archive.
	const addEntryToZip = async (fileSystem: FileSystem, zip: JSZip, remoteRoot: string, zipRoot: string, entry: FileSystemEntry, onProgress: (e: FileSystemProgress) => void, counters: { bytes: number }): Promise<void> => {
		if (entry.isDir) {
			zip.file(`${zipRoot}${entry.name}/`, null, { dir: true, date: entry.mtime });
			const children = await fileSystem.readDir(`${remoteRoot}/${entry.name}`);
			children.sort((a, b) => a.name.localeCompare(b.name));
			for (const child of children)
				await addEntryToZip(fileSystem, zip, `${remoteRoot}/${entry.name}`, `${zipRoot}${entry.name}/`, child, onProgress, counters);
			return;
		}

		const data = await fileSystem.readFile(`${remoteRoot}/${entry.name}`, onProgress);
		zip.file(`${zipRoot}${entry.name}`, data, { date: entry.mtime });
		counters.bytes += data.length;
	};

	const downloadSelection = errorWrap(async (list: FileSystemEntry[]): Promise<void> => {
		if (!list.length)
			return;

		// A single selected file is downloaded as-is, everything else becomes a zip
		if (list.length == 1 && !list[0].isDir) {
			await downloadFile(list[0]);
			return;
		}

		const fileSystem = fs()!;
		const zipName = list.length == 1
			? `${list[0].name}.zip`
			: `${path().length ? path()[path().length - 1] : fileSystem.name}.zip`;
		setTransfer({ kind: 'download', name: zipName, percent: -1, cursor: 0, total: 0, speed: 0 });
		const counters = { bytes: 0 };
		// One handler for the whole archive, reading counters at call time
		const onProgress = (e: FileSystemProgress): void => {
			setTransfer((prev) => prev && {
				...prev,
				cursor: counters.bytes + e.cursor,
				percent: prev.total > 0 ? Math.min(100, ((counters.bytes + e.cursor) / prev.total) * 100) : -1,
				speed: e.speed,
			});
		};
		const remoteRoot = path().length ? "/" + path().join("/") : "";
		try {
			const zip = new JSZip();
			for (const entry of list)
				await addEntryToZip(fileSystem, zip, remoteRoot, "", entry, onProgress, counters);
			downloadBlob(new Blob([new Uint8Array(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))]), zipName);
		} finally {
			setTransfer(undefined);
		}
	});

	// Asks for confirmation when an upload would replace entries that already exist.
	// Names in the current directory come from the loaded listing, for other target
	// directories (folder uploads) a listing is fetched per directory. Directories
	// that don't exist yet are created by the upload itself. The file systems find
	// names regardless of case, of ASCII letters at least.
	const confirmOverwrites = async (fileSystem: FileSystem, dir: string[], targets: { dirParts: string[]; fileName: string }[]): Promise<boolean> => {
		const listed = entries().map((e) => e.name);
		const namesByDir = new Map<string, Set<string>>();
		for (const targetDir of new Set(targets.map((t) => toPath(t.dirParts)))) {
			try {
				let names = listed;
				if (targetDir != toPath(dir))
					names = (await fileSystem.readDir(targetDir)).map((e) => e.name);
				namesByDir.set(targetDir, new Set(names.map((name) => name.toLowerCase())));
			} catch {
				// Directory not found: the upload creates it, nothing to overwrite
			}
		}
		const overwrites = targets.filter((t) => namesByDir.get(toPath(t.dirParts))?.has(t.fileName.toLowerCase()));
		if (!overwrites.length)
			return true;
		const shown = overwrites.slice(0, 5).map((t) => `"${t.fileName}"`).join(', ');
		const suffix = overwrites.length > 5 ? ` and ${overwrites.length - 5} more` : '';
		return confirm(`Overwrite ${shown}${suffix}?`);
	};

	// Goes to the file system and directory it was started in, whichever the user turns to meanwhile
	const uploadFiles = errorWrap(async (files: File[]): Promise<void> => {
		if (!files.length)
			return;

		const fileSystem = fs()!;
		const dir = path();
		const space = disk();

		// webkitRelativePath is set for directory uploads, e.g. "Sounds/midi/theme.mid"
		const targets = files.map((file) => {
			const relPathParts = (file.webkitRelativePath || file.name).split('/').filter(Boolean);
			const fileName = relPathParts.pop()!;
			return { fileName, dirParts: [...dir, ...relPathParts] };
		});

		// The phone's FlexMem server appends to existing files, so an upload of a
		// known name replaces it and needs the user's consent first
		setPending((count) => count + 1);
		try {
			if (!(await confirmOverwrites(fileSystem, dir, targets)))
				return;
		} finally {
			setPending((count) => count - 1);
		}

		const totalSize = files.reduce((sum, file) => sum + file.size, 0);

		// Warn before starting if the disk clearly can't fit the upload
		if (space && totalSize > space.available && !confirm('Not enough free space, are you sure you want to continue?'))
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
				const { fileName, dirParts } = targets[index];

				const dirPath = toPath(dirParts);
				if (dirParts.length && !createdDirs.has(dirPath)) {
					await fileSystem.mkdir(dirPath);
					createdDirs.add(dirPath);
				}

				const data = new Uint8Array(await file.arrayBuffer());
				const onProgress = (e: FileSystemProgress): void => {
					setTransfer((prev) => prev && {
						...prev,
						name: fileName,
						cursor: uploadedSize + e.cursor,
						total: totalSize,
						speed: e.speed,
						percent: totalSize > 0 ? Math.min(100, ((uploadedSize + e.cursor) / totalSize) * 100) : -1,
						filesDone: index,
					});
				};

				await fileSystem.writeFile(toPath([...dirParts, fileName]), data, onProgress);
				uploadedSize += file.size;
				setTransfer((prev) => prev && { ...prev, filesDone: index + 1 });
			}
		} finally {
			// The files uploaded before one that failed are there as well
			await loadDir(fileSystem, dir, true);
			setTransfer(undefined);
		}
	});

	const deleteRecursive = async (fileSystem: FileSystem, target: string, entry: FileSystemEntry): Promise<void> => {
		if (entry.isDir) {
			const children = await fileSystem.readDir(target);
			for (const child of children)
				await deleteRecursive(fileSystem, `${target}/${child.name}`, child);
		}
		await fileSystem.deleteFile(target);
	};

	const deleteEntry = errorWrap(async (entry: FileSystemEntry): Promise<void> => {
		if (!confirm(`Delete "${entry.name}"${entry.isDir ? ' and everything inside it' : ''}?`))
			return;
		await changeDir((fileSystem, dir) => deleteRecursive(fileSystem, toPath([...dir, entry.name]), entry));
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
		await changeDir(async (fileSystem, dir) => {
			for (const entry of list)
				await deleteRecursive(fileSystem, toPath([...dir, entry.name]), entry);
		});
	});

	const renameEntry = errorWrap(async (entry: FileSystemEntry): Promise<void> => {
		const newName = prompt(`Rename "${entry.name}" to:`, entry.name)?.trim();
		if (!newName || newName == entry.name)
			return;
		await changeDir((fileSystem, dir) => fileSystem.move(toPath([...dir, entry.name]), toPath([...dir, newName])));
	});

	const createDirectory = errorWrap(async (): Promise<void> => {
		const name = prompt('New folder name:')?.trim();
		if (!name)
			return;
		await changeDir((fileSystem, dir) => fileSystem.mkdir(toPath([...dir, name])));
	});

	const isBusy = createMemo(() => isLoading() || !!transfer());

	// F2 renames the single selected entry
	const onKeyDown = (e: KeyboardEvent): void => {
		if (e.key != 'F2')
			return;
		const list = selectedEntries();
		if (list.length != 1 || isBusy() || isReadOnly())
			return;
		e.preventDefault();
		void renameEntry(list[0]);
	};

	onMount(() => window.addEventListener('keydown', onKeyDown));
	onCleanup(() => window.removeEventListener('keydown', onKeyDown));

	// An error is of the file system it happened on
	createEffect(on([fs, source], () => setError(null), { defer: true }));

	// Loads the directory from the URL whenever it or the file system changes (navigation,
	// back/forward, connect, fullflash opened), unless it is listed already. The OBEX queue
	// and the worker serialize concurrent requests, so this is safe even during a transfer.
	createEffect(on([fs, path, listing], ([fileSystem, target, listed]) => {
		if (!fileSystem || (listed?.fs == fileSystem && toPath(listed.dir) == toPath(target)))
			return;
		setError(null);
		void loadDir(fileSystem, target);
	}));

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
				<ToggleButtonGroup
					exclusive
					size="small"
					value={source()}
					disabled={isBusy()}
					aria-label="Source"
					onChange={switchSource}
				>
					<ToggleButton value="phone">Phone</ToggleButton>
					<ToggleButton value="fullflash">Fullflash</ToggleButton>
				</ToggleButtonGroup>
			</Box>

			<Box mb={2}>
				{/* Progress lives next to the connect controls so an active transfer
				  doesn't add a line and shift the file list down */}
				<Stack direction="row" alignItems="center" flexWrap="wrap" gap={1}>
					<Show
						when={source() == 'phone'}
						fallback={
							<FullFlashStatusBar
								fullflash={fullflash()}
								disk={disk()}
								disabled={isBusy()}
								onChange={changeFullflash}
								onError={showFullflashError}
							/>
						}
					>
						<ObexStatusBar disk={disk()} />
					</Show>
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
				<Show when={source() == 'fullflash' && fullflash()}>{(opened) =>
					<FullFlashNotices info={opened().info} />
				}</Show>

				{/* Status window: logs AT commands and OBEX operations, also while connecting */}
				<Box hidden={source() != 'phone'} sx={{ position: 'relative' }}>
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
					when={fs()}
					fallback={
						<>
							<Alert severity="info">
								{source() == 'phone' ?
									'Connect to your phone via serial to access its filesystem over OBEX.' :
									'Open a fullflash to browse its filesystem. Everything is processed in your browser, the files are never uploaded.'}
							</Alert>
							<Show when={shownError()}>
								<Alert severity="error">{shownError()}</Alert>
							</Show>
						</>
					}
				>
					{/* Current path and navigation */}
					<Stack direction="row" alignItems="center" gap={1}>
						<Box sx={{ flexGrow: 1, minWidth: 200 }}>
							<Breadcrumbs>
								<Link component="button" onClick={() => navigateTo([])}>{fs()?.name}</Link>
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
								setError(null);
								void loadDir(fs()!, path(), true);
							}}
						>
							<RefreshIcon />
						</IconButton>
					</Stack>

					<Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">

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
							disabled={isBusy() || isReadOnly() || !selectedEntries().length}
							onClick={() => void deleteSelected()}
						>
							Delete selected{selectedEntries().length > 1 ? ` (${selectedEntries().length})` : ''}
						</Button>

						<IconButton
							title="New folder"
							disabled={isBusy() || isReadOnly()}
							onClick={() => void createDirectory()}
						>
							<CreateNewFolderIcon />
						</IconButton>

						<Button
							variant="contained"
							component="label"
							startIcon={<UploadFileIcon />}
							disabled={isBusy() || isReadOnly()}
						>
							Upload files
							<input
								ref={fileInputRef}
								type="file"
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

						<Button
							variant="outlined"
							component="label"
							startIcon={<DriveFolderUploadIcon />}
							disabled={isBusy() || isReadOnly()}
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

					<Show when={shownError()}>
						<Alert severity="error">{shownError()}</Alert>
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
									{sortableHeader('attributes', 'Attributes', { align: 'center' })}
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
									<TableRow hover selected={isSelected(entry)} sx={entry.hidden || entry.system ? { opacity: 0.55 } : undefined} onClick={(e: MouseEvent) => onRowClick(entry, e)}>
										<TableCell padding="checkbox">
											<Checkbox
												size="small"
												checked={isSelected(entry)}
												disabled={isBusy()}
												onChange={(e) => toggleSelected(entry, isShiftClick(e))}
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
															onMouseDown={(e: MouseEvent) => {
																// Middle click opens the file as well. Handled on mousedown instead of
																// auxclick: the press gesture is accepted by popup blockers in every
																// browser (auxclick is not everywhere), and preventDefault() here stops
																// the browser from starting autoscroll, which can otherwise swallow the
																// click on scrollable pages
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
										<TableCell
											align="center"
											title={attributeNames(entry)}
										>
											{attributeLetters(entry)}
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
													disabled={isBusy() || isReadOnly()}
													onClick={() => void renameEntry(entry)}
												>
													<DriveFileRenameOutlineIcon />
												</IconButton>
												<IconButton
													size="small"
													title="Delete"
													disabled={isBusy() || isReadOnly()}
													onClick={() => void deleteEntry(entry)}
												>
													<DeleteIcon />
												</IconButton>
											</Stack>
										</TableCell>
									</TableRow>
								}</For>
								<Show when={shownListing()?.entries && !entries().length && !isLoading()}>
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
