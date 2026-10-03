import { type Component, createSignal, onCleanup } from 'solid-js';
import { Box, Stack, Typography } from '@suid/material';
import ArrowForwardIcon from '@suid/icons-material/ArrowForward';
import { PageTitle } from '@/components/Layout/PageTitle';
import { FirmwareTabs } from './FirmwareTabs';
import { FirmwarePanel } from './FirmwarePanel';
import FirmwareWorker from '@/workers/firmware?worker';
import type { FirmwareMode, FirmwareRequest, FirmwareResponse, FirmwareSave } from '@/workers/services/FirmwareService';

const FirmwareConverterPage: Component = () => {
	const [tab, setTab] = createSignal<FirmwareMode>('unpack');
	const [activeMode, setActiveMode] = createSignal<FirmwareMode>();
	let worker: Worker | undefined;
	let cancelTask: (() => void) | undefined;

	const cancel = () => {
		worker?.terminate();
		worker = undefined;
		cancelTask?.();
	};
	onCleanup(cancel);

	const process = async (file: File, mode: FirmwareMode, save?: FirmwareSave): Promise<FirmwareResponse | undefined> => {
		if (activeMode())
			return;
		setActiveMode(mode);
		try {
			worker ??= new FirmwareWorker();
			const currentWorker = worker;
			return await new Promise<FirmwareResponse | undefined>((resolve, reject) => {
				cancelTask = () => resolve(undefined);
				currentWorker.onmessage = (event: MessageEvent<FirmwareResponse>) => resolve(event.data);
				currentWorker.onerror = (event) => reject(new Error(event.message || 'Firmware processing failed.'));
				currentWorker.postMessage({ file, mode, save } satisfies FirmwareRequest);
			});
		} catch (error) {
			cancel();
			throw error;
		} finally {
			if (worker) {
				worker.onmessage = null;
				worker.onerror = null;
			}
			cancelTask = undefined;
			setActiveMode(undefined);
		}
	};

	return (
		<Box>
			<PageTitle>Firmware Converter</PageTitle>
			<Typography variant="body2" color="text.secondary" mb={1}>
				Conversion happens in the browser, files never leave your PC.
			</Typography>
			<FirmwareTabs
				id="firmware"
				label="Firmware tools"
				value={tab()}
				onChange={setTab}
				tabs={[
					{ value: 'unpack', label: 'Unpack EXE' },
					{
						value: 'convert',
						label: (
							<Stack
								component="span"
								direction="row"
								alignItems="center"
								gap={0.5}
							>
								<span>EXE / XBI</span>
								<ArrowForwardIcon fontSize="inherit" />
								<span>BIN</span>
							</Stack>
						),
					},
					{ value: 'fullflash', label: 'Fullflash formats (MFL, BIN)' },
				]}
				disabled={!!activeMode()}
			/>
			<Box hidden={tab() !== 'unpack'}>
				<FirmwarePanel
					mode="unpack"
					activeMode={activeMode()}
					onCancel={cancel}
					onProcess={(file) => process(file, 'unpack')}
				/>
			</Box>
			<Box hidden={tab() !== 'convert'}>
				<FirmwarePanel
					mode="convert"
					activeMode={activeMode()}
					onCancel={cancel}
					onProcess={(file) => process(file, 'convert')}
				/>
			</Box>
			<Box hidden={tab() !== 'fullflash'}>
				<FirmwarePanel
					mode="fullflash"
					activeMode={activeMode()}
					onCancel={cancel}
					onProcess={(file, save) => process(file, 'fullflash', save)}
				/>
			</Box>
		</Box>
	);
};

export default FirmwareConverterPage;
