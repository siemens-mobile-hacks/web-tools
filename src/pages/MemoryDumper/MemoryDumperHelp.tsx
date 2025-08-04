import { Component, Match, Switch } from "solid-js";
import { Link, List, ListItem } from "@suid/material";

interface MemoryDumperHelpProps {
	protocol: string;
}

export const MemoryDumperHelp: Component<MemoryDumperHelpProps> = (props) => {
	return (
		<List sx={{ listStyleType: 'disc' }}>
			<Switch>
				<Match when={props.protocol == "DWD"}>
					<ListItem sx={{ display: 'list-item' }}>
						Only phones with NOR flash are supported. NAND support is coming soon.
					</ListItem>
					<ListItem sx={{ display: 'list-item' }}>
						You can achieve maximum speed using a USB cable.
					</ListItem>
					<ListItem sx={{ display: 'list-item' }}>
						With a USB cable, you can read memory in both P-Test and Normal modes. {' '}
						However, the serial cable works only in P-Test mode.
					</ListItem>
					<ListItem sx={{ display: 'list-item' }}>
						To enter P-Test mode: press the <b>*</b> and <b>#</b> keys simultaneously,  {' '}
						then turn on the phone using the power key. {' '}
						You should see a rainbow screen.
					</ListItem>
					<ListItem sx={{ display: 'list-item' }}>
						<Link href="https://siemens-mobile-hacks.github.io/docs/panasonic" target="_blank" rel="noopener">
							Read more about APOXI.
						</Link>
					</ListItem>
				</Match>
				<Match when={props.protocol == "CGSN"}>
					<ListItem sx={{ display: 'list-item' }}>
						<Link href="https://siemens-mobile-hacks.github.io/docs/reverse-engineering/arm-debugger.html" target="_blank" rel="noopener">
							CGSN patch is required.
						</Link>
					</ListItem>
					<ListItem sx={{ display: 'list-item' }}>
						You can achieve maximum speed using a DCA-540 or DCA-510 data cables.
					</ListItem>
					<ListItem sx={{ display: 'list-item' }}>
						Bluetooth is also possible, but has the worst speed.
					</ListItem>
					<ListItem sx={{ display: 'list-item' }}>
						It is better to read memory before ArmDebugger is used.
					</ListItem>
					<ListItem sx={{ display: 'list-item' }}>
						<Link href="https://siemens-mobile-hacks.github.io/docs/reverse-engineering/memory-dump" target="_blank" rel="noopener">
							Read more about memory dumping.
						</Link>
					</ListItem>
				</Match>
			</Switch>
		</List>
	);
};
