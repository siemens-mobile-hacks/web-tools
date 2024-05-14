import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import suidPlugin from "@suid/vite-plugin";
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'path';
import fs from 'fs';

const ROUTES = [
	`/screenshot`,
	`/swilib`,
];

function postBuildPlugin() {
	return {
		name:	'postbuild-plugin',
		async closeBundle() {
			let outDir = `${import.meta.dirname}/dist`;
			for (let routeDir of ROUTES) {
				let symlinkSrc = path.relative(`${outDir}/${routeDir}`, `${outDir}/index.html`);
				let symlinkDst = `${outDir}/${routeDir}/index.html`;

				fs.mkdirSync(`${outDir}/${routeDir}`, { recursive: true });

				if (!fs.existsSync(symlinkDst))
					fs.symlinkSync(symlinkSrc, `${outDir}/${routeDir}/index.html`);
			}
		}
	};
}

export default defineConfig({
	resolve: {
		alias: [{ find: '~', replacement: path.resolve(import.meta.dirname, '/src') }],
	},
	plugins: [
		suidPlugin(),
		solidPlugin(),
		nodePolyfills(),
		postBuildPlugin(),
	],
	server: {
		port: 3000,
	},
	build: {
		target: 'esnext',
	},
});
