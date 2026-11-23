// SPDX-License-Identifier: Apache-2.0

const channels = hex => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const fromChannels = rgb => rgb.reduce((hex, component) => (hex << 8) + Math.round(component), 0);
const mix = (from, to, ratio) => from.map((component, index) => component * (1 - ratio) + to[index] * ratio);

export const GRAPH_CAPTION_PALETTE = Object.freeze({
  light: Object.freeze({ labelText: 0x16283d, labelFill: 0xf8fafc, labelBorder: 0x49647f }),
  dark: Object.freeze({ labelText: 0xf3f8ff, labelFill: 0x223145, labelBorder: 0x91abc6 }),
});

function luminance(rgb) {
  const [r, g, b] = rgb.map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Readable contrast after compositing palette colors in display (sRGB) space. */
export function graphContrastRatio(foreground, background, opacity = 1) {
  const bg = channels(background);
  const a = luminance(mix(bg, channels(foreground), opacity));
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Preserve hue by moving toward a tonal endpoint only as far as needed. */
export function graphContrastColor(color, background, target, opacity = 1, direction = null) {
  if (graphContrastRatio(color, background, opacity) >= target) return color;
  const endpoint = direction === "lighter" || (direction == null && luminance(channels(background)) < 0.18)
    ? 0xffffff : 0;
  if (graphContrastRatio(endpoint, background, opacity) < target) return endpoint;
  const original = channels(color), goal = channels(endpoint);
  let lo = 0, hi = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) * 0.5;
    if (graphContrastRatio(fromChannels(mix(original, goal, mid)), background, opacity) >= target) hi = mid;
    else lo = mid;
  }
  return fromChannels(mix(original, goal, hi));
}
