import { Component, For, createEffect, createMemo, on } from 'solid-js';
import { Box } from '@suid/material';
import { useTheme } from '@suid/material/styles';
import { tokenizeVkp } from '@/pages/Flasher/vkpHighlight';

// ---------------------------------------------------------------------
// VKP syntax highlighting editor.
//
// A transparent <textarea> is rendered on top of a <pre> layer with the
// same geometry, font and wrap settings, so the colored copy below stays
// pixel-aligned with the text being typed:
//   - comments (; // # /* */) - gray
//   - old data (first group after "address:") - red
//   - new data (second group, or the only group) - green

export interface VkpEditorProps {
	value: string;
	onInput: (value: string) => void;
	placeholder?: string;
	minRows?: number;
	maxRows?: number;
	disabled?: boolean;
}

export const VkpEditor: Component<VkpEditorProps> = (props) => {
	const theme = useTheme();

	const kindColors = createMemo(() => ({
		comment: theme.palette.text.secondary,
		old: theme.palette.error.main,
		new: theme.palette.success.main,
		plain: theme.palette.text.primary,
	}));

	const tokens = createMemo(() => tokenizeVkp(props.value));

	let textareaRef: HTMLTextAreaElement | undefined;
	let highlightRef: HTMLPreElement | undefined;

	// Auto-grow like TextField multiline: clamp between minRows and maxRows.
	const resize = () => {
		const ta = textareaRef;
		if (!ta)
			return;
		ta.style.height = 'auto';
		const style = getComputedStyle(ta);
		const lineHeight = parseFloat(style.lineHeight) || 18;
		const paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
		const min = (props.minRows ?? 6) * lineHeight + paddingY;
		const max = (props.maxRows ?? 20) * lineHeight + paddingY;
		ta.style.height = Math.min(max, Math.max(min, ta.scrollHeight)) + 'px';
	};
	createEffect(on(() => props.value, resize, { defer: false }));

	const onScroll = () => {
		if (highlightRef && textareaRef)
			highlightRef.scrollTop = textareaRef.scrollTop;
	};

	const sharedSx = {
		margin: 0,
		padding: '16.5px 14px',
		border: 0,
		fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
		fontSize: '0.75rem',
		lineHeight: 1.5,
		whiteSpace: 'pre-wrap',
		overflowWrap: 'break-word',
		wordBreak: 'normal',
		tabSize: 4,
	} as const;

	const outlinedBorder = theme.palette.mode === 'light'
		? 'rgba(0, 0, 0, 0.23)'
		: 'rgba(255, 255, 255, 0.23)';
	const outlinedBorderHover = theme.palette.mode === 'light'
		? 'rgba(0, 0, 0, 0.87)'
		: 'rgba(255, 255, 255, 0.87)';

	return (
		<Box
			sx={{
				position: 'relative',
				width: '100%',
				border: '1px solid',
				borderColor: outlinedBorder,
				borderRadius: '4px',
				overflow: 'hidden',
				backgroundColor: theme.palette.background.paper,
				'&:hover': { borderColor: outlinedBorderHover },
				'&:focus-within': { borderColor: theme.palette.primary.main },
			}}
		>
			<Box
				ref={highlightRef}
				component="pre"
				aria-hidden
				sx={{
					...sharedSx,
					position: 'absolute',
					inset: 0,
					overflow: 'hidden',
					pointerEvents: 'none',
					color: kindColors().plain,
				}}
			>
				<For each={tokens()}>{(t) =>
					<Box component="span" sx={{ color: kindColors()[t.kind] }}>{t.text}</Box>
				}</For>
			</Box>
			<Box
				component="textarea"
				ref={textareaRef}
				value={props.value}
				placeholder={props.placeholder}
				disabled={props.disabled}
				spellcheck={false}
				onInput={(e) => props.onInput(e.currentTarget.value)}
				onScroll={onScroll}
				sx={{
					...sharedSx,
					position: 'relative',
					display: 'block',
					width: '100%',
					resize: 'none',
					outline: 'none',
					background: 'transparent',
					color: 'transparent',
					caretColor: kindColors().plain,
					'&::placeholder': {
						color: theme.palette.text.secondary,
						opacity: 1,
					},
				}}
			/>
		</Box>
	);
};
