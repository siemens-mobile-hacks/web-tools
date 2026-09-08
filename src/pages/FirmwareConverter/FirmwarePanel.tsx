import { type Component, createSignal, For, Show } from 'solid-js';
import { Alert, Box, Button, LinearProgress, Stack, Typography } from '@suid/material';
import { FirmwareOutputCard } from './FirmwareOutputCard';
import { FirmwareInfoDialog } from './FirmwareInfoDialog';
import { formatSize } from '@/utils';
import type {
	FirmwareMode,
	FirmwareOutput,
	FirmwareResult,
	FirmwareResponse,
} from '@/workers/services/FirmwareService';

const modeConfig = {
	unpack: {
		description: 'Extract firmware, FFS or MAP files from *_service.exe / *_update.exe.',
		fileTypes: 'Supported file types: *_service.exe / *_update.exe, FFSInit_*.exe or *_SCOUT_XBI.exe.',
		accept: '.exe',
		inputLabel: 'Update or service EXE',
		selectLabel: 'Select EXE',
		progressLabel: 'Unpacking…',
	},
	convert: {
		description: 'Convert any firmware file to fullflash.bin. Missing regions are filled with 0xFF.',
		fileTypes: 'Supported file types: .xbi, .xbz, .xfs, .xbb, .exci, .exbi, .xci and service / update installers (.exe).',
		accept: '.exe,.xbi,.xbz,.xci,.xbb,.xfs,.exci,.exbi',
		inputLabel: 'EXE or XBI firmware',
		selectLabel: 'Select firmware',
		progressLabel: 'Converting…',
	},
};

interface FirmwarePanelProps {
	mode: FirmwareMode;
	activeMode: FirmwareMode | undefined;
	onProcess: (file: File) => Promise<FirmwareResponse | undefined>;
	onCancel: () => void;
}

export const FirmwarePanel: Component<FirmwarePanelProps> = (props) => {
	let input!: HTMLInputElement;
	const [file, setFile] = createSignal<File>();
	const [error, setError] = createSignal('');
	const [result, setResult] = createSignal<FirmwareResult>();
	const [selectedOutput, setSelectedOutput] = createSignal<FirmwareOutput>();
	const [infoOpen, setInfoOpen] = createSignal(false);
	const config = () => modeConfig[props.mode];
	const busy = () => props.activeMode === props.mode;
	const process = async (selectedFile: File) => {
		if (props.activeMode)
			return;
		setFile(selectedFile);
		setError('');
		setResult(undefined);
		try {
			const response = await props.onProcess(selectedFile);
			if (!response)
				return;
			if ('error' in response) {
				setError(response.error);
			} else {
				setResult(response);
			}
		} catch (error) {
			setError(error instanceof Error ? error.message : String(error));
		}
	};
	const selectFile = () => {
		const selectedFile = input.files?.[0];
		input.value = '';
		if (selectedFile)
			void process(selectedFile);
	};
	const showInfo = (output: FirmwareOutput) => {
		setSelectedOutput(output);
		setInfoOpen(true);
	};
	const cancel = () => {
		setFile(undefined);
		props.onCancel();
	};

	return (
		<Box
			role="tabpanel"
			id={`firmware-panel-${props.mode}`}
			aria-labelledby={`firmware-tab-${props.mode}`}
			mt={1}
		>
			<Alert severity="info">
				<Typography variant="body2">
					{config().description}
				</Typography>
				<Typography variant="body2" mt={0.5}>
					{config().fileTypes}
				</Typography>
			</Alert>
			<Stack direction="row" alignItems="center" flexWrap="wrap" gap={1} mt={1}>
				<input
					ref={input}
					type="file"
					accept={config().accept}
					aria-label={config().inputLabel}
					hidden
					onChange={selectFile}
				/>
				<Button variant="contained" disabled={!!props.activeMode} onClick={() => input.click()}>
					{config().selectLabel}
				</Button>
				<Show when={file()}>{(selectedFile) =>
					<Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
						{selectedFile().name} · {formatSize(selectedFile().size)}
						<Show when={result()}>{(result) => ` · ${result().type}`}</Show>
					</Typography>
				}</Show>
				<Show when={busy()}>
					<Button onClick={cancel}>Cancel</Button>
				</Show>
			</Stack>
			<Show when={busy()}>
				<Box mt={2} role="status">
					<Typography variant="body2" mb={1}>
						{config().progressLabel}
					</Typography>
					<LinearProgress aria-label="Processing firmware" />
				</Box>
			</Show>
			<Show when={error()}>
				<Alert severity="error" sx={{ mt: 2 }}>
					{error()}
				</Alert>
			</Show>
			<Box
				mt={2}
				aria-live="polite"
				sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 2 }}
			>
				<For each={result()?.files}>{(output) =>
					<FirmwareOutputCard output={output} onInfo={() => showInfo(output)} />
				}</For>
			</Box>
			<Show when={selectedOutput()}>{(output) =>
				<FirmwareInfoDialog
					open={infoOpen()}
					output={output()}
					onClose={() => setInfoOpen(false)}
				/>
			}</Show>
		</Box>
	);
};
