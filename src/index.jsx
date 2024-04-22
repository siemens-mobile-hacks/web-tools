/* @refresh reload */
import { lazy } from 'solid-js';
import { render } from 'solid-js/web';
import { Router, Route, Navigate } from "@solidjs/router";
import App from './pages/App';

import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';

let ScreenShooter = lazy(() => import("./pages/ScreenShooter"));

let dispose = render(() => (
	<Router root={App} base={import.meta.env.BASE_URL}>
		<Route path="/" component={() => <Navigate href={() => "/screenshot"} />} />
		<Route path="/screenshot" component={ScreenShooter} />
	</Router>
), document.getElementById('root'));

import.meta.hot && import.meta.hot.dispose(dispose); // for HMR
