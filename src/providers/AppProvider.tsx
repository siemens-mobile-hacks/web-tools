import { Accessor, createContext, createEffect, createSignal, ParentComponent, Setter, useContext } from "solid-js";

interface AppContext {
	status: Accessor<string | undefined>;
	setStatus: Setter<string | undefined>;
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
	const [title, setTitle] = createSignal<string>();

	createEffect(() => {
		document.title = title() ? `Siemens ${title()}` : `Siemens Web Tools`;
	});

	return (
		<AppContext.Provider value={{
			status,
			setStatus,
			setTitle,
			title: () => title() ?? `Siemens Web Tools`,
		}}>
			{props.children}
		</AppContext.Provider>
	);
}
