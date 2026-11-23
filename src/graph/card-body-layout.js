// SPDX-License-Identifier: Apache-2.0

const graphemeSegmenter = typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
const graphemes = text => graphemeSegmenter
  ? Array.from(graphemeSegmenter.segment(text), part => part.segment) : Array.from(text);

/** Preflow authored text into the actual card body. The returned lines are presentation-only. */
export function layoutCardBodyText(text, { width, height, fontHeight, lineGap, measure, onOverflow }) {
  const maxLines = height >= fontHeight && fontHeight > 0 && lineGap > 0
    ? 1 + Math.floor((height - fontHeight) / lineGap) : 0;
  const paragraphs = String(text ?? "").replace(/\r\n?/gu, "\n").split("\n");
  const lines = [];
  if (maxLines === 0 || width <= 0) {
    if (String(text ?? "").trim()) onOverflow?.();
    return [];
  }
  const fits = candidate => measure(candidate) <= width;
  for (const paragraph of paragraphs) {
    let line = "";
    for (const word of paragraph.match(/[^\s\u00a0]+(?:\u00a0[^\s\u00a0]+)*/gu) ?? []) {
      const candidate = line ? `${line} ${word}` : word;
      if (fits(candidate)) {
        line = candidate;
        continue;
      }
      if (line) {
        lines.push(line);
        line = "";
        if (lines.length > maxLines) break;
      }
      if (fits(word)) {
        line = word;
        continue;
      }
      for (const char of graphemes(word)) {
        if (line && !fits(line + char)) {
          lines.push(line);
          line = "";
          if (lines.length > maxLines) break;
        }
        line += char;
      }
      if (lines.length > maxLines) break;
    }
    if (lines.length > maxLines) break;
    lines.push(line);
    if (lines.length > maxLines) break;
  }
  if (lines.length <= maxLines) return lines;
  onOverflow?.();
  lines.length = maxLines;
  const last = graphemes(lines[maxLines - 1].trimEnd());
  while (last.length && !fits(last.join("") + "…")) last.pop();
  lines[maxLines - 1] = fits("…") ? last.join("") + "…" : "";
  return lines;
}
