import { defineConfig } from 'vitest/config';

// The e2e tests drive the File Explorer in a browser, on the phones' fullflashes, and the Firmware
// Converter, on files they make:
//   SIE_FFS_TEST_FULLFLASHES=<directories of fullflashes> CHROME_PATH=<chrome> pnpm test:e2e
// Without CHROME_PATH, they take the Chromium of `pnpm exec playwright install chromium`. The tests
// of a fullflash that isn't found are skipped, and the run fails when none is.
// The unit tests run with Node's test runner: pnpm test.
export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: 'e2e',
					include: ['tests/e2e/**/*.test.ts'],
					globalSetup: ['tests/e2e/globalSetup.ts'],
					// Opening and saving fullflashes of up to 128 MiB in a browser is nothing like a unit test
					testTimeout: 120000,
					hookTimeout: 180000,
				},
			},
		],
	},
});
