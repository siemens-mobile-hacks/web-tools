import { A } from "@solidjs/router";

import AppBar from '@suid/material/AppBar';
import Toolbar from '@suid/material/Toolbar';
import IconButton from '@suid/material/IconButton';
import Typography from '@suid/material/Typography';

import MenuIcon from '@suid/icons-material/Menu';

import { useTheme } from '@suid/material/styles';
import useMediaQuery from '@suid/material/useMediaQuery';

function AppHeader(props) {
	let theme = useTheme();
	let isWideScreen = useMediaQuery(theme.breakpoints.up('md'));

	return (
		<AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
			<Toolbar>
				<Show when={!isWideScreen()}>
					<IconButton
						color="inherit"
						aria-label="Open drawer"
						onClick={props.onDrawerOpen}
						edge="start"
					>
						<MenuIcon />
					</IconButton>
				</Show>

				<Typography variant="h6" color="inherit" sx={{ flexGrow: 1 }}>
					Siemens Web Tools
				</Typography>
			</Toolbar>
		</AppBar>
	);
}

export default AppHeader;
