import { type Component, Show } from 'solid-js';
import { Alert, Button, IconButton, Paper, Stack, Typography } from '@suid/material';
import DownloadIcon from '@suid/icons-material/Download';
import InfoOutlinedIcon from '@suid/icons-material/InfoOutlined';
import { downloadBlob, formatSize } from '@/utils';
import type { FirmwareOutput } from '@/workers/services/FirmwareService';

interface FirmwareOutputCardProps {
	output: FirmwareOutput;
	onInfo: () => void;
}

export const FirmwareOutputCard: Component<FirmwareOutputCardProps> = (props) => {
	const hasDetails = () =>
		props.output.hashArea !== undefined ||
		props.output.info.some(([key]) => key !== 'type');

	return (
		<Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 1.5, p: 2 }}>
			<Stack direction="row" alignItems="center" gap={1}>
				<Typography variant="body1" sx={{ flex: 1, overflowWrap: 'anywhere' }}>
					{props.output.name}
				</Typography>
				<Show when={hasDetails()}>
					<IconButton onClick={props.onInfo} title="Information" aria-label={`Information for ${props.output.name}`}>
						<InfoOutlinedIcon />
					</IconButton>
				</Show>
			</Stack>
			<Show when={props.output.error}>
				<Alert severity={props.output.blob ? 'warning' : 'error'}>
					{props.output.error}
				</Alert>
			</Show>
			<Show when={props.output.blob}>{(blob) =>
				<Button
					sx={{ mt: 'auto', alignSelf: 'flex-start' }}
					variant="outlined"
					startIcon={<DownloadIcon />}
					onClick={() => downloadBlob(blob(), props.output.name)}
					aria-label={`Download ${props.output.name} (${formatSize(blob().size)})`}
				>
					Download · {formatSize(blob().size)}
				</Button>
			}</Show>
		</Paper>
	);
};
