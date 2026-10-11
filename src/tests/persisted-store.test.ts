import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import { makePersistedSignal } from '../utils/store/makePersistedSignal.js';
import { makePersistedStore } from '../utils/store/makePersistedStore.js';

interface TestSettings {
	enabled: boolean;
	label: string;
}

test('persisted store merges saved values with current defaults', () => {
	const storage = new MemoryStorage();
	storage.setItem('settings', JSON.stringify({
		version: 0,
		state: { enabled: false },
	}));
	const [settings] = makePersistedStore(
		createStore<TestSettings>({ enabled: true, label: 'new default' }),
		{ name: 'settings', storage },
	);

	assert.deepEqual(settings, { enabled: false, label: 'new default' });
});

test('persisted store ignores malformed JSON', () => {
	const storage = new MemoryStorage();
	storage.setItem('settings', '{');
	const originalWarn = console.warn;
	console.warn = () => undefined;
	try {
		const [settings] = makePersistedStore(
			createStore<TestSettings>({ enabled: true, label: 'default' }),
			{ name: 'settings', storage },
		);
		assert.deepEqual(settings, { enabled: true, label: 'default' });
	} finally {
		console.warn = originalWarn;
	}
});

test('persisted store writes updates through the wrapped setter', async () => {
	const storage = new MemoryStorage();
	const [, setSettings] = makePersistedStore(
		createStore<TestSettings>({ enabled: true, label: 'default' }),
		{ name: 'settings', storage },
	);

	setSettings('enabled', false);
	await waitForPersistence();

	assert.deepEqual(JSON.parse(storage.getItem('settings') ?? ''), {
		version: 0,
		state: { enabled: false, label: 'default' },
	});
});

test('persisted signal preserves the Solid setter result', async () => {
	const storage = new MemoryStorage();
	const [value, setValue] = makePersistedSignal(createSignal(1), { name: 'value', storage });

	const result = setValue((current) => current + 1);
	await waitForPersistence();

	assert.equal(result, 2);
	assert.equal(value(), 2);
	assert.equal(JSON.parse(storage.getItem('value') ?? ''), 2);
});

class MemoryStorage implements Storage {
	readonly values = new Map<string, string>();

	get length(): number {
		return this.values.size;
	}

	clear(): void {
		this.values.clear();
	}

	getItem(key: string): string | null {
		return this.values.get(key) ?? null;
	}

	key(index: number): string | null {
		return [...this.values.keys()][index] ?? null;
	}

	removeItem(key: string): void {
		this.values.delete(key);
	}

	setItem(key: string, value: string): void {
		this.values.set(key, value);
	}
}

function waitForPersistence(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}
