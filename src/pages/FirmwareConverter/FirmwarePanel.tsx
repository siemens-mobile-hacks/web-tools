import { type Component, createSignal, For, Show } from 'solid-js';
import { Alert, Box, Button, Chip, LinearProgress, Stack, Typography } from '@suid/material';
import { FirmwareOutputCard } from './FirmwareOutputCard';
import { FirmwareInfoDialog } from './FirmwareInfoDialog';
import { downloadBlob, formatSize } from '@/utils';
import type {
	FirmwareMode,
	FirmwareOutput,
	FirmwareResult,
	FirmwareResponse,
	FirmwareSave,
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
	fullflash: {
		description: 'Convert a fullflash to another format.',
		fileTypes: 'Supported file types: .bin (raw fullflash) and .mfl (Martech Box).',
		accept: '.bin,.mfl',
		inputLabel: 'Fullflash',
		selectLabel: 'Select fullflash',
		progressLabel: 'Converting…',
	},
};

interface FirmwarePanelProps {
	mode: FirmwareMode;
	activeMode: FirmwareMode | undefined;
	onProcess: (file: File, save?: FirmwareSave) => Promise<FirmwareResponse | undefined>;
	onCancel: () => void;
}

export const FirmwarePanel: Component<FirmwarePanelProps> = (props) => {
	let input!: HTMLInputElement;
	const [file, setFile] = createSignal<File>();
	const [error, setError] = createSignal('');
	const [result, setResult] = createSignal<FirmwareResult>();
	const [selectedOutput, setSelectedOutput] = createSignal<FirmwareOutput>();
	const [infoOpen, setInfoOpen] = createSignal(false);
	const [saving, setSaving] = createSignal(false);
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
	// Makes the deferred output from the file, and saves it
	const save = async (output: FirmwareOutput, model?: string) => {
		const source = file();
		if (!source || props.activeMode)
			return;
		setError('');
		setSaving(true);
		try {
			const response = await props.onProcess(source, { name: output.name, model });
			if (!response)
				return;
			if ('error' in response) {
				setError(response.error);
			} else if (response.files[0].blob) {
				downloadBlob(response.files[0].blob, output.name);
			}
		} catch (error) {
			setError(error instanceof Error ? error.message : String(error));
		} finally {
			setSaving(false);
		}
	};
	const showInfo = (output: FirmwareOutput) => {
		setSelectedOutput(output);
		setInfoOpen(true);
	};
	const cancel = () => {
		// A saved file's cards stay, and need the file
		if (!saving())
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
				{/* Cancel takes the place of the select button, so that nothing moves */}
				<Box sx={{ display: 'grid' }}>
					<Button
						variant="contained"
						disabled={!!props.activeMode}
						onClick={() => input.click()}
						sx={{ gridArea: '1 / 1', visibility: busy() ? 'hidden' : undefined }}
					>
						{config().selectLabel}
					</Button>
					<Show when={busy()}>
						<Button
							onClick={cancel}
							sx={{ gridArea: '1 / 1', justifySelf: 'start' }}
						>
							Cancel
						</Button>
					</Show>
				</Box>
				<Show when={file()}>{(selectedFile) =>
					<Stack
						direction="row"
						alignItems="center"
						flexWrap="wrap"
						gap={1}
						minWidth={0}
					>
						<Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
							{selectedFile().name} · {formatSize(selectedFile().size)}
						</Typography>
						<Show when={result()}>{(result) =>
							<Chip
								label={result().type}
								size="small"
								variant="outlined"
							/>
						}</Show>
					</Stack>
				}</Show>
			</Stack>
			{/* In the gap below the file, so that the content doesn't move */}
			<Box role="status" sx={{ position: 'relative' }}>
				<Show when={busy()}>
					<LinearProgress
						aria-label={config().progressLabel}
						sx={{ position: 'absolute', top: 6, left: 0, right: 0 }}
					/>
				</Show>
			</Box>
			<Show when={error()}>
				<Alert severity="error" sx={{ mt: 2 }}>
					{error()}
				</Alert>
			</Show>
			<Show when={result()?.warning}>
				<Alert severity="warning" sx={{ mt: 2 }}>
					{result()?.warning}
				</Alert>
			</Show>
			<Box
				mt={2}
				aria-live="polite"
				sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 2 }}
			>
				<For each={result()?.files}>{(output) =>
					<FirmwareOutputCard
					output={output}
					disabled={!!props.activeMode}
					onInfo={() => showInfo(output)}
					onSave={(model) => void save(output, model)}
				/>
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
