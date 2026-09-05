import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeVkp } from '../pages/Flasher/vkpHighlight.js';

// The tokens must reconstruct the input exactly: the highlight layer is
// rendered under a transparent textarea, so any drift breaks alignment.
function checkRoundtrip(text: string) {
	assert.equal(tokenizeVkp(text).map((t) => t.text).join(''), text);
}

test('vkp highlight: tokens reconstruct the input', () => {
	const samples = [
		'',
		'\n',
		'; comment only\n',
		'0x402BB4: F0F0F0F0 F1F1F1F1\n',
		'0x402BB4: F0F0F0F0 F1F1F1F1 ; trailing comment\n',
		'402BB4: F0F0 F1F1 // c++ style\n#hash comment\n#pragma undo\n',
		'/* multi\nline */ 0x1: AA BB /* inline */ ; end\n',
		'0x400000: "string data" BB\n',
		'0x400000: AA,BB CC\n0x400000: AA , BB CC\n',
		'+4E0000 ; offset corrector\n',
		'0x400000: 0n1010 0n1111\n0x400000: 0i+10 0i+11\n',
		'junk line without address\n0x400000: F0 F1, F2\n',
	];
	for (const text of samples)
		checkRoundtrip(text);
});

test('vkp highlight: colors', () => {
	const kindOf = (text: string) => {
		const map = new Map<string, string[]>();
		for (const t of tokenizeVkp(text))
			for (const line of t.text.split('\n'))
				if (t.text !== '\n')
					map.set(line, [...(map.get(line) ?? []), t.kind]);
		return map;
	};

	const map = kindOf(
		'; header\n' +
		'0x402BB4: F0F0F0F0 F1F1F1F1 ; old and new\n' +
		'0x402BB6: F1F1F1F1\n'
	);
	assert.equal(map.get('; header')?.[0], 'comment');
	assert.equal(map.get('0x402BB4:')?.[0], 'plain');
	assert.equal(map.get('F0F0F0F0')?.[0], 'old');
	assert.equal(map.get('F1F1F1F1')?.[0], 'new');
	assert.equal(map.get('; old and new')?.[0], 'comment');
	// Single data group is "new" data.
	assert.equal(map.get('F1F1F1F1')?.[1], 'new');
});

test('vkp highlight: comma keeps the data group', () => {
	// "AA,BB CC" = old=[AA,BB] (red), new=CC (green)
	const tokens = tokenizeVkp('0x400000: AA,BB CC\n');
	assert.deepEqual(
		tokens.filter((t) => /^[A-C]+$/.test(t.text)).map((t) => t.kind),
		['old', 'old', 'new'],
	);
	// Same with whitespace around the comma.
	const spaced = tokenizeVkp('0x400000: AA , BB CC\n');
	assert.deepEqual(
		spaced.filter((t) => /^[A-C]+$/.test(t.text)).map((t) => t.kind),
		['old', 'old', 'new'],
	);
});

test('vkp highlight: multiline comments', () => {
	const tokens = tokenizeVkp('/* start\nstill comment\nend */ 0x1: AA BB\n');
	assert.equal(tokens[0].kind, 'comment');
	assert.equal(tokens[2].kind, 'comment');
	assert.equal(tokens[4].text, 'end */');
	assert.equal(tokens[4].kind, 'comment');
});

test('vkp highlight: block comment ends at */ and does not eat the next line', () => {
	const tokens = tokenizeVkp('/* c\n*/ +4E0000 ; offset\n');
	const offset = tokens.find((t) => t.text === '+4E0000');
	assert.equal(offset?.kind, 'plain');
	const comment = tokens.find((t) => t.text === '; offset');
	assert.equal(comment?.kind, 'comment');
});
