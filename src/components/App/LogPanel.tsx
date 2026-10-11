import { type Component, createEffect, createSignal, onCleanup, Show } from 'solid-js';
import {
	Backdrop,
	Box,
	Divider,
	IconButton,
	ListItemIcon,
	Menu,
	MenuItem,
	Toolbar,
	Typography,
} from '@suid/material';
import BlockIcon from '@suid/icons-material/Block';
import ContentCopyIcon from '@suid/icons-material/ContentCopy';
import LayersIcon from '@suid/icons-material/Layers';
import MoreVertIcon from '@suid/icons-material/MoreVert';
import { useTheme } from '@suid/material/styles';
import type LunaConsole from 'luna-console';
import { DockBottomIcon } from '@/assets/icons/DockBottomIcon';
import { DockRightIcon } from '@/assets/icons/DockRightIcon';
import { showToast } from '@/components/App/Toaster';
import { ResizeHandle } from '@/components/App/ResizeHandle';
import type { ConsoleDock, ConsoleSettings } from '@/store/consoleSettings';
import {
	clearConsoleMessages,
	formatConsoleMessage,
	getConsoleMessages,
	subscribeConsoleMessages,
} from '@/utils/consoleRelay';

interface LogPanelProps {
	colorMode: 'light' | 'dark';
	mode: ConsoleDock;
	settings: ConsoleSettings;
	viewportHeight: number;
	viewportWidth: number;
	onSettingsChange: <K extends keyof ConsoleSettings>(key: K, value: ConsoleSettings[K]) => void;
}

const DEFAULT_PANEL_WIDTH = 480;
const DEFAULT_PANEL_HEIGHT = 400;
const MIN_PANEL_WIDTH = 240;
const MIN_PANEL_HEIGHT = 100;
const MIN_APP_WIDTH = 800;
const MIN_CONTENT_HEIGHT = 240;
const APP_BAR_HEIGHT = 48;

