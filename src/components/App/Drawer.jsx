import { createMemo, createEffect } from "solid-js";
import { A, useMatch } from "@solidjs/router";

import Box from '@suid/material/Box';
import Drawer from '@suid/material/Drawer';
import Toolbar from '@suid/material/Toolbar';
import IconButton from '@suid/material/IconButton';
import Typography from '@suid/material/Typography';

import List from '@suid/material/List';
import ListItem from '@suid/material/ListItem';
import ListItemButton from '@suid/material/ListItemButton';
import ListItemText from '@suid/material/ListItemText';
import ListItemIcon from '@suid/material/ListItemIcon';

import ScreenshotIcon from '@suid/icons-material/Screenshot';
import CameraAltIcon from '@suid/icons-material/CameraAlt';
import DataObjectIcon from '@suid/icons-material/DataObject';
import MenuIcon from '@suid/icons-material/Menu';

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
				</List>
			</Box>
		</Drawer>
	);
}

export default AppDrawer;
