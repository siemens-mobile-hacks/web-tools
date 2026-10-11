import { type Component, createSignal, type JSX } from 'solid-js';
import { Box } from '@suid/material';

export type ResizeEdge = 'left' | 'right' | 'top';

export interface ResizeHandleProps {
	edge: ResizeEdge;
	label: string;
	max: number;
	min: number;
	value: number;
	onChange: (value: number) => void;
}

export const ResizeHandle: Component<ResizeHandleProps> = (props) => {
	const [resizing, setResizing] = createSignal(false);
	let startPosition = 0;
	let startValue = 0;

	const horizontal = () => props.edge === 'top';
	const clamp = (value: number) => Math.min(props.max, Math.max(props.min, value));
	const pointerPosition = (event: PointerEvent) => horizontal() ? event.clientY : event.clientX;
	const resizeDelta = (event: PointerEvent) => {
		const delta = pointerPosition(event) - startPosition;
		return props.edge === 'right' ? delta : -delta;
	};
	const handlePosition = () => {
		if (horizontal()) {
			return {
				left: 0,
				right: 0,
				top: -4,
				height: 8,
				cursor: 'row-resize',
			};
		}
		return {
			top: 0,
			bottom: 0,
			[props.edge]: -4,
			width: 8,
			cursor: 'col-resize',
		};
	};
	const indicatorPosition = () => {
		if (horizontal()) {
			return {
				left: 0,
				right: 0,
				top: 3,
				height: 2,
			};
		}
		return {
			top: 0,
			bottom: 0,
			[props.edge]: 3,
			width: 2,
		};
	};
	const startResize: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
		if (!event.isPrimary || event.button !== 0)
			return;
		startPosition = pointerPosition(event);
		startValue = props.value;
		setResizing(true);
		event.currentTarget.setPointerCapture(event.pointerId);
		event.preventDefault();
	};
	const resize: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
		if (resizing())
			props.onChange(clamp(startValue + resizeDelta(event)));
	};
	const stopResize: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
		setResizing(false);
		if (event.currentTarget.hasPointerCapture(event.pointerId))
			event.currentTarget.releasePointerCapture(event.pointerId);
	};
	const resizeWithKeyboard: JSX.EventHandler<HTMLDivElement, KeyboardEvent> = (event) => {
		let value = props.value;
		if (event.key === 'Home') {
			value = props.min;
		} else if (event.key === 'End') {
			value = props.max;
		} else if ((props.edge === 'left' && event.key === 'ArrowLeft') ||
			(props.edge === 'right' && event.key === 'ArrowRight') ||
			(props.edge === 'top' && event.key === 'ArrowUp')) {
			value += 24;
		} else if ((props.edge === 'left' && event.key === 'ArrowRight') ||
			(props.edge === 'right' && event.key === 'ArrowLeft') ||
			(props.edge === 'top' && event.key === 'ArrowDown')) {
			value -= 24;
		} else {
			return;
		}
		event.preventDefault();
		props.onChange(clamp(value));
	};

	return (
		<Box
			role="separator"
			tabIndex={0}
			aria-label={props.label}
			aria-orientation={horizontal() ? 'horizontal' : 'vertical'}
			aria-valuemin={props.min}
			aria-valuemax={props.max}
			aria-valuenow={props.value}
			onPointerDown={startResize}
			onPointerMove={resize}
			onPointerUp={stopResize}
			onPointerCancel={stopResize}
			onKeyDown={resizeWithKeyboard}
			sx={{
				position: 'absolute',
				zIndex: 1,
				touchAction: 'none',
				...handlePosition(),
				'&::after': {
					content: '""',
					position: 'absolute',
					...indicatorPosition(),
					bgcolor: 'primary.main',
					opacity: resizing() ? 1 : 0,
				},
				'&:hover::after, &:focus-visible::after': {
					opacity: 1,
				},
			}}
		/>
	);
};
