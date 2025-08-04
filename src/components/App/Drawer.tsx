import { Component, createMemo, createSignal, For, JSX, ParentComponent, Show } from "solid-js";
import { A, useLocation, useMatch } from "@solidjs/router";
import { Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, useMediaQuery } from '@suid/material';
import ScreenshotIcon from '@suid/icons-material/Screenshot';
import SdCardIcon from '@suid/icons-material/SdCard';
import PhonelinkSetupIcon from '@suid/icons-material/PhonelinkSetup';
// import PhonelinkLockIcon from '@suid/icons-material/PhonelinkLock';
import MailIcon from '@suid/icons-material/Mail';
import ExpandMoreIcon from '@suid/icons-material/ExpandMore';
import ExpandLessIcon from '@suid/icons-material/ExpandLess';
import { useTheme } from '@suid/material/styles';
import { resolveURL } from '@/utils.js';
import { Collapse } from '@/components/UI/Collapse';

export const DRAWER_WIDTH = 240;

export interface AppDrawerLinkProps {
	href: string;
}

export const AppDrawerLink: ParentComponent<AppDrawerLinkProps> = (props) => {
	const match = useMatch(() => props.href);
	return (
		<ListItemButton component={A} href={props.href} selected={Boolean(match())}>
			{props.children}
		</ListItemButton>
	);
};

export interface AppDrawerProps {
	open: boolean;
	onClose: () => void;
}

type DrawerLinkProps = {
	icon: JSX.Element;
	title: JSX.Element;
	url?: string;
	depth?: number;
	sublinks?: DrawerLinkProps[];
};

export const DrawerLink: Component<DrawerLinkProps> = (props) => {
	const location = useLocation();
	const isSelected = () => props.url != null && resolveURL(props.url) === location.pathname;
	const isNestedSelected = () => {
		if (props.sublinks) {
			for (const sublink of props.sublinks) {
				if (sublink.url && resolveURL(sublink.url) === location.pathname)
					return true;
			}
		}
		return false;
	};
	const [isOpen, setIsOpen] = createSignal(isNestedSelected());
	const depth = () => props.depth ?? 1;

	return (
		<Show when={props.sublinks && props.sublinks.length > 0} fallback={
			<ListItemButton component={A} href={props.url ?? ""} selected={isSelected()} sx={{ pl: depth() * 2 }}>
				<ListItemIcon>
					{props.icon}
				</ListItemIcon>
				<ListItemText primary={props.title} />
			</ListItemButton>
		}>
			<ListItemButton onClick={() => setIsOpen((prev) => !prev)} sx={{ pl: depth() * 2 }}>
				<ListItemIcon>
					{props.icon}
				</ListItemIcon>
				<ListItemText primary={props.title} />
				<Show when={props.sublinks && props.sublinks.length > 0}>
					{isOpen() ? <ExpandLessIcon /> : <ExpandMoreIcon />}
				</Show>
			</ListItemButton>
			<Collapse open={isOpen()}>
				<List component="div" disablePadding>
					<For each={props.sublinks}>{(sublink) =>
						<DrawerLink {...sublink} depth={depth() + 1} />
					}</For>
				</List>
			</Collapse>
		</Show>
	);
};

export const AppDrawer: Component<AppDrawerProps> = (props) => {
	const theme = useTheme();
	const isWideScreen = useMediaQuery(theme.breakpoints.up('md'));
	const drawerVariant = createMemo(() => isWideScreen() ? 'permanent' : 'temporary');

	const links: DrawerLinkProps[] = [
		{
			icon: <ScreenshotIcon />,
			title: "Screenshotter",
			url: "/screenshot",
		},
		{
			icon: <SdCardIcon />,
			title: "RAM dumper",
			url: "/dumper",
		},
		{
			icon: <MailIcon />,
			title: "SMS Reader",
			url: "/sms-reader",
		},
		{
			icon: <PhonelinkSetupIcon />,
			title: "APOXI Tools",
			sublinks: [
				/*
				{
					icon: <PhonelinkLockIcon />,
					title: "Unlock boot",
					url: "/apoxi/unlock-boot",
				},
				 */
				{
					icon: <SdCardIcon />,
					title: "Memory dumper",
					url: "/dumper/dwd",
				}
			]
		}
	];

	return (
		<Drawer
			open={props.open || isWideScreen()}
			onClose={props.onClose}
			variant={drawerVariant()}
			sx={{ width: DRAWER_WIDTH, flexShrink: 0, [`& .MuiDrawer-paper`]: { width: DRAWER_WIDTH, boxSizing: 'border-box' } }}
		>
			<Toolbar />
			<Box sx={{ overflow: 'auto' }}>
				<List>
					<For each={links}>{(link) => <DrawerLink {...link} />}</For>
				</List>
			</Box>
		</Drawer>
	);
};
