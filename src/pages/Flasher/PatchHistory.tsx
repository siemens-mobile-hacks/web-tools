// The History tab of the Flasher page: a viewer over the patch history log
// stored in localStorage (see history.ts, the V_KLay DoPatchLogging analog).

import { Component, For, Show, createMemo, createSignal } from 'solid-js';
import {
	Alert, Box, Button, Chip, Divider, FormControl, IconButton, InputLabel,
	Paper, Select, MenuItem, Stack, TextField, Typography,
} from '@suid/material';
import DeleteIcon from '@suid/icons-material/Delete';
import FileDownloadIcon from '@suid/icons-material/FileDownload';
import ExpandMoreIcon from '@suid/icons-material/ExpandMore';
import { downloadBlob, formatSize } from '@/utils.js';
import { vkpCanonicalize } from '@sie-js/vkp';
import {
	PatchHistoryEntry, clearPatchHistory, deletePatchHistoryEntry, loadPatchHistory,
} from './history';

export const PatchHistory: Component = () => {
	const [entries, setEntries] = createSignal<PatchHistoryEntry[]>(loadPatchHistory());
	// Filters, like the V_KLay log viewers: model, IMEI and the date range.
	const [model, setModel] = createSignal('');
	const [imei, setImei] = createSignal('');
	const [dateFrom, setDateFrom] = createSignal('');
	const [dateTo, setDateTo] = createSignal('');
	const [expanded, setExpanded] = createSignal<string | undefined>();

	// Newest first (addPatchHistoryEntry prepends; sort again to be safe
	// for manually seeded or imported data).
	const sortedEntries = createMemo(() =>
		[...entries()].sort((a, b) => b.date.localeCompare(a.date)));

	const models = createMemo(() => {
		const set = new Set<string>();
		for (const entry of sortedEntries())
			if (entry.model)
				set.add(entry.model);
		return [...set].sort((a, b) => a.localeCompare(b));
	});

	const filtered = createMemo(() => {
		const imeiQuery = imei().trim();
		return sortedEntries().filter((entry) => {
			if (model() && entry.model != model())
				return false;
			if (imeiQuery && !entry.imei.includes(imeiQuery))
				return false;
			const day = entry.date.slice(0, 10);
			if (dateFrom() && day < dateFrom())
				return false;
			if (dateTo() && day > dateTo())
				return false;
			return true;
		});
	});

	const hasFilters = createMemo(() => !!(model() || imei().trim() || dateFrom() || dateTo()));

	const clearFilters = () => {
		setModel('');
		setImei('');
		setDateFrom('');
		setDateTo('');
	};

	const onDelete = (id: string) => {
		if (!confirm('Delete this history entry?'))
			return;
		setEntries(deletePatchHistoryEntry(id));
	};

	const onClear = () => {
		if (!confirm('Clear the whole patch history?\nThis cannot be undone.'))
			return;
		setExpanded(undefined);
		setEntries(clearPatchHistory());
	};

	// V_KLay keeps the applied patch text in its log directory (log.vkp):
	// offer the same for every entry.
	const onDownload = (entry: PatchHistoryEntry) => {
		const text = entry.text || '';
		const name = (entry.patchName || `patch_${entry.date.slice(0, 19).replace(/[:T]/g, '-')}`).replace(/\.vkp$/i, '') + '.vkp';
		downloadBlob(new Blob([new Uint8Array(vkpCanonicalize(text))], { type: 'text/plain' }), name);
	};

	return (
		<Stack spacing={2} sx={{ width: '100%' }}>
			<Paper variant="outlined" sx={{ p: 2 }}>
				<Stack spacing={2}>
					<Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" flexWrap="wrap">
						<Typography variant="h6">Patch history</Typography>
						<Button
							variant="outlined"
							color="error"
							startIcon={<DeleteIcon />}
							disabled={!entries().length}
							onClick={onClear}
						>
							Clear all
						</Button>
					</Stack>
					<Typography variant="body2" color="text.secondary">
						Every patch applied to a phone or to a fullflash dump is logged here
						(the V_KLay patch logging analog), newest first.
					</Typography>
					{/* Filters: phone model, IMEI and the date applied */}
					<Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
						<FormControl size="small" sx={{ minWidth: 170 }} disabled={!models().length}>
							<InputLabel>Phone model</InputLabel>
							<Select
								label="Phone model"
								value={model()}
								onChange={(e) => setModel(e.target.value)}
							>
								<MenuItem value=""><em>Any</em></MenuItem>
								<For each={models()}>{(m) => <MenuItem value={m}>{m}</MenuItem>}</For>
							</Select>
						</FormControl>
						<TextField
							size="small"
							label="IMEI"
							placeholder="Any"
							value={imei()}
							sx={{ width: 180 }}
							onChange={(e) => setImei(e.currentTarget.value)}
						/>
						<TextField
							size="small"
							type="date"
							label="Applied from"
							value={dateFrom()}
							sx={{ width: 170 }}
							InputLabelProps={{ shrink: true }}
							onChange={(e) => setDateFrom(e.currentTarget.value)}
						/>
						<TextField
							size="small"
							type="date"
							label="Applied to"
							value={dateTo()}
							sx={{ width: 170 }}
							InputLabelProps={{ shrink: true }}
							onChange={(e) => setDateTo(e.currentTarget.value)}
						/>
						<Show when={hasFilters()}>
							<Button size="small" onClick={clearFilters}>Reset</Button>
						</Show>
					</Stack>
				</Stack>
			</Paper>

			<Show when={!entries().length}>
				<Alert severity="info">
					No patches logged yet. Apply or undo a VKP patch on the phone or on a
					fullflash dump, and it will appear here.
				</Alert>
			</Show>
			<Show when={entries().length && !filtered().length}>
				<Alert severity="info">No entries match the filters.</Alert>
			</Show>

			<For each={filtered()}>{(entry) => {
				const open = () => expanded() == entry.id;
				return (
					<Paper variant="outlined" sx={{ p: 2 }}>
						<Stack spacing={1}>
							<Stack
								direction="row"
								spacing={1}
								alignItems="center"
								sx={{ cursor: 'pointer', userSelect: 'none' }}
								onClick={() => setExpanded(open() ? undefined : entry.id)}
							>
								<Show when={entry.text} fallback={
									<IconButton size="small" disabled title="No patch text kept" sx={{ ml: -1 }}>
										<ExpandMoreIcon />
									</IconButton>
								}>
									<IconButton size="small" sx={{ ml: -1, transition: 'transform .2s', transform: open() ? 'rotate(180deg)' : 'none' }}>
										<ExpandMoreIcon />
									</IconButton>
								</Show>
								<Box sx={{ flexGrow: 1, minWidth: 0 }}>
									<Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
										<b>{entry.patchTitle || entry.patchName || 'Patch'}</b>
									</Typography>
									<Typography variant="caption" component="div" color="text.secondary">
										{formatHistoryDate(entry.date)} — {entry.action == 'apply' ? 'applied' : 'undone'}
										{entry.model ? ` on ${entry.model}` : ''}
										<Show when={entry.imei}> (IMEI {entry.imei})</Show>
									</Typography>
								</Box>
								<Chip
									size="small"
									color={entry.source == 'phone' ? 'success' : 'default'}
									variant="outlined"
									label={entry.source == 'phone' ? 'Phone' : 'Dump'}
								/>
								<IconButton
									size="small"
									title="Download the logged patch (.vkp)"
									disabled={!entry.text}
									onClick={(e) => { e.stopPropagation(); onDownload(entry); }}
								>
									<FileDownloadIcon />
								</IconButton>
								<IconButton
									size="small"
									title="Delete the entry"
									onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
								>
									<DeleteIcon />
								</IconButton>
							</Stack>
							<Show when={open()}>
								<Divider />
								<Typography variant="caption" component="div">
									<Show when={entry.patchName} fallback={<i>(edited inline)</i>}>
										<b>{entry.patchName}</b>
									</Show>
									{' '}{entry.writes} writes, {formatSize(entry.written)} written
								</Typography>
								<Show when={entry.info}>
									<Typography variant="caption" component="div" sx={{ wordBreak: 'break-word' }}>
										{entry.info}
									</Typography>
								</Show>
								<Typography variant="caption" component="div" sx={{ wordBreak: 'break-word' }}>
									Device: {entry.deviceName || 'unknown'}
								</Typography>
								<Box
									component="pre"
									sx={{
										m: 0, mt: 1, p: 1, maxHeight: 300, overflow: 'auto',
										typography: 'body2', fontFamily: 'monospace', fontSize: 12,
										whiteSpace: 'pre-wrap', wordBreak: 'break-all',
										bgcolor: 'action.hover', borderRadius: 1,
									}}
								>{entry.text}</Box>
							</Show>
						</Stack>
					</Paper>
				);
			}}</For>
		</Stack>
	);
};

// "2024-01-02 03:04:05" from the ISO timestamp.
function formatHistoryDate(iso: string): string {
	return iso.slice(0, 19).replace('T', ' ');
}
