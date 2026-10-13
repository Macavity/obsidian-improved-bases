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
