import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	PatchHistoryEntry, addPatchHistoryEntry, clearPatchHistory, deletePatchHistoryEntry,
	dumpModelFromFileName, loadPatchHistory, savePatchHistory, vkpPatchTitle,
} from '../pages/Flasher/history.js';

// A minimal localStorage stub for Node.js.
class MemoryStorage implements Storage {
	public store = new Map<string, string>();

	get length(): number {
		return this.store.size;
	}

	clear(): void {
		this.store.clear();
	}

	getItem(key: string): string | null {
		return this.store.get(key) ?? null;
	}

	key(index: number): string | null {
		return [...this.store.keys()][index] ?? null;
	}

	removeItem(key: string): void {
		this.store.delete(key);
	}

	setItem(key: string, value: string): void {
		this.store.set(key, value);
	}
}

// A storage that refuses everything above the given JSON size (quota).
class QuotaStorage extends MemoryStorage {
	public used = 0;

	constructor(public limit: number) {
		super();
	}

	setItem(key: string, value: string): void {
		if (this.used + value.length > this.limit) {
			const e: any = new Error("quota exceeded");
			e.name = "QuotaExceededError";
			e.code = 22;
			throw e;
		}
		this.store.set(key, value);
		this.used += value.length;
	}
}

function makeEntry(overrides: Partial<PatchHistoryEntry> = {}): PatchHistoryEntry {
	return {
		id: Math.random().toString(36).slice(2),
		date: new Date().toISOString(),
		action: "apply",
		source: "phone",
		model: "S55",
		imei: "356079001234567",
		deviceName: "S55",
		info: "SIEMENS S55 IMEI 356079001234567",
		patchName: "test.vkp",
		patchTitle: "Test patch",
		writes: 2,
		written: 8,
		text: "; Test patch\n0x402BB4: F0F0F0F0 F1F1F1F1",
		...overrides,
	};
}

test("patch history roundtrip: newest first", () => {
	const storage = new MemoryStorage();
	const first = addPatchHistoryEntry(makeEntry({ id: "a", patchTitle: "first" }), storage);
	addPatchHistoryEntry(makeEntry({ id: "b", patchTitle: "second" }), storage);
	const loaded = loadPatchHistory(storage);
	assert.equal(loaded.length, 2);
	assert.equal(loaded[0].id, "b");
	assert.deepEqual(first.map((e) => e.id), ["a"]);
});

test("patch history survives broken storage data", () => {
	const storage = new MemoryStorage();
	storage.setItem("flasher.patchHistory", "{not json");
	assert.deepEqual(loadPatchHistory(storage), []);
	storage.setItem("flasher.patchHistory", JSON.stringify([{ id: 5 }, "junk", makeEntry({ id: "ok" })]));
	assert.deepEqual(loadPatchHistory(storage).map((e) => e.id), ["ok"]);
});

test("patch history is capped", () => {
	const storage = new MemoryStorage();
	let list: PatchHistoryEntry[] = [];
	for (let i = 0; i < 250; i++)
		list = addPatchHistoryEntry(makeEntry({ id: `e${i}` }), storage);
	assert.equal(list.length, 200);
	// The oldest entries are dropped.
	assert.ok(!list.some((e) => e.id == "e0"));
	assert.ok(list.some((e) => e.id == "e249"));
});

test("patch history delete and clear", () => {
	const storage = new MemoryStorage();
	addPatchHistoryEntry(makeEntry({ id: "a" }), storage);
	addPatchHistoryEntry(makeEntry({ id: "b" }), storage);
	assert.deepEqual(deletePatchHistoryEntry("a", storage).map((e) => e.id), ["b"]);
	assert.deepEqual(clearPatchHistory(storage), []);
	assert.deepEqual(loadPatchHistory(storage), []);
});

test("patch history quota: oldest patch texts are dropped first", () => {
	const entries = [
		makeEntry({ id: "new", text: "x".repeat(100) }),
		makeEntry({ id: "mid", text: "x".repeat(100) }),
		makeEntry({ id: "old", text: "x".repeat(100) }),
	];
	// Enough room for everything except the last patch text.
	const budget = JSON.stringify(entries).length - 100;
	const storage = new QuotaStorage(budget);
	assert.equal(savePatchHistory(entries, storage), true);
	const loaded = loadPatchHistory(storage);
	assert.equal(loaded.length, 3);
	// The entry itself is kept, its patch text is dropped.
	assert.equal(loaded[2].text, "");
	assert.equal(loaded[2].id, "old");
	assert.equal(loaded[1].text, "x".repeat(100));
	assert.equal(loaded[0].text, "x".repeat(100));
});

test("patch history quota: entries are dropped when even texts are not enough", () => {
	const entries = [
		makeEntry({ id: "new", text: "" }),
		makeEntry({ id: "old", text: "" }),
	];
	const storage = new QuotaStorage(10);
	assert.equal(savePatchHistory(entries, storage), true);
	const loaded = loadPatchHistory(storage);
	assert.ok(loaded.length < 2);
});

test("vkpPatchTitle: the first comment line", () => {
	assert.equal(vkpPatchTitle("; My patch\n; more\n0x402BB4: F0F0F0F0 F1F1F1F1"), "My patch");
	assert.equal(vkpPatchTitle("\r\n\r\n  ;   Spaced title with trailing   \r\n0x1: AA BB"), "Spaced title with trailing");
	assert.equal(vkpPatchTitle("0x402BB4: F0F0F0F0 F1F1F1F1"), "");
	assert.equal(vkpPatchTitle(""), "");
});

test("dumpModelFromFileName: the V_KLay dump name prefix", () => {
	assert.equal(dumpModelFromFileName("S55_2005-01-02_03-04-05_From_40.bin"), "S55");
	assert.equal(dumpModelFromFileName("CXV70_2020-01-02_03-04-05_From_A0.bin"), "CXV70");
	assert.equal(dumpModelFromFileName("fullflash.bin"), "");
	assert.equal(dumpModelFromFileName(""), "");
});
