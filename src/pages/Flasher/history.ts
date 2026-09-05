// Patch history: a persistent log of every applied/undone VKP patch.
//
// The web analog of V_KLay's patch logging (CPatchPage::DoPatchLogging in
// PatchPage.cpp): after a successful apply or undo V_KLay saves the patch
// text into its log directory and hands it over to log.exe/log.bat together
// with the device unique name and the /a (apply) or /u (undo) flag. Here the
// entries are kept in localStorage instead, and the History tab is the log
// viewer.

// localStorage key with the JSON array of the entries (newest first).
const STORAGE_KEY = "flasher.patchHistory";
// Hard cap of the kept entries (the oldest are dropped first).
const MAX_ENTRIES = 200;

// The device description of a patch operation, filled by the Flasher page
// for the phone and the fullflash file modes (V_KLay's DoPatchLogging passes
// the same kind of information to its log script).
export interface PatchLogContext {
	source: "phone" | "file";
	model: string;
	imei: string;
	deviceName: string;
	info: string;
}

export interface PatchHistoryEntry {
	id: string;
	// When the operation finished, ISO timestamp.
	date: string;
	// apply = patch written to the device, revert = undo.
	action: "apply" | "revert";
	// Where it was applied: a real phone (WebSerial) or a fullflash dump.
	source: "phone" | "file";
	// Phone model from the driver (or dump file name prefix).
	model: string;
	// Phone IMEI, when the loader reports it (x65 flash info v3).
	imei: string;
	// Device name analog of V_KLay's VDevice::GetUniqueName().
	deviceName: string;
	// Flash info line (fw version) or the dump address/size description.
	info: string;
	// The .vkp file name (or the generated patch name).
	patchName: string;
	// First comment line of the patch, like V_KLay shows in the open dialog.
	patchTitle: string;
	// Number of writes in the patch and bytes actually written.
	writes: number;
	written: number;
	// The full patch text (V_KLay saves it as log.vkp). Dropped for old
	// entries when the storage quota is exceeded.
	text: string;
}

function resolveStorage(): Storage | undefined {
	try {
		return typeof globalThis.localStorage !== "undefined"
			? globalThis.localStorage
			: undefined;
	} catch {
		return undefined;
	}
}

function isValidEntry(value: any): value is PatchHistoryEntry {
	return !!value
		&& typeof value.id == "string"
		&& typeof value.date == "string"
		&& (value.action == "apply" || value.action == "revert")
		&& (value.source == "phone" || value.source == "file")
		&& typeof value.model == "string"
		&& typeof value.imei == "string"
		&& typeof value.deviceName == "string"
		&& typeof value.info == "string"
		&& typeof value.patchName == "string"
		&& typeof value.patchTitle == "string"
		&& typeof value.writes == "number"
		&& typeof value.written == "number"
		&& typeof value.text == "string";
}

// Loads the history, newest first. Broken data is skipped, not fatal.
export function loadPatchHistory(storage: Storage | undefined = resolveStorage()): PatchHistoryEntry[] {
	if (!storage)
		return [];
	try {
		const raw = storage.getItem(STORAGE_KEY);
		const parsed = raw ? JSON.parse(raw) : [];
		if (!Array.isArray(parsed))
			return [];
		return parsed.filter(isValidEntry);
	} catch (e) {
		console.error("Failed to read the patch history", e);
		return [];
	}
}

// Saves the entries (newest first). When the quota is exceeded, the patch
// texts of the oldest entries are dropped first (the entry itself is kept),
// then the oldest entries are dropped.
export function savePatchHistory(
	entries: PatchHistoryEntry[],
	storage: Storage | undefined = resolveStorage(),
): boolean {
	if (!storage)
		return false;
	const list = entries.slice(0, MAX_ENTRIES);
	for (let removed = 0; removed <= list.length; removed++) {
		// The `removed` oldest entries are dropped completely.
		const keptList = list.slice(0, list.length - removed);
		for (let dropped = 0; dropped <= keptList.length; dropped++) {
			// The `dropped` oldest of the kept entries lose their patch text.
			const kept = keptList.map((entry, i) =>
				i >= keptList.length - dropped ? { ...entry, text: "" } : entry);
			try {
				storage.setItem(STORAGE_KEY, JSON.stringify(kept));
				return true;
			} catch (e: any) {
				if (!(e && (e.name == "QuotaExceededError" || e.code == 22 || e.code == 1014)))
					throw e;
			}
		}
	}
	return false;
}

// Adds a new entry on top of the history (V_KLay DoPatchLogging on apply/undo).
// Returns the new list; the list is unchanged when the storage is missing.
export function addPatchHistoryEntry(
	entry: PatchHistoryEntry,
	storage: Storage | undefined = resolveStorage(),
): PatchHistoryEntry[] {
	const list = [entry, ...loadPatchHistory(storage)].slice(0, MAX_ENTRIES);
	if (!savePatchHistory(list, storage))
		return loadPatchHistory(storage);
	return list;
}

export function deletePatchHistoryEntry(
	id: string,
	storage: Storage | undefined = resolveStorage(),
): PatchHistoryEntry[] {
	const list = loadPatchHistory(storage).filter((entry) => entry.id != id);
	savePatchHistory(list, storage);
	return list;
}

export function clearPatchHistory(storage: Storage | undefined = resolveStorage()): PatchHistoryEntry[] {
	if (storage) {
		try {
			storage.removeItem(STORAGE_KEY);
		} catch (e) {
			console.error("Failed to clear the patch history", e);
		}
	}
	return [];
}

export function newPatchHistoryId(): string {
	return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

// The patch title: the first comment line, like V_KLay uses it as the
// caption of a patch (GetPatchTitle analog).
export function vkpPatchTitle(text: string): string {
	for (const line of text.split(/\r?\n/)) {
		const match = line.match(/^\s*;\s*(.*\S)/);
		if (match)
			return match[1];
	}
	return "";
}

// Best-effort phone model guess from a dump file name ("S55_2020-..._From_40.bin" → "S55").
// Siemens model names start with a capital letter (S55, CXV70, M65, SL45).
export function dumpModelFromFileName(name: string): string {
	const base = name.replace(/\.(bin|fls|ful|vkp)$/i, "");
	const first = base.split(/[\s_]+/)[0] ?? "";
	return /^[A-Z][A-Za-z0-9-]{0,9}$/.test(first) ? first : "";
}
