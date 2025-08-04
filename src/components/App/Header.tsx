import "./Header.scss";
import { Component, createSignal, Match, Show, Switch } from "solid-js";
import { AppBar, IconButton, Stack, Toolbar, Typography, useMediaQuery } from '@suid/material';
import MenuIcon from '@suid/icons-material/Menu';
import LightModeIcon from '@suid/icons-material/LightMode';
import BedtimeIcon from '@suid/icons-material/Bedtime';
import BrightnessMediumIcon from '@suid/icons-material/BrightnessMedium';
import { useTheme } from '@suid/material/styles';
import { useApp } from "@/providers/AppProvider";

type ThemeMode = 'light' | 'dark' | 'system';

export interface AppHeaderProps {
	effectiveTheme: ThemeMode;
	preferredTheme: ThemeMode;
	onThemeChanged: (theme: ThemeMode) => void;
	onDrawerOpen: () => void;
}

export const AppHeader: Component<AppHeaderProps> = (props) => {
	const theme = useTheme();
	const isWideScreen = useMediaQuery(theme.breakpoints.up('md'));
	const [clicks, setClicks] = createSignal<number>(0);
	const app = useApp();

	const changeTheme = () => {
		if (clicks() < 2) {
			if (props.effectiveTheme === 'dark') {
				props.onThemeChanged('light');
			} else if (props.effectiveTheme === 'light') {
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

				<Show when={isWideScreen()}>
					<Stack sx={{ flexGrow: 1 }} direction="row" alignItems="center" gap={6}>
						<Typography variant="h6" color="inherit">
							Siemens Web Tools
						</Typography>

						<Show when={app.status()}>
							<Typography color="inherit">
								<div class="header-status-indicator"></div>
								{app.status()}
							</Typography>
						</Show>
					</Stack>
				</Show>

				<Show when={!isWideScreen()}>
					<Stack sx={{ flexGrow: 1 }} direction="row" justifyContent="center" alignItems="center">
						<Stack direction="column">
							<Typography variant="h6" color="inherit">
								{app.title()}
							</Typography>

							<Show when={app.status()}>
								<Typography variant="caption" color="inherit" align="center">
									<div class="header-status-indicator"></div>
									{app.status()}
								</Typography>
							</Show>
						</Stack>
					</Stack>
				</Show>

				<IconButton size="large" edge="end" color="inherit" onClick={changeTheme}>
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
				</IconButton>
			</Toolbar>
		</AppBar>
	);
}
