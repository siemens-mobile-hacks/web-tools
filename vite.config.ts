import { defineConfig, Plugin } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import suidPlugin from "@suid/vite-plugin";
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import solidSvg from 'vite-plugin-solid-svg'
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'node:path';
import fs from 'node:fs';

const ROUTES = [
	`/screenshot`,
	`/dumper`,
	`/dumper/dwd`,
	`/sms-reader`,
	`/apoxi/unlock-boot`,
	`/video-converter`,
	`/file-explorer`,
	`/flasher`,
	`/firmware-converter`,
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
		solidSvg({
			 defaultAsComponent: true,
			 svgo: {
				 enabled: true,
				 svgoConfig: {
					 plugins: [
						 {
							 name: 'preset-default',
							 params: {
								 overrides: {
									 removeViewBox: false,
								 },
							 },
						 },
					 ],
				 },
			 },
		 }),
	],
	optimizeDeps: {
		include: ['@sie-js/fw'],
		exclude: [
			'siemens-sms-parser',
			'@sie-js/creampie',
			'@sie-js/libffshit',
			'@ffmpeg/util',
			'@ffmpeg/ffmpeg',
			'@ffmpeg/core',
		],
	},
	server: {
		port: 3000,
		fs: {
			// This project's root (the default) plus the sibling sieflasher
			// checkout, for when the gitignored pnpm-workspace.yaml override
			// links @sie-js/flasher and vklay-loaders from there.
			allow: ['.', '../sieflasher'],
		},
	},
	resolve: {
		// vite-plugin-node-polyfills injects imports of its shims
		// (vite-plugin-node-polyfills/shims/*) into every module that
		// references the Buffer/process/global identifiers, and rollup
		// resolves them relative to the importing file. When @sie-js/flasher
		// is linked from the sibling sieflasher checkout, that resolution
		// cannot walk up to this project's node_modules, so resolve the
		// package from the root instead.
		dedupe: ['vite-plugin-node-polyfills'],
	},
	build: {
		target: 'esnext'
	},
});
