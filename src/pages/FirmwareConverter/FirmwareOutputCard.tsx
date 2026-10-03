import { type Component, createSignal, createUniqueId, For, Show } from 'solid-js';
import {
	Alert, Button, FormControl, IconButton, InputLabel, MenuItem, Paper, Select, Stack, Typography,
} from '@suid/material';
import DownloadIcon from '@suid/icons-material/Download';
import InfoOutlinedIcon from '@suid/icons-material/InfoOutlined';
import { downloadBlob, formatSize } from '@/utils';
import type { FirmwareOutput } from '@/workers/services/FirmwareService';

interface FirmwareOutputCardProps {
	output: FirmwareOutput;
	disabled: boolean;
	onInfo: () => void;
	// Makes and saves a deferred output, for the phone model chosen
	onSave: (model?: string) => void;
}

export const FirmwareOutputCard: Component<FirmwareOutputCardProps> = (props) => {
	const id = createUniqueId();
	const [model, setModel] = createSignal(props.output.model ?? '');
	const hasDetails = () =>
		props.output.hashArea !== undefined ||
		props.output.info.some(([key]) => key !== 'type');
	// Deferred files have no size until they are made
	const size = () => props.output.blob && formatSize(props.output.blob.size);
	const save = () => {
		if (props.output.blob) {
			downloadBlob(props.output.blob, props.output.name);
		} else {
			props.onSave(model() || undefined);
		}
	};

	return (
		<Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 1.5, p: 2 }}>
			<Stack direction="row" alignItems="center" gap={1}>
				<Stack sx={{ flex: 1, minWidth: 0 }}>
					<Typography variant="body1" sx={{ overflowWrap: 'anywhere' }}>
						{props.output.format ?? props.output.name}
					</Typography>
					<Show when={props.output.format}>
						<Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
							{props.output.name}
						</Typography>
					</Show>
				</Stack>
				<Show when={hasDetails()}>
					<IconButton onClick={props.onInfo} title="Information" aria-label={`Information for ${props.output.name}`}>
						<InfoOutlinedIcon />
					</IconButton>
				</Show>
			</Stack>
			{/* The error of an output with models is about the choice of one */}
			<Show when={props.output.error && !(props.output.models && model())}>
				<Alert severity={props.output.blob || props.output.models ? 'warning' : 'error'}>
					{props.output.error}
				</Alert>
			</Show>
			<Show when={props.output.models}>{(models) =>
				<FormControl size="small">
					<InputLabel id={`${id}-model-label`}>Phone model</InputLabel>
					<Select
						labelId={`${id}-model-label`}
						label="Phone model"
						value={model()}
						onChange={(event) => setModel(event.target.value)}
					>
						<For each={models()}>{(item) =>
							<MenuItem value={item}>{item}</MenuItem>
						}</For>
					</Select>
				</FormControl>
			}</Show>
			<Show when={props.output.blob || props.output.deferred}>
				<Button
					sx={{ mt: 'auto', alignSelf: 'flex-start' }}
					variant="outlined"
					startIcon={<DownloadIcon />}
					disabled={props.disabled || (!!props.output.models && !model())}
					onClick={save}
					aria-label={size() ? `Save ${props.output.name} (${size()})` : `Save ${props.output.name}`}
				>
					{size() ? `Save · ${size()}` : 'Save'}
				</Button>
			</Show>
		</Paper>
	);
};
