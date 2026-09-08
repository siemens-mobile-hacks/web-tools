import { type Component, createSignal, For } from 'solid-js';
import { Table, TableContainer, TableBody, TableCell, TableHead, TableRow } from '@suid/material';
import { alpha, useTheme } from '@suid/material/styles';
import { Virtualizer } from 'virtua/solid';
import { sprintf } from 'sprintf-js';
import { FirmwareBlockRow } from './FirmwareBlockRow';
import { useTableHeaderMeasurements } from '@/hooks/useTableHeaderMeasurements';
import type { FirmwareBlock } from '@/workers/services/FirmwareService';

const kindLabels: Record<FirmwareBlock['kind'], string> = {
	data: 'Data',
	erased: 'Erased (0xFF)',
	untouched: 'Untouched',
};

interface Column {
	label: string;
	value: (block: FirmwareBlock) => string | number;
	monospace?: boolean;
	align?: 'right';
	sx?: { width: string };
}

const columns: Column[] = [
	{ label: 'Start', value: (block: FirmwareBlock) => sprintf('%08X', block.addr), monospace: true },
	{ label: 'End', value: (block: FirmwareBlock) => sprintf('%08X', block.addr + block.size - 1), monospace: true },
	{ label: 'Size', value: (block: FirmwareBlock) => block.size, align: 'right' },
	{ label: 'Kind', value: (block: FirmwareBlock) => kindLabels[block.kind], sx: { width: '100%' } },
];

const tableSx = {
	borderLeft: 1,
	borderColor: 'divider',
	'& th, & td': {
		borderRight: 1,
		borderBottom: 1,
		borderColor: 'divider',
	},
	'& th': {
		borderTop: 1,
		borderColor: 'divider',
		backgroundColor: 'tableHeader',
	},
};

interface FirmwareBlocksTableProps {
	blocks: FirmwareBlock[];
}

export const FirmwareBlocksTable: Component<FirmwareBlocksTableProps> = (props) => {
	const [scrollContainer, setScrollContainer] = createSignal<HTMLDivElement>();
	const theme = useTheme();
	const header = useTableHeaderMeasurements();
	const backgroundColors = {
		data: alpha(theme.palette.success.main, 0.12),
		erased: alpha(theme.palette.error.main, 0.12),
		untouched: 'transparent',
	};
	return (
		<TableContainer
			ref={setScrollContainer}
			tabIndex={0}
			role="region"
			aria-label="Flash blocks"
			sx={{ maxHeight: '55dvh' }}
		>
			<Table
				stickyHeader
				size="small"
				aria-label="Flash blocks"
				aria-rowcount={props.blocks.length + 1}
				sx={tableSx}
			>
				<TableHead ref={header.ref}>
					<TableRow aria-rowindex={1}>
						<For each={columns}>{(column) =>
							<TableCell
								component="th"
								scope="col"
								align={column.align}
								sx={column.sx}
							>
								{column.label}
							</TableCell>
						}</For>
					</TableRow>
				</TableHead>
				{/* Preserve column widths while rows are virtualized. */}
				<TableBody aria-hidden="true">
					<TableRow sx={{ visibility: 'collapse' }}>
						<TableCell sx={{ fontFamily: 'monospace' }}>00000000</TableCell>
						<TableCell sx={{ fontFamily: 'monospace' }}>00000000</TableCell>
						<TableCell>67108864</TableCell>
						<TableCell />
					</TableRow>
				</TableBody>
				<Virtualizer
					data={props.blocks}
					as="tbody"
					item={FirmwareBlockRow}
					scrollRef={scrollContainer()}
					startMargin={header.height()}
				>{(block) =>
					<For each={columns}>{(column, index) =>
						<TableCell
							align={column.align}
							sx={{
								fontFamily: column.monospace ? 'monospace' : undefined,
								opacity: block.kind === 'untouched' ? 0.5 : 1,
								backgroundColor: backgroundColors[block.kind],
							}}
							style={{ width: header.columnWidths()[index()] }}
						>
							{column.value(block)}
						</TableCell>
					}</For>
				}</Virtualizer>
			</Table>
		</TableContainer>
	);
};
