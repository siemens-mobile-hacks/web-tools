import fs from 'node:fs';
import { FFS, type FFSEntry } from '@sie-js/ffs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FileExplorer, type EntryAttributes } from './fileExplorer';
import { findFullflash, type Phone, PHONES } from './fullflashes';

// As src/utils.ts's, which imports what only runs in a browser
function formatBinarySize(size: number): string {
	if (size > 1024 * 1024)
		return +(size / 1024 / 1024).toFixed(2) + ' MiB';
	return +(size / 1024).toFixed(2) + ' KiB';
}

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

const byName = (entries: EntryAttributes[]): EntryAttributes[] => [...entries].sort((a, b) => a.name.localeCompare(b.name));

// As the File Explorer shows the attributes of the entries the library lists
function attributesOf(entries: FFSEntry[]): EntryAttributes[] {
	return byName(entries.map((entry) => {
		const set = ([
			['R', 'Read-only', entry.readonly],
			['H', 'Hidden', entry.hidden],
			['S', 'System', entry.system],
			['A', 'Archive', entry.archive],
			['P', 'Protected', entry.protected],
		] as const).filter(([, , isSet]) => isSet);
		return {
			name: entry.name,
			letters: set.map(([letter]) => letter).join(' '),
			names: set.map(([, name]) => name).join(', '),
			dimmed: entry.hidden || entry.system,
		};
	}));
}

// What the title bar tells of the fullflash, with the free space the library finds at the path
function status(phone: Phone, ffs: FFS, path: string): string {
	const { size, free } = ffs.statfs(path);
	return `${phone.name} · IMEI ${ffs.imei} · ${ffs.platform} · ${formatBinarySize(free)}/${formatBinarySize(size)} free`;
}

