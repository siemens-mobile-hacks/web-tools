import "./PopperWithArrow.scss";
import { Box, Popper } from "@suid/material";
import { ParentComponent, splitProps } from "solid-js";
import { PopperTypeMap } from "@suid/material/Popper/PopperProps";
import { useTheme } from "@suid/material/styles";

type PopperBaseType = PopperTypeMap<{}, "div">;
type PopperWithArrowProps = PopperBaseType["props"] & {
	arrowColor?: string;
};

export const PopperWithArrow: ParentComponent<PopperWithArrowProps> = (props) => {
	const theme = useTheme();
	const [local, others] = splitProps(props, ["arrowColor"]);

	return (
		<Popper
			{...others}
			style={{ "z-index": 1 }}
			disablePortal={false}
			modifiers={[
				{
					name: 'preventOverflow',
					enabled: true,
					options: {
						padding: 8,
						boundary: document.querySelector("main")
					},
				},
				{
					name: 'offset',
					options: {
						offset: [0, 10],
					},
				},
				{
					name: 'arrow',
					enabled: true,
				},
			]}
		>
			{props.children}
			<Box
				data-popper-arrow="true"
				component="span"
				class="popper-arrow"
				style={{ '--popper-arrow-color': local.arrowColor ?? theme.palette.background.paper }}
			/>
		</Popper>
	);
};
