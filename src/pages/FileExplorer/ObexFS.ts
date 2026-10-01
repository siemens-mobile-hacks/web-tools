import { proxy, type Remote } from 'comlink';
import type { ObexService } from '@/workers/services/ObexService';
import type { DiskInfo, FileSystem, FileSystemEntry, FileSystemProgress } from '@/pages/FileExplorer/FileSystem';

export class ObexFS implements FileSystem {
	readonly name = 'Phone';

	constructor(private readonly obex: Remote<ObexService>) {}

	// One disk
	diskOf(): string {
		return '';
	}

	// The phone tells of its data disk only, wherever the path leads
	async getDiskInfo(): Promise<DiskInfo> {
		const capacity = await this.obex.getCapacity();
		const available = await this.obex.getAvailable();
		return { capacity, available, readOnly: false };
	}

	readDir(path: string): Promise<FileSystemEntry[]> {
		return this.obex.readDir(path);
	}

	readFile(path: string, onProgress?: (e: FileSystemProgress) => void): Promise<Uint8Array> {
		return this.obex.getFile(path, onProgress && proxy(onProgress));
	}

	writeFile(path: string, data: Uint8Array, onProgress?: (e: FileSystemProgress) => void): Promise<void> {
		return this.obex.putFile(path, data, onProgress && proxy(onProgress));
	}

	deleteFile(path: string): Promise<void> {
		return this.obex.deleteFile(path);
	}

	mkdir(path: string): Promise<void> {
		return this.obex.mkdir(path);
	}

	move(src: string, dest: string): Promise<void> {
		return this.obex.move(src, dest);
	}
}
