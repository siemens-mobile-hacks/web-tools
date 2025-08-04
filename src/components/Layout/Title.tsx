import { createEffect, ParentComponent } from "solid-js";
import { useApp } from "@/providers/AppProvider";

interface TitleProps {
	children: string;
}

export const Title: ParentComponent<TitleProps> = (props) => {
	const app = useApp();
	createEffect(() => app.setTitle(props.children));
	return <></>;
}
