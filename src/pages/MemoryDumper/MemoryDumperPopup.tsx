import { Component, Match, Show, Switch } from "solid-js";
import {
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
	LinearProgress,
	Stack
} from "@suid/material";
import { sprintf } from "sprintf-js";
import { formatDuration, formatSize } from "@/utils";
import CheckCircleOutlineIcon from "@suid/icons-material/CheckCircleOutline";
import { MemoryDumperProgress, MemoryDumperResult, MemoryDumperState } from "@/pages/MemoryDumper/MemoryDumperPage";

interface MemoryDumperPopupProps {
	memoryAddr: number;
	memorySize: number;
	progress?: MemoryDumperProgress;
	readResult?: MemoryDumperResult;
	state: MemoryDumperState;
	onClose: () => void;
	onCancel: () => void;
	onFileSave: () => void;
}

export const MemoryDumperPopup: Component<MemoryDumperPopupProps> = (props) => {
	return (
		<Dialog
			open={props.state === 'download' || props.state === 'save'}
			onClose={() => {}}
			maxWidth="sm"
			fullWidth={true}
		>
			<DialogTitle>
				{sprintf("%08X", props.memoryAddr)} … {sprintf("%08X", props.memoryAddr + props.memorySize - 1)}
			</DialogTitle>

			<DialogContent>
				<Show when={props.state === 'download' && props.progress}>
					<Box sx={{ justifyContent: 'space-between', display: 'flex' }}>
						<Box sx={{ color: 'text.secondary' }}>
							{props.progress?.cursor} / {props.progress?.total}, {props.progress?.speed}
						</Box>
						<Box sx={{ color: 'text.secondary' }}>
							{formatDuration(props.progress?.remaining || 0)}
						</Box>
					</Box>
					<LinearProgress variant="determinate" value={props.progress?.percent || 0} />
				</Show>

				<Show when={props.state === 'save' && props.readResult}>
					<DialogContentText>
						<Switch>
							<Match when={props.readResult?.error}>
								<Box sx={{ color: 'error.main' }}>
									{props.readResult?.error}<br />
									Due to an error, only {' '}
									<b>{formatSize(props.readResult?.buffer?.length ?? 0)}</b> {' '}
									from <b>{formatSize(props.memorySize)}</b> {' '}
									was successfully read.<br />
									You can save this partial read result as a file.
								</Box>
							</Match>
							<Match when={props.readResult?.canceled}>
								<Box sx={{ color: 'error.main' }}>
									Due to an interruption, only {' '}
									<b>{formatSize(props.readResult?.buffer?.length ?? 0)}</b> {' '}
									from <b>{formatSize(props.memorySize)}</b> {' '}
									was successfully read.<br />
									You can save this partial read result as a file.
								</Box>
							</Match>
							<Match when={props.readResult?.buffer}>
								<Stack alignItems="center" direction="row" gap={1} sx={{ color: 'success.main' }}>
									<CheckCircleOutlineIcon />
									<span>
										Memory was successfully read in {' '}
										<b>{formatDuration(props.progress?.elapsed || 0)}</b> at a speed of {props.progress?.speed}.
									</span>
								</Stack>
							</Match>
						</Switch>
					</DialogContentText>
				</Show>
			</DialogContent>
			<DialogActions>
				<Show when={props.state === 'save'}>
					<Button color="success" onClick={props.onFileSave}>
						Save as file
					</Button>
					<Button color="error" onClick={props.onClose}>
						Cancel
					</Button>
				</Show>
				<Show when={props.state === 'download'}>
					<Button color="error" onClick={props.onCancel}>
						Cancel
					</Button>
				</Show>
			</DialogActions>
		</Dialog>
	);
}
