import { Component, createEffect, createMemo, createSignal, on } from 'solid-js';
import { SerialConnect } from '@/components/SerialConnect.js';
import { useApp } from '@/providers/AppProvider';
import { useSerial } from '@/providers/SerialProvider.js';
import { SerialReadyState } from '@/workers/endpoints/serial';
import { type DiskInfo, formatFreeSpace } from '@/pages/FileExplorer/FileSystem';

interface ObexStatusBarProps {
	disk?: DiskInfo;
}

// Connects to the phone, whose link speed and free space the title bar shows after its name
export const ObexStatusBar: Component<ObexStatusBarProps> = (props) => {
	const app = useApp();
	const serial = useSerial();
	const [baudrate, setBaudrate] = createSignal(0);

	const isConnected = createMemo(() => serial.readyState() === SerialReadyState.CONNECTED && serial.protocol() === "OBEX");

	createEffect(on(isConnected, async (connected) => {
		setBaudrate(0);
		if (!connected)
			return;
		const speed = await serial.obex.getBaudrate().catch(() => 0);
		if (isConnected())
			setBaudrate(speed);
	}));

	// Another tool's connection keeps the status that tool gave it
	createEffect(() => {
		const name = serial.device();
		if (!name || !isConnected())
			return;
		const parts = [name];
		if (baudrate())
			parts.push(`${baudrate()} baud`);
		if (props.disk)
			parts.push(formatFreeSpace(props.disk));
		app.setStatus(parts.join(' · '));
	});

	return <SerialConnect protocol="OBEX" />;
};
