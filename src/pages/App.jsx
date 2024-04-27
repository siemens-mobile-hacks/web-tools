/* @refresh reload */
import { createSignal, createEffect, createMemo, onMount } from "solid-js";

import Box from '@suid/material/Box';
import Toolbar from '@suid/material/Toolbar';

import { createTheme, ThemeProvider } from '@suid/material/styles';
import CssBaseline from '@suid/material/CssBaseline';
import useMediaQuery from '@suid/material/useMediaQuery';

import AppHeader from '~/components/App/Header';
import AppDrawer from '~/components/App/Drawer';

import BfcProvider from '~/contexts/BfcProvider';

function App(props) {
	let [drawerIsOpen, setDrawerIsOpen] = createSignal(false);

	let prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
	let theme = createMemo(() => {
		return createTheme({
			palette: {
				mode: prefersDarkMode() ? 'dark' : 'light',
				primary: {
					main: prefersDarkMode() ? '#bb86fc' : '#673ab7',
				},
				secondary: {
					main: prefersDarkMode() ? '#03dac6' : '#651fff',
				},
			},
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
	});

	let toggleDrawer = (drawerState) => {
		setDrawerIsOpen(drawerState);
	};

	return (
		<ThemeProvider theme={theme()}>
			<BfcProvider>
				<Box sx={{ display: 'flex' }}>
					<CssBaseline />

					<AppHeader onDrawerOpen={() => toggleDrawer(!drawerIsOpen())} />
					<AppDrawer open={drawerIsOpen()} onClose={toggleDrawer(false)} />

					<Box component="main" sx={{ flexGrow: 1, p: 1 }}>
						<Toolbar />
						{props.children}
					</Box>
				</Box>
			</BfcProvider>
		</ThemeProvider>
	);
}

export default App;
