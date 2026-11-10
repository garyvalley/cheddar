/**
 * Cheddar's mark, a wedge of cheese, on a 32-unit grid: drawn by AppMark in
 * the app and by scripts/make-icons.mjs for the favicon and Home Screen icons.
 */
export const MARK_COLOURS = { tile: '#6b3fc4', cheese: '#f6c04f', rind: '#e39a2a' }

/** The wedge: its faces as paths and its holes as circles, each with its colour's name. */
export const WEDGE = {
  paths: [
    { d: 'M6 21.5 23.5 9.5 26 21.5z', fill: 'cheese' },
    { d: 'M6 21.5h20V24H6z', fill: 'rind' },
  ],
  holes: [
    { cx: 16, cy: 18, r: 1.6, fill: 'rind' },
    { cx: 21.5, cy: 15.5, r: 1.1, fill: 'rind' },
  ],
} as const

/** The wedge's shapes as SVG markup, without the tile behind them. */
export function wedgeSvg(): string {
  return WEDGE.paths.map(p => `<path d="${p.d}" fill="${MARK_COLOURS[p.fill]}"/>`).join('')
    + WEDGE.holes.map(h => `<circle cx="${h.cx}" cy="${h.cy}" r="${h.r}" fill="${MARK_COLOURS[h.fill]}"/>`).join('')
}

/** The whole mark: the wedge on its rounded tile. */
export function markSvg(): string {
  return `<rect width="32" height="32" rx="8" fill="${MARK_COLOURS.tile}"/>${wedgeSvg()}`
}
