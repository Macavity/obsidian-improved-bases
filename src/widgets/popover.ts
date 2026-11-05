import type { OverlayRegistry } from "./types";

/** Closes a popover on a mousedown outside it (`isInside` decides) and when the overlay registry closes all. Returns the cleanup. */
export function dismissOnOutside(isInside: (target: Element) => boolean, close: () => void, overlays: OverlayRegistry): () => void {
	const onOutside = (evt: MouseEvent): void => {
		const target = evt.target as Element;
		// A modal opened from the popover (the delete confirmation) is not outside of it.
		if (!isInside(target) && !target.closest(".modal-container")) close();
	};
	document.addEventListener("mousedown", onOutside, true);
	const unregister = overlays.add(close);
	return () => {
		document.removeEventListener("mousedown", onOutside, true);
		unregister();
	};
}

/** Obsidian marks narrow mobile layouts with `.is-phone` on the body. */
export function isPhone(): boolean {
	return document.body.classList.contains("is-phone");
}

/** Pins a popover to the bottom edge of the visual viewport (above the on-screen keyboard) and caps its height at 60% of it. Returns the cleanup. */
export function dockToViewport(popover: HTMLElement): () => void {
	const vv = window.visualViewport;
	const update = (): void => {
		const height = vv?.height ?? window.innerHeight;
		const keyboard = vv ? Math.max(0, window.innerHeight - vv.offsetTop - vv.height) : 0;
		popover.setCssProps({ "--ib-dock-bottom": `${keyboard}px`, "--ib-dock-max-height": `${Math.round(height * 0.6)}px` });
	};
	popover.addClass("is-docked");
	update();
	vv?.addEventListener("resize", update);
	vv?.addEventListener("scroll", update);
	return () => {
		vv?.removeEventListener("resize", update);
		vv?.removeEventListener("scroll", update);
	};
}
