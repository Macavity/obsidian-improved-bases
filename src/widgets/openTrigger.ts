/** Opens a picker from a focusable field on click and on Enter / Space; clicks on `skip` targets (links) keep their own behavior. */
export function bindOpenTrigger(root: HTMLElement, open: () => void, skip?: string): void {
	root.addEventListener("click", (evt) => {
		if (skip && evt.target instanceof Element && evt.target.closest(skip)) return;
		open();
	});
	root.addEventListener("keydown", (evt) => {
		// Keys from a focused element inside the field belong to that element.
		if (evt.target !== root || (evt.key !== "Enter" && evt.key !== " ")) return;
		evt.preventDefault();
		open();
	});
}
