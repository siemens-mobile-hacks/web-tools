import type { ObexDirEntry, ObexProgress } from '@sie-js/serial';
import { formatBinarySize } from '@/utils';

// A phone tells of no attributes but read-only and hidden over OBEX
export type FileSystemEntry = ObexDirEntry & {
	system?: boolean;
	archive?: boolean;
	protected?: boolean;
};
export type FileSystemProgress = ObexProgress;

const ATTRIBUTES = [
	{ letter: 'R', name: 'Read-only', isSet: (entry: FileSystemEntry) => !entry.writable },
	{ letter: 'H', name: 'Hidden', isSet: (entry: FileSystemEntry) => entry.hidden },
	{ letter: 'S', name: 'System', isSet: (entry: FileSystemEntry) => !!entry.system },
	{ letter: 'A', name: 'Archive', isSet: (entry: FileSystemEntry) => !!entry.archive },
	{ letter: 'P', name: 'Protected', isSet: (entry: FileSystemEntry) => !!entry.protected },
];

const attributesOf = (entry: FileSystemEntry) => ATTRIBUTES.filter((attribute) => attribute.isSet(entry));

// The attributes an entry has, as "R A", and as "Read-only, Archive"
export const attributeLetters = (entry: FileSystemEntry): string => attributesOf(entry).map((attribute) => attribute.letter).join(' ');
export const attributeNames = (entry: FileSystemEntry): string => attributesOf(entry).map((attribute) => attribute.name).join(', ');

// In bytes
export type DiskInfo = {
	capacity: number;
	available: number;
	readOnly: boolean;
};

export const formatFreeSpace = (disk: DiskInfo): string => `${formatBinarySize(disk.available)}/${formatBinarySize(disk.capacity)} free`;

// What the File Explorer browses: the phone over OBEX, or a fullflash. Paths are absolute.
export interface FileSystem {
	// The root in the breadcrumbs, and the name of a zip of the root's entries
	readonly name: string;
	// Names the disk the path is on, which paths on the same disk share
	diskOf(path: string): string;
	// Of the disk the path is on
	getDiskInfo(path: string): Promise<DiskInfo>;
	readDir(path: string): Promise<FileSystemEntry[]>;
	readFile(path: string, onProgress?: (e: FileSystemProgress) => void): Promise<Uint8Array>;
	writeFile(path: string, data: Uint8Array, onProgress?: (e: FileSystemProgress) => void): Promise<void>;
	deleteFile(path: string): Promise<void>;
	// Creates the parents as well
	mkdir(path: string): Promise<void>;
	move(src: string, dest: string): Promise<void>;
}
