import { Component, createEffect, createSignal, For, Show } from 'solid-js';
import {
	Alert,
	Box,
	Button,
	CircularProgress,
	Divider,
	Fade,
	Paper,
	Stack,
	Typography,
	useTheme,
} from '@suid/material';
import FolderOpenIcon from '@suid/icons-material/FolderOpen';
import FileUploadIcon from '@suid/icons-material/FileUpload';
import {
	DecodedPDU,
	DecodedSMS,
	formatTimestampToIsoWithOffset,
	HTMLRenderer,
	SMSDatParser,
	SMSDecoder
} from 'siemens-sms-parser';

type ParsedMessage = Partial<DecodedSMS> & DecodedPDU & {
	phoneKey: string;
	file: File;
};

const htmlRenderer = new HTMLRenderer();
const SMSReaderPage: Component = () => {
	const [parsedMessages, setParsedMessages] = createSignal<ParsedMessage[]>([]);
	const [isLoading, setIsLoading] = createSignal(false);
	const [filesPicked, setFilesPicked] = createSignal(false);
	const [selectedFilesCount, setSelectedFilesCount] = createSignal(0);
	const [parsedFilesCount, setParsedFilesCount] = createSignal(0);
	const [validFilesCount, setValidFilesCount] = createSignal(0);
	const [messagesCount, setMessagesCount] = createSignal(0);
	const theme = useTheme();

	let singleFileInput!: HTMLInputElement;
	let directoryInput!: HTMLInputElement;

	createEffect(() => {
		parsedMessages();                                 // establish the dependency
		queueMicrotask(() => htmlRenderer.initHandlers()); // run after DOM is flushed
	});

	const getMessageStyles = (direction: 'Incoming' | 'Outgoing' | 'STATUS_REPORT') => {
		const backgroundShade =
			direction === 'Incoming'
				? theme.palette.primary.light
				: theme.palette.secondary.light;

		return {
			alignSelf: direction === 'Incoming' ? 'flex-start' : 'flex-end',
			backgroundColor: backgroundShade,
			color: theme.palette.getContrastText(backgroundShade),
		};
	};

	const handleSelection = async () => {
		const selectedFiles = [
			...Array.from(directoryInput.files ?? []),
			...Array.from(singleFileInput.files ?? []),
		];
		setParsedFilesCount(0);
		setMessagesCount(0);
		setSelectedFilesCount(0);
		setValidFilesCount(0);

		if (!selectedFiles.length)  {
			return;
		}

		setIsLoading(true);
		setFilesPicked(true);
		const messagesByPhoneNumber: Record<string, ParsedMessage[]> = {};

		setSelectedFilesCount(selectedFiles.length);
		let parsedFilesCount = 0;
		for (const file of selectedFiles) {
			parsedFilesCount++;
			if (parsedFilesCount % 131 === 0) {
				setParsedFilesCount(parsedFilesCount);
			}
			try {
				const buffer = new Uint8Array(await file.arrayBuffer());
				const decoded =
					file.name.endsWith('.dat')
						? new SMSDatParser().decode(buffer)
						: [new SMSDecoder().decode(buffer)];

				decoded.forEach((raw) => {
					const phoneKey =
						(raw.type === 'Incoming' ? raw.sender : raw.recipient) ?? 'Unknown';

					const parsed: ParsedMessage = {
						...raw,
						phoneKey,
						file,
					};

					messagesByPhoneNumber[phoneKey] ??= [];
					messagesByPhoneNumber[phoneKey].push(parsed);
					setMessagesCount(messagesCount() + 1);
				});
				if (decoded.length > 0) {
					setValidFilesCount(validFilesCount() + 1);
				}
			} catch (error) {
				console.warn(`Failed to parse ${file.name}`, error);
			}
		}

		const flattened: ParsedMessage[] = [];
		Object.keys(messagesByPhoneNumber)
			.sort((a, b) => a.localeCompare(b, undefined, {numeric: true}))
			.forEach((phoneKey) => {
				const sorted = messagesByPhoneNumber[phoneKey].
					sort(function (msg1, msg2) {
						//Trying to get as close as possible to chronological order,
						// while not knowing the date for outgoing messages. The current version is non-deterministic,
					    // there is a potential for improving the sorting by implementing a custom sort function
						if (msg1.dateAndTimeZoneOffset !== undefined && msg2.dateAndTimeZoneOffset !== undefined) {
							return msg1.dateAndTimeZoneOffset.date > msg2.dateAndTimeZoneOffset.date ? 1 : -1;
						}
						if (msg1.file.name === msg2.file.name && msg1.messageIndex !== undefined && msg2.messageIndex !== undefined) {
							//Order in SMS.dat is not always chronological,
							// it's going to depend on which messages were deleted previously,
							// but it's more likely to be chronological than the file last modified date.
							return msg1.messageIndex > msg2.messageIndex ? 1: -1;
						}
						if (msg1.dateAndTimeZoneOffset !== undefined && msg2.file.lastModified !== undefined) {
							return msg1.dateAndTimeZoneOffset.date.getTime() > msg2.file.lastModified ? 1 : -1;
						}
						if (msg1.file.lastModified !== undefined && msg2.dateAndTimeZoneOffset !== undefined) {
							return msg1.file.lastModified > msg2.dateAndTimeZoneOffset.date.getTime() ? 1 : -1;
						}
						if (msg1.file.lastModified !== undefined && msg2.file.lastModified !== undefined) {
							return msg1.file.lastModified > msg2.file.lastModified ? 1 : -1;
						}
						return msg1.file.name.localeCompare(msg2.file.name);
					})
					flattened.push(...sorted);
			});

		setParsedFilesCount(parsedFilesCount);
		setParsedMessages(flattened);
		setIsLoading(false);
	};

	return (
		<Box>
			<Typography>
				Files must be present on your device, retrieving from the phone is not supported.
			</Typography>
			<Typography>
				SMS.dat, *.smi, and *.smo files are supported. Unsupported files will be ignored.
			</Typography>
			<Typography>
				Everything is parsed locally in the browser; no data ever leaves your device.
			</Typography>

			{/* Hidden native inputs */}
			<input
				ref={directoryInput}
				type="file"
				webkitdirectory
				multiple
				style={{ display: 'none' }}
				onChange={handleSelection}
			/>
			<input
				ref={singleFileInput}
				type="file"
				style={{ display: 'none' }}
				onChange={handleSelection}
			/>

			<Box sx={{ display: 'flex', gap: 1, mt:3, mb: 2, flexWrap: 'wrap' }}>
				<Button
					variant="contained"
					startIcon={<FolderOpenIcon />}
					onClick={() => directoryInput.click()}
				>
					Pick a directory with multiple files
				</Button>
				<Button
					variant="contained"
					startIcon={<FileUploadIcon />}
					onClick={() => singleFileInput.click()}
				>
					Pick a single file
				</Button>
			</Box>
			<Show when={isLoading()}>
				<CircularProgress sx={{ mt: 3 }} />
			</Show>
			<Show when={filesPicked()}>
				<Typography>Files Parsed: <b>{parsedFilesCount()}/{selectedFilesCount()}</b>
				<br/>
					Files with SMS: <b>{validFilesCount()}</b>
				<br/>
					Total messages: <b>{messagesCount()}</b>
				</Typography>
				<Show when={!isLoading() && parsedMessages().length === 0}>
					<Alert severity="error">No supported files!</Alert>
				</Show>
			</Show>

			<Box maxWidth={1024}>
				<For each={parsedMessages()}>
					{(message, index) => {
						const firstForPhone =
							index() === 0 ||
							parsedMessages()[index() - 1].phoneKey !== message.phoneKey;

						const messageIso =
							message.dateAndTimeZoneOffset !== undefined
								? formatTimestampToIsoWithOffset(
									message.dateAndTimeZoneOffset.date,
									message.dateAndTimeZoneOffset.timeZoneOffsetMinutes
								)
								: 'Unknown date';

						const fileIso =
							message.file.lastModified !== undefined
								? formatTimestampToIsoWithOffset(message.file.lastModified)
								: '';

						return (
							<Fade in timeout={1000}>
								<Stack spacing={0.5} sx={{ mt: firstForPhone ? 4 : 2 }}>
									<Show when={firstForPhone}>
										<Divider textAlign="center">{message.phoneKey}</Divider>
									</Show>

									<Paper
										elevation={3}
										sx={{
											px: 2,
											py: 1.5,
											borderRadius: 3,
											maxWidth: '90%',
											...getMessageStyles(message.type),
										}}
									>
										<Typography variant="caption">
											<em>{messageIso}</em>
											<b> {message.file.webkitRelativePath || message.file.name}{message.messageIndex !== undefined && `#${message.messageIndex}`}</b>
											{fileIso !== undefined && (<> File mtime: <em>{fileIso}</em></>)
											}
											<br/>
											<span> Format: <em>{message.format}</em></span>
											<span> Segments: <em>{message.segmentsStored}/{message.segmentsTotal}</em></span>
											<span> Encoding:  <em>{message.encoding ?? 'N/A'}</em></span>
											<span> SMSC: <em>{message.smsCenterNumber ?? 'N/A'}</em></span>
										</Typography>

										<Typography
											sx={{
												wordBreak: 'break-word',
												lineHeight: 1.6,
												mt: 1,
											}}
											component="div"
											innerHTML={message.html}
										/>
									</Paper>
								</Stack>
							</Fade>
						);
					}}
				</For>
			</Box>
		</Box>
	);
};

export default SMSReaderPage;
