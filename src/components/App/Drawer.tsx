import { Component, createMemo, For, Match, Show, Switch } from "solid-js";
import { Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, useMediaQuery } from '@suid/material';
import ScreenshotIcon from '@suid/icons-material/Screenshot';
import SdCardIcon from '@suid/icons-material/SdCard';
import MailIcon from '@suid/icons-material/Mail';
import MemoryIcon from "@suid/icons-material/Memory";
import PhonelinkLockIcon from '@suid/icons-material/PhonelinkLock';
import FolderOpenIcon from '@suid/icons-material/FolderOpen';
import VideocamIcon from '@suid/icons-material/Videocam';
import SyncAltIcon from '@suid/icons-material/SyncAlt';
import LightModeIcon from '@suid/icons-material/LightMode';
import BedtimeIcon from '@suid/icons-material/Bedtime';
import BrightnessMediumIcon from '@suid/icons-material/BrightnessMedium';
import ApoxiIcon from '@/assets/apoxi.svg';
import SgoldIcon from '@/assets/sgold.svg';
import EgoldIcon from '@/assets/egold.svg';
import { useTheme } from '@suid/material/styles';
import { DrawerLink, type DrawerLinkItem } from '@/components/App/DrawerLink';
import { ResizeHandle } from '@/components/App/ResizeHandle';

export interface AppDrawerProps {
	open: boolean;
	preferredTheme: 'light' | 'dark' | 'system';
	width: number;
	onClose: () => void;
	onThemeToggle: () => void;
	onWidthChange: (width: number) => void;
}

export const DEFAULT_DRAWER_WIDTH = 240;
export const MIN_DRAWER_WIDTH = 160;
export const MAX_DRAWER_WIDTH = 480;

export const AppDrawer: Component<AppDrawerProps> = (props) => {
	const theme = useTheme();
	const isWideScreen = useMediaQuery(theme.breakpoints.up('md'));
	const drawerVariant = createMemo(() => isWideScreen() ? 'permanent' : 'temporary');

	const links: DrawerLinkItem[] = [
		{
			icon: <SgoldIcon width="1.5em" height="1.5em" />,
			title: "SGOLD Tools",
			sublinks: [
				{
					icon: <ScreenshotIcon />,
					title: "Screenshotter",
					url: "/screenshot",
				},
				{
					icon: <SdCardIcon />,
					title: "Memory Dumper",
					url: "/dumper",
				},
			]
		},
		{
			icon: <EgoldIcon width="1.5em" height="1.5em" />,
			title: "EGOLD Tools",
			sublinks: [
				{
					icon: <ScreenshotIcon />,
					title: "Screenshotter",
					url: "/screenshot/bfb",
				},
				{
					icon: <SdCardIcon />,
					title: "Memory Dumper",
					url: "/dumper/bfb",
				},
			]
		},
		{
			icon: <ApoxiIcon width="1.5em" height="1.5em" />,
			title: "APOXI Tools",
			sublinks: [
				{
					icon: <PhonelinkLockIcon />,
					title: "Unlock Boot",
					url: "/apoxi/unlock-boot",
				},
				{
					icon: <SdCardIcon />,
					title: "Memory Dumper",
					url: "/dumper/dwd",
				}
			]
		},
		{
			icon: <MemoryIcon />,
			title: "Flasher/Patcher",
			url: "/flasher",
		},
		{
			icon: <SyncAltIcon />,
			title: "Firmware Converter",
			url: "/firmware-converter",
		},
		{
			icon: <MailIcon />,
			title: "SMS Reader",
			url: "/sms-reader",
		},
		{
			icon: <VideocamIcon />,
			title: "Video Converter",
			url: "/video-converter",
		},
		{
			icon: <FolderOpenIcon />,
			title: "File Explorer",
			url: "/file-explorer",
		},
	];

	return (
		<Drawer
			open={props.open || isWideScreen()}
			onClose={props.onClose}
			variant={drawerVariant()}
			sx={{
				gridArea: isWideScreen() ? 'drawer' : undefined,
				width: isWideScreen() ? props.width : DEFAULT_DRAWER_WIDTH,
				minWidth: isWideScreen() ? props.width : undefined,
				maxWidth: '100vw',
				height: isWideScreen() ? '100%' : undefined,
				flexShrink: 0,
				[`& .MuiDrawer-paper`]: {
					position: isWideScreen() ? 'relative' : undefined,
					width: isWideScreen() ? props.width : DEFAULT_DRAWER_WIDTH,
					maxWidth: '100vw',
					height: isWideScreen() ? '100%' : undefined,
					boxSizing: 'border-box',
					overflow: 'visible',
				},
			}}
		>
			<Toolbar variant="dense" />
			<Box sx={{ flex: '1 1 0', minHeight: 0, overflow: 'auto' }}>
				<List>
					<For each={links}>{(link) => <DrawerLink item={link} />}</For>
				</List>
			</Box>
			<Show when={!isWideScreen()}>
				<List
					disablePadding
					sx={{ mt: 'auto', borderTop: 1, borderColor: 'divider' }}
				>
					<ListItemButton dense onClick={props.onThemeToggle}>
						<ListItemIcon sx={{ minWidth: '2.5em' }}>
							<Switch>
								<Match when={props.preferredTheme === 'light'}>
									<LightModeIcon />
								</Match>
								<Match when={props.preferredTheme === 'dark'}>
									<BedtimeIcon />
								</Match>
								<Match when={props.preferredTheme === 'system'}>
									<BrightnessMediumIcon />
								</Match>
							</Switch>
						</ListItemIcon>
						<ListItemText
							primary={`Theme: ${props.preferredTheme}`}
							sx={{ textTransform: 'capitalize' }}
						/>
					</ListItemButton>
				</List>
			</Show>
			<Show when={isWideScreen()}>
				<ResizeHandle
					edge="right"
					label="Resize navigation sidebar"
					min={MIN_DRAWER_WIDTH}
					max={MAX_DRAWER_WIDTH}
					value={props.width}
					onChange={props.onWidthChange}
				/>
			</Show>
		</Drawer>
	);
};
