// Theme wash as an SVG IMAGE, not a CSS linear-gradient: Chromium caches a decoded image as a GPU
// texture, while a window-sized procedural gradient re-rasterizes on resize and, under GPU memory
// pressure (webviews, external monitors), those rasters get DROPPED and paint as a half/blank
// rectangle (the same class as the 1.5.9 dot-grid white-patch bug; see DashboardCanvas's grid note).
export function washBackgroundUrl(stops: string[], washOpacity: number): string {
  const alpha = Math.max(0, Math.min(1, washOpacity));
  const stopEls = stops.map((hex, i) => {
    const offset = stops.length > 1 ? (i / (stops.length - 1)) * 100 : 100;
    return `<stop offset='${offset}%' stop-color='${hex}' stop-opacity='${alpha}'/>`;
  }).join('');
  // x2/y2 approximate the CSS 115deg direction (25 degrees below horizontal).
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' preserveAspectRatio='none'><defs><linearGradient id='w' x1='0%' y1='0%' x2='90%' y2='42%'>${stopEls}</linearGradient></defs><rect width='100' height='100' fill='url(%23w)'/></svg>`;
  return `url("data:image/svg+xml,${svg.replace(/#/g, '%23').replace(/'/g, '%27')}")`;
}
