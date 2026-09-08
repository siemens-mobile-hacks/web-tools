import { Buffer } from 'buffer';
import { getVersionFromFFS, type XbiInfo } from '@sie-js/fw';
import JSZip from 'jszip';
import { sprintf } from 'sprintf-js';

export async function firmwareFileName(
	payload: Buffer,
	extension: string,
	fallback: string,
	xbi?: XbiInfo,
	flash?: Buffer,
): Promise<string> {
	let name: string | undefined;
	if (extension === 'map') {
		name = payload.toString().match(/<([^>]+)>\s*$/si)?.[1]?.replace(/_2D/g, '-');
	} else if (extension === 'xfs') {
		const version = flash && getVersionFromFFS(flash);
		if (version)
			name = `${version}.xfs`;
	} else if (xbi?.model && xbi.svn !== undefined && xbi.langpack) {
		const langpack = Number(xbi.langpack.replace(/^lg/, ''));
		if (Number.isNaN(langpack)) {
			name = sprintf('%s_%02d.%s', xbi.model, xbi.svn, extension);
		} else if (xbi.t9 !== undefined) {
			name = sprintf('%s_%02d%02d%02d.%s', xbi.model, xbi.svn, langpack, xbi.t9, extension);
		} else {
			name = sprintf('%s_%02d%02d.%s', xbi.model, xbi.svn, langpack, extension);
		}
	} else if (extension === 'zip') {
		try {
			const zip = await JSZip.loadAsync(payload);
			const version = await zip.file('Config/ccq_vinfo.txt')?.async('string');
			const firstLine = version?.split(/\r?\n/)[0].trim();
			if (firstLine)
				name = `${firstLine}.zip`;
		} catch {
			// Optional naming metadata must not prevent downloading the extracted archive.
		}
	}
	return (name || `${fallback}.${extension}`).replace(/[\\/\x00-\x1F]/g, '_');
}
