export function downloadCanvasImage(canvas: HTMLCanvasElement, filename: string): void {
	const a = document.createElement('a');
	a.href = canvas.toDataURL('image/png');
	a.download = filename;
	a.click();
}
