/* @refresh reload */
import { createSignal, createEffect, createMemo, onMount } from "solid-js";

import Box from '@suid/material/Box';
import Toolbar from '@suid/material/Toolbar';

import { createTheme, ThemeProvider, createPalette } from '@suid/material/styles';
import CssBaseline from '@suid/material/CssBaseline';
import useMediaQuery from '@suid/material/useMediaQuery';

import AppHeader from '~/components/App/Header';
import AppDrawer from '~/components/App/Drawer';

import SerialProvider from '~/contexts/SerialProvider';
import { createStoredSignal } from "~/storage";

function App(props) {
	let [drawerIsOpen, setDrawerIsOpen] = createSignal(false);
	let [preferredTheme, setPreferredTheme] = createStoredSignal("theme", "system");
	let prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');

	let effectiveTheme = createMemo(() => {
		if (preferredTheme() == 'system')
			return prefersDarkMode() ? 'dark' : 'light';
		return preferredTheme();
	});

	let palette = createMemo(() => {
		return createPalette({
			mode: effectiveTheme() == 'dark' ? 'dark' : 'light',
			primary: {
				main: effectiveTheme() == 'dark' ? '#bb86fc' : '#673ab7',
			},
			secondary: {
				main: effectiveTheme() == 'dark' ? '#03dac6' : '#651fff',
			},
		});
	});
	let theme = createTheme({
		palette,
		typography: {
			fontFamily: [
				'-apple-system',
				'BlinkMacSystemFont',
				'"Segoe UI"',
				'Roboto',
				'"Helvetica Neue"',
				'Arial',
				'sans-serif',
				'"Apple Color Emoji"',
				'"Segoe UI Emoji"',
				'"Segoe UI Symbol"',
			].join(','),
		},
	});

	let toggleDrawer = (drawerState) => {
		setDrawerIsOpen(drawerState);
	};

	return (
		<ThemeProvider theme={theme}>
			<SerialProvider>
				<Box sx={{ display: 'flex' }}>
					<CssBaseline />

					<AppHeader
						effectiveTheme={effectiveTheme()}
						preferredTheme={preferredTheme()}
						onDrawerOpen={() => toggleDrawer(!drawerIsOpen())}
						onThemeChanged={(newTheme) => setPreferredTheme(newTheme)}
					/>
					<AppDrawer open={drawerIsOpen()} onClose={toggleDrawer(false)} />

					<Box component="main" sx={{ flexGrow: 1, p: 1 }}>
						<Toolbar />
						{props.children}
					</Box>
				</Box>
			</SerialProvider>
		</ThemeProvider>
	);
}

export default App;
