// Regenerate all app icons + the social share card from the vector art in
// assets/. Usage: node scripts/gen-icons.mjs   (sharp comes in via Next's
// dependency tree)
import sharp from "sharp";
import { readFileSync } from "node:fs";

const icon = readFileSync(new URL("../assets/icon.svg", import.meta.url));
const og = readFileSync(new URL("../assets/og.svg", import.meta.url));

const targets = [
  { out: "app/icon.png", size: 256 },
  { out: "app/apple-icon.png", size: 180 },
  { out: "public/icon-192.png", size: 192 },
  { out: "public/icon-512.png", size: 512 },
  // Maskable: same art, safe because key elements sit inside the inner 80%.
  { out: "public/icon-maskable.png", size: 512 },
];

for (const { out, size } of targets) {
  await sharp(icon, { density: 300 }).resize(size, size).png().toFile(out);
  console.log(`wrote ${out} (${size}x${size})`);
}

// iOS App Store icon: 1024px and NO alpha channel (App Store rejects
// transparency), hence the flatten onto the art's own sky color.
await sharp(icon, { density: 300 })
  .resize(1024, 1024)
  .flatten({ background: "#0a1730" })
  .png()
  .toFile("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png");
console.log("wrote ios AppIcon-512@2x.png (1024x1024, flattened)");

// Social share card (Open Graph / Twitter), referenced from app/layout.tsx.
await sharp(og, { density: 300 }).resize(1200, 630).png().toFile("public/og.png");
console.log("wrote public/og.png (1200x630)");
