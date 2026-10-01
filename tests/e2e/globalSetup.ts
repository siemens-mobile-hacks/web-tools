import path from 'node:path';
import type { TestProject } from 'vitest/node';
import { createServer } from 'vite';
import { launchBrowser } from './browser';
import { findFullflash, PHONES } from './fullflashes';

declare module 'vitest' {
	export interface ProvidedContext {
		baseUrl: string;
	}
}

const ROOT = path.resolve(import.meta.dirname, '../..');

// How long the page has to go without reloading for the dev server to be done optimizing
const SETTLED_MS = 3000;

// Serves the app for the tests' pages
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
	if (!PHONES.some((phone) => findFullflash(phone.fullflash)))
		throw new Error(`None of ${PHONES.map((phone) => phone.fullflash).join(', ')} is in the directories SIE_FFS_TEST_FULLFLASHES lists`);

	// The optimizer's cache is the tests' own: under vitest, NODE_ENV is "test", which makes the dev
	// server's cache look outdated to it, and the other way round
	const server = await createServer({ root: ROOT, cacheDir: 'node_modules/.vite-e2e', logLevel: 'warn' });
	await server.listen();
	const baseUrl = server.resolvedUrls!.local[0];
	try {
		await settle(baseUrl);
	} catch (e) {
		await server.close();
		throw e;
	}
	project.provide('baseUrl', baseUrl);
	return () => server.close();
}

// A cold dev server finds dependencies to optimize while the page loads, and then reloads it, which
// would fail whatever a test was doing. The page and the workers it starts import all of them.
async function settle(baseUrl: string): Promise<void> {
	const browser = await launchBrowser();
	try {
		const page = await browser.newPage();
		let loaded = Date.now();
		page.on('load', () => loaded = Date.now());
		await page.goto(`${baseUrl}file-explorer`);
		while (Date.now() - loaded < SETTLED_MS)
			await page.waitForTimeout(500);
		await page.getByRole('button', { name: 'Connect' }).waitFor();
	} finally {
		await browser.close();
	}
}
