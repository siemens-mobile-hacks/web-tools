import { debounce } from 'es-toolkit';
import { type SetStoreFunction, type Store, reconcile, unwrap } from 'solid-js/store';

export type PersistentStore<T extends object> = [get: Store<T>, set: SetStoreFunction<T>];

interface PersistentStoreInternal {
	version: number;
	state: unknown;
}

export interface PersistentStoreOptions<T extends object> {
	name: string;
	storage?: Storage;
	version?: number;
	serialize?: (data: unknown) => string;
	deserialize?: (data: string) => unknown;
	migrate?: (persistedState: unknown, version: number) => T;
	merge?: (persistedState: T, currentState: T) => T;
	skipLoad?: boolean;
	debounce?: number;
}

export function makePersistedStore<T extends object>(
	store: [Store<T>, SetStoreFunction<T>],
	options: PersistentStoreOptions<T>,
): PersistentStore<T> {
	const {
		name,
		storage = localStorage,
		version = 0,
		migrate = (persistedState) => persistedState,
		merge = (persistedState, currentState) => ({ ...currentState, ...persistedState }),
		serialize = JSON.stringify,
		deserialize = JSON.parse,
		skipLoad,
		debounce: debounceInterval = 0,
	} = options;

	if (!skipLoad) {
		try {
			const storedValue = storage.getItem(name);
			if (storedValue !== null) {
				const parsed = deserialize(storedValue) as PersistentStoreInternal;
				const persistedState = parsed.version === version ?
					parsed.state :
					migrate(parsed.state, parsed.version);
				store[1](reconcile(merge(persistedState as T, unwrap(store[0]))));
			}
		} catch (error) {
			console.warn(`Failed to load persisted store "${name}"`, error);
		}
	}

	const updateStorage = debounce(() => {
		try {
			storage.setItem(name, serialize({
				version,
				state: unwrap(store[0]),
			} satisfies PersistentStoreInternal));
		} catch (error) {
			console.warn(`Failed to persist store "${name}"`, error);
		}
	}, debounceInterval);

	const setStore = store[1] as (...args: unknown[]) => void;
	const setWithPersistence = ((...args: unknown[]) => {
		setStore(...args);
		updateStorage();
	}) as SetStoreFunction<T>;

	return [store[0], setWithPersistence];
}
