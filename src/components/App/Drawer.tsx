import { Component, createMemo, ParentComponent } from "solid-js";
import { A, useMatch } from "@solidjs/router";
import {
	Box,
	Drawer,
	List,
	ListItem,
	ListItemButton,
	ListItemIcon,
	ListItemText,
	Toolbar,
	useMediaQuery
} from '@suid/material';
import ScreenshotIcon from '@suid/icons-material/Screenshot';
import SdCardIcon from '@suid/icons-material/SdCard';
import { useTheme } from '@suid/material/styles';
import { resolveURL } from '@/utils.js';
import { Mail } from "@suid/icons-material";

const DRAWER_WIDTH = 240;

export interface AppDrawerLinkProps {
	href: string;
}

export const AppDrawerLink: ParentComponent<AppDrawerLinkProps> = (props) => {
	const match = useMatch(() => resolveURL(props.href));
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

export const AppDrawer: Component<AppDrawerProps> = (props) => {
	const theme = useTheme();
	const isWideScreen = useMediaQuery(theme.breakpoints.up('md'));
	const drawerVariant = createMemo(() => isWideScreen() ? 'permanent' : 'temporary');

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
					<ListItem disablePadding>
						<AppDrawerLink href="/screenshot">
							<ListItemIcon>
								<ScreenshotIcon />
							</ListItemIcon>
							<ListItemText primary="Screenshot" />
						</AppDrawerLink>
					</ListItem>
					<ListItem disablePadding>
						<AppDrawerLink href="/dumper">
							<ListItemIcon>
								<SdCardIcon />
							</ListItemIcon>
							<ListItemText primary="RAM dumper" />
						</AppDrawerLink>
					</ListItem>
					<ListItem disablePadding>
						<AppDrawerLink href="/sms-reader">
							<ListItemIcon>
								<Mail />
							</ListItemIcon>
							<ListItemText primary="SMS Reader" />
						</AppDrawerLink>
					</ListItem>
				</List>
			</Box>
		</Drawer>
	);
};
