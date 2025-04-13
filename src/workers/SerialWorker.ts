import WorkerModule from './worker?worker';
import * as Comlink from 'comlink';
import EventEmitter from "eventemitter3";
import { getSerialPort } from "@/utils/serial.js";
import { BfcService } from "@/workers/services/BfcService.js";
import { CgsnService } from "@/workers/services/CgsnService.js";
import { SerialService } from "./services/SerialService";

export enum SerialReadyState {
	DISCONNECTED,
	CONNECTED,
	CONNECTING,
	DISCONNECTING
}

export type SerialProtocol = 'none' | 'BFC' | 'CGSN';

interface RemoteSerialWorker {
	getService(name: SerialProtocol): any;
}

type SerialWorkerEvents = {
	protocolChange: [SerialProtocol];
	readyStateChange: [SerialReadyState];
	serialPortChange: [string];
};

type SerialWorkerServices = {
	CGSN: Comlink.Remote<CgsnService>;
	BFC: Comlink.Remote<BfcService>;
};

const remoteSerialWorker = Comlink.wrap<RemoteSerialWorker>(new WorkerModule());
const SERVICES: SerialWorkerServices = {
	BFC: await remoteSerialWorker.getService('BFC'),
	CGSN: await remoteSerialWorker.getService('CGSN'),
};

export class SerialWorker extends EventEmitter<SerialWorkerEvents> {
	private readyState: SerialReadyState = SerialReadyState.DISCONNECTED;
	private protocol: SerialProtocol = 'none';
	private lastPortPath?: string;

	protected get service(): Comlink.Remote<SerialService> {
		if (!SERVICES[this.protocol as keyof typeof SERVICES])
			throw new Error(`Can't get service for protocol ${this.protocol}.`);
		return SERVICES[this.protocol as keyof typeof SERVICES];
	}

	async connect(protocol: SerialProtocol, prevPortPath?: string, limitBaudrate?: number, debug?: string): Promise<void> {
		if (this.readyState == SerialReadyState.CONNECTING || this.readyState == SerialReadyState.CONNECTED)
			throw new Error(`Can't connect, already connected to ${this.protocol}.`);

		this.setProtocol(protocol);
		this.setReadyState(SerialReadyState.CONNECTING);
		try {
			const { index: portIndex, path: portPath } = await getSerialPort(prevPortPath);
			this.setLastPortPath(portPath);
			if (debug)
				await this.service.setDebug(debug);
			await this.service.connect(portIndex, limitBaudrate);
			this.setReadyState(SerialReadyState.CONNECTED);
		} catch (e) {
			try {
				await this.disconnect();
			} catch (e) {
				console.error(e);
			}
			throw e;
		}
	}

	async disconnect(): Promise<void> {
		if (this.readyState == SerialReadyState.DISCONNECTED || this.readyState == SerialReadyState.DISCONNECTING)
			return;
		this.setReadyState(SerialReadyState.DISCONNECTING);
		await this.service.disconnect();
		this.setProtocol('none');
		this.setReadyState(SerialReadyState.DISCONNECTED);
	}

	getLastPortPath() {
		return this.lastPortPath;
	}

	async setDebug(filter: string): Promise<void> {
		await this.service.setDebug(filter);
	}

	protected setLastPortPath(path: string): void {
		if (this.lastPortPath != path) {
			this.lastPortPath = path;
			this.emit('serialPortChange', path);
		}
	}

	protected setProtocol(protocol: SerialProtocol): void {
		if (this.protocol != protocol) {
			this.protocol = protocol;
			this.emit('protocolChange', protocol);
		}
	}

	protected setReadyState(state: SerialReadyState): void {
		if (this.readyState != state) {
			this.readyState = state;
			this.emit('readyStateChange', state);
		}
	}

	getService<T extends keyof typeof SERVICES>(type: T): typeof SERVICES[T] {
		return SERVICES[type];
	}
}

export const serialWorker = new SerialWorker();
