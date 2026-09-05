import { Component, For, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { Box, IconButton } from '@suid/material';
import ContentCopyIcon from '@suid/icons-material/ContentCopy';
import ClearIcon from '@suid/icons-material/ClearAll';
import { useTheme } from '@suid/material/styles';
import { useSerial } from '@/providers/SerialProvider.js';
import * as Comlink from 'comlink';

// Log window over the serial worker debug output (same source as in the File Explorer).
export const LogWindow: Component<{ height?: string; emptyMessage?: string }> = (props) => {
	const serial = useSerial();
	const theme = useTheme();
	const [logLines, setLogLines] = createSignal<string[]>([]);
	const [stickToBottom, setStickToBottom] = createSignal(true);

	let logPreElement: HTMLPreElement | undefined;
	let isPointerPressedInsideLog = false;

	const MAX_LOG_LINES = 1000;
	const appendLogLine = (line: string): void => {
		setLogLines((prev) => {
			const next = [...prev, line];
			if (next.length > MAX_LOG_LINES)
				next.splice(0, next.length - MAX_LOG_LINES);
			return next;
		});
	};

	const copyLogToClipboard = (): void => {
		void navigator.clipboard?.writeText(logLines().join('\n'));
	};

	const scrollLogToBottom = (): void => {
		if (logPreElement)
			logPreElement.scrollTop = logPreElement.scrollHeight;
	};

	const updateLogStickiness = (): void => {
		if (!logPreElement)
			return;
		if (isPointerPressedInsideLog) {
			setStickToBottom(false);
			return;
		}
		const distanceFromBottom = logPreElement.scrollHeight - logPreElement.scrollTop - logPreElement.clientHeight;
		setStickToBottom(distanceFromBottom <= 24);
	};

	// Auto-scroll only while the log is already at the bottom
	createEffect(() => {
		logLines();
		if (stickToBottom())
			queueMicrotask(scrollLogToBottom);
	});

	createEffect(async () => {
		const history = await serial.logs.getLog();
		if (history.length)
			setLogLines(history);
		queueMicrotask(scrollLogToBottom);
		await serial.logs.setListener(Comlink.proxy(appendLogLine));
	});

	onCleanup(() => {
		void serial.logs.setListener(undefined);
	});

	// A pointerdown inside the log can be released outside it
	const onWindowPointerUp = (): void => {
		if (!isPointerPressedInsideLog)
			return;
		isPointerPressedInsideLog = false;
		updateLogStickiness();
	};
	window.addEventListener('pointerup', onWindowPointerUp);
	onCleanup(() => window.removeEventListener('pointerup', onWindowPointerUp));

	return (
		<Box sx={{ position: 'relative' }}>
			<Show when={logLines().length}>
				<IconButton
					size="small"
					title="Copy to clipboard"
					sx={{
						position: 'absolute',
						top: 0,
						right: 32,
						zIndex: 1,
						bgcolor: theme.palette.mode === 'light' ? theme.palette.grey[100] : theme.palette.grey[900],
					}}
					onClick={copyLogToClipboard}
				>
					<ContentCopyIcon sx={{ fontSize: 14 }} />
				</IconButton>
				<IconButton
					size="small"
					title="Clear"
					sx={{
						position: 'absolute',
						top: 0,
						right: 0,
						zIndex: 1,
						bgcolor: theme.palette.mode === 'light' ? theme.palette.grey[100] : theme.palette.grey[900],
					}}
					onClick={() => {
						setLogLines([]);
						void serial.logs.clear();
					}}
				>
					<ClearIcon sx={{ fontSize: 14 }} />
				</IconButton>
			</Show>
			<Box
				component="pre"
				aria-live="polite"
				ref={(el) => (logPreElement = el as HTMLPreElement)}
				onScroll={updateLogStickiness}
				onPointerDown={(e) => {
					isPointerPressedInsideLog = true;
					setStickToBottom(false);
					e.currentTarget.setPointerCapture?.(e.pointerId);
				}}
				onPointerUp={() => {
					isPointerPressedInsideLog = false;
					updateLogStickiness();
				}}
				onPointerCancel={() => {
					isPointerPressedInsideLog = false;
					updateLogStickiness();
				}}
				sx={{
					background: theme.palette.mode === 'light' ? theme.palette.grey[100] : theme.palette.grey[900],
					color: theme.palette.text.primary,
					p: 1,
					borderRadius: 1,
					height: props.height ?? `calc(6 * 1.4 * 0.75rem + 16px)`,
					overflow: 'auto',
					whiteSpace: 'pre-wrap',
					wordBreak: 'break-all',
					// keep text readable under the overlapping buttons
					pr: 4,
					m: 0,
					fontSize: '0.75rem',
					lineHeight: 1.4,
					fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
				}}
			>
				{logLines().length ? logLines().join('\n') : props.emptyMessage}
			</Box>
		</Box>
	);
};
