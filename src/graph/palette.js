// SPDX-License-Identifier: Apache-2.0
import { HUD_TEXT_BRIGHT_COLOR, HUD_TEXT_MUTED_COLOR } from "@rb/halo/src/hud-text-style.js";

/** Generate the native disclosure glyphs used across graph palettes. */
export function createGraphPaletteDisclosureTextures(THREE) {
  function create(expanded) {
    if (!THREE?.CanvasTexture || typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.scale(64 / 24, 64 / 24);
    ctx.strokeStyle = "#6a88a8";
    ctx.lineWidth = 2.8;
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.beginPath();
    if (expanded) {
      ctx.moveTo(7.5, 9.75); ctx.lineTo(12, 14.25); ctx.lineTo(16.5, 9.75);
    } else {
      ctx.moveTo(9.75, 7.5); ctx.lineTo(14.25, 12); ctx.lineTo(9.75, 16.5);
    }
    ctx.stroke();
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = expanded ? "palette-disclosure-expanded" : "palette-disclosure-collapsed";
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    return texture;
  }
  return { disclosureExpanded: create(true), disclosureCollapsed: create(false) };
}

/**
 * Native Palette layout and state. Hosts supply row text, callbacks and status;
 * each Palette preserves one independent open state per section key.
 */
export function createGraphPalette({ hudSystem, windowKey, defaultOpen = [], icons = {} } = {}) {
  const expanded = new Set(defaultOpen);
  let lastStatusKey;
  let content = {};
  function repaint(revealStatus = false) {
    const { statusRows = [], sections = [] } = content;
    const lines = [...statusRows];
    for (const { key, title, items = [], description = "", emptyText } of sections) {
      const open = expanded.has(key);
      const children = open ? (items.length ? items : emptyText ? [{ text: emptyText }] : []) : [];
      lines.push({ text: "", rowHeightPx: 5 }, {
        text: "",
        rowHeightPx: 25,
        accordionRole: children.length ? "header" : "single",
        actionButtonText: `${title} (${items.length})`,
        actionButtonIconTexture: (open ? icons?.disclosureExpanded : icons?.disclosureCollapsed) ?? null,
        actionButtonWidthPx: Number.MAX_SAFE_INTEGER,
        actionButtonTextInsetPx: 12,
        actionButtonTextColor: HUD_TEXT_BRIGHT_COLOR,
        actionButtonBgColor: 0x182e44,
        actionButtonBgOpacity: 1,
        actionButtonHoverText: `${open ? "Collapse" : "Expand"} ${title}.${description ? " " + description : ""}`,
        actionButtonOnClick: () => {
          if (expanded.has(key)) expanded.delete(key);
          else expanded.add(key);
          repaint();
        },
      });
      children.forEach((row, index) => {
        const { text, onClick, hoverText, paletteActive, ...rest } = row;
        lines.push({
          ...rest,
          text: onClick ? "" : "       " + text,
          color: HUD_TEXT_MUTED_COLOR,
          rowHeightPx: 21,
          accordionRole: index === children.length - 1 ? "last" : "item",
          accordionSelected: paletteActive === true,
          ...(onClick ? {
            actionButtonText: text,
            actionButtonWidthPx: Number.MAX_SAFE_INTEGER,
            actionButtonTextInsetPx: 27,
            actionButtonOnClick: onClick,
            actionButtonHoverText: hoverText,
          } : {}),
        });
      });
    }
    if (revealStatus) hudSystem.setWindowScrollTop?.(windowKey, 0, "top");
    const currentMode = hudSystem.getWindowScrollState?.(windowKey)?.scrollMode ??
      hudSystem.hud?.ui?.windows?.[windowKey]?.scrollMode;
    const scrollMode = !revealStatus && currentMode === "manual" ? "manual" : "top";
    hudSystem.setWindowLines(windowKey, lines, { scrollMode });
  }
  return {
    render(next = {}) {
      const reveal = Boolean(next.statusKey && next.statusKey !== lastStatusKey);
      lastStatusKey = next.statusKey;
      content = next;
      repaint(reveal);
    },
  };
}
