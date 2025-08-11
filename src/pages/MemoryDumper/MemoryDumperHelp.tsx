import { Component, For, JSX } from "solid-js";
import { Link, List, ListItem, ListItemText } from "@suid/material";

interface MemoryDumperHelpProps {
	protocol: string;
}

export const MemoryDumperHelp: Component<MemoryDumperHelpProps> = (props) => {
	const tipsTricks: Record<string, JSX.Element[]> = {
		"DWD": [
			<>Only phones with NOR flash are supported. NAND support is coming soon.</>,
			<>You can achieve maximum speed using a USB cable</>,
			<>With a USB cable, you can read memory in both P-Test and Normal modes. {' '}
				However, the serial cable works only in P-Test mode.</>,
			<>To enter P-Test mode: press the <b>*</b> and <b>#</b> keys simultaneously,  {' '}
				then turn on the phone using the power key. {' '}
				You should see a rainbow screen.</>,
			<>
				<Link href="https://siemens-mobile-hacks.github.io/docs/panasonic" target="_blank" rel="noopener">
					Read more about APOXI.
				</Link>
			</>
		],
		"CGSN": [
			<><Link href="https://siemens-mobile-hacks.github.io/docs/reverse-engineering/arm-debugger.html" target="_blank" rel="noopener">
				CGSN patch is required.
			</Link></>,
			<>You can achieve maximum speed using DCA-540 or DCA-510 data cables.</>,
			<>Bluetooth is also possible, but has the slowest speed.</>,
			<>It is better to read memory before using ArmDebugger.</>,
			<>
				<Link href="https://siemens-mobile-hacks.github.io/docs/reverse-engineering/memory-dump" target="_blank" rel="noopener">
					Read more about memory dumping.
				</Link>
			</>
		]
	};

	return (
		<List>
			<For each={tipsTricks[props.protocol] ?? []}>{(item, index) =>
				<ListItem>
					<ListItemText>
						{index() + 1}. {item}
					</ListItemText>
				</ListItem>
			}</For>
		</List>
	);
};
