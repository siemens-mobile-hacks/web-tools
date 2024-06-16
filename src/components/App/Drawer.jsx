import { createMemo, createEffect } from "solid-js";
import { A, useMatch } from "@solidjs/router";

import Box from '@suid/material/Box';
import Drawer from '@suid/material/Drawer';
import Toolbar from '@suid/material/Toolbar';

import List from '@suid/material/List';
import ListItem from '@suid/material/ListItem';
import ListItemButton from '@suid/material/ListItemButton';
import ListItemText from '@suid/material/ListItemText';
import ListItemIcon from '@suid/material/ListItemIcon';

import ScreenshotIcon from '@suid/icons-material/Screenshot';
import SdCardIcon from '@suid/icons-material/SdCard';

import { useTheme } from '@suid/material/styles';
import useMediaQuery from '@suid/material/useMediaQuery';

import { resolveURL } from '~/utils';

const DRAWER_WIDTH = 240;

function AppDrawerLink(props) {
	let match = useMatch(() => resolveURL(props.href));
	return (
		<ListItemButton component={A} {...props} selected={Boolean(match())}>
			{props.children}
		</ListItemButton>
	);
}

function AppDrawer(props) {
	let theme = useTheme();
	let isWideScreen = useMediaQuery(theme.breakpoints.up('md'));
	let drawerVariant = createMemo(() => isWideScreen() ? 'permanent' : 'temporary');

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
				</List>
			</Box>
		</Drawer>
	);
}

export default AppDrawer;
