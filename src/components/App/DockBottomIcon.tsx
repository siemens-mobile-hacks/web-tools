import type { Component } from 'solid-js';
import SvgIcon, { type SvgIconProps } from '@suid/material/SvgIcon';

export interface DockBottomIconProps extends SvgIconProps {}

export const DockBottomIcon: Component<DockBottomIconProps> = (props) => (
	<SvgIcon {...props}>
		<rect x="3" y="4" width="18" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2" />
		<path d="M4 14h16v5H4z" />
	</SvgIcon>
);
