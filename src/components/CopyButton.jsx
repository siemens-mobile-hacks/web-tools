import { createSignal } from 'solid-js';
import Button from '@suid/material/Button';
import ContentCopyIcon from '@suid/icons-material/ContentCopy';
import DoneIcon from '@suid/icons-material/Done';

function CopyButton(props) {
	let timeout;
	const [isCopied, setIsCopied] = createSignal(false);

	const onClick = () => {
		setIsCopied(true);
		timeout && clearTimeout(timeout);
		timeout = setTimeout(() => {
			timeout = false;
			setIsCopied(false);
		}, 1000);
		props.onCopy();
	};

	return (
		<Button
			color={isCopied() ? 'success' : 'primary'}
			disabled={props.disabled}
			onClick={onClick}
			{...props}
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

export default CopyButton;
