import { FFS, FFSOpenOptions } from "@sie-js/libffshit";

export class FFSService {
	private handle = new FFS();

	async open(file: File, options: FFSOpenOptions = {}) {
		console.log("open", file, options);

		const fullflash = Buffer.from(await file.arrayBuffer());
		await this.handle.open(fullflash, options);

		console.log(this.getInfo());
	}

	getFilesTree() {
		return this.handle.getFilesTree();
	}

	getInfo() {
		return {
			model: this.handle.getModel(),
			platform: this.handle.getPlatform(),
			imei: this.handle.getIMEI(),
		};
	}

	close() {
		this.handle.close();
	}
}
