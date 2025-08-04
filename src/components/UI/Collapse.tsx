import "./Collapse.scss";
import { ParentComponent } from "solid-js";
import { Collapsible as CollapsiblePrimitive, CollapsibleRootProps } from "@kobalte/core/collapsible";

export const Collapse: ParentComponent<CollapsibleRootProps> = (props) => {
	return (
		<CollapsiblePrimitive {...props} class="collapse">
			<CollapsiblePrimitive.Content class="collapse__content">
				{props.children}
			</CollapsiblePrimitive.Content>
		</CollapsiblePrimitive>
	);
};