for (const phone of PHONES) {
	const file = findFullflash(phone.fullflash);
	const partition = `/${phone.partition}`;

	// The tests share the page, and each goes on from where the one before it left it
	describe.skipIf(!file)(`The File Explorer, on ${phone.fullflash}`, () => {
		const uploaded = encode('uploaded from the browser '.repeat(3000));
		let app: FileExplorer;
		let original: FFS;
		// The same changes, made by the library
		let replica: FFS;
		let saved: FFS;

		beforeAll(async () => {
			original = FFS.open(fs.readFileSync(file!));
			replica = FFS.open(fs.readFileSync(file!));
			app = await FileExplorer.open();
			await app.openFullflash(file!);
		});

		afterAll(() => app?.close());

		it("shows the phone as it is named over OBEX, its IMEI, its platform and all partitions' free space in the title bar", async () => {
			await expect.poll(() => app.titleBar()).toEqual({ text: status(phone, original, '/'), pulses: false, icon: true });
		});

		it('shows only the file name beside Save fullflash', async () => {
			expect(await app.fileNameBesideSave()).toBe(phone.fullflash);
		});

		it("lists the partitions in the phone's order, which it does not write to", async () => {
			expect(await app.names()).toEqual(['Data', 'Cache', 'Config']);
			expect(await app.button('New folder').isDisabled()).toBe(true);
			expect(await app.isUploadDisabled()).toBe(true);
		});

		it("shows the partition's free space in it, and writes to it", async () => {
			await app.enter(phone.partition);

			await expect.poll(() => app.titleBarText()).toBe(status(phone, original, partition));
			expect(await app.button('New folder').isDisabled()).toBe(false);
		});

		it('has nothing to save after a change that failed', async () => {
			await app.mkdir('e2e?invalid');

			await expect.poll(() => app.error()).toBeDefined();
			expect(await app.isSaveEnabled()).toBe(false);

			await app.refresh();
		});

		it('shows the attributes the phone keeps, with their names on hover, and dims hidden and system entries', async () => {
			expect(byName(await app.attributes())).toEqual(attributesOf(original.readDir(partition)));

			for (const dir of phone.attributed)
				await app.enter(dir);
			expect(byName(await app.attributes())).toEqual(attributesOf(original.readDir([partition, ...phone.attributed].join('/'))));

			for (const _ of phone.attributed)
				await app.up();
			await app.waitForName(phone.attributed[0]);
		});

		it('asks before uploading more than the partition has free, and uploads nothing when told not to', async () => {
			app.answer(false);
			await app.upload('e2e-big.bin', new Uint8Array(original.statfs(partition).free + 1));

			await expect.poll(() => app.dialogs.at(-1)).toBe('Not enough free space, are you sure you want to continue?');
			await app.waitIdle();
			expect(await app.names()).not.toContain('e2e-big.bin');
			expect(await app.titleBarText()).toBe(status(phone, original, partition));
		});

		it('counts an upload against the free space', async () => {
			await app.upload('e2e.txt', uploaded);
			await app.waitForName('e2e.txt');
			replica.writeFile(`${partition}/e2e.txt`, uploaded);

			await expect.poll(() => app.titleBarText()).toBe(status(phone, replica, partition));
			expect(replica.statfs(partition).free).toBeLessThan(original.statfs(partition).free);
		});

		it('asks before an upload replaces a file of the name in another case, and keeps it when told not to', async () => {
			app.answer(false);
			await app.upload('E2E.TXT', encode('replaced'));

			await expect.poll(() => app.dialogs.at(-1)).toBe('Overwrite "E2E.TXT"?');
			await app.waitIdle();
			expect((await app.names()).filter((name) => name.toLowerCase() == 'e2e.txt')).toEqual(['e2e.txt']);
		});

		it('renames a file by the case of its name alone, and a folder', async () => {
			await app.rename('e2e.txt', 'E2E.txt');
			await app.waitForName('E2E.txt');
			expect((await app.names()).filter((name) => name.toLowerCase() == 'e2e.txt')).toEqual(['E2E.txt']);

			await app.mkdir('e2e-dir');
			await app.waitForName('e2e-dir');
			await app.rename('e2e-dir', 'e2e-renamed-dir');
			await app.waitForName('e2e-renamed-dir');
			expect(await app.names()).not.toContain('e2e-dir');
		});

		it('enters a folder whose name holds a percent sign', async () => {
			await app.mkdir('e2e 100%');
			await app.waitForName('e2e 100%');
			await app.enter('e2e 100%');

			expect(await app.error()).toBeUndefined();
			expect(await app.names()).toEqual([]);

			await app.up();
			await app.waitForName('e2e 100%');
		});

		it('refuses to move a folder into itself, and leaves it as it was', async () => {
			await app.rename('e2e-renamed-dir', 'e2e-renamed-dir/inner');

			await expect.poll(() => app.error()).toContain('/e2e-renamed-dir/inner: is in ');

			await app.refresh();
			expect(await app.error()).toBeUndefined();
			expect(await app.names()).toContain('e2e-renamed-dir');
		});

		it('gives the space of a deleted file back', async () => {
			const before = await app.titleBarText();

			await app.upload('e2e-doomed.bin', new Uint8Array(64 * 1024));
			await app.waitForName('e2e-doomed.bin');
			await expect.poll(() => app.titleBarText()).not.toBe(before);

			await app.remove('e2e-doomed.bin');
			await app.waitForName('e2e-doomed.bin', false);
			await expect.poll(() => app.titleBarText()).toBe(before);
		});

		it('saves a fullflash that reads back, of the free space it showed', async () => {
			const data = await app.save();
			saved = FFS.open(data, { strict: true });
			const names = saved.readDir(partition).map((entry) => entry.name);

			expect(data.length).toBe(fs.statSync(file!).size);
			expect(saved.readFile(`${partition}/E2E.txt`)).toEqual(uploaded);
			expect(names).toEqual(expect.arrayContaining([...original.readDir(partition).map((entry) => entry.name), 'E2E.txt', 'e2e-renamed-dir']));
			for (const gone of ['e2e.txt', 'e2e-dir', 'e2e-doomed.bin', 'e2e-big.bin'])
				expect(names).not.toContain(gone);
			expect(await app.titleBarText()).toBe(status(phone, saved, partition));
		});

		it('gives the title bar to the phone source, and takes it back at the root', async () => {
			await app.switchSource('Phone');
			await expect.poll(() => app.titleBar()).toEqual({ text: '', pulses: false, icon: false });

			await app.switchSource('Fullflash');
			await expect.poll(() => app.titleBar()).toEqual({ text: status(phone, saved, '/'), pulses: false, icon: true });
		});
	});
}

const phone = PHONES.find((phone) => findFullflash(phone.fullflash));

describe.skipIf(!phone)('The File Explorer, on a fullflash with changes that were not saved', () => {
	let app: FileExplorer;

	beforeAll(async () => {
		app = await FileExplorer.open();
		await app.openFullflash(findFullflash(phone!.fullflash)!);
		await app.enter(phone!.partition);
		await app.mkdir('e2e-unsaved');
		await app.waitForName('e2e-unsaved');
	});

	afterAll(() => app?.close());

	it('asks before another tool is opened, and stays when told not to', async () => {
		app.answer(false);
		await app.goTo('/sms-reader');

		await expect.poll(() => app.dialogs.at(-1)).toBe(`Discard the changes to ${phone!.fullflash}?`);
		expect(new URL(app.page.url()).pathname).toBe('/file-explorer');
		expect(await app.names()).toContain('e2e-unsaved');
	});

	it('does not ask on its own way through the folders', async () => {
		const asked = app.dialogs.length;

		await app.up();
		await app.enter(phone!.partition);

		expect(app.dialogs.length).toBe(asked);
	});

	it('leaves when told to', async () => {
		app.answer(true);
		await app.goTo('/sms-reader');

		await app.page.waitForURL((url) => url.pathname == '/sms-reader');
	});
});
