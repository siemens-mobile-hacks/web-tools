import { type Accessor, createSignal, type Setter } from 'solid-js';
import { ffsWorker } from '@/workers/endpoints/ffs';
import type { FFSInfo } from '@/workers/services/FFSService';
import type { DiskInfo, FileSystem, FileSystemEntry, FileSystemProgress } from '@/pages/FileExplorer/FileSystem';

// The fullflash is changed in the worker, save() returns it with the changes
export class FullFlashFS implements FileSystem {
	readonly name: string;
	// Whether it has changes that were not saved
	readonly isModified: Accessor<boolean>;
	// The worker's count of changes, as of the last change made here, and as the last save had it
	private readonly setChanges: Setter<number>;
	private readonly setSavedChanges: Setter<number>;

	private constructor(readonly fileName: string, readonly info: FFSInfo) {
		this.name = info.model ?? 'Fullflash';
		const [changes, setChanges] = createSignal(0);
		const [savedChanges, setSavedChanges] = createSignal(0);
		this.isModified = () => changes() != savedChanges();
		this.setChanges = setChanges;
		this.setSavedChanges = setSavedChanges;
	}

	static async open(file: File): Promise<FullFlashFS> {
		return new FullFlashFS(file.name, await ffsWorker.open(file));
	}

	// Whether its changes may be lost: when it has none, or the user agrees
	mayDiscard(): boolean {
		return !this.isModified() || confirm(`Discard the changes to ${this.fileName}?`);
	}

	// Each partition is a disk of its own
	diskOf(path: string): string {
		return path.split('/').filter(Boolean)[0] ?? '';
	}

	// Of the partition, and at the root of all of them, which can't be changed
	async getDiskInfo(path: string): Promise<DiskInfo> {
		const { size, free, readonly } = await ffsWorker.statfs(path);
		return { capacity: size, available: free, readOnly: readonly };
	}

	async readDir(path: string): Promise<FileSystemEntry[]> {
		const entries = await ffsWorker.readDir(path);
		return entries.map((entry) => ({
			name: entry.name,
			isDir: entry.isDirectory,
			size: entry.size,
			mtime: entry.timestamp,
			readable: true,
			writable: !entry.readonly,
			hidden: entry.hidden,
			system: entry.system,
			archive: entry.archive,
			protected: entry.protected,
		}));
	}

	// Files are read and written at once, a single progress event reports them done
	async readFile(path: string, onProgress?: (e: FileSystemProgress) => void): Promise<Uint8Array> {
		const data = await ffsWorker.readFile(path);
		onProgress?.({ percent: 100, cursor: data.length, total: data.length, speed: 0 });
		return data;
	}

	async writeFile(path: string, data: Uint8Array, onProgress?: (e: FileSystemProgress) => void): Promise<void> {
		await this.change(ffsWorker.writeFile(path, data));
		onProgress?.({ percent: 100, cursor: data.length, total: data.length, speed: 0 });
	}

	deleteFile(path: string): Promise<void> {
		return this.change(ffsWorker.remove(path));
	}

	mkdir(path: string): Promise<void> {
		return this.change(ffsWorker.mkdir(path));
	}

	move(src: string, dest: string): Promise<void> {
		return this.change(ffsWorker.move(src, dest));
	}

	// An operation that fails may have changed the fullflash too, such as a mkdir() that made some of the
	// parents. The worker answers in order, so a change made while a save is under way is counted after it.
	private async change(operation: Promise<void>): Promise<void> {
		try {
			await operation;
		} finally {
			this.setChanges(await ffsWorker.getChanges());
		}
	}

	async save(): Promise<Uint8Array<ArrayBuffer>> {
		const { data, changes } = await ffsWorker.save();
		this.setSavedChanges(changes);
		return data;
	}

	close(): Promise<void> {
		return ffsWorker.close();
	}
}
