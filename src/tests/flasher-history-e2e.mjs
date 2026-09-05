// Browser e2e smoke test for the Flasher patch history (not part of `pnpm test`):
//   npx vite --config vite.e2e.config.ts
//   node src/tests/flasher-history-e2e.mjs
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.env.PUPPETEER_CORE ?? '/tmp/node_modules', '/'));
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/chromium-browser';
const SERVER = process.env.E2E_SERVER ?? 'http://localhost:3001';

const browser = await puppeteer.launch({
	executablePath: CHROME,
	headless: true,
	defaultViewport: { width: 1280, height: 1000 },
	args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

let failures = 0;
const check = (name, actual, expected) => {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (!ok) failures++;
	console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const seedHistory = (entries) => page.evaluate((entries) => {
	localStorage.setItem('flasher.patchHistory', JSON.stringify(entries));
}, entries);

const clickButton = async (label) => {
	await page.evaluate((label) => {
		const b = [...document.querySelectorAll('button')].filter((x) => x.offsetParent)
			.find((x) => x.textContent.trim() == label);
		if (!b) throw new Error(`button not found: ${label}`);
		b.click();
	}, label);
	await sleep(300);
};

const entry = (over = {}) => ({
	id: over.id ?? Math.random().toString(36).slice(2),
	date: over.date ?? '2024-06-15T10:00:00.000Z',
	action: over.action ?? 'apply',
	source: over.source ?? 'phone',
	model: over.model ?? 'S55',
	imei: over.imei ?? '356079001234567',
	deviceName: over.deviceName ?? 'S55',
	info: over.info ?? 'SIEMENS S55',
	patchName: over.patchName ?? 'test.vkp',
	patchTitle: over.patchTitle ?? 'Test patch',
	writes: 2,
	written: 8,
	text: over.text ?? '; Test patch\n0x402BB4: F0F0F0F0 F1F1F1F1',
	...over,
});

await page.goto(`${SERVER}/flasher`, { waitUntil: 'networkidle0' });
await sleep(500);

// The tab bar
check('tabs', await page.evaluate(() =>
	[...document.querySelectorAll('button')].map((b) => b.textContent.trim())
		.filter((t) => ['Phone (WebSerial)', 'Fullflash file (.bin)', 'History'].includes(t))), [
	'Phone (WebSerial)', 'Fullflash file (.bin)', 'History',
]);

// Empty state
await clickButton('History');
check('empty state', (await page.evaluate(() => document.body.textContent)).includes('No patches logged yet'), true);

// Seeded entries
await seedHistory([
	entry({ id: 'a', patchTitle: 'Black list', model: 'S55', imei: '111111111111111', date: '2024-06-15T10:00:00.000Z' }),
	entry({ id: 'b', patchTitle: 'Blue EQ', model: 'CXV70', imei: '222222222222222', date: '2024-06-16T10:00:00.000Z' }),
	entry({ id: 'c', patchTitle: 'Caller groups', model: 'S55', imei: '333333333333333', date: '2024-06-17T10:00:00.000Z', action: 'revert' }),
]);
await clickButton('Phone (WebSerial)');
await clickButton('History');
const titles = () => page.evaluate(() =>
	[...document.querySelectorAll('.MuiPaper-outlined')]
		.map((p) => p.querySelector('b')?.textContent ?? '')
		.filter((t) => t && t != 'Patch history'));
check('seeded entries, newest first', await titles(), ['Caller groups', 'Blue EQ', 'Black list']);

// Filter by model (MUI Select: open the menu, then click the item)
await page.evaluate(() => {
	const select = [...document.querySelectorAll('.MuiSelect-select')].find((x) =>
		x.offsetParent && x.closest('.MuiFormControl-root')?.textContent.includes('Phone model'));
	select.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
	select.click();
});
await sleep(300);
await page.evaluate(() => {
	const item = [...document.querySelectorAll('li')].filter((li) => li.offsetParent).find((li) => li.textContent == 'S55');
	item.click();
});
await sleep(300);
check('model filter', await titles(), ['Caller groups', 'Black list']);

// Filter by IMEI (after a reset)
await clickButton('Reset');

// Filter by IMEI
await page.evaluate(() => {
	const input = [...document.querySelectorAll('input')].find((i) =>
		i.offsetParent && i.closest('.MuiFormControl-root')?.textContent.includes('IMEI'));
	input.value = '222222222222222';
	input.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(300);
check('imei filter', await titles(), ['Blue EQ']);

// Filter by date
await page.evaluate(() => {
	const input = [...document.querySelectorAll('input[type="date"]')].find((i) =>
		i.offsetParent && i.closest('.MuiFormControl-root')?.textContent.includes('from'));
	input.value = '2024-06-17';
	input.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(300);
check('imei + date filter', await titles(), []);

// Reset
await clickButton('Reset');
check('reset filters', await titles(), ['Caller groups', 'Blue EQ', 'Black list']);

// Expand an entry: patch text and meta
await page.evaluate(() => {
	const row = [...document.querySelectorAll('.MuiPaper-outlined')].find((p) => p.textContent.includes('Blue EQ'));
	row.querySelector('button[title="Download the logged patch (.vkp)"]').closest('div').click();
});
await sleep(300);
check('expanded patch text', (await page.evaluate(() => document.body.textContent)).includes('0x402BB4: F0F0F0F0 F1F1F1F1'), true);

// Applying a patch in the file mode logs a new entry
await page.evaluate(() => localStorage.clear());
await clickButton('Fullflash file (.bin)');
// A 16-byte dump at 0x400000 via the File constructor
await page.evaluate(async () => {
	const data = new Uint8Array(16).fill(0xF0);
	const file = new File([data], 'S55_2024-01-01_00-00-00_From_40.bin');
	// The file inputs carry the HTML "hidden" attribute: check the wrapping
	// label for visibility instead.
	const input = [...document.querySelectorAll('input[type="file"]')]
		.filter((i) => i.parentElement?.offsetParent).find((i) => i.accept.includes('.bin'));
	const dt = new DataTransfer();
	dt.items.add(file);
	input.files = dt.files;
	input.dispatchEvent(new Event('change', { bubbles: true }));
});
await sleep(300);

// Type a patch into the editor (old data matches the 0xF0 dump)
const editor = await page.evaluateHandle(() =>
	[...document.querySelectorAll('textarea')].find((t) => t.offsetParent));
await editor.asElement().click();
await page.keyboard.type('; My new patch\n0x400004: F0F0F0F0 F1F1F1F1', { delay: 5 });
await sleep(600); // parse debounce

// Confirm dialogs
page.on('dialog', (d) => d.accept());
await sleep(100);
await clickButton('Apply');
await sleep(800);

await clickButton('History');
check('logged entry', await titles(), ['My new patch']);
check('logged entry model', (await page.evaluate(() => document.body.textContent)).includes('on S55'), true);
check('logged entry source', (await page.evaluate(() => document.body.textContent)).includes('Dump'), true);

console.log(failures ? `\n${failures} FAILURES` : '\nALL OK');
await browser.close();
process.exit(failures ? 1 : 0);
