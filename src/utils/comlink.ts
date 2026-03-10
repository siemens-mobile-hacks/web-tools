import * as Comlink from "comlink";
import { isPlainObject } from 'es-toolkit/predicate';

interface ComlinkSerializedValue {
	type: string;
	value: any;
	__isComlinkSerializedValue: boolean;
}

export function initComlinkDataTransfers() {
	const bufferTransferHandler: Comlink.TransferHandler<Buffer, ArrayBufferLike> = {
		canHandle: (val): val is Buffer => val instanceof Buffer,
		serialize: (b) => [b.buffer, []],
		deserialize: (arr) => Buffer.from(arr),
	};
	Comlink.transferHandlers.set("BUFFER", bufferTransferHandler);

	const transferObjects: Comlink.TransferHandler<any, any> = {
		canHandle: (val): val is any => {
			return (Array.isArray(val) || isPlainObject(val)) && hasTransferable(val);
		},
		serialize: (val) => {
			const transferables: Transferable[] = [];
			return [toWireValueRecursive(val, transferables), transferables];
		},
		deserialize: (val) => {
			return fromWireValueRecursive(val);
		},
	};
	Comlink.transferHandlers.set("OBJECT", transferObjects);
}

function hasTransferable(value: any) {
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			if (hasTransferable(value[i]))
				return true;
		}
	} else if (isPlainObject(value)) {
		for (const key of Object.keys(value)) {
			if (hasTransferable(value[key]))
				return true;
		}
	} else if (typeof value === "object") {
		for (const [name, handler] of Comlink.transferHandlers) {
			if (name === "OBJECT")
				continue;
			if (handler.canHandle(value))
				return true;
		}
	}
	return false;
}

function fromWireValueRecursive(value: any): any {
	if (typeof value === "object" && '__isComlinkSerializedValue' in value) {
		const serializedValue = value as ComlinkSerializedValue;
		return Comlink.transferHandlers.get(serializedValue.type)!.deserialize(serializedValue.value);
	}
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++)
			value[i] = fromWireValueRecursive(value[i]);
		return value;
	} else if (isPlainObject(value)) {
		for (const key of Object.keys(value))
			value[key] = fromWireValueRecursive(value[key]);
		return value;
	}
	return value;
}

function toWireValueRecursive(value: any, transferables: Transferable[] = []): ComlinkSerializedValue | any {
	if (Array.isArray(value)) {
		let newArray: any[] | undefined;
		for (let i = 0; i < value.length; i++) {
			const serializedValue = toWireValueRecursive(value[i], transferables);
			if (serializedValue !== value[i]) {
				newArray = newArray || [ ...value ];
				newArray[i] = serializedValue;
			}
		}
		return newArray ?? value;
	} else if (isPlainObject(value)) {
		let newObject: Record<string, any> | undefined;
		for (const key of Object.keys(value)) {
			const serializedValue = toWireValueRecursive(value[key], transferables);
			if (serializedValue !== value[key]) {
				newObject = newObject || { ...value as Record<string, any> };
				newObject[key] = serializedValue;
			}
		}
		return newObject ?? value;
	} else if (typeof value === "object") {
		for (const [name, handler] of Comlink.transferHandlers) {
			if (name === "OBJECT")
				continue;
			if (handler.canHandle(value)) {
				const [serializedValue, newTransferables] = handler.serialize(value);
				if (newTransferables.length > 0)
					transferables.push(...newTransferables);
				return {
					type: name,
					value: serializedValue,
					__isComlinkSerializedValue: true,
				} as ComlinkSerializedValue;
			}
		}
	}
	return value;
}
