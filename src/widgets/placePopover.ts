/** Pure placement: below unless the space above is larger and below is too small for `height`. `align: "end"` right-aligns to the anchor. `dock` (phones) ignores the anchor: full viewport width, the caller pins it to the bottom edge. */
export function placePopover(
	anchor: DOMRect,
	viewport: { width: number; height: number },
	size: { width: number; height: number },
	align: "start" | "end" = "start",
	dock = false,
): { top: number; left: number; width: number; above: boolean; docked: boolean } {
	if (dock) return { top: Math.max(0, viewport.height - size.height), left: 0, width: viewport.width, above: false, docked: true };
	const width = Math.max(anchor.width, size.width);
	const wanted = align === "end" ? anchor.right - width : anchor.left;
	const left = Math.max(0, Math.min(wanted, viewport.width - width));
	const below = viewport.height - anchor.bottom;
	const above = below < size.height && anchor.top > below;
	return { top: above ? Math.max(0, anchor.top - size.height) : anchor.bottom, left, width, above, docked: false };
}
