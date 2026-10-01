import { Accessor, createContext, createEffect, createSignal, ParentComponent, Setter, useContext } from "solid-js";

// What the title bar's status is of: a connected phone, or an opened file
export type StatusKind = 'connection' | 'file';

interface AppContext {
	status: Accessor<string | undefined>;
	statusKind: Accessor<StatusKind>;
	// Of the connected phone
	setStatus: Setter<string | undefined>;
	// Of an opened file, shown instead of the connection's until it is cleared
	setFileStatus: Setter<string | undefined>;
	title: Accessor<string>;
	setTitle: Setter<string | undefined>;
}

const AppContext = createContext<AppContext | undefined>(undefined);

export function useApp(): AppContext {
	const value = useContext(AppContext);
	if (value === undefined)
		throw new Error("useApp must be used within a <AppProvider>!");
	return value;
}

export const AppProvider: ParentComponent = (props) => {
	const [status, setStatus] = createSignal<string>();
	const [fileStatus, setFileStatus] = createSignal<string>();
	const [title, setTitle] = createSignal<string>();

	createEffect(() => {
		document.title = title() ? `Siemens ${title()}` : `Siemens Web Tools`;
	});

	return (
		<AppContext.Provider value={{
			status: () => fileStatus() ?? status(),
			statusKind: () => fileStatus() ? 'file' : 'connection',
			setStatus,
			setFileStatus,
			setTitle,
			title: () => title() ?? `Siemens Web Tools`,
		}}>
			{props.children}
		</AppContext.Provider>
	);
}
