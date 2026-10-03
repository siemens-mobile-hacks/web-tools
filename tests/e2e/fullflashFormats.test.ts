import fs from 'node:fs';
import type { Browser, Locator, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { decodeMfl, encodeMfl, mflHeader } from '../../src/utils/mfl';
import { launchBrowser } from './browser';

const MiB = 1024 * 1024;
const NO_MODEL = 'Could not detect the phone model.';
const MFL = 'Martech Box (.mfl)';
const BIN = 'Raw fullflash (.bin)';

// A flash with the info tables of the phone models
function makeFlash(size: number, ...models: string[]): Uint8Array<ArrayBuffer> {
	const flash = new Uint8Array(size);
	models.forEach((model, i) => Buffer.from(`${model}\0\0\0\0\0\0\0\0SIEMENS`).copy(flash, (i + 1) * 0x1000));
	return flash;
}

function makeMfl(flash: Uint8Array<ArrayBuffer>, code: string): Buffer {
	return Buffer.concat([mflHeader(code), encodeMfl(flash)]);
}

// The tests share the page
describe('The Firmware Converter\'s fullflash formats', () => {
	let browser: Browser;
	let page: Page;
	let panel: Locator;
	let cards: Locator;
	// The error that takes the place of the cards
	let failure: Locator;
	// What may be wrong with all the cards' files
	let warning: Locator;

	// The page with the file's cards, or with the error
	async function convert(name: string, data: Uint8Array): Promise<void> {
		await panel.locator('input[type=file]').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(data) });
		await cards.or(failure).first().waitFor();
	}

	async function download(card: Locator): Promise<Buffer> {
		const [file] = await Promise.all([
			page.waitForEvent('download'),
			save(card).click(),
		]);
		return fs.readFileSync(await file.path());
	}

	const type = (): Promise<string | null> => panel.locator('.MuiChip-label').textContent();
	const card = (format: string): Locator => cards.filter({ has: page.getByText(format, { exact: true }) });
	// The cards' titles
	const formats = (): Promise<string[]> => cards.locator('.MuiTypography-body1').allTextContents();
	const save = (card: Locator): Locator => card.getByRole('button', { name: /^Save/ });
	const alerts = (card: Locator): Promise<string[]> => card.locator('.MuiAlert-message').allTextContents();
	// The portals of SUID's menus are aria-hidden, so their options have no roles to find them by
	const model = (card: Locator): Locator => card.locator('[aria-haspopup=listbox]');

	beforeAll(async () => {
		browser = await launchBrowser();
		page = await browser.newPage();
		await page.goto(`${inject('baseUrl')}firmware-converter`);
		await page.getByRole('tab', { name: 'Fullflash formats (MFL, BIN)' }).click();
		panel = page.locator('#firmware-panel-fullflash');
		cards = panel.locator('[aria-live=polite] > .MuiPaper-root');
		failure = panel.locator(':scope > .MuiAlert-standardError');
		warning = panel.locator(':scope > .MuiAlert-standardWarning');
	});

	afterAll(() => browser?.close());

	it('converts a BIN to the MFL of the model it names', async () => {
		const flash = makeFlash(4 * MiB, 'C45');
		await convert('c45.bin', flash);
		expect(await type()).toBe('Raw fullflash');
		expect(await formats()).toEqual([BIN, MFL]);
		expect(await card(MFL).textContent()).toContain('c45.mfl');
		expect(await model(card(MFL)).textContent()).toBe('C45');
		expect(await alerts(cards)).toEqual([]);
		expect(await warning.count()).toBe(0);
		expect(await page.getByText('Conversion happens in the browser, files never leave your PC.').isVisible()).toBe(true);
		// The files are made when saved, so their sizes are unknown
		expect(await cards.getByRole('button', { name: /^Save/ }).allTextContents()).toEqual(['Save', 'Save']);

		const decoded = decodeMfl(await download(card(MFL)));
		expect(decoded.code).toBe('C45F');
		expect(Buffer.from(decoded.flash).equals(flash)).toBe(true);
		expect(await card(BIN).textContent()).toContain('c45.bin');
		expect((await download(card(BIN))).equals(flash)).toBe(true);
	});

	it('asks for the model of a BIN that names none', async () => {
		await convert('unnamed.bin', makeFlash(4 * MiB));
		expect(await alerts(card(MFL))).toEqual([NO_MODEL]);
		expect(await save(card(MFL)).isDisabled()).toBe(true);

		await model(cards).click();
		const options = page.locator('[role=option]');
		expect(await options.allTextContents()).toEqual(['A50', 'A51', 'A52', 'A70', 'C45', 'MC35i/MC35']);
		await options.filter({ hasText: 'A70' }).click();
		expect(await alerts(cards)).toEqual([]);
		expect(decodeMfl(await download(card(MFL))).code).toBe('A70G');
	});

	it('names the models of a BIN that names several', async () => {
		await convert('two.bin', makeFlash(4 * MiB, 'C45', 'A50', 'S75'));
		expect(await alerts(card(MFL))).toEqual(['The fullflash names several phone models: A50, C45.']);
		expect(await save(card(MFL)).isDisabled()).toBe(true);
	});

	it('chooses the only model of a BIN\'s size', async () => {
		await convert('module.bin', makeFlash(2 * MiB));
		expect(await model(cards).textContent()).toBe('TC35i/TC35');
		expect(await alerts(cards)).toEqual([]);
		expect(decodeMfl(await download(card(MFL))).code).toBe('TC3F');
	});

	it('has no MFL for a BIN of no model\'s size', async () => {
		await convert('odd.bin', makeFlash(3 * MiB));
		expect(await formats()).toEqual([BIN, MFL]);
		expect(await alerts(card(MFL))).toEqual(['Martech has no phone model with a 3 MiB fullflash.']);
		expect(await card(MFL).getByRole('button').count()).toBe(0);
		expect(await save(card(BIN)).isDisabled()).toBe(false);
	});

	it('converts an MFL to a BIN, and to an MFL of the model it names', async () => {
		const flash = makeFlash(16 * MiB, 'M55');
		// An older generation of Martech's dumps of the model, which the file names rather than its flash
		await convert('m55.mfl', makeMfl(flash, 'C60K'));
		expect(await type()).toBe('Martech Box · C60');
		expect(await formats()).toEqual([BIN, MFL]);
		expect(await alerts(cards)).toEqual([]);
		expect(await card(BIN).textContent()).toContain('m55.bin');
		expect((await download(card(BIN))).equals(flash)).toBe(true);

		expect(await card(MFL).textContent()).toContain('m55.mfl');
		expect(await model(card(MFL)).textContent()).toBe('C60');
		const decoded = decodeMfl(await download(card(MFL)));
		expect(decoded.code).toBe('C60M');
		expect(Buffer.from(decoded.flash).equals(flash)).toBe(true);
	});

	it('warns of an MFL that may be wrong', async () => {
		const file = makeMfl(makeFlash(4 * MiB, 'C45'), 'C45F');
		await convert('cut.mfl', Buffer.concat([file.subarray(0, MiB), file.subarray(-2)]));
		expect(await warning.textContent()).toContain('the fullflash of C45 has 4 MiB');
		expect(await alerts(card(BIN))).toEqual([]);
		expect((await download(card(BIN))).length).toBeLessThan(MiB);

		await convert('unknown.mfl', makeMfl(makeFlash(4 * MiB), 'ZZZQ'));
		expect(await type()).toBe('Martech Box · ZZZQ');
		expect(await warning.textContent()).toContain('no phone model with the code ZZZQ');
		expect(await alerts(card(MFL))).toEqual([NO_MODEL]);
	});

	it('refuses an MFL it cannot read, whatever its size', async () => {
		const flash = makeFlash(4 * MiB);
		// Martech's newer format, by its header and by its name only, and its "X" format
		for (const [name, header] of [['mr2.mfl', 'MR2S75F'], ['mr2.bin', 'MR2S75F'], ['flash.mfl', '\0\0\0\0\0\0\0'], ['x.mfl', 'MRTM55X']]) {
			flash.set(Buffer.from(header));
			await convert(name, flash);
			expect(await failure.textContent(), name).toMatch(/unsupported format|not supported/);
			expect(await cards.count()).toBe(0);
			expect(await warning.count()).toBe(0);
		}
	});
});
