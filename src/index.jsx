/* @refresh reload */
import { lazy } from 'solid-js';
import { render } from 'solid-js/web';
import { Router, Route, Navigate } from "@solidjs/router";
import App from './pages/App';

import '@fontsource-variable/roboto';

const ScreenShooter = lazy(() => import("./pages/ScreenShooter"));
const MemoryDumper = lazy(() => import("./pages/MemoryDumper"));

const dispose = render(() => (
	<Router root={App} base={import.meta.env.BASE_URL}>
		<Route path="/" component={() => <Navigate href={() => "/screenshot"} />} />
		<Route path="/screenshot" component={ScreenShooter} />
		<Route path="/dumper" component={MemoryDumper} />
	</Router>
), document.getElementById('root'));

import.meta.hot && import.meta.hot.dispose(dispose); // for HMR
