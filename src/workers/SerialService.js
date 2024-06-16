export class SerialService {
	port;
	handle;

	async connect(limitBaudrate = 0) {
		// stub
	}

	async disconnect() {
		// stub
	}

	sendEvent(event, data) {
		postMessage({ event: `${this.protocol()}:${event}`, ...data });
	}

	async _closeSerialPort() {
		try {
			if (this.port.isOpen) {
				await new Promise((resolve) => {
					this.port.close((e) => e ? reject(e) : resolve());
				});
			}
		} catch (e) {
			console.error(`[${this.protocol()}] port close error`, e);
		} finally {
			this.port = null;
		}
	}

	protocol() {
		return "UNKNOWN";
	}
}
