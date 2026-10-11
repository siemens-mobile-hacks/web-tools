/* @refresh reload */
import { createEffect, createMemo, createSignal, on, onCleanup, onMount, ParentComponent } from "solid-js";
import { Box, CssBaseline, Toolbar, useMediaQuery } from '@suid/material';
import { grey } from '@suid/material/colors';
import { createPalette, createTheme, ThemeProvider } from '@suid/material/styles';
import { AppHeader } from '@/components/App/Header.js';
import {
	AppDrawer,
	DEFAULT_DRAWER_WIDTH,
	MAX_DRAWER_WIDTH,
	MIN_DRAWER_WIDTH,
} from '@/components/App/Drawer.js';
import { SerialProvider } from '@/providers/SerialProvider.js';
import { Toaster } from "@/components/App/Toaster.js";
import { AppProvider } from "@/providers/AppProvider";
import { useLocation } from "@solidjs/router";
import { LogPanel } from '@/components/App/LogPanel';
import { createConsoleSettingsStore, type ConsoleDock } from '@/store/consoleSettings';
import { makePersistedSignal } from '@/utils/store/makePersistedSignal';

type ThemeMode = 'light' | 'dark' | 'system';
type EffectiveTheme = Exclude<ThemeMode, 'system'>;
const AUTO_OVERLAY_MAX_WIDTH = 1100;

export const App: ParentComponent = (props) => {
	const location = useLocation();
	const [drawerIsOpen, setDrawerIsOpen] = createSignal<boolean>(false);
	const [themeChangeCount, setThemeChangeCount] = createSignal(0);
	const [preferredTheme, setPreferredTheme] = makePersistedSignal(createSignal<ThemeMode>("system"), { name: "theme" });
	const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
	const [preferredDrawerWidth, setPreferredDrawerWidth] = makePersistedSignal(
		createSignal(DEFAULT_DRAWER_WIDTH),
		{
			name: 'drawerWidth',
			debounce: 100,
		},
	);
	const [viewportSize, setViewportSize] = createSignal({
		width: window.innerWidth,
		height: window.innerHeight,
	});

	const effectiveTheme = createMemo<EffectiveTheme>(() => {
		const preferred = preferredTheme();
		if (preferred === 'system')
			return prefersDarkMode() ? 'dark' : 'light';
		return preferred;
	});

	const palette = createMemo(() => {
		return createPalette({
			mode: effectiveTheme() === 'dark' ? 'dark' : 'light',
			tableHeader: effectiveTheme() === 'dark' ? grey[900] : grey[100],
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
	const hasPermanentDrawer = useMediaQuery(theme.breakpoints.up('md'));
	const [logSettings, setLogSettings] = createConsoleSettingsStore();
	const drawerWidth = () => Math.min(MAX_DRAWER_WIDTH, Math.max(MIN_DRAWER_WIDTH, preferredDrawerWidth()));
	const logMode = (): ConsoleDock => {
		if (viewportSize().width <= AUTO_OVERLAY_MAX_WIDTH)
			return 'overlay';
		return logSettings.dock;
	};
	const layout = createMemo(() => {
		if (!hasPermanentDrawer()) {
			return {
				columns: 'minmax(0, 1fr)',
				rows: 'auto',
				areas: '"main"',
			};
		}
		if (logMode() === 'right') {
			return {
				columns: 'auto minmax(0, 1fr) auto',
				rows: 'minmax(0, 1fr)',
				areas: '"drawer main log"',
			};
		}
		if (logMode() === 'bottom') {
			return {
				columns: 'auto minmax(0, 1fr)',
				rows: 'minmax(0, 1fr) auto',
				areas: '"drawer main" "log log"',
			};
		}
		return {
			columns: 'auto minmax(0, 1fr)',
			rows: 'minmax(0, 1fr)',
			areas: '"drawer main"',
		};
	});

	const toggleDrawer = (drawerState: boolean): void => {
		setDrawerIsOpen(drawerState);
	};
	const toggleTheme = (): void => {
		if (themeChangeCount() < 2) {
			setPreferredTheme(effectiveTheme() === 'dark' ? 'light' : 'dark');
			setThemeChangeCount((count) => count + 1);
			return;
		}
		setPreferredTheme('system');
		setThemeChangeCount(0);
	};

	createEffect(on(() => location.pathname, () => toggleDrawer(false)));
	onMount(() => {
		const handleResize = () => setViewportSize({
			width: window.innerWidth,
			height: window.innerHeight,
		});
		window.addEventListener('resize', handleResize);
		onCleanup(() => window.removeEventListener('resize', handleResize));
	});

	return (
		<ThemeProvider theme={theme}>
			<AppProvider>
				<SerialProvider>
					<Toaster />
					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: layout().columns,
							gridTemplateRows: layout().rows,
							gridTemplateAreas: layout().areas,
							height: hasPermanentDrawer() ? '100dvh' : undefined,
							minHeight: hasPermanentDrawer() ? undefined : '100dvh',
							overflow: hasPermanentDrawer() ? 'hidden' : undefined,
						}}
					>
						<CssBaseline />

						<AppHeader
							logOpen={logSettings.open}
							preferredTheme={preferredTheme()}
							onDrawerOpen={() => toggleDrawer(!drawerIsOpen())}
							onLogToggle={() => setLogSettings('open', (open) => !open)}
							onThemeToggle={toggleTheme}
						/>
						<AppDrawer
							open={drawerIsOpen()}
							preferredTheme={preferredTheme()}
							width={drawerWidth()}
							onClose={() => toggleDrawer(false)}
							onThemeToggle={toggleTheme}
							onWidthChange={setPreferredDrawerWidth}
						/>

						<Box
							component="main"
							sx={{
								gridArea: 'main',
								minWidth: 0,
								minHeight: 0,
								p: 2,
								maxWidth: '100%',
								overflow: hasPermanentDrawer() ? 'auto' : undefined,
							}}
						>
							<Toolbar variant="dense" />
							{props.children}
						</Box>
						<LogPanel
							colorMode={effectiveTheme()}
							mode={logMode()}
							settings={logSettings}
							viewportHeight={viewportSize().height}
							viewportWidth={viewportSize().width}
							onSettingsChange={(key, value) => setLogSettings(key, value)}
						/>
					</Box>
				</SerialProvider>
			</AppProvider>
		</ThemeProvider>
	);
};
