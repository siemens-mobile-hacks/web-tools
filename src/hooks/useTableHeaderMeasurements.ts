import { type Accessor, createSignal, onCleanup, onMount } from 'solid-js';

interface TableHeaderMeasurements {
	ref: (element: HTMLTableSectionElement) => void;
	height: Accessor<number>;
	columnWidths: Accessor<string[]>;
}

export function useTableHeaderMeasurements(): TableHeaderMeasurements {
	let header!: HTMLTableSectionElement;
	const [height, setHeight] = createSignal(0);
	const [columnWidths, setColumnWidths] = createSignal<string[]>([]);

	onMount(() => {
		const observer = new ResizeObserver(() => {
			setHeight(header.getBoundingClientRect().height);
			setColumnWidths([...header.querySelectorAll('th')].map((cell) => `${cell.getBoundingClientRect().width}px`));
		});
		observer.observe(header);
		onCleanup(() => observer.disconnect());
	});

	return {
		ref: (element) => header = element,
		height,
		columnWidths,
	};
}
