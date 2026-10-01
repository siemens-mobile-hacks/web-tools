import { Component, createEffect, createMemo, createSignal, onCleanup, Show } from 'solid-js';
import { Button, IconButton, Stack, Typography } from '@suid/material';
import FileOpenIcon from '@suid/icons-material/FileOpen';
import SaveIcon from '@suid/icons-material/Save';
import CloseIcon from '@suid/icons-material/Close';
import { ButtonLoadingText } from '@/components/UI/ButtonLoadingText';
import { useApp } from '@/providers/AppProvider';
import { downloadBlob } from '@/utils';
import { type DiskInfo, formatFreeSpace } from '@/pages/FileExplorer/FileSystem';
import { FullFlashFS } from '@/pages/FileExplorer/FullFlashFS';

interface FullFlashStatusBarProps {
	fullflash?: FullFlashFS;
	disk?: DiskInfo;
	disabled: boolean;
	// A fullflash was opened, or the open one closed
	onChange: (fullflash?: FullFlashFS) => void;
	onError: (message: string) => void;
}

// Opens, saves and closes a fullflash, and tells what it is and how much of it is free
export const FullFlashStatusBar: Component<FullFlashStatusBarProps> = (props) => {
	const app = useApp();
	const [isOpening, setIsOpening] = createSignal(false);
	let fileInputRef!: HTMLInputElement;

	// Asks before changes that were not saved are lost
	const close = (): boolean => {
		const opened = props.fullflash;
		if (opened && !opened.mayDiscard())
			return false;
		void opened?.close();
		props.onChange(undefined);
		return true;
	};

	const open = async (file: File): Promise<void> => {
		if (!close())
			return;
		setIsOpening(true);
		try {
			props.onChange(await FullFlashFS.open(file));
		} catch (e) {
			props.onError((e as Error).message);
		} finally {
			setIsOpening(false);
		}
	};

	const save = async (opened: FullFlashFS): Promise<void> => {
		try {
			downloadBlob(new Blob([await opened.save()]), opened.fileName);
		} catch (e) {
			props.onError((e as Error).message);
		}
	};

	const status = createMemo<string | undefined>(() => {
		const info = props.fullflash?.info;
		if (!info)
			return undefined;
		const parts = [info.deviceName, info.imei && `IMEI ${info.imei}`, info.platform];
		if (props.disk)
			parts.push(formatFreeSpace(props.disk));
		return parts.filter(Boolean).join(" · ");
	});

	// In the title bar, over the phone's connection, which shows again once the fullflash is closed or
	// the source switched
	createEffect(() => app.setFileStatus(status()));
	onCleanup(() => app.setFileStatus(undefined));

	return (
		<Stack direction="row" alignItems="center" flexWrap="wrap" gap={1} sx={{ minWidth: 0, flexGrow: 1 }}>
			<Button
				variant="contained"
				startIcon={<FileOpenIcon />}
				disabled={props.disabled || isOpening()}
				onClick={() => fileInputRef.click()}
			>
				<ButtonLoadingText loading={isOpening()}>Open fullflash</ButtonLoadingText>
			</Button>
			<input
				ref={fileInputRef}
				type="file"
				aria-label="Fullflash"
				hidden
				onChange={(e) => {
					const file = e.currentTarget.files?.[0];
					e.currentTarget.value = "";
					if (file)
						void open(file);
				}}
			/>
			<Show when={props.fullflash}>{(opened) =>
				<>
					<Button
						variant="outlined"
						startIcon={<SaveIcon />}
						disabled={props.disabled || !opened().isModified()}
						onClick={() => void save(opened())}
					>
						Save fullflash
					</Button>
					<Typography variant="body2" sx={{ flex: '1 1 8em', overflowWrap: 'anywhere' }}>
						{opened().fileName}
					</Typography>
					<IconButton
						title="Close fullflash"
						disabled={props.disabled}
						onClick={close}
					>
						<CloseIcon />
					</IconButton>
				</>
			}</Show>
		</Stack>
	);
};
