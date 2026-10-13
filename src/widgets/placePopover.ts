/** Pure placement: below unless the space above is larger and below is too small for `height`. */
export function placePopover(
	anchor: DOMRect,
	viewport: { width: number; height: number },
	size: { width: number; height: number },
): { top: number; left: number; width: number; above: boolean } {
	const width = Math.max(anchor.width, size.width);
	const left = Math.max(0, Math.min(anchor.left, viewport.width - width));
	const below = viewport.height - anchor.bottom;
	const above = below < size.height && anchor.top > below;
	return { top: above ? Math.max(0, anchor.top - size.height) : anchor.bottom, left, width, above };
}
