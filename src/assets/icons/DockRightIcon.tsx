import type { Component } from 'solid-js';
import SvgIcon, { type SvgIconProps } from '@suid/material/SvgIcon';

export interface DockRightIconProps extends SvgIconProps {}

export const DockRightIcon: Component<DockRightIconProps> = (props) => (
	<SvgIcon {...props}>
		<rect x="3" y="4" width="18" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2" />
		<path d="M15 5h5v14h-5z" />
	</SvgIcon>
);
