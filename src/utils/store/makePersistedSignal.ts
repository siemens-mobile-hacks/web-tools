import { debounce } from 'es-toolkit';
import type { Setter, Signal } from 'solid-js';

export interface PersistentSignalOptions {
	name: string;
	storage?: Storage;
	serialize?: (data: unknown) => string;
	deserialize?: (data: string) => unknown;
	debounce?: number;
}

export function makePersistedSignal<T>(
	signal: Signal<T>,
	options: PersistentSignalOptions,
): Signal<T> {
	const {
		name,
		storage = localStorage,
		serialize = JSON.stringify,
		deserialize = JSON.parse,
		debounce: debounceInterval = 0,
	} = options;

	try {
		const storedValue = storage.getItem(name);
		if (storedValue !== null)
			signal[1](() => deserialize(storedValue) as T);
	} catch (error) {
		console.warn(`Failed to load persisted signal "${name}"`, error);
	}

	const updateStorage = debounce(() => {
		try {
			storage.setItem(name, serialize(signal[0]()));
		} catch (error) {
			console.warn(`Failed to persist signal "${name}"`, error);
		}
	}, debounceInterval);
	const setWithPersistence: Setter<T> = new Proxy(signal[1], {
		apply(target, thisArg, args) {
			const result = Reflect.apply(target, thisArg, args);
			updateStorage();
			return result;
		},
	});

	return [signal[0], setWithPersistence];
}