export const LogPanel: Component<LogPanelProps> = (props) => {
	const theme = useTheme();
	const [dockAnchor, setDockAnchor] = createSignal<Element>();
	let container!: HTMLDivElement;
	let panel!: HTMLElement;
	let logConsole: LunaConsole | undefined;
	let initializePromise: Promise<void> | undefined;
	let unsubscribe: (() => void) | undefined;
	let disposed = false;

	const initializeConsole = (): Promise<void> => {
		if (initializePromise)
			return initializePromise;
		initializePromise = Promise.all([
			import('luna-console'),
			import('luna-object-viewer/luna-object-viewer.css'),
			import('luna-data-grid/luna-data-grid.css'),
			import('luna-dom-viewer/luna-dom-viewer.css'),
			import('luna-console/luna-console.css'),
		]).then(
			([module]) => {
				if (disposed)
					return;
				logConsole = new module.default(container, {
					theme: props.colorMode,
					asyncRender: true,
					showHeader: false,
					maxNum: 1000,
				});
				unsubscribe = subscribeConsoleMessages(({ method, args }) => {
					logConsole?.[method](...args);
				});
			},
			(error: unknown) => {
				initializePromise = undefined;
				showToast('error', 'Failed to load the log console');
				console.error('Failed to load the log console', error);
			},
		);
		return initializePromise;
	};

	createEffect(() => {
		if (props.settings.open)
			void initializeConsole();
	});
	createEffect(() => {
		const colorMode = props.colorMode;
		logConsole?.setOption('theme', colorMode);
	});
	createEffect(() => {
		if (props.mode !== 'overlay' || !props.settings.open)
			return;
		const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
		const handleKeyDown = (event: KeyboardEvent): void => {
			if (event.key === 'Escape')
				props.onSettingsChange('open', false);
		};
		queueMicrotask(() => panel.focus());
		window.addEventListener('keydown', handleKeyDown);
		onCleanup(() => {
			window.removeEventListener('keydown', handleKeyDown);
			previousFocus?.focus();
		});
	});
	onCleanup(() => {
		disposed = true;
		unsubscribe?.();
		logConsole?.destroy();
		logConsole = undefined;
	});

	const clearLog = () => {
		clearConsoleMessages();
		logConsole?.clear(true);
	};
	const copyLog = () => {
		const text = getConsoleMessages().map(formatConsoleMessage).join('\n');
		if (!navigator.clipboard) {
			showToast('error', 'Clipboard is not available');
			console.error('Clipboard is not available');
			return;
		}
		void navigator.clipboard.writeText(text)
			.then(() => showToast('success', 'Log copied to clipboard'))
			.catch((error: unknown) => {
				showToast('error', 'Failed to copy log');
				console.error('Failed to copy log', error);
			});
	};
	const copyLogAndClose = (): void => {
		setDockAnchor(undefined);
		copyLog();
	};
	const clearLogAndClose = (): void => {
		setDockAnchor(undefined);
		clearLog();
	};
	const overlay = () => props.mode === 'overlay';
	const horizontalPanel = () => props.mode !== 'right';
	const maxPanelWidth = () => Math.max(
		MIN_PANEL_WIDTH,
		props.viewportWidth - MIN_APP_WIDTH,
	);
	const maxPanelHeight = () => Math.max(MIN_PANEL_HEIGHT, props.viewportHeight - MIN_CONTENT_HEIGHT);
	const maxOverlayHeight = () => Math.max(MIN_PANEL_HEIGHT, props.viewportHeight - APP_BAR_HEIGHT);
	const clampPanelWidth = (width: number) => Math.min(maxPanelWidth(), Math.max(MIN_PANEL_WIDTH, width));
	const clampPanelHeight = (height: number) => Math.min(maxPanelHeight(), Math.max(MIN_PANEL_HEIGHT, height));
	const clampOverlayHeight = (height: number) => Math.min(
		maxOverlayHeight(),
		Math.max(MIN_PANEL_HEIGHT, height),
	);
	const panelWidth = () => clampPanelWidth(props.settings.panelWidth ?? DEFAULT_PANEL_WIDTH);
	const panelHeight = () => clampPanelHeight(props.settings.panelHeight ?? DEFAULT_PANEL_HEIGHT);
	const overlayHeight = () => clampOverlayHeight(
		props.settings.overlayHeight ?? props.viewportHeight * 0.6,
	);
	const panelSize = () => {
		if (overlay())
			return overlayHeight();
		return horizontalPanel() ? panelHeight() : panelWidth();
	};
	const maxPanelSize = () => {
		if (overlay())
			return maxOverlayHeight();
		return horizontalPanel() ? maxPanelHeight() : maxPanelWidth();
	};
	const minPanelSize = () => horizontalPanel() ? MIN_PANEL_HEIGHT : MIN_PANEL_WIDTH;
	const renderedPanelHeight = () => {
		if (overlay())
			return overlayHeight();
		if (props.mode === 'right')
			return '100dvh';
		return panelHeight();
	};
	const resizePanel = (size: number): void => {
		if (overlay()) {
			props.onSettingsChange('overlayHeight', clampOverlayHeight(size));
		} else if (horizontalPanel()) {
			props.onSettingsChange('panelHeight', clampPanelHeight(size));
		} else {
			props.onSettingsChange('panelWidth', clampPanelWidth(size));
		}
	};
	const setDock = (dock: ConsoleDock) => {
		setDockAnchor(undefined);
		props.onSettingsChange('dock', dock);
	};

	return (
		<>
			<Backdrop
				open={overlay() && props.settings.open}
				onClick={() => props.onSettingsChange('open', false)}
				sx={{ zIndex: theme.zIndex.drawer - 1 }}
			/>

			<Box
				ref={panel}
				component="aside"
				aria-label="Application log"
				aria-modal={overlay() ? true : undefined}
				role={overlay() ? 'dialog' : undefined}
				tabIndex={overlay() ? -1 : undefined}
				sx={{
					width: props.mode === 'right' ? panelWidth() : '100%',
					height: renderedPanelHeight(),
					flexShrink: 0,
					position: overlay() ? 'fixed' : 'relative',
					gridArea: overlay() ? undefined : 'log',
					bottom: overlay() ? 0 : undefined,
					left: overlay() ? 0 : undefined,
					right: 0,
					zIndex: overlay() ? theme.zIndex.drawer : 1,
					display: props.settings.open ? 'flex' : 'none',
					flexDirection: 'column',
					borderLeft: props.mode === 'right' ? 1 : 0,
					borderTop: horizontalPanel() ? 1 : 0,
					borderColor: 'divider',
					bgcolor: 'background.paper',
				}}
			>
				<ResizeHandle
					edge={horizontalPanel() ? 'top' : 'left'}
					label="Resize log panel"
					min={minPanelSize()}
					max={maxPanelSize()}
					value={panelSize()}
					onChange={resizePanel}
				/>
				<Show when={props.mode === 'right'}>
					<Toolbar variant="dense" />
				</Show>
				<Toolbar
					variant="dense"
					disableGutters
					sx={{
						px: 0.5,
						minHeight: 32,
						flexShrink: 0,
						display: 'grid',
						gridTemplateColumns: 'auto minmax(0, 1fr) auto',
						borderBottom: 1,
						borderColor: 'divider',
					}}
				>
					<Box sx={{ display: 'flex' }}>
						<IconButton
							size="small"
							title="Clear log"
							aria-label="Clear log"
							onClick={clearLog}
							sx={{ p: 0.5 }}
						>
							<BlockIcon fontSize="small" />
						</IconButton>
					</Box>
					<Typography
						variant="subtitle2"
						noWrap
						align="center"
						sx={{ px: 0.5 }}
					>
						Debug console
					</Typography>
					<IconButton
						size="small"
						title="Dock options"
						aria-label="Dock options"
						onClick={(event) => setDockAnchor(event.currentTarget)}
						sx={{ p: 0.5 }}
					>
						<MoreVertIcon fontSize="small" />
					</IconButton>
					<Menu
						anchorEl={dockAnchor()}
						open={dockAnchor() !== undefined}
						onClose={() => setDockAnchor(undefined)}
					>
						<MenuItem
							selected={props.mode === 'right'}
							onClick={() => setDock('right')}
						>
							<ListItemIcon sx={{ minWidth: 32 }}>
								<DockRightIcon fontSize="small" />
							</ListItemIcon>
							Dock right
						</MenuItem>
						<MenuItem
							selected={props.mode === 'bottom'}
							onClick={() => setDock('bottom')}
						>
							<ListItemIcon sx={{ minWidth: 32 }}>
								<DockBottomIcon fontSize="small" />
							</ListItemIcon>
							Dock bottom
						</MenuItem>
						<MenuItem
							selected={props.mode === 'overlay'}
							onClick={() => setDock('overlay')}
						>
							<ListItemIcon sx={{ minWidth: 32 }}>
								<LayersIcon fontSize="small" />
							</ListItemIcon>
							Overlay
						</MenuItem>
						<Divider />
						<MenuItem onClick={copyLogAndClose}>
							<ListItemIcon sx={{ minWidth: 32 }}>
								<ContentCopyIcon fontSize="small" />
							</ListItemIcon>
							Copy log
						</MenuItem>
						<MenuItem onClick={clearLogAndClose}>
							<ListItemIcon sx={{ minWidth: 32 }}>
								<BlockIcon fontSize="small" />
							</ListItemIcon>
							Clear log
						</MenuItem>
					</Menu>
				</Toolbar>
				<Box
					sx={{
						flex: '1 1 0',
						minHeight: 0,
						overflow: 'hidden',
						'& .luna-console-log-item .luna-console-icon-container .luna-console-icon-error': {
							top: '-1px',
						},
						'& .luna-console-log-item > .luna-console-count-container': {
							alignSelf: 'flex-start',
						},
						'& .luna-console-log-item > .luna-console-count-container > .luna-console-count': {
							boxSizing: 'border-box',
							display: 'inline-flex',
							alignItems: 'center',
							justifyContent: 'center',
							minWidth: '1.5em',
							height: '1.5em',
							padding: '0 0.333333em',
							lineHeight: 1,
							borderRadius: '100%',
						},
						'& .luna-console-logs': {
							scrollbarWidth: 'thin',
							scrollbarColor: `${theme.palette.action.disabled} transparent`,
						},
						'& .luna-console-logs::-webkit-scrollbar': {
							width: 6,
							height: 6,
						},
						'& .luna-console-logs::-webkit-scrollbar-track': {
							background: 'transparent',
						},
						'& .luna-console-logs::-webkit-scrollbar-thumb': {
							bgcolor: 'action.disabled',
							borderRadius: 3,
						},
						'& .luna-console-logs::-webkit-scrollbar-thumb:hover': {
							bgcolor: 'action.active',
						},
					}}
				>
					<div
						lang="en"
						style={{
							all: 'initial',
							display: 'block',
							height: '100%',
						}}
					>
						<div
							ref={container}
							style={{ height: '100%' }}
						/>
					</div>
				</Box>
			</Box>
		</>
	);
};
