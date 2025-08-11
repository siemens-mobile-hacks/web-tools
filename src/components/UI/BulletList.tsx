import "./BulletList.scss";
import { ParentComponent } from "solid-js";

export const BulletList: ParentComponent = (props) => {
	return <ul class="bullet-list">{props.children}</ul>;
}

export const BulletListItem: ParentComponent = (props) => {
	return <li class="bullet-list__item">{props.children}</li>;
}
