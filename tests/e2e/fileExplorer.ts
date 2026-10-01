import fs from 'node:fs';
import type { Browser, Locator, Page } from 'playwright';
import { inject } from 'vitest';
import { launchBrowser } from './browser';

// A prompt's text, or whether to confirm
export type Answer = string | boolean;

export interface TitleBarStatus {
	text: string;
	// A connection's pulsing dot
	pulses: boolean;
	// An opened file's icon
	icon: boolean;
}

export interface EntryAttributes {
	name: string;
	// "R A"
	letters: string;
	// "Read-only, Archive"
	names: string;
	dimmed: boolean;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The File Explorer, in a browser of its own
export class FileExplorer {
	// What the page's confirm() and prompt() asked, in order
	readonly dialogs: string[] = [];
	private readonly answers: Answer[] = [];

	private constructor(private readonly browser: Browser, readonly page: Page) {
		page.on('dialog', (dialog) => {
			this.dialogs.push(dialog.message());
			const answer = this.answers.shift() ?? true;
			if (answer === false) {
				void dialog.dismiss();
			} else {
				void dialog.accept(typeof answer == 'string' ? answer : undefined);
			}
		});
	}

	static async open(): Promise<FileExplorer> {
		const browser = await launchBrowser();
		const page = await browser.newPage();
		await page.goto(`${inject('baseUrl')}file-explorer`);
		return new FileExplorer(browser, page);
	}

	close(): Promise<void> {
		return this.browser.close();
	}

	// The answers to the next dialogs, which are confirmed without one
	answer(...answers: Answer[]): void {
		this.answers.push(...answers);
	}

	titleBar(): Promise<TitleBarStatus> {
		return this.page.evaluate(() => {
			const status = document.querySelector('.MuiAppBar-root h6')?.nextElementSibling;
			return {
				text: status?.textContent ?? '',
				pulses: !!status?.querySelector('.header-status-indicator'),
				icon: !!status?.querySelector('svg'),
			};
		});
	}

	async titleBarText(): Promise<string> {
		return (await this.titleBar()).text;
	}

	// The entries listed, without the way up
	names(): Promise<string[]> {
		return this.page.evaluate(() => [...document.querySelectorAll('tbody tr')]
			.map((tr) => tr.querySelectorAll('td')[1]?.textContent?.trim() ?? '')
			.filter((name) => name && name != '..'));
	}

	// The entries listed, with their attributes' letters, their names as they show on hover, and
	// whether they are dimmed
	attributes(): Promise<EntryAttributes[]> {
		return this.page.evaluate(() => [...document.querySelectorAll('tbody tr')]
			.map((tr) => [tr, tr.querySelectorAll('td')] as const)
			.filter(([, cells]) => cells.length > 4)
			.map(([tr, cells]) => ({
				name: cells[1].textContent?.trim() ?? '',
				letters: cells[4].textContent?.trim() ?? '',
				names: cells[4].title,
				dimmed: getComputedStyle(tr).opacity != '1',
			})));
	}

	// Throws the error the page shows meanwhile
	async waitForName(name: string, listed = true): Promise<void> {
		await this.page.waitForFunction(([name, listed]) => {
			const names = [...document.querySelectorAll('tbody tr')].map((tr) => tr.querySelectorAll('td')[1]?.textContent?.trim());
			return names.includes(name) == listed || document.querySelector('.MuiAlert-standardError');
		}, [name, listed] as const, { timeout: 30000 });
		await this.throwError();
	}

	async error(): Promise<string | undefined> {
		const alert = this.page.locator('.MuiAlert-standardError');
		return await alert.count() ? (await alert.first().textContent()) ?? '' : undefined;
	}

	private async throwError(): Promise<void> {
		const error = await this.error();
		if (error !== undefined)
			throw new Error(`The page shows: ${error}`);
	}

	async waitIdle(): Promise<void> {
		await this.page.locator('.MuiLinearProgress-root').first().waitFor({ state: 'detached', timeout: 30000 });
	}

	button(title: string): Locator {
		return this.page.locator(`button[title="${title}"]`);
	}

	isUploadDisabled(): Promise<boolean> {
		return this.page.locator('label', { hasText: 'Upload File' }).evaluate((label) => label.classList.contains('Mui-disabled'));
	}

	async switchSource(source: 'Phone' | 'Fullflash'): Promise<void> {
		await this.page.getByRole('button', { name: source, exact: true }).click();
	}

	async openFullflash(file: string): Promise<void> {
		await this.switchSource('Fullflash');
		await this.page.locator('input[type=file][aria-label="Fullflash"]').setInputFiles(file);
		await this.page.waitForFunction(() => document.querySelector('tbody tr td:nth-child(2) button') || document.querySelector('.MuiAlert-standardError'), undefined, { timeout: 60000 });
		await this.throwError();
	}

	// Through the app's menu, by the tool's path
	async goTo(pathname: string): Promise<void> {
		await this.page.locator(`a[href$="${pathname}"]`).click();
	}

	isSaveEnabled(): Promise<boolean> {
		return this.page.getByRole('button', { name: 'Save fullflash' }).isEnabled();
	}

	fileNameBesideSave(): Promise<string | null> {
		return this.page.getByRole('button', { name: 'Save fullflash' }).locator('xpath=following-sibling::*[1]').textContent();
	}

	async enter(name: string): Promise<void> {
		await this.row(name).locator('td:nth-child(2) button').click();
		await this.page.waitForURL((url) => url.searchParams.get('path')?.split('/').includes(name) ?? false);
		await this.waitIdle();
	}

	async up(): Promise<void> {
		const path = new URL(this.page.url()).searchParams.get('path');
		await this.page.getByRole('button', { name: '..', exact: true }).click();
		await this.page.waitForURL((url) => url.searchParams.get('path') != path);
		await this.waitIdle();
	}

	async upload(name: string, data: Uint8Array): Promise<void> {
		await this.page.locator('label', { hasText: 'Upload File' }).locator('input[type=file]').setInputFiles({
			name,
			mimeType: 'application/octet-stream',
			buffer: Buffer.from(data),
		});
	}

	async mkdir(name: string): Promise<void> {
		this.answer(name);
		await this.button('New folder').click();
	}

	async rename(name: string, newName: string): Promise<void> {
		this.answer(newName);
		await this.row(name).locator('button[title="Rename"]').click();
	}

	async remove(name: string): Promise<void> {
		await this.row(name).locator('button[title="Delete"]').click();
	}

	async refresh(): Promise<void> {
		await this.button('Refresh').click();
		await this.waitIdle();
	}

	async save(): Promise<Buffer> {
		const [download] = await Promise.all([
			this.page.waitForEvent('download'),
			this.page.getByRole('button', { name: 'Save fullflash' }).click(),
		]);
		return fs.readFileSync((await download.path())!);
	}

	private row(name: string): Locator {
		return this.page.locator('tbody tr').filter({
			has: this.page.locator('td:nth-child(2) button', { hasText: new RegExp(`^${escapeRegExp(name)}$`) }),
		});
	}
}
