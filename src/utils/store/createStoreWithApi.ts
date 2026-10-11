import { type SetStoreFunction, createStore } from 'solid-js/store';
import { makePersistedStore, type PersistentStoreOptions } from '@/utils/store/makePersistedStore';

export interface CreateStoreWithApiOptions<S extends object> {
	persist?: PersistentStoreOptions<S>;
}

export function createStoreWithApi<S extends object, A>(
	initialData: () => S,
	createApi: (store: S, set: SetStoreFunction<S>) => A,
	options?: CreateStoreWithApiOptions<S>,
): () => [store: S, api: A] {
	const [store, setStore] = options?.persist ?
		makePersistedStore(createStore<S>(initialData()), options.persist) :
		createStore<S>(initialData());
	const value: [store: S, api: A] = [store, createApi(store, setStore)];
	return () => value;
}
