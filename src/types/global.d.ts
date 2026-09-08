import 'solid-js';

declare module '@suid/material/styles/createPalette' {
	interface PaletteOptions {
		tableHeader: string;
	}
}

declare module 'solid-js' {
	namespace JSX {
		interface InputHTMLAttributes<T> {
			webkitdirectory?: boolean;
		}
	}
}
