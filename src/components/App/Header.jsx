import { Match, Show, Switch, createSignal } from "solid-js";

import AppBar from '@suid/material/AppBar';
import Toolbar from '@suid/material/Toolbar';
import IconButton from '@suid/material/IconButton';
import Typography from '@suid/material/Typography';

import MenuIcon from '@suid/icons-material/Menu';
import LightModeIcon from '@suid/icons-material/LightMode';
import BedtimeIcon from '@suid/icons-material/Bedtime';
import BrightnessMediumIcon from '@suid/icons-material/BrightnessMedium';

import { useTheme } from '@suid/material/styles';
import useMediaQuery from '@suid/material/useMediaQuery';

function AppHeader(props) {
	let theme = useTheme();
	let isWideScreen = useMediaQuery(theme.breakpoints.up('md'));
	let [clicks, setClicks] = createSignal(0);

	let changeTheme = (e) => {
		if (clicks() < 2) {
			if (props.effectiveTheme == 'dark') {
				props.onThemeChanged('light');
			} else if (props.effectiveTheme == 'light') {
				props.onThemeChanged('dark');
			}
			setClicks(clicks() + 1);
		} else {
			props.onThemeChanged('system');
			setClicks(0);
		}
	};

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

				<IconButton size="large" edge="end" color="inherit" onClick={changeTheme}>
					<Switch>
						<Match when={props.preferredTheme == 'light'}>
							<LightModeIcon />
						</Match>
						<Match when={props.preferredTheme == 'dark'}>
							<BedtimeIcon />
						</Match>
						<Match when={props.preferredTheme == 'system'}>
							<BrightnessMediumIcon />
						</Match>
					</Switch>
				</IconButton>
			</Toolbar>
		</AppBar>
	);
}

export default AppHeader;
