import { Component, createSignal, Show } from 'solid-js';
import { Button } from '@suid/material';
import ContentCopyIcon from '@suid/icons-material/ContentCopy';
import DoneIcon from '@suid/icons-material/Done';

export interface CopyButtonProps {
	onCopy: () => void;
	disabled?: boolean;
}

export const CopyButton: Component<CopyButtonProps> = (props) => {
	let timeout: NodeJS.Timeout | undefined;
	const [isCopied, setIsCopied] = createSignal<boolean>(false);

	const onClick = (): void => {
		setIsCopied(true);
		timeout && clearTimeout(timeout);
		timeout = setTimeout(() => {
			timeout = undefined;
			setIsCopied(false);
		}, 1000);
		props.onCopy();
	};

	return (
		<Button
			color={isCopied() ? 'success' : 'primary'}
			variant="outlined"
			sx={{ minWidth: 0, padding: "6px" }}
			disabled={props.disabled}
			onClick={onClick}
		>
			<Show when={isCopied()}>
				<DoneIcon />
			</Show>

			<Show when={!isCopied()}>
				<ContentCopyIcon />
			</Show>
		</Button>
	);
}
