import { defineConfig, mergeConfig } from 'vite';
import baseConfig from './vite.config';
import path from 'node:path';

// Dev config for e2e tests (src/tests/*.mjs): same setup as the app, but the serial worker
// endpoint is replaced by an in-memory mock, so the File Explorer works
// without a real phone.
export default mergeConfig(baseConfig, defineConfig({
	resolve: {
		alias: {
			"@/workers/endpoints/serial": path.resolve(import.meta.dirname, "src/tests/mock-serial.ts"),
		},
	},
	server: { port: 3001, strictPort: true },
}));
