import { Component, For, Show } from 'solid-js';
import { Alert, AlertTitle, Box } from '@suid/material';
import type { FFSInfo } from '@/workers/services/FFSService';

interface FullFlashNoticesProps {
	info: FFSInfo;
}

// What was found broken in the fullflash, and what can't be written to as safely as the rest
export const FullFlashNotices: Component<FullFlashNoticesProps> = (props) => (
	<>
		<Show when={props.info.warnings.length}>
			<Alert severity="warning">
				<AlertTitle>Some blocks were found broken and are left out</AlertTitle>
				<Box component="ul" sx={{ m: 0, pl: 2, maxHeight: 200, overflow: 'auto', overflowWrap: 'anywhere' }}>
					<For each={props.info.warnings}>{(warning) =>
						<li>{warning}</li>
					}</For>
				</Box>
			</Alert>
		</Show>
		<Show when={props.info.platform == 'EGOLD_CE'}>
			<Alert severity="warning">Writing to EGOLD filesystems is experimental.</Alert>
		</Show>
		<Show when={props.info.platform == 'EGOLD'}>
			<Alert severity="info">Fullflashes of EGOLD phones without Card-Explorer open read only.</Alert>
		</Show>
	</>
);
