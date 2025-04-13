import * as Comlink from 'comlink';
import { createEffect, createMemo, createSignal, Index, JSX, on, onMount, Show } from 'solid-js';
import { format as dateFormat } from 'date-fns/format';
import {
	Alert,
	Box,
	Button,
	FormControl,
	FormControlLabel,
	Grid,
	LinearProgress,
	List,
	ListItem,
	Paper,
	Radio,
	RadioGroup,
	Stack
} from '@suid/material';
import TvIcon from '@suid/icons-material/Tv';
import DownloadIcon from '@suid/icons-material/Download';
import { CopyButton } from './CopyButton';
import { SerialConnect } from '../../components/SerialConnect';
import { useSerial } from '../../contexts/SerialProvider';
import { downloadCanvasImage, transferBufferToCanvas } from '../../utils';
import { SerialReadyState } from "../../workers/SerialWorker";
import { PhoneDisplay } from "../../workers/services/BfcService";
import { IoReadWriteProgress } from "../../../../node-sie-serial/src";

type ProgressInfo = {
	percent: number
	cursor?: string;
	total?: string;
	speed?: string;
};

function ScreenShooterPage(): JSX.Element {
	const [displayNumber, setDisplayNumber] = createSignal<number>(0);
	const [phoneDisplays, setPhoneDisplays] = createSignal<PhoneDisplay[]>([
		{ width: 240, height: 320, bufferWidth: 240, bufferHeight: 320 }
	]);
	const [progressValue, setProgressValue] = createSignal<ProgressInfo | undefined>(undefined);
	const [hasScreenshot, setHasScreenshot] = createSignal<boolean>(false);
	const [errorMessage, setErrorMessage] = createSignal<string | null | false>(false);

	const serial = useSerial();
	let canvasRef!: HTMLCanvasElement;
	let bufferCanvasRef!: HTMLCanvasElement;

	const bfcReady = createMemo<boolean>(() => {
		return serial.readyState() === SerialReadyState.CONNECTED && serial.protocol() === "BFC";
	});

	onMount(() => {
		document.title = 'Screenshot';

		const ctx = canvasRef.getContext('2d');
		if (!ctx) return;

		ctx.rect(0, 0, canvasRef.width, canvasRef.height);
		ctx.fillStyle = "rgba(0,0,0,0.1)";
		ctx.fill();
	});

	const errorWrap = <T extends (...args: any[]) => Promise<void>>(callback: T): ((...args: Parameters<T>) => Promise<void>) => {
		return async (...args: Parameters<T>): Promise<void> => {
			try {
				setErrorMessage(null);
				await callback(...args);
			} catch (e) {
				setErrorMessage((e as Error).message);
			}
		};
	};

	const makeScreenshot = errorWrap(async (): Promise<void> => {
		setProgressValue({ percent: 0 });

		const onProgress =  Comlink.proxy((e: IoReadWriteProgress) => {
			setProgressValue({
				percent: e.percent,
				cursor: `${+(e.cursor / 1024).toFixed(0)} kB`,
				total: `${+(e.total / 1024).toFixed(0)} kB`,
				speed: `${+(e.speed / 1024).toFixed(1)} kB/s`
			});
		});

		try {
			const buffer = await serial.bfc.getDisplayBuffer(displayNumber() + 1, onProgress);
			if (bufferCanvasRef.width !== canvasRef.width || bufferCanvasRef.height !== canvasRef.height) {
				transferBufferToCanvas(buffer.mode, buffer.buffer, bufferCanvasRef);
				const ctx = canvasRef.getContext('2d');
				if (!ctx)
					return;

				const x = Math.round((bufferCanvasRef.width - canvasRef.width) / 2);
				const y = Math.round((bufferCanvasRef.height - canvasRef.height) / 2);
				ctx.drawImage(bufferCanvasRef, -x, -y);
			} else {
				transferBufferToCanvas(buffer.mode, buffer.buffer, canvasRef);
			}

			setHasScreenshot(true);
		} finally {
			setProgressValue(undefined);
		}
	});

	const saveScreenshot = async (): Promise<void> => {
		const fileName = `Screenshot_${dateFormat(new Date(), 'yyyyMMdd_HHmmss')}.png`;
		downloadCanvasImage(canvasRef, fileName);
	};

	const copyScreenshot = async (): Promise<void> => {
		canvasRef.toBlob((blob) => {
			if (blob && navigator.clipboard) {
				navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
			}
		});
	};

	createEffect(on(bfcReady, () => {
		if (bfcReady()) {
			serial.bfc.getAllDisplays().then((displays) => {
				if (displayNumber() >= displays.length)
					setDisplayNumber(0);
				setPhoneDisplays(displays);
				console.log(displays);
			});
		}
		setErrorMessage(null);
	}));

	return (
		<Box>
			<Show when={serial.connectError()}>
				<Alert severity="error" sx={{ mb: 1 }}>
					ERROR: {serial.connectError()?.message}<br />
					Try reconnecting the data cable if you are sure that your phone is connected and online.
				</Alert>
			</Show>

			<Grid container spacing={2}>
				<Grid
					item
					sx={{
						order: { xs: 2, sm: 1 },
						textAlign: 'center',
						minWidth: '255px',
						width: phoneDisplays()[displayNumber()].width + 15 + 'px'
					}}
				>
					<Paper sx={{ display: 'inline-flex' }}>
						<canvas
							width={phoneDisplays()[displayNumber()].width}
							height={phoneDisplays()[displayNumber()].height}
							ref={canvasRef!}
						/>
						<canvas
							width={phoneDisplays()[displayNumber()].bufferWidth}
							height={phoneDisplays()[displayNumber()].bufferHeight}
							ref={bufferCanvasRef!}
							style={{ display: 'none' }}
						/>
					</Paper>
				</Grid>

				<Grid item mt={1} sx={{ order: { xs: 1, sm: 2 } }}>
					<SerialConnect protocol="BFC" />

					<Show when={phoneDisplays().length > 0}>
						<Stack alignItems="center" direction="row" gap={2}>
							<TvIcon />
							<FormControl>
								<RadioGroup row value={displayNumber()} onChange={(e) => setDisplayNumber(Number(e.target.value))}>
									<Index each={phoneDisplays()}>{(display, index) =>
										<FormControlLabel
											value={index}
											control={<Radio />}
											label={`Display #${index + 1} (${display().width}x${display().height})`}
										/>
									}</Index>
								</RadioGroup>
							</FormControl>
						</Stack>
					</Show>

					<Stack alignItems="center" direction="row" gap={2} mt={1}>
						<FormControl variant="standard">
							<Button
								variant="outlined"
								disabled={!bfcReady() || !!progressValue()}
								onClick={makeScreenshot}
							>
								Make screenshot
							</Button>
						</FormControl>

						<FormControl variant="standard">
							<Button
								variant="outlined"
								title="Download screenshot" sx={{ minWidth: 0 }}
								disabled={!hasScreenshot()}
								onClick={saveScreenshot}
							>
								<DownloadIcon />
							</Button>
						</FormControl>

						<FormControl variant="standard">
							<CopyButton onCopy={copyScreenshot} disabled={!hasScreenshot()} />
						</FormControl>
					</Stack>

					<Box sx={{ width: '100%', mt: 2, display: progressValue() ? '' : 'none' }}>
						<LinearProgress variant="determinate" value={progressValue()?.percent || 0} />
						<Show when={progressValue()?.total}>
							{progressValue()!.cursor} / {progressValue()!.total}, {progressValue()!.speed}
						</Show>
					</Box>

					<Show when={errorMessage()}>
						<Box mt={1}>
							<Alert severity="error">{errorMessage()}</Alert>
						</Box>
					</Show>
				</Grid>
			</Grid>

			<Alert severity="info" sx={{ mt: 1 }}>
				<b>TIPS & TRICKS:</b>

				<List sx={{ listStyleType: 'disc' }}>
					<ListItem sx={{ display: 'list-item' }}>
						DCA-540 is better choice for speed.
					</ListItem>
					<ListItem sx={{ display: 'list-item' }}>
						Entered SKEY/BKEY is required for normal operation.
					</ListItem>
					<ListItem sx={{ display: 'list-item' }}>
						Bluetooth is not supported.
					</ListItem>
				</List>
			</Alert>
		</Box>
	);
}

export default ScreenShooterPage;
