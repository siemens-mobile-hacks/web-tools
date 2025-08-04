import "./PopperArrow.scss";
import { Component } from "solid-js";
import { Box } from "@suid/material";
import { useTheme } from "@suid/material/styles";

interface PopperArrowProps {
	color?: string;
}

export const PopperArrow: Component<PopperArrowProps> = (props) => {
	const theme = useTheme();
	return (
		<Box
			data-popper-arrow="true"
			component="span"
			class="popper-arrow"
			style={{ '--popper-arrow-color': props.color ?? theme.palette.background.paper }}
		/>
	);
};
