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
		exclude: [
			'siemens-sms-parser',
			'@sie-js/creampie',
			'@sie-js/libffshit',
			'@ffmpeg/util',
			'@ffmpeg/ffmpeg',
			'@ffmpeg/core',
			'@ffmpeg/core-mt',
		],
	},
	server: {
		port: 3000,
		// Required for SharedArrayBuffer and ffmpeg.wasm multithreading
		headers: {
			'Cross-Origin-Opener-Policy': 'same-origin',
			'Cross-Origin-Embedder-Policy': 'require-corp',
			'Cross-Origin-Resource-Policy': 'same-origin'
		}
	},
	preview: {
		// Mirrors dev behavior when running `vite preview`
		headers: {
			'Cross-Origin-Opener-Policy': 'same-origin',
			'Cross-Origin-Embedder-Policy': 'require-corp',
			'Cross-Origin-Resource-Policy': 'same-origin'
		}
	},
	build: {
		target: 'esnext'
	},
});
