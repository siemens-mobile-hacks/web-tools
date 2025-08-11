import { Component, createSignal } from "solid-js";
import {
	Alert,
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
	Stack,
	TextField
} from "@suid/material";
import { Title } from "@/components/Layout/Title";
import { SerialConnect } from "@/components/SerialConnect";
import { useSerial } from "@/providers/SerialProvider";
import * as Comlink from "comlink";
import { ButtonLoadingText } from "@/components/UI/ButtonLoadingText";

export const UnlockBootloaderPage: Component = () => {
	let logFieldRef!: HTMLTextAreaElement;
	const [log, setLog] = createSignal<string>("");
	const [isBusy, setIsBusy] = createSignal<boolean>(false);
	const [showConfirm, setShowConfirm] = createSignal(false);
	const isSerialReady = () => serial.protocol() == "DWD";

	const serial = useSerial();

	const onUnlockLog = (log: string) => {
		setLog((prev) => prev + log + "\n");
		logFieldRef.scrollTop = logFieldRef.scrollHeight;
	};

	const handleUnlock = async () => {
		setShowConfirm(false);
		setIsBusy(true);

		try {
			onUnlockLog("Starting unlock process...");
			await serial.dwd.unlockBoot(Comlink.proxy(onUnlockLog));
		} catch (e) {
			onUnlockLog(String(e));
		} finally {
			setIsBusy(false);
		}
	};

	const handleCancelUnlock = () => {
		setShowConfirm(false);
	};

	return (
		<Box mt={1}>
			<Title>Unlock Bootloader</Title>

			<SerialConnect protocol="DWD" />

			<Box mt={1}>
				<Alert severity="info">
					Unlocking the bootloader lets you use external flash tools.<br />
					For example: V-Klay to install patches.<br />
					<b>This does not remove the SIM lock.</b>

					<Box mt={1}>
						<Button
							variant="contained"
							onClick={() => setShowConfirm(true)}
							disabled={isBusy() || !isSerialReady()}
						>
							<ButtonLoadingText loading={isBusy()}>
								Unlock bootloader
							</ButtonLoadingText>
						</Button>
					</Box>
				</Alert>
			</Box>

			<Dialog open={showConfirm()} onClose={handleCancelUnlock}>
				<DialogTitle id="alert-dialog-title">
					Unlocking bootloader
				</DialogTitle>
				<DialogContent>
					<DialogContentText id="alert-dialog-description">
						Unlocking the APOXI bootloader WILL BREAK THE DEVICE and it may never work again.<br /><br />
						<b>MAKE A FULL BACKUP BEFORE THE OPERATION.</b>
					</DialogContentText>
				</DialogContent>
				<DialogActions>
					<Button onClick={handleCancelUnlock}>Cancel</Button>
					<Button onClick={handleUnlock} color="error">
						Continue
					</Button>
				</DialogActions>
			</Dialog>

			<Stack mt={2}>
				<TextField
					inputRef={(ref) => (logFieldRef = ref as HTMLElement as HTMLTextAreaElement)}
					value={log()}
					sx={{flex: 1}}
					multiline={true}
					rows={10}
					inputProps={{ readOnly: true }}
					label="Log output"
				/>
			</Stack>
		</Box>
	);
}

export default UnlockBootloaderPage;
