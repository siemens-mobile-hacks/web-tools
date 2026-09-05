// Browser e2e harness for the File Explorer. Not part of `pnpm test`: needs the
// mock dev server (vite.e2e.config.ts) and a local Chrome + puppeteer-core:
//   npx vite --config vite.e2e.config.ts
//   PUPPETEER_CORE=<puppeteer-core dir> CHROME_PATH=<chrome> node src/tests/fileexplorer-e2e.mjs
// HEADFUL=1 runs in a real (Xvfb) display, VH=500 forces a scrollable page.
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.env.PUPPETEER_CORE ?? '/tmp/node_modules', '/'));
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH ?? '/tmp/chrome/chrome/linux-154.0.8021.0/chrome-linux64/chrome';
const SERVER = process.env.E2E_SERVER ?? 'http://localhost:3001';

const browser = await puppeteer.launch({
	executablePath: CHROME,
	headless: !process.env.HEADFUL,
	defaultViewport: { width: Number(process.env.VW ?? 1280), height: Number(process.env.VH ?? 900) },
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

await page.goto(`${SERVER}/file-explorer`, { waitUntil: 'networkidle0' });
await page.evaluate(() => {
	const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() == 'Connect');
	b?.click();
});
await page.waitForFunction(() => document.body.textContent.includes('logo.png'), { timeout: 10000 });
await sleep(500);

// Names of the currently selected rows, in display order
const selectedRows = () => page.evaluate(() =>
	[...document.querySelectorAll('tr.Mui-selected')]
		.map((tr) => [...tr.querySelectorAll('td')][1]?.textContent ?? '')
		.filter((t) => t && t != '..')
);

// Clicks the row of `name` on a plain spot (the size cell), bypassing links,
// buttons and checkboxes, optionally holding modifiers
async function clickRow(name, { shift = false, ctrl = false } = {}) {
	const pos = await page.evaluate((name) => {
		const rows = [...document.querySelectorAll('tr')];
		const row = rows.find((r) => r.textContent.includes(name));
		if (!row) return null;
		row.scrollIntoView({ block: 'center' });
		const cells = [...row.querySelectorAll('td')];
		const cell = cells[2] ?? cells[cells.length - 2]; // size column
		const r = cell.getBoundingClientRect();
		return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
	}, name);
	if (!pos) throw new Error(`row not found: ${name}`);
	await sleep(100);
	if (shift) await page.keyboard.down('Shift');
	if (ctrl) await page.keyboard.down('Control');
	await page.mouse.click(pos.x, pos.y);
	if (shift) await page.keyboard.up('Shift');
	if (ctrl) await page.keyboard.up('Control');
	await sleep(200);
}

// Clicks the checkbox in the row of `name`, optionally with shift held
async function clickCheckbox(name, { shift = false } = {}) {
	const pos = await page.evaluate((name) => {
		const rows = [...document.querySelectorAll('tr')];
		const row = rows.find((r) => r.textContent.includes(name));
		if (!row) return null;
		row.scrollIntoView({ block: 'center' });
		const box = row.querySelector('input[type="checkbox"]');
		const r = box.getBoundingClientRect();
		return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
	}, name);
	if (!pos) throw new Error(`checkbox not found: ${name}`);
	await sleep(100);
	if (shift) await page.keyboard.down('Shift');
	await page.mouse.click(pos.x, pos.y);
	if (shift) await page.keyboard.up('Shift');
	await sleep(200);
}

// Middle-clicks the "open in new tab" link of `name`; resolves to the preview
// tab once it finished loading (null if no tab appeared)
async function middleClickFile(name) {
	const appPages = new Set(await browser.pages());
	const before = appPages.size;
	const pos = await page.evaluate((name) => {
		const el = [...document.querySelectorAll('button[title="Open in new tab"]')]
			.find((x) => x.textContent.includes(name));
		if (!el) return null;
		el.scrollIntoView({ block: 'center' });
		const r = el.getBoundingClientRect();
		return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
	}, name);
	if (!pos) throw new Error(`file not found: ${name}`);
	await sleep(100);
	await page.mouse.move(pos.x, pos.y);
	await page.mouse.down({ button: 'middle' });
	await sleep(120);
	await page.mouse.up({ button: 'middle' });

	for (let i = 0; i < 40; i++) {
		await sleep(200);
		const pages = await browser.pages();
		const tab = pages.find((p) => !appPages.has(p));
		if (tab && !tab.url().endsWith('about:blank'))
			return tab;
		if (i == 39 && tab) return tab;
	}
	return null;
}

// --- selection ---

console.log('\n== selection ==');
await clickRow('theme.mid');
check('plain row click selects single entry', await selectedRows(), ['theme.mid']);

await clickRow('addressbook.vcf');
check('plain click on another row replaces selection', await selectedRows(), ['addressbook.vcf']);

await clickRow('config.ini', { shift: true });
check('shift+row click selects the range in between', await selectedRows(), ['addressbook.vcf', 'bigvideo.3gp', 'config.ini']);

await clickRow('addressbook.vcf', { shift: true });
check('shift+row click works upwards too', await selectedRows(), ['addressbook.vcf', 'bigvideo.3gp', 'config.ini']);

await clickRow('notes.txt', { ctrl: true });
check('ctrl+row click toggles without clearing', await selectedRows(), ['addressbook.vcf', 'bigvideo.3gp', 'config.ini', 'notes.txt']);

await clickCheckbox('addressbook.vcf');
check('plain checkbox click toggles a single entry off', await selectedRows(), ['bigvideo.3gp', 'config.ini', 'notes.txt']);

// The deselection above became the anchor: a shift+checkbox click applies its
// direction and removes the whole range instead of selecting it
await clickCheckbox('theme.mid', { shift: true });
check("shift+checkbox applies the anchor's deselect direction", await selectedRows(), []);

// A checkbox anchor that selects adds the range
await clickCheckbox('logo.png');
check('plain checkbox click toggles a single entry on', await selectedRows(), ['logo.png']);
await clickCheckbox('logo3.png', { shift: true });
check('shift+checkbox click selects the range from the anchor', await selectedRows(), ['logo.png', 'logo2.png', 'logo3.png']);

// Deselect a middle range: anchor on logo2.png deselecting, shift removes it and logo3.png
await clickCheckbox('logo2.png');
await clickCheckbox('logo3.png', { shift: true });
check('shift+checkbox from a deselecting anchor removes the range', await selectedRows(), ['logo.png']);

// Select-all checkbox clears the anchor: next shift-click just selects one
await page.evaluate(() => document.querySelector('thead input[type="checkbox"]').click());
await sleep(200);
await page.evaluate(() => document.querySelector('thead input[type="checkbox"]').click());
await sleep(200);
check('select all / none resets selection', await selectedRows(), []);
await clickRow('hidden.dat', { shift: true });
check('shift+click without an anchor selects the single entry', await selectedRows(), ['hidden.dat']);

// Clicking a file link must not change the selection
await clickRow('notes.txt');
await page.evaluate((name) => {
	const el = [...document.querySelectorAll('button[title="Open in new tab"]')].find((x) => x.textContent.includes(name));
	el.click();
}, 'logo.png');
await sleep(1500);
check('clicking a file link keeps the selection', await selectedRows(), ['notes.txt']);
for (const p of await browser.pages()) {
	if (p !== page) await p.close();
}

// --- middle click ---

console.log('\n== middle click ==');
const tab1 = await middleClickFile('logo.png');
check('middle click opens the file in a new tab', tab1 ? tab1.url().includes('/__preview/') && tab1.url().endsWith('logo.png') : null, true);
const type1 = tab1 ? await tab1.evaluate(() => document.contentType) : null;
check('preview tab serves the file', type1, 'image/png');
if (tab1) await tab1.close();

const tab2 = await middleClickFile('logo2.png');
check('middle click works repeatedly', tab2 ? tab2.url().endsWith('logo2.png') : null, true);
if (tab2) await tab2.close();

console.log(`\n${failures == 0 ? 'ALL PASSED' : failures + ' FAILED'}`);
await browser.close();
process.exit(failures == 0 ? 0 : 1);
