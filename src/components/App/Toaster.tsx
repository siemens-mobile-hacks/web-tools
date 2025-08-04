import "./Toaster.scss";
import { Component, JSX } from "solid-js";
import { Alert } from "@suid/material";
import { Toast as ToastPrimitive, toaster } from "@kobalte/core/toast";
import { Portal } from "solid-js/web";

export const Toaster: Component = () => {
	return (
		<Portal>
			<ToastPrimitive.Region>
				<ToastPrimitive.List class="toaster" />
			</ToastPrimitive.Region>
		</Portal>
	);
};

export function showToast(severity: 'success' | 'error' | 'warning' | 'info', content: JSX.Element) {
	return toaster.show((props) => (
		<ToastPrimitive toastId={props.toastId} class="toast">
			<Alert
				onClose={() => toaster.dismiss(props.toastId)}
				severity={severity}
				variant="filled"
				sx={{ width: '100%' }}
			>
				{content}
			</Alert>
		</ToastPrimitive>
	));
}
