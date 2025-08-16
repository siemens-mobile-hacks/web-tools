import { createEffect, ParentComponent } from "solid-js";
import { useApp } from "@/providers/AppProvider";

interface PageTitleProps {
	children: string;
}

export const PageTitle: ParentComponent<PageTitleProps> = (props) => {
	const app = useApp();
	createEffect(() => app.setTitle(props.children));
	return <></>;
}
