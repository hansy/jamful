import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("..", import.meta.url));
const orange = "#c2410c";
const amber = "#f59e0b";
const amberLight = "#fcd34d";
const cream = "#fffdf8";
const black = "#09090b";
const muted = "#a1a1aa";
const green = "#22c55e";

const extensionRows = [
  { avatar: "/avatars/levelsio.jpg", name: "@levelsio", game: "Astropilot VR", tag: "VR" },
  { avatar: "/avatars/marclou.jpg", name: "@marclou", game: "MoonCraft" },
  { avatar: "/avatars/chongdashu.jpg", name: "@chongdashu", game: "Field of Command" },
  { avatar: "/avatars/vincent31788.jpg", name: "@vincent31788", game: "bitwars" },
];

type AvatarSources = Record<string, string>;

function svgBody(svg: string) {
  return svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
}

function jarSvg(size = 128) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="${size}" height="${size}" fill="none">
  <defs>
    <linearGradient id="lid" x1="35" y1="17" x2="93" y2="31" gradientUnits="userSpaceOnUse">
      <stop stop-color="${amberLight}" />
      <stop offset="1" stop-color="${amber}" />
    </linearGradient>
    <linearGradient id="glass" x1="29" y1="35" x2="103" y2="111" gradientUnits="userSpaceOnUse">
      <stop stop-color="#fffef9" />
      <stop offset="1" stop-color="#fff7ed" />
    </linearGradient>
  </defs>
  <rect x="31" y="17" width="66" height="13" rx="6.5" fill="url(#lid)" stroke="${orange}" stroke-width="6" />
  <path d="M39 30H89C100 34 108 44 108 57V88C108 101 98 111 85 111H43C30 111 20 101 20 88V57C20 44 28 34 39 30Z" fill="url(#glass)" stroke="${orange}" stroke-width="6" />
  <path d="M40 48C34 58 34 75 40 86" stroke="white" stroke-linecap="round" stroke-width="7" opacity=".55" />
  <path d="M81 38C91 43 96 51 96 63" stroke="white" stroke-linecap="round" stroke-width="4" opacity=".28" />
</svg>`;
}

function toolbarCountIconSvg(count = 4) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128" fill="none">
    <style>
      * { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    </style>
    ${svgBody(jarSvg())}
    <circle cx="90" cy="36" r="27" fill="${orange}" stroke="#fff7ed" stroke-width="6"/>
    <text x="90" y="47" text-anchor="middle" font-size="35" font-weight="850" fill="#fff7ed">${count}</text>
  </svg>`;
}

