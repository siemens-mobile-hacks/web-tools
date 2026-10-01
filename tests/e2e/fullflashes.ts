import fs from 'node:fs';
import path from 'node:path';

// The phones' fullflashes @sie-js/ffs tests with, and how the title bar names them. They are looked
// for in the directories SIE_FFS_TEST_FULLFLASHES lists, and the tests of those not found skipped.
// Their data partitions are named Data, as the phones name them. In each, a directory holds entries
// of attributes the partition's own entries have not: protected T9 dictionaries, read-only and
// archive files.
export const PHONES = [
	{ fullflash: 'CX70v56lg3.bin', name: 'SIEMENS CX70v56', partition: 'Data', attributed: ['System', 'T9'] },
	{ fullflash: 'S75v40lg1.bin', name: 'SIEMENS S75v40', partition: 'Data', attributed: ['Pictures'] },
	{ fullflash: 'EL71v41lg91.bin', name: 'SIEMENS EL71v41', partition: 'Data', attributed: ['Applications'] },
];

export type Phone = typeof PHONES[number];

export function findFullflash(name: string): string | undefined {
	const dirs = process.env.SIE_FFS_TEST_FULLFLASHES?.split(path.delimiter).filter(Boolean) ?? [];
	return dirs.map((dir) => path.join(dir, name)).find((file) => fs.existsSync(file));
}
