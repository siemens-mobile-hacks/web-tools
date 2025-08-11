import { createSignal, JSX, ParentComponent } from "solid-js";
import {
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
	useMediaQuery
} from "@suid/material";
import InfoOutlinedIcon from "@suid/icons-material/InfoOutlined";
import { useTheme } from "@suid/material/styles";

interface TipsAndTricksProps {
	linkTitle?: JSX.Element;
	linkIcon?: JSX.Element;
	dialogTitle?: JSX.Element;
}

export const TipsAndTricks: ParentComponent<TipsAndTricksProps> = (props) => {
	const [showDialog, setShowDialog] = createSignal(false);

	const theme = useTheme();
	const fullScreen = useMediaQuery(theme.breakpoints.down('md'));

	const handleOpen = () => {
		setShowDialog(true);
	};

	const handleClose = () => {
		setShowDialog(false);
	};

	return (
		<>
			<Button startIcon={props.linkIcon ?? <InfoOutlinedIcon />} onClick={handleOpen}>
				{props.linkTitle ?? "Tips & Tricks"}
			</Button>

			<Dialog open={showDialog()} onClose={handleClose} fullScreen={fullScreen()}>
				<DialogTitle>
					{props.dialogTitle}
				</DialogTitle>
				<DialogContent sx={{ padding: '20px 10px' }}>
					<DialogContentText>
						{props.children}
					</DialogContentText>
				</DialogContent>
				<DialogActions>
					<Button onClick={handleClose}>Close</Button>
				</DialogActions>
			</Dialog>
		</>
	);
};
