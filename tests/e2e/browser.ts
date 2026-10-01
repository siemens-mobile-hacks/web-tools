import { chromium, type Browser } from 'playwright';

// CHROME_PATH, else the Chromium of `pnpm exec playwright install chromium`
export function launchBrowser(): Promise<Browser> {
	return chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
}
