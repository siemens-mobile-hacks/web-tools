export const TRX_DEBUG_PATTERN = '*:trx';
export const SERIALPORT_DEBUG_PATTERN = 'serialport/*';

export const DEFAULT_DISABLED_DEBUG_CHANNELS = [
	SERIALPORT_DEBUG_PATTERN,
	TRX_DEBUG_PATTERN,
];

export const DEFAULT_DEBUG_FILTER = createDebugFilter(DEFAULT_DISABLED_DEBUG_CHANNELS);

export function setDebugChannelEnabled(
	disabledChannels: readonly string[],
	channel: string,
	enabled: boolean,
): string[] {
	const nextDisabledChannels = disabledChannels.filter((disabledChannel) => disabledChannel !== channel);
	if (!enabled)
		nextDisabledChannels.push(channel);
	return nextDisabledChannels;
}

export function createDebugFilter(disabledChannels: readonly string[]): string {
	return ['*', ...disabledChannels.map((channel) => `-${channel}`)].join(',');
}
