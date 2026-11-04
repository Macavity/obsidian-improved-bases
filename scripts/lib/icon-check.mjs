// Shared by the smoke scripts that measure an Obsidian icon button's SVG.

/** An Obsidian icon is square: a width below its height, or below any sensible icon size, means a padding rule squeezed it
 * (Obsidian pads plain buttons on tablets, Cupertino pads `.clickable-icon` 10px). Returns the failure text, or null. */
export function squeezedIcon({ svgWidth, svgHeight }) {
	return svgWidth < 12 || svgWidth < svgHeight - 1 ? `icon squeezed (svg ${svgWidth}x${svgHeight}px)` : null;
}
