// Screenshots the real running app for the video (read-only: nothing in ../frontend changes).
// Starts the app's own Vite dev server, drives it with headless Chrome, saves PNGs to public/shots.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public/shots");
mkdirSync(out, { recursive: true });
const PORT = 5199;
const BASE = `http://localhost:${PORT}`;
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const up = () => fetch(BASE).then((r) => r.ok, () => false);
// Reuse a dev server that's already running; otherwise start the app's own.
const server = (await up())
  ? null
  : spawn("npx", ["vite", "dev", "--port", String(PORT), "--strictPort"], {
      cwd: join(root, "../frontend"),
      stdio: "ignore",
    });
const ready = (async () => {
  for (let i = 0; i < 120; i++) {
    if (await up()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("dev server did not start");
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await ready;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 414, height: 860, deviceScaleFactor: 3 });
  // The app honours reduced motion, so every screenshot is a settled frame.
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);

  const frame = async () =>
    page.evaluate(() => {
      const el = [...document.querySelectorAll("div")].find((d) => d.className.includes("max-w-[390px]"));
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
  const shot = async (name) => {
    await sleep(900);
    await page.screenshot({ path: join(out, `${name}.png`), clip: await frame() });
    console.log("captured", name);
  };
  const go = async (path) => {
    await page.goto(BASE + path, { waitUntil: "load", timeout: 60_000 }).catch(() => {});
    await page.waitForSelector("main", { timeout: 60_000 });
    // Hydrated and the page transition finished: real text is visible in <main>.
    await page.waitForFunction(
      () => {
        const m = document.querySelector("main");
        const inner = m?.firstElementChild;
        return (m?.innerText.trim().length ?? 0) > 20 && inner && getComputedStyle(inner).opacity === "1";
      },
      { timeout: 60_000 },
    );
    await sleep(1200);
  };
  const clickText = async (text) => {
    await page.evaluate((text) => {
      const b = [...document.querySelectorAll("button, a")].find((e) => e.textContent?.includes(text));
      b?.click();
    }, text);
  };

  await go("/");
  await page.evaluate(() => localStorage.clear());
  await go("/");
  await shot("home");

  await go("/practice");
  await shot("practice");

  await go("/progress");
  await shot("progress");

  await go("/employee");
  await shot("analysts");

  // Caller codes: the employee picks the customer and issues a code (demo delivery only)...
  await go("/employee/verify");
  await page.type("#customer-search", "Alex", { delay: 40 });
  await page.waitForFunction(() => document.body.innerText.includes("ID: alex"), { timeout: 10_000 });
  await clickText("Alex Rivera");
  await page.waitForFunction(() => !document.body.innerText.includes("No customer selected"), { timeout: 10_000 });
  await clickText("Generate & send code");
  await page.waitForFunction(() => /\b\d{4}\b/.test(document.querySelector("[aria-label^='Employee code']")?.textContent ?? ""), { timeout: 10_000 });
  const code = await page.$eval("[aria-label^='Employee code']", (e) => e.textContent.trim());
  await shot("employee-code");

  // ...and the customer checks it.
  await go("/verify");
  await page.type("#caller-code", code, { delay: 60 });
  await clickText("Check caller");
  await page.waitForFunction(() => document.body.textContent.includes("Caller verified!"), { timeout: 10_000 });
  await shot("verify-verified");

  await browser.close();
} finally {
  server?.kill();
}
