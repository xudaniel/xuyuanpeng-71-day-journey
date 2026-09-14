import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const seed = JSON.parse(
  fs.readFileSync(new URL("../data/journey.json", import.meta.url)),
);
const core = await import("../app/core.mjs");

test("seed validates and day number is bounded", () => {
  assert.equal(core.validateJourneyData(seed).ok, true);
  assert.equal(core.dayNumber(seed, "2026-08-25"), 1);
  assert.equal(core.dayNumber(seed, "2026-11-03"), 71);
});

test("stage change impact and undo preserve canonical seed", () => {
  let state = core.defaultState();
  state.events.push({
    id: "e1",
    date: "2026-09-20",
    start: "10:00",
    end: "11:00",
    title: "Meeting",
  });
  const impact = core.impactOfStageChange(
    seed,
    state,
    "stage-06-shenzhen-long",
    { end: "2026-09-28" },
  );
  assert.equal(impact.counts.events, 1);
  state = core.applyStageChange(
    seed,
    state,
    "stage-06-shenzhen-long",
    { end: "2026-09-28" },
    "test",
  );
  assert.equal(
    core
      .effectiveStages(seed, state)
      .find((s) => s.id === "stage-06-shenzhen-long").end,
    "2026-09-28",
  );
  state = core.undoLastChange(state);
  assert.equal(
    core
      .effectiveStages(seed, state)
      .find((s) => s.id === "stage-06-shenzhen-long").end,
    "2026-10-22",
  );
});

test("conflict engine finds short airport buffer", () => {
  const state = core.defaultState();
  state.events = [
    {
      id: "m",
      date: "2026-09-20",
      start: "13:00",
      end: "14:00",
      title: "Meeting",
    },
  ];
  state.travel = [
    {
      id: "f",
      date: "2026-09-20",
      departureTime: "14:30",
      arrivalTime: "17:00",
      title: "SZX flight",
      mode: "flight",
    },
  ];
  const risks = core.detectConflicts(state);
  assert.equal(risks.length, 1);
  assert.equal(risks[0].kind, "buffer");
  assert.equal(risks[0].level, "critical");
});

test("relationship summary separates waiting and owed", () => {
  const state = core.defaultState();
  state.people = [{ id: "p1", name: "Allen" }];
  state.actions = [
    { id: "a1", personId: "p1", status: "waiting" },
    { id: "a2", personId: "p1", status: "open" },
  ];
  const r = core.relationshipSummary(state, "p1");
  assert.equal(r.openLoops, 2);
  assert.equal(r.waiting.length, 1);
  assert.equal(r.owed.length, 1);
});
test("stage preview and apply reject overlaps, reordered stages, and impossible dates", () => {
  const state = core.defaultState(),
    id = "stage-06-shenzhen-long";
  for (const patch of [
    { end: "2026-10-25" },
    { start: "2026-09-12" },
    { start: "2026-12-01", end: "2026-12-02" },
    { end: "2026-09-31" },
  ]) {
    assert.throws(() => core.impactOfStageChange(seed, state, id, patch));
    assert.throws(() => core.applyStageChange(seed, state, id, patch));
  }
  state.stageOverrides["stage-07-tokyo"] = { start: "2026-10-20" };
  assert.throws(
    () => core.impactOfStageChange(seed, state, id, { city: "Shenzhen" }),
    /重叠/,
  );
  assert.deepEqual(state.history, []);
});

test("all nested intervals and retained buffers are compared even after ignoring one risk", () => {
  const state = core.defaultState();
  state.events = [
    ["A", "09:00", "17:00"],
    ["B", "10:00", "11:00"],
    ["C", "12:00", "13:00"],
    ["D", "17:15", "18:00"],
  ].map(([id, start, end]) => ({ id, start, end, date: "2026-09-20" }));
  const risks = core.detectConflicts(state);
  assert.ok(risks.some((r) => r.id === "overlap:A:B"));
  assert.ok(risks.some((r) => r.id === "overlap:A:C"));
  assert.ok(risks.some((r) => r.id === "buffer:A:D"));
  state.riskOverrides = [{ riskId: "overlap:A:B" }];
  assert.ok(core.detectConflicts(state).some((r) => r.id === "overlap:A:C"));
});

test("travel endpoints support international, overnight, and explicit invalid arrivals", () => {
  const leg = {
    id: "flight",
    date: "2026-10-25",
    departureTime: "17:00",
    departureTimeZone: "Asia/Tokyo",
    arrivalDate: "2026-10-25",
    arrivalTime: "16:00",
    arrivalTimeZone: "America/Toronto",
  };
  const { start, end } = core.travelInterval(leg);
  assert.equal(start, Date.parse("2026-10-25T08:00Z") / 60000);
  assert.equal(end, Date.parse("2026-10-25T20:00Z") / 60000);
  const state = {
    travel: [leg],
    events: [
      {
        id: "arrival-meeting",
        date: "2026-10-25",
        start: "15:00",
        end: "17:00",
        timeZone: "America/Toronto",
      },
    ],
  };
  assert.equal(core.detectConflicts(state)[0].kind, "overlap");
  const overnight = {
    ...leg,
    date: "2026-10-24",
    departureTime: "23:00",
    arrivalDate: "2026-10-25",
    arrivalTime: "02:00",
    arrivalTimeZone: "Asia/Tokyo",
  };
  assert.equal(
    core.travelInterval(overnight).end - core.travelInterval(overnight).start,
    180,
  );
  assert.throws(
    () => core.travelInterval({ ...overnight, arrivalDate: "2026-10-24" }),
    /到达/,
  );
  assert.equal(
    core.zonedEpochMinutes("2026-03-08", "03:30", "America/New_York"),
    Date.parse("2026-03-08T07:30Z") / 60000,
  );
  assert.throws(
    () => core.zonedEpochMinutes("2026-03-08", "02:30", "America/New_York"),
    /不存在/,
  );
});

test("datetime-local defaults preserve Shanghai wall time and local date boundaries", () => {
  const before = process.env.TZ;
  try {
    process.env.TZ = "Asia/Shanghai";
    assert.equal(
      core.localDateTimeValue(new Date("2026-09-14T18:45Z")),
      "2026-09-15T02:45",
    );
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
});
