import { Component, onCleanup } from "solid-js";
import { ffsWorker } from "@/workers/endpoints/ffs";
import { Box, Button } from "@suid/material";
import { FileManager } from "@/components/FileManager/FileManager";
import FileUploadIcon from "@suid/icons-material/FileUpload";
import { PageTitle } from "@/components/Layout/PageTitle";

export const FFSExplorerPage: Component = () => {
	let fileInputRef!: HTMLInputElement;

	onCleanup(async () => {
	//	await ffsWorker.close();
	});

	const handleFile = async () => {
		if (fileInputRef.files && fileInputRef.files.length > 0) {
			const file = fileInputRef.files[0];
			await ffsWorker.open(file);
			console.log(await ffsWorker.getFilesTree())
		}

		console.log(fileInputRef.files);
	};

	return (
		<Box>
			<PageTitle>FFS Explorer</PageTitle>

			<Button
				variant="contained"
				startIcon={<FileUploadIcon />}
				onClick={() => fileInputRef.click()}
			>
				Pick a file
				<input
					ref={fileInputRef}
					type="file"
					style={{ display: 'none' }}
					onChange={handleFile}
				/>
			</Button>
			<Box mt={1}>
				<FileManager />
			</Box>
		</Box>
	);
}

export default FFSExplorerPage;
