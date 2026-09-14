import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : "playwright"
);
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const target = path.resolve(root, "." + decodeURIComponent(url.pathname));
    if (!target.startsWith(root + path.sep)) throw Error("path");
    const data = await readFile(target);
    const type =
      {
        ".html": "text/html",
        ".mjs": "text/javascript",
        ".js": "text/javascript",
        ".json": "application/json",
        ".css": "text/css",
        ".webmanifest": "application/manifest+json",
      }[path.extname(target)] || "text/plain";
    res.writeHead(200, { "content-type": type });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/os.html`;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE
    ? { executablePath: process.env.BROWSER_EXECUTABLE }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 375, height: 812 },
  timezoneId: "Asia/Shanghai",
  acceptDownloads: true,
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (err) => errors.push(err.message));
const date = "2026-09-22";
await page.clock.setFixedTime(new Date(date + "T10:00:00+08:00"));
const submit = async (dialog) => {
  await page.locator(`#${dialog} button[type=submit]`).click();
  await page.locator(`#${dialog}`).waitFor({ state: "hidden" });
};
const field = (dialog, name) => page.locator(`#${dialog} [name="${name}"]`);
const readState = () =>
  page.evaluate(async () => {
    const { decryptJson } = await import("./app/storage.mjs");
    return decryptJson(
      JSON.parse(localStorage.getItem("71day-os-state-v1")),
      "synthetic-password",
    );
  });
const close = (dialog) =>
  page
    .locator(`#${dialog} [data-dismiss],#${dialog} [data-close]`)
    .first()
    .click();
