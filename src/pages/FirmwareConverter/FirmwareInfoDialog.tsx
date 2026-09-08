import { type Component, createSignal, createUniqueId, For, Show } from 'solid-js';
import {
	Box, Dialog, DialogContent, DialogTitle, IconButton, Stack,
	Table, TableBody, TableCell, TableHead, TableRow, Typography, useMediaQuery,
} from '@suid/material';
import CloseIcon from '@suid/icons-material/Close';
import { useTheme } from '@suid/material/styles';
import { FirmwareTabs } from './FirmwareTabs';
import { FirmwareBlocksTable } from './FirmwareBlocksTable';
import type { FirmwareOutput } from '@/workers/services/FirmwareService';

const infoTableSx = {
	width: 'auto',
	maxWidth: '100%',
	'& thead': {
		backgroundColor: 'tableHeader',
	},
	'& th, & td': {
		border: 1,
		borderColor: 'divider',
		overflowWrap: 'anywhere',
	},
};

interface FirmwareInfoDialogProps {
	open: boolean;
	output: FirmwareOutput;
	onClose: () => void;
}

export const FirmwareInfoDialog: Component<FirmwareInfoDialogProps> = (props) => {
	const id = createUniqueId();
	const [tab, setTab] = createSignal<'info' | 'blocks'>('info');
	const theme = useTheme();
	const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

	return (
		<Dialog
			open={props.open}
			onClose={props.onClose}
			maxWidth="md"
			fullWidth
			fullScreen={fullScreen()}
			aria-labelledby={`${id}-title`}
		>
			<Stack direction="row" alignItems="center" pr={2}>
				<DialogTitle id={`${id}-title`} sx={{ flex: 1, overflowWrap: 'anywhere' }}>
					{props.output.name}
				</DialogTitle>
				<IconButton onClick={props.onClose} aria-label="Close" title="Close">
					<CloseIcon />
				</IconButton>
			</Stack>
			<Box mx={3}>
				<FirmwareTabs
					id={id}
					label="Firmware details"
					value={tab()}
					onChange={setTab}
					tabs={[
						{ value: 'info', label: 'INFO' },
						{ value: 'blocks', label: 'BLOCKS' },
					]}
				/>
			</Box>
			<DialogContent>
				<Box
					role="tabpanel"
					id={`${id}-panel-info`}
					aria-labelledby={`${id}-tab-info`}
					hidden={tab() !== 'info'}
				>
					<Table
						size="small"
						aria-label="Firmware information"
						sx={infoTableSx}
					>
						<TableHead>
							<TableRow>
								<TableCell>Field</TableCell>
								<TableCell>Value</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							<For each={props.output.info}>{([key, value]) =>
								<TableRow>
									<TableCell
										component="th"
										scope="row"
										variant="head"
										sx={{ verticalAlign: 'top' }}
									>
										{key}
									</TableCell>
									<TableCell>{value}</TableCell>
								</TableRow>
							}</For>
						</TableBody>
					</Table>
					<Show when={props.output.hashArea}>{(hashArea) =>
						<Box mt={2}>
							<Typography variant="subtitle2" gutterBottom>
								HASH AREA
							</Typography>
							<Typography
								component="pre"
								variant="body2"
								sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'monospace' }}
							>
								{hashArea()}
							</Typography>
						</Box>
					}</Show>
				</Box>
				<Box
					role="tabpanel"
					id={`${id}-panel-blocks`}
					aria-labelledby={`${id}-tab-blocks`}
					hidden={tab() !== 'blocks'}
				>
					<Show
						when={tab() === 'blocks' && props.output.blocks.length}
						fallback={
							<Typography color="text.secondary">
								No flash block map is available for this file.
							</Typography>
						}
					>
						<FirmwareBlocksTable blocks={props.output.blocks} />
					</Show>
				</Box>
			</DialogContent>
		</Dialog>
	);
};
