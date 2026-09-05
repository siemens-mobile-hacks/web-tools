// ---------------------------------------------------------------------
// VKP tokenizer for the syntax highlighted patch editor.
//
// Line-based, mirroring the VKP grammar from @sie-js/vkp: each record is
// "address: oldData newData ; comment". The result must reconstruct the
// input text exactly (kinds only add color), so the highlight layer stays
// pixel-aligned with the transparent <textarea> above it.

export interface VkpToken {
	text: string;
	kind: 'comment' | 'old' | 'new' | 'plain';
}

const RE_WS = /^\s+/;
const RE_ADDRESS = /^(?:0[xX])?[0-9a-fA-F]+:/;
const RE_OFFSET = /^[+-](?:0[xX])?[0-9a-fA-F]+(?![0-9a-zA-Z:])/;
const RE_PRAGMA = /^#[ \t]*pragma[ \t\w]+/;
const RE_WORD = /^[^\s,;/#]+/;

function isCommentStart(line: string, i: number): boolean {
	if (line[i] === ';' || line.startsWith('//', i))
		return true;
	// "#" is a comment, except for the #pragma directive
	return line[i] === '#' && !RE_PRAGMA.test(line.slice(i));
}

// Commas inside a data group do not split it ("AA,BB CC" = old=[AA,BB],
// new=CC), and a record with a single data group is "new" data only.
export function tokenizeVkp(text: string): VkpToken[] {
	const tokens: VkpToken[] = [];
	const push = (text: string, kind: VkpToken['kind']) => {
		if (text)
			tokens.push({ text, kind });
	};
	let inBlockComment = false;

	const lines = text.split('\n');
	for (let li = 0; li < lines.length; li++) {
		const line = lines[li];
		if (li > 0)
			push('\n', 'plain');

		let i = 0;
		if (inBlockComment) {
			const end = line.indexOf('*/');
			if (end === -1) {
				push(line, 'comment');
				continue;
			}
			push(line.slice(0, end + 2), 'comment');
			inBlockComment = false;
			i = end + 2;
		}

		let sawAddress = false;
		let group = -1; // data group index, -1 = none yet
		let continueGroup = false; // comma joins the next run to the current group
		const firstGroupTokens: VkpToken[] = [];

		while (i < line.length) {
			const rest = line.slice(i);

			const ws = RE_WS.exec(rest);
			if (ws) {
				push(ws[0], 'plain');
				i += ws[0].length;
				continue;
			}

			if (rest[0] === ',') {
				push(',', 'plain');
				i++;
				continueGroup = true;
				continue;
			}

			if (isCommentStart(line, i)) {
				push(rest, 'comment');
				break;
			}

			if (rest.startsWith('/*')) {
				const end = rest.indexOf('*/', 2);
				if (end === -1) {
					push(rest, 'comment');
					inBlockComment = true;
					break;
				}
				push(rest.slice(0, end + 2), 'comment');
				i += end + 2;
				continue;
			}

			if (!sawAddress) {
				const address = RE_ADDRESS.exec(rest);
				if (address) {
					push(address[0], 'plain');
					i += address[0].length;
					sawAddress = true;
					continue;
				}
				const offset = RE_OFFSET.exec(rest);
				const pragma = RE_PRAGMA.exec(rest);
				if (offset || pragma) {
					const token = (pragma ?? offset)![0];
					push(token, 'plain');
					i += token.length;
					sawAddress = true;
					continue;
				}
			}

			// Quoted string ("...") is a single data token.
			let word: string;
			const quote = rest[0];
			if (quote === '"' || quote === "'") {
				const m = new RegExp(`^${quote}(?:\\\\.|[^${quote}\\\\])*${quote}?`).exec(rest);
				word = m ? m[0] : quote;
			} else {
				word = RE_WORD.exec(rest)?.[0] ?? rest[0];
			}

			if (sawAddress) {
				if (!continueGroup)
					group++;
				continueGroup = false;
				const kind = group === 0 ? 'old' : group === 1 ? 'new' : 'plain';
				const token: VkpToken = { text: word, kind };
				tokens.push(token);
				if (group === 0)
					firstGroupTokens.push(token);
			} else {
				push(word, 'plain');
			}
			i += word.length;
		}

		// A record with a single data group holds "new" data only.
		if (group === 0)
			for (const t of firstGroupTokens)
				t.kind = 'new';
	}

	return tokens;
}
