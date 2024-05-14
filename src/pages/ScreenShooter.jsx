import { createSignal, onMount, onCleanup, createEffect } from 'solid-js';
import { format as dateFormat } from 'date-fns';

import Box from '@suid/material/Box';
import InputLabel from '@suid/material/InputLabel';
import MenuItem from '@suid/material/MenuItem';
import FormControl from '@suid/material/FormControl';
import FormControlLabel from '@suid/material/FormControlLabel';
import Select from '@suid/material/Select';
import Stack from '@suid/material/Stack';
import Grid from '@suid/material/Grid';
import Button from '@suid/material/Button';
import IconButton from '@suid/material/IconButton';
import Alert from '@suid/material/Alert';
import Radio from '@suid/material/Radio';
import RadioGroup from '@suid/material/RadioGroup';
import FormLabel from '@suid/material/FormLabel';
import Divider from '@suid/material/Divider';
import Paper from '@suid/material/Paper';
import CircularProgress from '@suid/material/CircularProgress';
import LinearProgress from '@suid/material/LinearProgress';

import UsbIcon from '@suid/icons-material/Usb';
import UsbOffIcon from '@suid/icons-material/UsbOff';
import TvIcon from '@suid/icons-material/Tv';
import DownloadIcon from '@suid/icons-material/Download';

import CopyButton from '~/components/CopyButton';
import BfcConnect from '~/components/BfcConnect';

import { useBFC, BfcState } from '~/contexts/BfcProvider'
import { transferBufferToCanvas, downloadCanvasImage } from '~/utils';

