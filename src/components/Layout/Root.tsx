import { type Component, ErrorBoundary, lazy } from "solid-js";
import { App } from "@/components/Layout/App.js";
import { Navigate, Route, Router } from "@solidjs/router";

const ScreenShooter = lazy(() => import("../../pages/ScreenShooter/ScreenShooterPage"));
const MemoryDumper = lazy(() => import("../../pages/MemoryDumper/MemoryDumperPage"));
const SMSReader = lazy(() => import("../../pages/SMSReader/SMSReaderPage"));

export const Root: Component = () => {
	const showAppError = (err: any) => {
		console.log(err);
		return <div>FATAL ERROR: {err.toString()}</div>;
	};

	return (
		<ErrorBoundary fallback={showAppError}>
			<Router root={App} base={import.meta.env.BASE_URL}>
				<Route path="/" component={() => <Navigate href={() => "/screenshot"} />} />
				<Route path="/screenshot" component={ScreenShooter} />
				<Route path="/dumper" component={MemoryDumper} />
				<Route path="/sms-reader" component={SMSReader} />
				<Route path="*" component={() => <Navigate href="/" />} />
			</Router>
		</ErrorBoundary>
	);
};
