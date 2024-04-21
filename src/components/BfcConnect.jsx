import { createSignal } from 'solid-js';

import FormControl from '@suid/material/FormControl';
import Stack from '@suid/material/Stack';
import Button from '@suid/material/Button';
import CircularProgress from '@suid/material/CircularProgress';
import LinearProgress from '@suid/material/LinearProgress';
import MenuItem from '@suid/material/MenuItem';
import Select from '@suid/material/Select';

import UsbIcon from '@suid/icons-material/Usb';
import UsbOffIcon from '@suid/icons-material/UsbOff';
import TvIcon from '@suid/icons-material/Tv';

import { useBFC, BfcState } from '../contexts/BfcProvider';

function BfcConnect(props) {
	let [currentBaudrate, setCurrentBaudrate] = createSignal('auto');
	let bfc = useBFC();

	let handleConnect = () => {
		bfc.connect();
	};

	let handleDisconnect = () => {
		bfc.disconnect();
	};

	return (
		<>
			<Show when={bfc.readyState() == BfcState.CONNECTED}>
				<UsbIcon />
			</Show>

			<Show when={bfc.readyState() == BfcState.DISCONNECTED}>
				<UsbOffIcon />
			</Show>

			<Show when={bfc.readyState() == BfcState.CONNECTING || bfc.readyState() == BfcState.DISCONNECTING}>
				<CircularProgress size="1.5rem" />
			</Show>

			<Show when={bfc.readyState() == BfcState.DISCONNECTED || bfc.readyState() == BfcState.CONNECTING}>
				<FormControl variant="standard" sx={{ m: 1 }}>
					<Button size="small" variant="contained"
						disabled={bfc.readyState() != BfcState.DISCONNECTED}
						onClick={handleConnect}>Connect</Button>
				</FormControl>
			</Show>

			<Show when={bfc.readyState() == BfcState.CONNECTED || bfc.readyState() == BfcState.DISCONNECTING}>
				<FormControl variant="standard" sx={{ m: 1 }}>
					<Button size="small" variant="contained" color="error"
						disabled={bfc.readyState() != BfcState.CONNECTED}
						onClick={handleDisconnect}>Disconnect</Button>
				</FormControl>
			</Show>
		</>
	);
}

export default BfcConnect;
