// Render web/public/icon.svg to the PNG sizes the manifest and iOS need.
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const svg = await readFile(new URL("../web/public/icon.svg", import.meta.url), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of [["icon-192.png", 192, 0], ["icon-512.png", 512, 0], ["apple-touch-icon.png", 180, 0]]) {
  await page.setViewportSize({ width: size, height: size });
  // apple-touch-icon is masked by iOS itself, so draw it full-bleed without the rounded corners
  const body = name.startsWith("apple") ? svg.replace('rx="112"', 'rx="0"') : svg;
  await page.setContent(`<html><body style="margin:0;padding:${pad}px">${body.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: new URL(`../web/public/${name}`, import.meta.url).pathname, omitBackground: true });
}
await browser.close();
console.log("icons written");
