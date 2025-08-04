import { type Component, ErrorBoundary } from "solid-js";
import { App } from "@/components/Layout/App.js";
import { Navigate, Route, Router } from "@solidjs/router";
import ScreenShooterPage from "@/pages/ScreenShooter/ScreenShooterPage";
import { MemoryDumperPage } from "@/pages/MemoryDumper/MemoryDumperPage";
import SMSReaderPage from "@/pages/SMSReader/SMSReaderPage";

export const Root: Component = () => {
	const showAppError = (err: any) => {
		console.log(err);
		return <div>FATAL ERROR: {err.toString()}</div>;
	};

	return (
		<ErrorBoundary fallback={showAppError}>
			<Router root={App} base={import.meta.env.BASE_URL}>
				<Route path="/" component={() => <Navigate href={() => "/screenshot"} />} />
				<Route path="/screenshot" component={ScreenShooterPage} />
				<Route path="/dumper" component={MemoryDumperPage} />
				<Route path="/dumper/:protocol" component={MemoryDumperPage} />
				<Route path="/sms-reader" component={SMSReaderPage} />
				<Route path="/apoxi/unlock-boot" component={SMSReaderPage} />
				<Route path="*" component={() => <Navigate href="/" />} />
			</Router>
		</ErrorBoundary>
	);
};
