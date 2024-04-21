import { createSignal } from 'solid-js';
import Button from '@suid/material/Button';

function CopyButton(props) {
	let timeout;
	let [isCopied, setIsCopied] = createSignal(false);

	let onClick = () => {
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
			variant="contained"
			color={isCopied() ? 'success' : 'primary'}
			disabled={props.disabled}
			onClick={onClick}
		>
			{isCopied() ? 'Copied' : 'Copy'}
		</Button>
	);
}

export default CopyButton;