const unlock = async (first = false) => {
  await page.locator("#vaultPassword").fill("synthetic-password");
  if (first) await page.locator("#vaultConfirm").fill("synthetic-password");
  await page.locator("#unlockForm button").click();
  await page.locator("#app").waitFor({ state: "visible" });
  assert.equal(await page.locator("#lockScreen").isVisible(), false);
};
try {
  await page.goto(url);
  await unlock(true);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  // Regression: invalid stage edits never reach preview or persist.
  await page.locator("#editStageButton").click();
  await page.locator("#stageEnd").fill("2026-10-25");
  page.once("dialog", async (dialog) => {
    assert.match(dialog.message(), /重叠/);
    await dialog.accept();
  });
  await page.locator("#previewStageButton").click();
  await close("stageDialog");
  console.log("PASS: stage overlap rejected");
  // Create a meeting through the actual mobile form.
  await page.locator("#addEventButton").click();
  await field("eventDialog", "title").fill("Synthetic Tencent");
  await field("eventDialog", "date").fill(date);
  await field("eventDialog", "start").fill("14:00");
  await field("eventDialog", "end").fill("15:00");
  await field("eventDialog", "location").fill("Synthetic room");
  await field("eventDialog", "doc").selectOption("tencent");
  await submit("eventDialog");
  await page.locator("#dailyQueue [data-collection=events]").click();
  await page.locator("#activityDialog [data-prep]").click();
  for (let i = 0; i < 4; i++)
    await field("prepDialog", "status" + i).selectOption("done");
  await submit("prepDialog");
  assert.match(await page.locator("#activityDialog").innerText(), /80%/);
  assert.match(await page.locator("#dailyQueue").innerText(), /80%/);
  assert.equal(
    await page
      .locator("#activityDialog [data-prep]")
      .evaluate((el) => el.getBoundingClientRect().height >= 44),
    true,
  );
  await page.locator("#activityDialog [data-prep]").click();
  await field("prepDialog", "status4").selectOption("done");
  await field("prepDialog", "markPrepared").selectOption("yes");
  await submit("prepDialog");
  assert.match(await page.locator("#activityDialog").innerText(), /Upcoming/);
  await page
    .locator("#stageActions button")
    .filter({ hasText: "实际完成" })
    .click();
  await field("completionDialog", "actualAt").fill(date + "T09:00");
  await field("completionDialog", "evidence").fill(
    "Synthetic verified occurrence",
  );
  await submit("completionDialog");
  await page
    .locator("#stageActions button")
    .filter({ hasText: "补记成果" })
    .click();
  await field("notesDialog", "summary").fill("Synthetic actual outcome");
  await field("notesDialog", "statements").fill("Synthetic statement");
  await submit("notesDialog");
  console.log("PASS: prep, completion and notes");
  // Two linked actions, including Waiting For with independent deadlines.
  for (const waiting of [false, true]) {
    await page.locator("#activityDialog [data-action]").click();
    await field("loopDialog", "title").fill(
      waiting ? "Synthetic waiting" : "Synthetic deliver",
    );
    if (waiting) {
      await field("loopDialog", "status").selectOption("waiting");
      await field("loopDialog", "waitingOn").fill("Synthetic host");
      await field("loopDialog", "expected").fill("Slides");
      await field("loopDialog", "checkIn").fill("2026-09-25");
      await field("loopDialog", "dueDate").fill("2026-09-21");
    }
    await submit("loopDialog");
  }
  await page
    .locator("#stageActions button")
    .filter({ hasText: "复核 Follow-up" })
    .click();
  await submit("followupDialog");
  page.once("dialog", async (dialog) => {
    assert.match(dialog.message(), /未解决/);
    await dialog.accept();
  });
  await page
    .locator("#stageActions button")
    .filter({ hasText: "关闭" })
    .click();

  let s = await readState();
  assert.equal(s.events[0].stage, "Follow-up");
  assert.equal(s.actions.length, 2);
  assert.equal(
    await page.locator("#dailyQueue [data-collection=actions]").count(),
    2,
  );
  for (const title of ["Synthetic deliver", "Synthetic waiting"]) {
    await page
      .locator("#linkedActions button")
      .filter({ hasText: title })
      .click();
    await field("loopDialog", "status").selectOption("completed");
    await field("loopDialog", "evidence").fill("Synthetic delivered");
    await submit("loopDialog");
  }
  await page
    .locator("#stageActions button")
    .filter({ hasText: "关闭" })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector("#activityDialog")
      .textContent.includes("当前：Closed"),
  );
  s = await readState();
  assert.equal(s.events[0].stage, "Closed");
  assert.equal(s.events[0].notes.summary, "Synthetic actual outcome");
  await page.locator("#linkedActions button").first().click();
  await field("loopDialog", "status").selectOption("open");
  await submit("loopDialog");
  s = await readState();
  assert.equal(s.events[0].stage, "Follow-up");
  assert.equal(s.actions.length, 2);
  await close("activityDialog");
  console.log("PASS: followups, blocked closure and reopen");
  // Explicit departure + arrival dates and zones survive storage and reopen.
  await page.locator("#addTravelButton").click();
  await field("travelDialog", "title").fill("Synthetic Tokyo Toronto");
  await field("travelDialog", "date").fill("2026-10-25");
  await field("travelDialog", "departureTime").fill("17:00");
  await field("travelDialog", "departureTimeZone").selectOption("Asia/Tokyo");
  await field("travelDialog", "arrivalDate").fill("2026-10-25");
  await field("travelDialog", "arrivalTime").fill("16:00");
  await field("travelDialog", "arrivalTimeZone").selectOption(
    "America/Toronto",
  );
  await field("travelDialog", "dueDate").fill(date);
  await submit("travelDialog");
  await page.locator("#dailyQueue [data-collection=travel]").click();
  await page.locator("#activityDialog [data-edit]").click();
  assert.equal(
    await field("travelDialog", "arrivalTimeZone").inputValue(),
    "America/Toronto",
  );
  await field("travelDialog", "status").selectOption("confirmed");
  await field("travelDialog", "reference").fill("Synthetic receipt");
  await submit("travelDialog");
  s = await readState();
  assert.equal(s.travel[0].stage, "Planned");
  assert.equal(s.travel[0].status, "confirmed");
  assert.equal(s.travel[0].arrivalDate, "2026-10-25");
  await close("activityDialog");
  console.log("PASS: international travel confirmation");
  // Datetime-local defaults use wall time; interaction persists an unambiguous instant.
  await page.locator(".bottom-nav [data-nav=people]").click();
  await page.locator("#addPersonButton").click();
  await page.locator("#personName").fill("Synthetic host");
  await page.locator("#personForm button[type=submit]").click();
  await page.locator("#personDialog").waitFor({ state: "hidden" });
  await page.locator("#peopleList button").click();
  await page.locator("#addInteractionButton").click();
  assert.equal(
    await page.locator("#interactionAt").inputValue(),
    date + "T10:00",
  );
  await page.locator("#interactionText").fill("Synthetic private discussion");
  await page.locator("#interactionForm button[type=submit]").click();
  await page.locator("#interactionDialog").waitFor({ state: "hidden" });
  await page.locator("#personDetailDialog [data-close]").click();
  assert.equal((await readState()).interactions[0].at, date + "T02:00:00.000Z");
  assert.doesNotMatch(
    await page.evaluate(() => localStorage.getItem("71day-os-state-v1")),
    /Synthetic/,
  );
  // Save failure keeps the dialog open and preserves the committed snapshot.
  await page.locator(".bottom-nav [data-nav=today]").click();
  await page.locator("#addActionButton").click();
  await field("loopDialog", "title").fill("Must not persist");
  await page.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      throw Error("Synthetic quota failure");
    };
  });
  await page.locator("#loopDialog button[type=submit]").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#loopDialog [role=alert]")
      .textContent.includes("quota"),
  );
  assert.equal(
    (await readState()).actions.some((a) => a.title === "Must not persist"),
    false,
  );
  await page.evaluate(
    () => (Storage.prototype.setItem = window.originalSetItem),
  );
  await close("loopDialog");
  // Backup, encrypted reload, restore and PWA offline navigation.
  await page.locator(".bottom-nav [data-nav=settings]").click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#backupButton").click();
  const download = await downloadPromise;
  const backup = await download.path();
  await page.reload();
  await unlock();
  assert.equal(
    (await readState()).events[0].notes.summary,
    "Synthetic actual outcome",
  );
  await page.locator(".bottom-nav [data-nav=settings]").click();
  await page.locator("#restoreInput").setInputFiles(backup);
  await page.locator("#restoreDialog").waitFor({ state: "visible" });
  await page.locator("#restoreConfirmButton").click();
  await page.locator("#restoreDialog").waitFor({ state: "hidden" });
  assert.equal((await readState()).actions.length, 2);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await unlock();
  assert.equal(
    (await readState()).travel[0].arrivalTimeZone,
    "America/Toronto",
  );
  await context.setOffline(false);
  await page.locator(".bottom-nav [data-nav=today]").click();
  await mkdir(path.join(root, "test-results"), { recursive: true });
  await page.screenshot({
    path: path.join(root, "test-results/mobile.png"),
    fullPage: true,
  });
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
  }
  await page.locator("#lockButton").click();
  await page.locator("#lockScreen").waitFor({ state: "visible" });
  assert.equal(
    await page
      .locator("body")
      .innerText()
      .then((t) => t.includes("Synthetic actual outcome")),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: mobile lifecycle, waiting, travel zones, CRM wall time, failed save, backup/restore, reload, offline, lock and 375/1280px layouts",
  );
} catch (error) {
  await mkdir(path.join(root, "test-results"), { recursive: true });
  await page.screenshot({
    path: path.join(root, "test-results/failure.png"),
    fullPage: true,
  });
  console.error(
    (await page.locator("dialog[open]").allTextContents()).join("\n"),
  );
  throw error;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
