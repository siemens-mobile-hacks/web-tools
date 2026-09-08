import type { Component } from 'solid-js';
import { TableRow } from '@suid/material';
import type { CustomItemComponentProps } from 'virtua/solid';

export const FirmwareBlockRow: Component<CustomItemComponentProps> = (props) => {
	return (
		<TableRow ref={props.ref} style={props.style} aria-rowindex={props.index + 2}>
			{props.children}
		</TableRow>
	);
};
