import { ParentComponent, Show } from "solid-js";
import { Box, CircularProgress, Stack } from "@suid/material";

interface ButtonLoadingTextProps {
	loading: boolean;
}

export const ButtonLoadingText: ParentComponent<ButtonLoadingTextProps> = (props) => {
	return (
		<Box>
			<Box sx={{ visibility: props.loading ? "hidden" : "visible" }}>
				{props.children}
			</Box>
			<Show when={props.loading}>
				<Stack sx={{ position: 'absolute', inset: 0 }} justifyContent="center" alignItems="center">
					<CircularProgress color="inherit" size="1em" />
				</Stack>
			</Show>
		</Box>
	);
};
