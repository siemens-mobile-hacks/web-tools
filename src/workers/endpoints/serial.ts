import * as Comlink from 'comlink';
import EventEmitter from "eventemitter3";
import { resolveSerialPortPath } from '@/utils/serial';
import { BfcService } from "@/workers/services/BfcService";
import { CgsnService } from "@/workers/services/CgsnService";
import { SerialService } from "../services/SerialService";
import { DwdService } from "../services/DwdService";
import { ObexService } from "../services/ObexService";
import { FlasherService } from "@/workers/services/FlasherService";
import { commonWorker } from "@/workers/endpoints/common";
import { BfbService } from "@/workers/services/BfbService";

export type SerialProtocol = 'none' | 'BFB' | 'BFC' | 'CGSN' | 'DWD' | 'OBEX' | 'FLSH';

type SerialWorkerEvents = {
	protocolChange: [SerialProtocol];
	readyStateChange: [SerialReadyState];
	serialPortChange: [string];
	deviceChange: [string | undefined];
};

type SerialWorkerServices = {
	BFB: Comlink.Remote<BfbService>;
	CGSN: Comlink.Remote<CgsnService>;
	BFC: Comlink.Remote<BfcService>;
	DWD: Comlink.Remote<DwdService>;
	OBEX: Comlink.Remote<ObexService>;
	FLSH: Comlink.Remote<FlasherService>;
};

export enum SerialReadyState {
	DISCONNECTED,
	CONNECTED,
	CONNECTING,
	DISCONNECTING
}

const SERVICES: SerialWorkerServices = {
	BFB: await commonWorker.getService('BFB'),
	BFC: await commonWorker.getService('BFC'),
	CGSN: await commonWorker.getService('CGSN'),
	DWD: await commonWorker.getService('DWD'),
	OBEX: await commonWorker.getService('OBEX'),
	FLSH: await commonWorker.getService('FLSH'),
};

export class Serial extends EventEmitter<SerialWorkerEvents> {
	private readyState: SerialReadyState = SerialReadyState.DISCONNECTED;
	private protocol: SerialProtocol = 'none';
	private device: string | undefined;
	private lastPortPath?: string;

	protected get service(): Comlink.Remote<SerialService> {
		const protocol = this.protocol;
		if (protocol === 'none')
			throw new Error(`Can't get service for protocol ${protocol}.`);
		return SERVICES[protocol];
	}

	async connect(protocol: SerialProtocol, prevPortPath?: string, limitBaudrate?: number, data?: any): Promise<void> {
		if (this.readyState == SerialReadyState.CONNECTING || this.readyState == SerialReadyState.CONNECTED)
			throw new Error(`Can't connect, already connected to ${this.protocol}.`);

		this.setProtocol(protocol);
		this.setReadyState(SerialReadyState.CONNECTING);
		try {
			if (!prevPortPath)
				throw new Error('No serial transport is available.');
			const portPath = await resolveSerialPortPath(prevPortPath);
			await this.service.connect(portPath, limitBaudrate, data);
			this.setLastPortPath(portPath);
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
