import { createSignal } from 'solid-js';

const STORAGE_KEY = "siemens-web-tools";

let storageData;

function loadStorage() {
	if (!storageData) {
		try {
			storageData = JSON.parse(localStorage.getItem(STORAGE_KEY) || `{}`);
		} catch (e) { }
	}
	return storageData;
}

function has(key) {
	const storage = loadStorage();
	return key in storage;
}

function get(key) {
	const storage = loadStorage();
	return storage[key];
}

function set(key, value) {
	const storage = loadStorage();
	storage[key] = value;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
}

function createStoredSignal(key, defaultValue) {
	const initialValue = has(key) ? get(key) : defaultValue;
	const [value, setValue] = createSignal(initialValue);

	const setValueAndStore = (newValue) => {
		const ret = setValue(newValue);
		set(key, newValue);
		return ret;
	};
	return [value, setValueAndStore];
}

export { createStoredSignal };
export default { get, set, has };
