import { onCleanup } from 'solid-js';
import { recursiveMap } from '~/utils';
import SerialWorker from '~/workers/SerialWorker?worker';

let worker = new SerialWorker();
let receivers = {};
let eventHandlers = {};
let globalRequestId = 0;
let globalFunctionId = 0;

worker.onmessage = handleMessage;

async function sendRequest(method, data) {
	let requestId = globalRequestId++;

	let promise = new Promise((resolve, reject) => {
		receivers[requestId] = { resolve, reject, promise: null };
	});
	receivers[requestId].promise = promise;

	worker.postMessage({ method, requestId, data });
	return await receivers[requestId].promise;
}

function on(event, handler) {
	eventHandlers[event] = eventHandlers[event] || [];
	eventHandlers[event].push(handler);
}

function off(event, handler) {
	if (eventHandlers[event])
		eventHandlers[event] = eventHandlers[event].filter((h) => h !== handler);
}

function createProxyMethod(protocol, method) {
	return async (...methodArguments) => {
		recursiveMap(methodArguments, (value) => {
			return value;
		});
		return await sendRequest("rpc", { protocol, method, methodArguments });
	};
}

function getApiProxy(protocol) {
	let methodsCache = {};
	let api = {
		on: (event, handler) => on(`${protocol}:${event}`, handler),
		off: (event, handler) => off(`${protocol}:${event}`, handler),
	};
	return new Proxy(api, {
		get(target, prop, receiver) {
			if (prop in api) {
				return api[prop];
			} else {
				methodsCache[prop] = methodsCache[prop] || createProxyMethod(protocol, prop);
				return methodsCache[prop];
			}
		}
	});
}

function handleMessage(e) {
	if (e.data.response) {
		let receiver = receivers[e.data.requestId];
		if (receiver) {
			delete receivers[e.data.requestId];

			if ((e.data.response instanceof Error)) {
				receiver.reject(e.data.response);
			} else {
				receiver.resolve(e.data.response);
			}
		}
	} else if (e.data.event) {
		if (eventHandlers[e.data.event]) {
			for (let handler of eventHandlers[e.data.event])
				handler(e.data);
		}
	}
}

export default { on, off, sendRequest, getApiProxy };