function ScreenShooter() {
	let [displayNumber, setDisplayNumber] = createSignal(0);
	let [phoneDisplays, setPhoneDisplays] = createSignal([
		{width: 240, height: 320, bufferWidth: 240, bufferHeight: 320}
	]);
	let [progressValue, setProgressValue] = createSignal(false);
	let [hasScreenshot, setHasScreenshot] = createSignal(false);
	let [errorMessage, setErrorMessage] = createSignal(false);

	let bfc = useBFC();
	let canvasRef;
	let bufferCanvasRef;

	onMount(() => {
		document.title = 'Screenshot';

		let ctx = canvasRef.getContext('2d');
		ctx.rect(0, 0, canvasRef.width, canvasRef.height);
		ctx.fillStyle = "rgba(0,0,0,0.1)";
		ctx.fill();
	});

	let errorWrap = (callback) => {
		return async () => {
			try {
				setErrorMessage(null);
				await callback(...arguments);
			} catch (e) {
				setErrorMessage(e.message);
			}
		}
	};

	let makeScreenshot = errorWrap(async () => {
		setProgressValue({ pct: 0 });

		try {
			let buffer = await bfc.api.getDisplayBuffer(+displayNumber() + 1, {
				onProgress(value, total, elapsed) {
					let speed = elapsed > 0 ? value / (elapsed / 1000) : 0;
					setProgressValue({
						pct:	value / total * 100,
						value:	`${+(value / 1024).toFixed(0)} Kb`,
						total:	`${+(total / 1024).toFixed(0)} Kb`,
						speed:	`${+(speed / 1024).toFixed(1)} Kb/s`
					});
				}
			});

			if (bufferCanvasRef.width != canvasRef.width || bufferCanvasRef.height != canvasRef.height) {
				transferBufferToCanvas(buffer.mode, buffer.data, bufferCanvasRef);
				let ctx = canvasRef.getContext('2d');
				ctx.drawImage(bufferCanvasRef, 0, 0);
			} else {
				transferBufferToCanvas(buffer.mode, buffer.data, canvasRef);
			}

			setHasScreenshot(true);
		} finally {
			setProgressValue(false)
		}
	});

	let saveScreenshot = async () => {
		let fileName = `Screenshot_${dateFormat(new Date(), 'yyyyMMdd_HHmmss')}.png`;
		downloadCanvasImage(canvasRef, fileName);
	};

	let copyScreenshot = async () => {
		canvasRef.toBlob((blob) => {
			navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
		});
	};

	let getAllDisplaysInfo = async () => {
		let displaysCount = await bfc.api.getDisplayCount();
		let displays = [];
		for (let i = 1; i <= displaysCount; i++) {
			let displayInfo = await bfc.api.getDisplayInfo(i);
			let bufferInfo = await bfc.api.getDisplayBufferInfo(displayInfo.clientId);
			displays.push({
				width: displayInfo.width,
				height: displayInfo.height,
				bufferWidth: bufferInfo.width,
				bufferHeight: bufferInfo.height
			});
		}
		return displays;
	};

	createEffect(() => {
		if (bfc.readyState() == BfcState.CONNECTED) {
			getAllDisplaysInfo().then((displays) => {
				if (displayNumber() >= displays.length)
					setDisplayNumber(0);
				setPhoneDisplays(displays);
			});
		}
		setErrorMessage(null);
	});

	return (
		<Grid container spacing={2}>
			<Show when={bfc.connectError()}>
				<Grid item xs={12} mt={1} order={0}>
					<Alert severity="error">{bfc.connectError().message}</Alert>
				</Grid>
			</Show>

			<Grid item sx={{ textAlign: 'center', minWidth: '255px', width: phoneDisplays()[displayNumber()].width + 15 + 'px' }} order={{ xs: 2, sm: 1 }}>
				<Paper sx={{ display: 'inline-flex' }}>
					<canvas width={phoneDisplays()[displayNumber()].width} height={phoneDisplays()[displayNumber()].height} ref={canvasRef} />
					<canvas
						width={phoneDisplays()[displayNumber()].bufferWidth}
						height={phoneDisplays()[displayNumber()].bufferHeight}
						ref={bufferCanvasRef}
						style={{ display: 'none' }}
					/>
				</Paper>
			</Grid>

			<Grid item xs={12} sm order={{ xs: 1, sm: 2 }}>
				<Stack alignItems="center" direction="row" gap={1}>
					<BfcConnect />
				</Stack>

				<Show when={phoneDisplays().length > 0}>
					<Stack alignItems="center" direction="row" gap={2}>
						<TvIcon />
						<FormControl>
							<RadioGroup row value={displayNumber()} onChange={(e) => setDisplayNumber(event.target.value)}>
								<Index each={phoneDisplays()}>{(display, index) =>
									<FormControlLabel value={index} control={<Radio />} label={`Display #${index + 1} (${display().width}x${display().height})`} />
								}</Index>
							</RadioGroup>
						</FormControl>
					</Stack>
				</Show>

				<Stack alignItems="center" direction="row" gap={2} mt={1}>
					<FormControl variant="standard">
						<Button variant="outlined" disabled={bfc.readyState() != BfcState.CONNECTED || progressValue()} onClick={makeScreenshot}>
							Make screenshot
						</Button>
					</FormControl>

					<FormControl variant="standard">
						<Button variant="outlined" title="Download screenshot" sx={{ minWidth: 0 }} disabled={!hasScreenshot()} onClick={saveScreenshot}>
							<DownloadIcon />
						</Button>
					</FormControl>

					<FormControl variant="standard">
						<CopyButton variant="outlined" title="Copy screenshot" sx={{ minWidth: 0 }} onCopy={copyScreenshot} disabled={!hasScreenshot()} />
					</FormControl>
				</Stack>

				<Box sx={{ width: '100%', mt: 2, display: progressValue() ? '' : 'none' }}>
					<LinearProgress variant="determinate" value={progressValue()?.pct || 0} />
					<Show when={progressValue() && progressValue().total}>
						{progressValue().value} / {progressValue().total}, {progressValue().speed}
					</Show>
				</Box>

				<Show when={errorMessage()}>
					<Box mt={1}>
						<Alert severity="error">{errorMessage()}</Alert>
					</Box>
				</Show>
			</Grid>
		</Grid>
	);
}

export default ScreenShooter;
