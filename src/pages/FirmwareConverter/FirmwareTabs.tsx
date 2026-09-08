import { type JSX, For } from 'solid-js';
import { Button, Stack } from '@suid/material';

interface FirmwareTabsProps<T extends string> {
	id: string;
	label: string;
	tabs: readonly { value: T; label: JSX.Element }[];
	value: T;
	onChange: (value: T) => void;
	disabled?: boolean;
}

function nextTabIndex(key: string, index: number, count: number): number | undefined {
	switch (key) {
		case 'Home':
			return 0;
		case 'End':
			return count - 1;
		case 'ArrowRight':
			return (index + 1) % count;
		case 'ArrowLeft':
			return (index + count - 1) % count;
	}
}

export const FirmwareTabs = <T extends string>(props: FirmwareTabsProps<T>) => {
	const selectWithKeyboard = (event: KeyboardEvent, index: number) => {
		const next = nextTabIndex(event.key, index, props.tabs.length);
		if (next === undefined)
			return;
		event.preventDefault();
		props.onChange(props.tabs[next].value);
		document.getElementById(`${props.id}-tab-${props.tabs[next].value}`)?.focus();
	};

	return (
		<Stack
			direction="row"
			flexWrap="wrap"
			role="tablist"
			aria-label={props.label}
			sx={{ borderBottom: 1, borderColor: 'divider' }}
		>
			<For each={props.tabs}>{(tab, index) =>
				<Button
					role="tab"
					id={`${props.id}-tab-${tab.value}`}
					aria-controls={`${props.id}-panel-${tab.value}`}
					aria-selected={props.value === tab.value}
					tabIndex={props.value === tab.value ? 0 : -1}
					disabled={props.disabled}
					onClick={() => props.onChange(tab.value)}
					onKeyDown={(event) => selectWithKeyboard(event, index())}
					sx={{
						borderRadius: 0,
						borderBottom: 2,
						px: 2,
						borderColor: props.value === tab.value ? 'primary.main' : 'transparent',
						color: props.value === tab.value ? 'primary.main' : 'text.secondary',
					}}
				>
					{tab.label}
				</Button>
			}</For>
		</Stack>
	);
};
