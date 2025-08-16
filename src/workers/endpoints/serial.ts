import * as Comlink from 'comlink';
import EventEmitter from "eventemitter3";
import { getSerialPort } from "@/utils/serial";
import { BfcService } from "@/workers/services/BfcService";
import { CgsnService } from "@/workers/services/CgsnService";
import { SerialService } from "../services/SerialService";
import { DwdService } from "../services/DwdService";
import { commonWorker } from "@/workers/endpoints/common";

export enum SerialReadyState {
	DISCONNECTED,
	CONNECTED,
	CONNECTING,
	DISCONNECTING
}

export type SerialProtocol = 'none' | 'BFC' | 'CGSN' | 'DWD';

type SerialWorkerEvents = {
	protocolChange: [SerialProtocol];
	readyStateChange: [SerialReadyState];
	serialPortChange: [string];
	deviceChange: [string | undefined];
};

type SerialWorkerServices = {
	CGSN: Comlink.Remote<CgsnService>;
	BFC: Comlink.Remote<BfcService>;
	DWD: Comlink.Remote<DwdService>;
};

const SERVICES: SerialWorkerServices = {
	BFC: await commonWorker.getService('BFC'),
	CGSN: await commonWorker.getService('CGSN'),
	DWD: await commonWorker.getService('DWD'),
};

export class Serial extends EventEmitter<SerialWorkerEvents> {
	private readyState: SerialReadyState = SerialReadyState.DISCONNECTED;
	private protocol: SerialProtocol = 'none';
	private device: string | undefined;
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
			this.setDevice(await this.service.getDeviceName() ?? "Unknown device");
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
		if (this.readyState == SerialReadyState.CONNECTED)
			this.setReadyState(SerialReadyState.DISCONNECTING);
		this.setDevice(undefined);
		await this.service.disconnect();
		this.setProtocol('none');
		this.setReadyState(SerialReadyState.DISCONNECTED);
	}

	async getPhoneName() {
		console.log(await this.service.getDeviceName());
		return this.service.getDeviceName();
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

	protected setDevice(device?: string): void {
		if (this.device != device) {
			this.device = device;
			this.emit('deviceChange', device);
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

export const serialWorker = new Serial();
