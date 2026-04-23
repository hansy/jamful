const SIZES = [16, 24, 32, 48] as const;

type ToolbarVariant = "signed-out" | "online" | "broadcasting";

type ToolbarPalette = {
  frame: string;
  frameFill: string;
  lid: string;
  lidHighlight: string;
  jarFill: string;
  jarOutline: string;
  number: string;
  numberStroke: string;
  glow: string;
  glowEdge: string;
};

type RoundedBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
};

const PALETTES: Record<ToolbarVariant, ToolbarPalette> = {
  "signed-out": {
    frame: "rgba(0, 0, 0, 0)",
    frameFill: "rgba(0, 0, 0, 0)",
    lid: "#a1a1aa",
    lidHighlight: "rgba(255, 255, 255, 0.32)",
    jarFill: "#fafafa",
    jarOutline: "#71717a",
    number: "#52525b",
    numberStroke: "#fafafa",
    glow: "rgba(0, 0, 0, 0)",
    glowEdge: "rgba(0, 0, 0, 0)",
  },
  online: {
    frame: "rgba(0, 0, 0, 0)",
    frameFill: "rgba(0, 0, 0, 0)",
    lid: "#f59e0b",
    lidHighlight: "rgba(255, 251, 235, 0.54)",
    jarFill: "#fffdf8",
    jarOutline: "#c2410c",
    number: "#be123c",
    numberStroke: "#fff7ed",
    glow: "rgba(0, 0, 0, 0)",
    glowEdge: "rgba(0, 0, 0, 0)",
  },
  broadcasting: {
    frame: "rgba(0, 0, 0, 0)",
    frameFill: "#be123c",
    lid: "#f59e0b",
    lidHighlight: "rgba(255, 251, 235, 0.54)",
    jarFill: "rgba(0, 0, 0, 0)",
    jarOutline: "#fff7ed",
    number: "#fff7ed",
    numberStroke: "rgba(255, 247, 237, 0.18)",
    glow: "rgba(0, 0, 0, 0)",
    glowEdge: "rgba(0, 0, 0, 0)",
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundedRectPath(
  ctx: OffscreenCanvasRenderingContext2D,
  box: RoundedBox,
): void {
  const r = clamp(box.r, 0, Math.min(box.w / 2, box.h / 2));
  ctx.beginPath();
  ctx.moveTo(box.x + r, box.y);
  ctx.lineTo(box.x + box.w - r, box.y);
  ctx.quadraticCurveTo(box.x + box.w, box.y, box.x + box.w, box.y + r);
  ctx.lineTo(box.x + box.w, box.y + box.h - r);
  ctx.quadraticCurveTo(
    box.x + box.w,
    box.y + box.h,
    box.x + box.w - r,
    box.y + box.h,
  );
  ctx.lineTo(box.x + r, box.y + box.h);
  ctx.quadraticCurveTo(box.x, box.y + box.h, box.x, box.y + box.h - r);
  ctx.lineTo(box.x, box.y + r);
  ctx.quadraticCurveTo(box.x, box.y, box.x + r, box.y);
  ctx.closePath();
}

function fillRoundedRect(
  ctx: OffscreenCanvasRenderingContext2D,
  box: RoundedBox,
): void {
  roundedRectPath(ctx, box);
  ctx.fill();
}

function strokeRoundedRect(
  ctx: OffscreenCanvasRenderingContext2D,
  box: RoundedBox,
): void {
  roundedRectPath(ctx, box);
  ctx.stroke();
}

function iconCountText(size: number, count: number): string {
  if (count < 0) return "";
  if (count <= 9) return String(count);
  return size <= 16 ? "9+" : "9+";
}

function titleForPresentation(p: ToolbarPresentation): string {
  if (p.onlineCount === null) {
    return "Jamful: sign in to see who's online";
  }
  const noun = p.onlineCount === 1 ? "friend" : "friends";
  if (p.broadcasting) {
    return `Jamful: broadcasting, ${p.onlineCount} ${noun} online`;
  }
  return `Jamful: ${p.onlineCount} ${noun} online`;
}

function drawCount(
  ctx: OffscreenCanvasRenderingContext2D,
  size: number,
  text: string,
  palette: ToolbarPalette,
  body: RoundedBox,
): void {
  const fontSize =
    text.length >= 3 ? size * 0.21 : text.length === 2 ? size * 0.31 : size * 0.5;
  const y = body.y + body.h * 0.49;

  ctx.save();
  ctx.font = `900 ${fontSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  if (palette.numberStroke !== "rgba(0, 0, 0, 0)") {
    ctx.lineWidth = Math.max(1.1, size * 0.1);
    ctx.strokeStyle = palette.numberStroke;
    ctx.strokeText(text, size / 2, y);
  }
  ctx.fillStyle = palette.number;
  ctx.fillText(text, size / 2, y);
  ctx.restore();
}

function drawJarImageData(size: number, p: ToolbarPresentation): ImageData {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new ImageData(size, size);
  }

  const variant: ToolbarVariant =
    p.onlineCount === null ? "signed-out" : p.broadcasting ? "broadcasting" : "online";
  const palette = PALETTES[variant];
  const countText = p.onlineCount === null ? "" : iconCountText(size, p.onlineCount);

  const frame: RoundedBox = {
    x: size * 0.06,
    y: size * 0.06,
    w: size * 0.88,
    h: size * 0.88,
    r: size * 0.2,
  };
  const lid: RoundedBox = {
    x: size * 0.24,
    y: size * 0.135,
    w: size * 0.52,
    h: size * 0.085,
    r: size * 0.04,
  };
  const body: RoundedBox = {
    x: size * 0.13,
    y: size * 0.235,
    w: size * 0.74,
    h: size * 0.6,
    r: size * 0.16,
  };

  if (variant === "broadcasting") {
    ctx.fillStyle = palette.frameFill;
    fillRoundedRect(ctx, frame);
  }

  if (palette.jarFill !== "rgba(0, 0, 0, 0)") {
    ctx.fillStyle = palette.jarFill;
    fillRoundedRect(ctx, body);
  }

  ctx.fillStyle = palette.lid;
  fillRoundedRect(ctx, lid);
  ctx.fillStyle = palette.lidHighlight;
  fillRoundedRect(ctx, {
    x: lid.x + size * 0.02,
    y: lid.y + size * 0.012,
    w: lid.w - size * 0.04,
    h: lid.h * 0.22,
    r: lid.r,
  });

  ctx.strokeStyle = palette.jarOutline;
  ctx.lineWidth = Math.max(1.1, size * 0.075);
  strokeRoundedRect(ctx, lid);
  strokeRoundedRect(ctx, body);

  ctx.save();
  ctx.strokeStyle = variant === "broadcasting" ? "rgba(255, 255, 255, 0.26)" : "rgba(255, 255, 255, 0.4)";
  ctx.lineWidth = Math.max(1, size * 0.04);
  ctx.beginPath();
  ctx.moveTo(body.x + body.w * 0.22, body.y + body.h * 0.12);
  ctx.quadraticCurveTo(
    body.x + body.w * 0.12,
    body.y + body.h * 0.28,
    body.x + body.w * 0.17,
    body.y + body.h * 0.48,
  );
  ctx.stroke();
  ctx.restore();

  if (countText) {
    drawCount(ctx, size, countText, palette, body);
  }

  return ctx.getImageData(0, 0, size, size);
}

export type ToolbarPresentation = {
  onlineCount: number | null;
  broadcasting: boolean;
};

let lastRenderKey: string | null = null;
let lastTitle: string | null = null;

export async function applyToolbarPresentation(p: ToolbarPresentation): Promise<void> {
  try {
    const renderKey = `${p.onlineCount === null ? "signed-out" : p.onlineCount}|${p.broadcasting ? "live" : "idle"}`;

    if (lastRenderKey !== renderKey) {
      lastRenderKey = renderKey;
      const imageData: Record<string, ImageData> = {};
      for (const size of SIZES) {
        imageData[String(size)] = drawJarImageData(size, p);
      }
      await browser.action.setIcon({ imageData });
      await browser.action.setBadgeText({ text: "" });
    }

    const nextTitle = titleForPresentation(p);
    if (lastTitle !== nextTitle) {
      lastTitle = nextTitle;
      await browser.action.setTitle({ title: nextTitle });
    }
  } catch {
    /* ignore */
  }
}
