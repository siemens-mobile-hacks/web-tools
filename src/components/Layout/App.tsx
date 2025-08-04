/* @refresh reload */
import { createMemo, createSignal, ParentComponent } from "solid-js";
import { Box, CssBaseline, Toolbar, useMediaQuery } from '@suid/material';
import { createPalette, createTheme, ThemeProvider } from '@suid/material/styles';
import { AppHeader } from '@/components/App/Header.js';
import { AppDrawer } from '@/components/App/Drawer.js';
import { SerialProvider } from '@/providers/SerialProvider.js';
import { makePersisted } from "@solid-primitives/storage";
import { Toaster } from "@/components/App/Toaster.js";
import { AppProvider } from "@/providers/AppProvider";

type ThemeMode = 'light' | 'dark' | 'system';

export const App: ParentComponent = (props) => {
	const [drawerIsOpen, setDrawerIsOpen] = createSignal<boolean>(false);
	const [preferredTheme, setPreferredTheme] = makePersisted(createSignal<ThemeMode>("system"), { name: "theme" });
	const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');

	const effectiveTheme = createMemo<ThemeMode>(() => {
		if (preferredTheme() === 'system')
			return prefersDarkMode() ? 'dark' : 'light';
		return preferredTheme();
	});

	const palette = createMemo(() => {
		return createPalette({
			mode: effectiveTheme() === 'dark' ? 'dark' : 'light',
			primary: {
				main: effectiveTheme() === 'dark' ? '#bb86fc' : '#673ab7',
			},
			secondary: {
				main: effectiveTheme() === 'dark' ? '#03dac6' : '#651fff',
			},
		});
	});

	const theme = createTheme({
		palette,
		typography: {
			fontFamily: [
				'-apple-system',
				'BlinkMacSystemFont',
				'"Segoe UI"',
				'Roboto Variable',
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

	const toggleDrawer = (drawerState: boolean): void => {
		setDrawerIsOpen(drawerState);
	};

	return (
		<ThemeProvider theme={theme}>
			<AppProvider>
				<SerialProvider>
					<Toaster />
					<Box sx={{ display: 'flex' }}>
						<CssBaseline />

						<AppHeader
							effectiveTheme={effectiveTheme()}
							preferredTheme={preferredTheme()}
							onDrawerOpen={() => toggleDrawer(!drawerIsOpen())}
							onThemeChanged={(newTheme) => setPreferredTheme(newTheme)}
						/>
						<AppDrawer open={drawerIsOpen()} onClose={() => toggleDrawer(false)} />

						<Box component="main" sx={{ flexGrow: 1, p: 1, maxWidth: '100%' }}>
							<Toolbar />
							{props.children}
						</Box>
					</Box>
				</SerialProvider>
			</AppProvider>
		</ThemeProvider>
	);
};
