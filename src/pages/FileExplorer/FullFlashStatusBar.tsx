import { Component, createEffect, createMemo, createSignal, onCleanup, Show } from 'solid-js';
import { Box, Button, IconButton, Stack } from '@suid/material';
import CloseIcon from '@suid/icons-material/Close';
import InsertDriveFileIcon from '@suid/icons-material/InsertDriveFile';
import FileOpenIcon from '@suid/icons-material/FileOpen';
import SaveOutlinedIcon from '@suid/icons-material/SaveOutlined';
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
		return parts.filter(Boolean).join(' · ');
	});

	// In the title bar, over the phone's connection, which shows again once the fullflash is closed or
	// the source switched
	createEffect(() => app.setFileStatus(status()));
	onCleanup(() => app.setFileStatus(undefined));

	return (
		<Stack
			direction="row"
			alignItems="center"
			gap={1}
			sx={{ width: { xs: '100%', sm: 'auto' }, minWidth: 0, flexGrow: 1 }}
		>
			<Stack
				direction="row"
				alignItems="center"
				gap={0.5}
				sx={{
					minWidth: 0,
					flex: { xs: '1 1 0', sm: '0 1 auto' },
				}}
			>
				<Button
					component="label"
					variant={props.fullflash ? 'text' : 'contained'}
					startIcon={props.fullflash ? <InsertDriveFileIcon /> : <FileOpenIcon />}
					title={props.fullflash?.fileName}
					disabled={props.disabled || isOpening()}
					sx={{
						height: 40,
						minWidth: 0,
						flexGrow: 1,
						textTransform: 'none',
					}}
				>
					<Show
						when={props.fullflash}
						fallback={<ButtonLoadingText loading={isOpening()}>Open fullflash</ButtonLoadingText>}
					>{(opened) =>
						<Box
							component="span"
							sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
						>
							{opened().fileName}
						</Box>
					}</Show>
					<input
						type="file"
						aria-label="Fullflash"
						hidden
						disabled={props.disabled || isOpening()}
						onChange={(e) => {
							const file = e.currentTarget.files?.[0];
							e.currentTarget.value = '';
							if (file)
								void open(file);
						}}
					/>
				</Button>
				<Show when={props.fullflash}>
					<IconButton
						title="Close fullflash"
						aria-label="Close fullflash"
						disabled={props.disabled}
						onClick={close}
					>
						<CloseIcon />
					</IconButton>
				</Show>
			</Stack>
			<Show when={props.fullflash}>{(opened) =>
				<Button
					variant="outlined"
					startIcon={<SaveOutlinedIcon />}
					title="Save fullflash"
					aria-label="Save fullflash"
					color="primary"
					disabled={props.disabled || !opened().isModified()}
					onClick={() => void save(opened())}
				>
					Save
				</Button>
			}</Show>
		</Stack>
	);
};
