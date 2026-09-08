import { type Component, createSignal, onCleanup } from 'solid-js';
import { Box } from '@suid/material';
import { PageTitle } from '@/components/Layout/PageTitle';
import { FirmwareTabs } from './FirmwareTabs';
import { FirmwarePanel } from './FirmwarePanel';
import FirmwareWorker from '@/workers/firmware?worker';
import type { FirmwareMode, FirmwareRequest, FirmwareResponse } from '@/workers/services/FirmwareService';

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

	const process = async (file: File, mode: FirmwareMode): Promise<FirmwareResponse | undefined> => {
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
				currentWorker.postMessage({ file, mode } satisfies FirmwareRequest);
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
			<FirmwareTabs
				id="firmware"
				label="Firmware tools"
				value={tab()}
				onChange={setTab}
				tabs={[
					{ value: 'unpack', label: 'Unpack EXE' },
					{ value: 'convert', label: 'EXE / XBI → BIN' },
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
		</Box>
	);
};

export default FirmwareConverterPage;
