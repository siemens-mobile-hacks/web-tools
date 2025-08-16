import { type Component, ErrorBoundary, lazy } from "solid-js";
import { App } from "@/components/Layout/App.js";
import { Navigate, Route, Router } from "@solidjs/router";

// lazy imports
const ScreenShooterPage = lazy(() => import("@/pages/ScreenShooter/ScreenShooterPage"));
const MemoryDumperPage = lazy(() => import("@/pages/MemoryDumper/MemoryDumperPage"));
const SMSReaderPage = lazy(() => import("@/pages/SMSReader/SMSReaderPage"));
const UnlockBootloaderPage = lazy(() => import("@/pages/Apoxi/UnlockBootloaderPage"));
const FFSExplorerPage = lazy(() => import("@/pages/FFSExplorerPage/FFSExplorerPage"));
import VideoConverter from "@/pages/VideoConverter/VideoConverterPage";

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
				<Route path="/ffs" component={FFSExplorerPage} />
				<Route path="/dumper" component={MemoryDumperPage} />
				<Route path="/dumper/:protocol" component={MemoryDumperPage} />
				<Route path="/sms-reader" component={SMSReaderPage} />
				<Route path="/apoxi/unlock-boot" component={UnlockBootloaderPage} />
				<Route path="/video-converter" component={VideoConverter} />
				<Route path="*" component={() => <Navigate href="/" />} />
			</Router>
		</ErrorBoundary>
	);
};
