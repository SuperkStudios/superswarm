// Theme wash as an SVG IMAGE, not a CSS linear-gradient: Chromium caches a decoded image as a GPU
// texture, while a window-sized procedural gradient re-rasterizes on resize and, under GPU memory
// pressure (webviews, external monitors), those rasters get DROPPED and paint as a half/blank
// rectangle (the same class as the 1.5.9 dot-grid white-patch bug; see DashboardCanvas's grid note).
export function washBackgroundUrl(stops: string[], washOpacity: number): string {
  const alpha = Math.max(0, Math.min(1, washOpacity));
  // A native CSS gradient, not an SVG data-URL. The data-URL version was a decoded IMAGE resource:
  // Chromium can evict its tiles under GPU memory pressure (many webviews, external displays) and
  // paints the layer's background-color there instead, which is the hard-edged band users report.
  // A gradient is a paint op on the layer itself, so there is no separate texture to drop, and it
  // also stops shipping a ~119KB data-URL string on every theme render.
  const stopEls = stops.map((hex, i) => {
    const offset = stops.length > 1 ? (i / (stops.length - 1)) * 100 : 100;
    return `${p_rgba(hex, alpha)} ${offset}%`;
  }).join(', ');
  return `linear-gradient(115deg, ${stopEls})`;
}

function p_rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}, ${alpha})`;
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number): number => Math.round(((pa >> shift) & 0xff) * (1 - t) + ((pb >> shift) & 0xff) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

// The canvas wash, pre-blended over the page color so the layer is OPAQUE: identical pixels to the translucent version, but Chromium can then paint the declared background-color for any tile it evicted or hasn't rastered yet, instead of raw page white/black.
export function washOpaqueBackgroundUrl(stops: string[], washOpacity: number, pageBg: string): string {
  const alpha = Math.max(0, Math.min(1, washOpacity));
  const blended = stops.map((hex) => mixHex(pageBg, hex, alpha));
  return washBackgroundUrl(blended, 1);
}

// What an evicted/unrastered wash tile should paint as: the wash's mean tint, never raw page color.
export function washUnderlayColor(stops: string[], washOpacity: number, pageBg: string): string {
  const alpha = Math.max(0, Math.min(1, washOpacity));
  if (stops.length === 0) return pageBg;
  const mean = stops.reduce((acc, hex, i) => (i === 0 ? hex : mixHex(acc, hex, 1 / (i + 1))), stops[0]);
  return mixHex(pageBg, mean, alpha);
}

// Stock wallpaper when the user hasn't picked an accent yet: a designed blue-to-cream-to-pink
// gradient (contrasting stops), so a fresh install and the onboarding stage never look flat/white.
export const DEFAULT_WASH_STOPS = ['#B7CDEA', '#EFE0D2', '#E7BDD1'];

export function effectiveWashStops(gradient: string[] | null, accent: string | null): string[] {
  if (gradient && gradient.length > 0) return gradient;
  if (accent) return [accent];
  return DEFAULT_WASH_STOPS;
}