function extensionPanelSvg(
  width = 420,
  height = 560,
  avatarSources: AvatarSources = {},
) {
  const rows = extensionRows
    .map((row, index) => {
      const y = 250 + index * 66;
      const avatar = avatarSources[row.avatar] ?? row.avatar;
      return `<g>
        <clipPath id="avatar-${index}"><circle cx="54" cy="${y + 24}" r="24"/></clipPath>
        <image href="${avatar}" x="30" y="${y}" width="48" height="48" clip-path="url(#avatar-${index})" preserveAspectRatio="xMidYMid slice"/>
        ${row.tag ? `<rect x="60" y="${y + 34}" width="26" height="18" rx="5" fill="#7c3aed"/><text x="73" y="${y + 47}" text-anchor="middle" font-size="10" font-weight="800" fill="white">${row.tag}</text>` : ""}
        <text x="96" y="${y + 17}" font-size="18" font-weight="800" fill="#f8fafc">${row.name}</text>
        <circle cx="104" cy="${y + 36}" r="6" fill="${green}"/>
        <text x="118" y="${y + 42}" font-size="15" font-weight="600" fill="#a1a1aa">Playing <tspan fill="#f8fafc">${row.game}</tspan></text>
        <circle cx="366" cy="${y + 25}" r="22" fill="#27272a"/>
        <path d="M360 ${y + 15}L360 ${y + 35}L377 ${y + 25}Z" fill="none" stroke="#f8fafc" stroke-width="3" stroke-linejoin="round"/>
      </g>`;
    })
    .join("");

  const currentUserAvatar =
    avatarSources["/avatars/laxbrownie.jpg"] ?? "/avatars/laxbrownie.jpg";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <style>
      * { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    </style>
    <rect width="${width}" height="${height}" rx="30" fill="${black}"/>
    <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="29" fill="none" stroke="#27272a" stroke-width="2"/>
    <g>
      <clipPath id="me"><circle cx="55" cy="52" r="28"/></clipPath>
      <image href="${currentUserAvatar}" x="27" y="24" width="56" height="56" clip-path="url(#me)" preserveAspectRatio="xMidYMid slice"/>
      <text x="104" y="44" font-size="20" font-weight="800" fill="#fafafa">@laxbrownie</text>
      <circle cx="111" cy="66" r="6" fill="${green}"/>
      <text x="126" y="72" font-size="16" font-weight="600" fill="#a1a1aa">Playing Tiny Hamlet</text>
      <path d="M369 52L379 62L389 52" fill="none" stroke="#a1a1aa" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    <line x1="0" y1="106" x2="${width}" y2="106" stroke="#27272a"/>
    <rect x="12" y="122" width="190" height="50" rx="10" fill="#27272a"/>
    <text x="107" y="154" text-anchor="middle" font-size="18" font-weight="800" fill="#fafafa">Activity</text>
    <text x="300" y="154" text-anchor="middle" font-size="18" font-weight="800" fill="#fafafa">Discover</text>
    <line x1="0" y1="188" x2="${width}" y2="188" stroke="#27272a"/>
    <text x="28" y="222" font-size="13" font-weight="800" letter-spacing="2" fill="#a1a1aa">PEOPLE YOU FOLLOW</text>
    <rect x="360" y="204" width="36" height="36" rx="10" fill="#27272a"/>
    <text x="378" y="228" text-anchor="middle" font-size="18" font-weight="800" fill="#d4d4d8">4</text>
    ${rows}
  </svg>`;
}

function browserGraphicSvg(
  width = 720,
  height = 560,
  avatarSources: AvatarSources = {},
) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <style>
      * { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    </style>
    <rect width="${width}" height="${height}" rx="32" fill="#f4f4f5"/>
    <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="31" fill="none" stroke="#d4d4d8" stroke-width="2"/>
    <circle cx="38" cy="34" r="7" fill="#a1a1aa"/>
    <circle cx="62" cy="34" r="7" fill="#a1a1aa"/>
    <circle cx="86" cy="34" r="7" fill="#a1a1aa"/>
    <rect x="120" y="20" width="390" height="28" rx="10" fill="#ffffff" stroke="#d4d4d8"/>
    <rect x="140" y="31" width="130" height="6" rx="3" fill="#d4d4d8"/>
    <rect x="574" y="18" width="32" height="32" rx="9" fill="#ffffff" stroke="#d4d4d8"/>
    <rect x="622" y="18" width="32" height="32" rx="9" fill="${orange}"/>
    <svg x="625" y="20" width="26" height="26" viewBox="0 0 128 128">${svgBody(toolbarCountIconSvg(4))}</svg>
    <rect x="26" y="78" width="360" height="18" rx="9" fill="#e4e4e7"/>
    <rect x="26" y="116" width="270" height="14" rx="7" fill="#e4e4e7"/>
    <rect x="26" y="164" width="250" height="130" rx="16" fill="#e4e4e7" opacity=".72"/>
    <rect x="26" y="318" width="290" height="130" rx="16" fill="#e4e4e7" opacity=".72"/>
    <svg x="308" y="72" width="388" height="516" viewBox="0 0 420 560">${svgBody(extensionPanelSvg(420, 560, avatarSources))}</svg>
  </svg>`;
}

function socialSvg(
  width = 1200,
  height = 630,
  avatarSources: AvatarSources = {},
) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <style>
      * { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    </style>
    <rect width="${width}" height="${height}" fill="${black}"/>
    <circle cx="1010" cy="110" r="220" fill="#7c2d12" opacity=".22"/>
    <circle cx="160" cy="560" r="260" fill="#3f1d0b" opacity=".26"/>
    <text x="80" y="135" font-size="34" font-weight="800" fill="${amber}">jamful</text>
    <text x="80" y="246" font-size="58" font-weight="850" fill="#fafafa">See what games</text>
    <text x="80" y="314" font-size="58" font-weight="850" fill="#fafafa">people are playing.</text>
    <text x="84" y="382" font-size="25" font-weight="500" fill="${muted}">A browser activity feed for supported Vibe Jam games.</text>
    <svg x="745" y="60" width="395" height="500" viewBox="0 0 720 560">${svgBody(browserGraphicSvg(720, 560, avatarSources))}</svg>
  </svg>`;
}

async function svgToPng(svg: string, outPath: string, width?: number, height?: number) {
  let image = sharp(Buffer.from(svg));
  if (width || height) image = image.resize(width, height);
  await image.png().toFile(outPath);
}

async function main() {
  const websitePublic = join(root, "apps/website/public");
  const extensionPublic = join(root, "apps/extension/public");
  const extensionIconDir = join(extensionPublic, "icon");
  const storeDir = join(root, "apps/extension/store");

  await mkdir(websitePublic, { recursive: true });
  await mkdir(extensionIconDir, { recursive: true });
  await mkdir(storeDir, { recursive: true });

  const avatarSources: AvatarSources = {};
  const avatarPaths = [
    "/avatars/laxbrownie.jpg",
    ...extensionRows.map((row) => row.avatar),
  ];
  await Promise.all(
    avatarPaths.map(async (avatarPath) => {
      const image = await readFile(join(websitePublic, "avatars", basename(avatarPath)));
      avatarSources[avatarPath] = `data:image/jpeg;base64,${image.toString("base64")}`;
    }),
  );

  const jar = jarSvg();
  await writeFile(join(extensionIconDir, "jar.svg"), jar, "utf-8");
  await writeFile(join(websitePublic, "favicon.svg"), jar, "utf-8");
  for (const size of [16, 24, 32, 48, 96, 128]) {
    await svgToPng(jar, join(extensionIconDir, `${size}.png`), size, size);
  }
  await svgToPng(jar, join(websitePublic, "favicon.png"), 128, 128);
  await svgToPng(jar, join(websitePublic, "apple-touch-icon.png"), 180, 180);

  const extensionPanel = extensionPanelSvg(420, 560, avatarSources);
  await svgToPng(extensionPanel, join(websitePublic, "extension-panel.png"));
  const browserGraphic = browserGraphicSvg(720, 560, avatarSources);
  await svgToPng(browserGraphic, join(websitePublic, "extension-preview.png"));
  await svgToPng(socialSvg(1200, 630, avatarSources), join(websitePublic, "social-image.png"));

  await svgToPng(browserGraphic, join(storeDir, "screenshot-1.png"), 1280, 800);
  await svgToPng(socialSvg(1200, 630, avatarSources), join(storeDir, "promo-small.png"), 440, 280);

  console.log("Generated Jamful brand, website, social, and Chrome Store assets.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
