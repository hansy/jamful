/**
 * Toolbar glyph: gray = not broadcasting presence; live = heartbeats active.
 * Signed-out also uses gray (no badge) so the icon stays calm until you sign in.
 */
export type ToolbarGlyph = "gray" | "live";

const SIZES = [16, 32, 48] as const;

const GRAY = { bg: "#52525b", fg: "#d4d4d8" };
const LIVE = { bg: "#059669", fg: "#a7f3d0" };

function renderGlyphImageData(size: number, glyph: ToolbarGlyph): ImageData {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new ImageData(size, size);
  }
  const { bg, fg } = glyph === "live" ? LIVE : GRAY;
  const r = size * 0.2;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = fg;
  const inner = glyph === "live" ? size * 0.22 : size * 0.15;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, inner, 0, Math.PI * 2);
  ctx.fill();

  if (glyph === "live") {
    ctx.strokeStyle = fg;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = Math.max(1, size * 0.08);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.36, -Math.PI / 2, Math.PI * 0.75);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  return ctx.getImageData(0, 0, size, size);
}

export type ToolbarPresentation = {
  glyph: ToolbarGlyph;
  /** `null` = signed out (badge hidden). Otherwise friends currently playing (feed length). */
  badgeCount: number | null;
};

let lastGlyph: ToolbarGlyph | null = null;
let lastBadgeText: string | null = "\x00";

function formatBadge(count: number): string {
  if (count > 99) return "99+";
  return String(count);
}

async function applyBadgeChrome(p: ToolbarPresentation): Promise<void> {
  if (p.badgeCount === null) {
    await browser.action.setBadgeBackgroundColor({ color: "#52525b" });
    try {
      await browser.action.setBadgeTextColor({ color: "#fafafa" });
    } catch {
      /* optional in older Chromium */
    }
    return;
  }
  if (p.glyph === "live") {
    await browser.action.setBadgeBackgroundColor({ color: "#047857" });
    try {
      await browser.action.setBadgeTextColor({ color: "#ecfdf5" });
    } catch {
      /* optional */
    }
    return;
  }
  await browser.action.setBadgeBackgroundColor({ color: "#3f3f46" });
  try {
    await browser.action.setBadgeTextColor({ color: "#fafafa" });
  } catch {
    /* optional */
  }
}

export async function applyToolbarPresentation(p: ToolbarPresentation): Promise<void> {
  try {
    const glyphChanged = lastGlyph !== p.glyph;
    const nextText = p.badgeCount === null ? "" : formatBadge(p.badgeCount);
    const textChanged = lastBadgeText !== nextText;

    if (glyphChanged) {
      lastGlyph = p.glyph;
      const imageData: Record<string, ImageData> = {};
      for (const size of SIZES) {
        imageData[String(size)] = renderGlyphImageData(size, p.glyph);
      }
      await browser.action.setIcon({ imageData });
    }

    if (textChanged) {
      lastBadgeText = nextText;
      await browser.action.setBadgeText({ text: nextText });
    }

    if (glyphChanged || textChanged) {
      await applyBadgeChrome(p);
    }
  } catch (e) {
    console.warn("[jamful] toolbar presentation failed", e);
  }
}
