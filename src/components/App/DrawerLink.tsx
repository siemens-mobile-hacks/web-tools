import { type Component, createEffect, createMemo, createSignal, For, type JSX, Match, Switch } from 'solid-js';
import { A } from '@solidjs/router';
import { List, ListItemButton, ListItemIcon, ListItemText } from '@suid/material';
import ExpandMoreIcon from '@suid/icons-material/ExpandMore';
import ExpandLessIcon from '@suid/icons-material/ExpandLess';
import { Collapse } from '@/components/UI/Collapse';
import { matchURL } from '@/utils.js';

interface DrawerLinkItemBase {
	icon: JSX.Element;
	title: string;
}

interface DrawerPageLinkItem extends DrawerLinkItemBase {
	url: string;
}

interface DrawerGroupLinkItem extends DrawerLinkItemBase {
	sublinks: DrawerLinkItem[];
}

export type DrawerLinkItem = DrawerPageLinkItem | DrawerGroupLinkItem;

export interface DrawerLinkProps {
	item: DrawerLinkItem;
	depth?: number;
}

export const DrawerLink: Component<DrawerLinkProps> = (props) => {
	const pageLink = () => 'url' in props.item ? props.item : undefined;
	const groupLink = () => 'sublinks' in props.item ? props.item : undefined;
	const isSelected = () => {
		const link = pageLink();
		return link !== undefined && matchURL(link.url);
	};
	const isNestedSelected = createMemo(() => {
		const group = groupLink();
		if (group) {
			for (const sublink of group.sublinks) {
				if ('url' in sublink && matchURL(sublink.url))
					return true;
			}
		}
		return false;
	});
	const [isOpen, setIsOpen] = createSignal(isNestedSelected());
	const depth = () => props.depth ?? 1;

	createEffect(() => {
		if (isNestedSelected())
			setIsOpen(true);
	});

	return (
		<Switch>
			<Match when={pageLink()}>{(link) =>
				<ListItemButton
					component={A}
					href={link().url}
					selected={isSelected()}
					sx={{ pl: depth() * 2 }}
				>
					<ListItemIcon sx={{ minWidth: '2.5em' }}>
						{link().icon}
					</ListItemIcon>
					<ListItemText
						primary={link().title}
						primaryTypographyProps={{ noWrap: true, sx: { display: 'block' } }}
						sx={{ minWidth: 0, overflow: 'hidden' }}
						title={link().title}
					/>
				</ListItemButton>
			}</Match>
			<Match when={groupLink()}>{(group) =>
				<>
					<ListItemButton
						aria-expanded={isOpen()}
						onClick={() => setIsOpen((prev) => !prev)}
						sx={{ pl: depth() * 2 }}
					>
						<ListItemIcon sx={{ minWidth: '2.5em' }}>
							{group().icon}
						</ListItemIcon>
						<ListItemText
							primary={group().title}
							primaryTypographyProps={{ noWrap: true, sx: { display: 'block' } }}
							sx={{ minWidth: 0, overflow: 'hidden' }}
							title={group().title}
						/>
						{isOpen() ? <ExpandLessIcon /> : <ExpandMoreIcon />}
					</ListItemButton>
					<Collapse open={isOpen()}>
						<List component="div" disablePadding>
							<For each={group().sublinks}>{(sublink) =>
								<DrawerLink
									item={sublink}
									depth={depth() + 1}
								/>
							}</For>
						</List>
					</Collapse>
				</>
			}</Match>
		</Switch>
	);
};
