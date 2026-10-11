import createDebug from 'debug';
import { broadcastWorkerDebugFilter } from '@/utils/consoleRelay';
import { createStoreWithApi } from '@/utils/store/createStoreWithApi';
import {
	createDebugFilter,
	DEFAULT_DISABLED_DEBUG_CHANNELS,
	setDebugChannelEnabled,
} from '@/utils/debugChannels';

export interface DebugSettings {
	disabledChannels: string[];
}

interface DebugSettingsApi {
	filter(): string;
	isChannelEnabled(channel: string): boolean;
	setChannelEnabled(channel: string, enabled: boolean): void;
}

export const useDebugSettings = createStoreWithApi<DebugSettings, DebugSettingsApi>(
	() => ({
		disabledChannels: [...DEFAULT_DISABLED_DEBUG_CHANNELS],
	}),
	(store, setStore) => {
		applyDebugFilter(store.disabledChannels);
		return {
			filter() {
				return createDebugFilter(store.disabledChannels);
			},
			isChannelEnabled(channel) {
				return !store.disabledChannels.includes(channel);
			},
			setChannelEnabled(channel, enabled) {
				const disabledChannels = setDebugChannelEnabled(store.disabledChannels, channel, enabled);
				setStore('disabledChannels', disabledChannels);
				applyDebugFilter(disabledChannels);
			},
		};
	},
	{
		persist: {
			name: 'debugSettings',
		},
	},
);

function applyDebugFilter(disabledChannels: readonly string[]): void {
	const filter = createDebugFilter(disabledChannels);
	createDebug.enable(filter);
	broadcastWorkerDebugFilter(filter);
}
