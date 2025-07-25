import { defineConfig, Plugin } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import suidPlugin from "@suid/vite-plugin";
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'node:path';
import fs from 'node:fs';

const ROUTES = [
	`/screenshot`,
	`/dumper`,
	`/sms-reader`
];

function postBuildPlugin(): Plugin {
	return {
		name: 'postbuild-plugin',
		async closeBundle() {
			const isSymlinkExists = (file: string) => {
				try {
					fs.lstatSync(file);
					return true;
				} catch (e) {
					return false;
				}
			};

			let outDir = `${import.meta.dirname}/dist`;
			for (let routeDir of ROUTES) {
				let symlinkSrc = path.relative(`${outDir}/${routeDir}`, `${outDir}/index.html`);
				let symlinkDst = `${outDir}/${routeDir}/index.html`;

				fs.mkdirSync(`${outDir}/${routeDir}`, { recursive: true });

				if (isSymlinkExists(symlinkDst))
					fs.unlinkSync(symlinkDst);

				fs.symlinkSync(symlinkSrc, `${outDir}/${routeDir}/index.html`);
			}
		}
	};
}

export default defineConfig({
	resolve: {
		alias: [{ find: '~', replacement: path.resolve(import.meta.dirname, '/src') }],
	},
	worker: {
		format: 'es',
		plugins: () => [ tsconfigPaths(), nodePolyfills() ]
	},
	plugins: [
		suidPlugin(),
		solidPlugin(),
		tsconfigPaths(),
		nodePolyfills(),
		postBuildPlugin(),
	],
	optimizeDeps: {
		exclude: ['siemens-sms-parser'],
	},
	server: {
		port: 3000,
	},
	build: {
		target: 'esnext'
	},
});
