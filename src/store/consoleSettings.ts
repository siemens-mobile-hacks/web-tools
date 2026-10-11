import { createStore } from 'solid-js/store';
import { makePersistedStore } from '@/utils/store/makePersistedStore';

export type ConsoleDock = 'bottom' | 'overlay' | 'right';

export interface ConsoleSettings {
	dock: ConsoleDock;
	open: boolean;
	overlayHeight?: number;
	panelHeight?: number;
	panelWidth?: number;
}

export function createConsoleSettingsStore() {
	return makePersistedStore(
		createStore<ConsoleSettings>({
			dock: 'right',
			open: false,
		}),
		{
			name: 'consoleSettings',
			debounce: 100,
		},
	);
}
