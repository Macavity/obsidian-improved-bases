import type { OverlayRegistry } from "./types";

/** Closes a popover on a mousedown outside it (`isInside` decides) and when the overlay registry closes all. Returns the cleanup. */
export function dismissOnOutside(isInside: (target: Element) => boolean, close: () => void, overlays: OverlayRegistry): () => void {
	const onOutside = (evt: MouseEvent): void => {
		if (!isInside(evt.target as Element)) close();
	};
	document.addEventListener("mousedown", onOutside, true);
	const unregister = overlays.add(close);
	return () => {
		document.removeEventListener("mousedown", onOutside, true);
		unregister();
	};
}
