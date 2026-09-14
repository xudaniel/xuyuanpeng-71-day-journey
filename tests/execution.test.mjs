import test from "node:test";
import assert from "node:assert/strict";
import { defaultState } from "../app/core.mjs";
import * as E from "../app/execution.mjs";
const now = new Date("2026-09-22T10:00:00+08:00");
const blank = () => E.migrateState(defaultState());
const makeEvent = (s, id = "m", extra = {}) =>
  E.putActivity(
    s,
    "events",
    {
      id,
      title: "Synthetic meeting",
      date: "2026-09-22",
      start: "14:00",
      end: "15:00",
      timeZone: "Asia/Shanghai",
      ...extra,
    },
    now,
  );
const makeTravel = (s, extra = {}) =>
  E.putActivity(
    s,
    "travel",
    {
      id: "t",
      title: "Synthetic flight",
      date: "2026-09-22",
      departureTime: "15:00",
      arrivalDate: "2026-09-22",
      arrivalTime: "18:00",
      departureTimeZone: "Asia/Shanghai",
      arrivalTimeZone: "Asia/Tokyo",
      status: "unknown",
      nextAction: "Book ticket",
      ...extra,
    },
    now,
  );
const put = (s, id, extra = {}) =>
  E.putAction(
    s,
    { id, title: id, priority: "P1", status: "open", ...extra },
    now,
  );
const complete = (s, c, id) =>
  E.transition(
    s,
    c,
    id,
    "Completed",
    {
      actualAt: "2026-09-22T09:00+08:00",
      evidence: "Verified occurrence",
      reason: "Late entry",
    },
    now,
  );
const noteAndReview = (s, c, id, noFollowup = "No further obligations") => {
  E.saveNotes(s, c, id, {
    summary: "Actual result",
    statements: "Statement",
    observations: "Observation",
    judgments: "Judgment",
  });
  E.transition(s, c, id, "Notes", {}, now);
  E.transition(s, c, id, "Follow-up", { noFollowup }, now);
};

test("daily queue deduplicates waiting followups and derives P0/P1/P2 counts without mutating stored priorities", () => {
  const s = blank(),
    m = makeEvent(s);
  m.prep.forEach((p) => (p.status = "done"));
  m.location = "Room";
  m.readinessData = Object.fromEntries(
    E.MEETING_READINESS.map(([key]) => [key, true]),
  );
  for (let i = 0; i < 5; i++)
    put(s, "a" + i, {
      priority: i < 2 ? "P0" : "P1",
      date: "2026-09-22",
      dueDate: i === 2 ? "2026-09-21" : "",
    });
  let d = E.dashboard(s, now);
  assert.equal(d.rows.length, 5);
  assert.equal(d.rows.filter((r) => r.priority === "P0").length, 2);
  assert.equal(d.rows.filter((r) => r.priority === "P1").length, 3);
  assert.equal(d.rows.filter((r) => r.late).length, 1);
  assert.equal(d.next.start, "14:00");
  put(s, "waiting", {
    kind: "followup",
    eventId: "m",
    owner: "Me",
    status: "waiting",
    waitingOn: "Host",
    expected: "Slides",
    dueDate: "2026-09-23",
    checkIn: "2026-09-22",
  });
  put(s, "future", { dueDate: "2026-09-30" });
  put(s, "undated");
  d = E.dashboard(s, now);
  assert.equal(d.rows.filter((r) => r.id === "waiting").length, 1);
  assert.equal(d.waiting.length, 1);
  assert.ok(!d.rows.some((r) => ["future", "undated"].includes(r.id)));
  m.readinessData = {};
  m.priority = "P2";
  d = E.dashboard(s, now);
  assert.equal(d.rows.find((r) => r.id === "m").priority, "P0");
  assert.equal(m.priority, "P2");
});

test("date-only and timed deadlines preserve independent target, check-in, and stale timing", () => {
  assert.equal(E.overdue("2026-09-22", "2026-09-22", now), false);
  assert.equal(E.overdue("2026-09-22T09:00+08:00", "2026-09-22", now), true);
  assert.equal(E.deadlineDay("2026-09-23T00:30+09:00"), "2026-09-22");
  const a = {
    status: "waiting",
    dueDate: "2026-09-21",
    checkIn: "2026-09-30",
    requestedAt: "2026-09-15",
    staleDays: 3,
  };
  assert.deepEqual(E.actionTiming(a, "2026-09-22", now), {
    targetLate: true,
    checkLate: false,
    late: true,
    stale: true,
    due: false,
  });
  assert.equal(
    E.actionTiming({ ...a, lastContact: "2026-09-22" }, "2026-09-22", now)
      .stale,
    false,
  );
  assert.throws(() => E.validateDeadline("2026-09-31"), /date/);
  assert.throws(() => E.validateDeadline("2026-09-22T12:00"), /时区/);
});

test("waiting fields, follow-up owners, evidence, and record links are validated; reopens retain stable IDs", () => {
  const s = blank();
  assert.throws(() => put(s, "w", { status: "waiting" }), /等待谁/);
  assert.throws(() => put(s, "a", { status: "completed" }), /确认记录/);
  assert.throws(() => put(s, "f", { kind: "followup" }), /负责人/);
  assert.throws(() => put(s, "f", { eventId: "missing" }), /不存在/);
  assert.throws(() => put(s, "a", { staleDays: 1.5 }), /天数/);
  const a = put(s, "a", { dueDate: "2026-09-22" });
  E.putAction(s, { ...a, status: "completed", evidence: "Delivered" }, now);
  assert.equal(E.dashboard(s, now).rows.length, 0);
  E.putAction(s, { ...a, status: "open" }, now);
  assert.equal(s.actions.length, 1);
  assert.equal(E.dashboard(s, now).rows.length, 1);
  assert.equal(s.actions[0].history.length, 3);
});

test("readiness exact 24/72-hour boundaries are timezone-aware and separate from explicit prep", () => {
  const s = blank(),
    m = makeEvent(s, "m", { priority: "P2" });
  for (const [date, time, expected] of [
    ["2026-09-23", "10:00", "P0"],
    ["2026-09-23", "10:01", "P1"],
    ["2026-09-25", "10:00", "P1"],
    ["2026-09-25", "10:01", null],
  ]) {
    Object.assign(m, { date, start: time, end: "" });
    const row = E.dashboard(s, now).rows.find((r) => r.id === "m");
    assert.equal(row?.priority || null, expected);
  }
  Object.assign(m, { date: "2026-09-22", start: "14:00", location: "Room" });
  E.saveReadiness(
    s,
    "events",
    "m",
    Object.fromEntries(E.MEETING_READINESS.map(([key]) => [key, true])),
  );
  assert.equal(E.readinessScore(m).percent, 100);
  assert.equal(E.prepScore(m).percent, 0);
  assert.throws(
    () => E.transition(s, "events", "m", "Prepared", {}, now),
    /准备/,
  );
});

test("80% prep, N/A requirements, explicit all-N/A readiness, and reopening prep preserve completion", () => {
  const s = blank(),
    m = makeEvent(s);
  const items = m.prep.map((p, i) => ({
    ...p,
    status: i === 4 ? "todo" : "done",
  }));
  E.setPrep(s, "events", "m", items);
  assert.equal(E.prepScore(m).percent, 80);
  assert.equal(E.prepScore(m).missing.length, 1);
  items[4].status = "done";
  E.setPrep(s, "events", "m", items);
  E.transition(s, "events", "m", "Prepared", {}, now);
  items[4].status = "todo";
  E.setPrep(s, "events", "m", items);
  assert.equal(m.stage, "Planned");
  complete(s, "events", "m");
  E.setPrep(s, "events", "m", items);
  assert.equal(m.stage, "Completed");
  const allNA = items.map((p) => ({
    ...p,
    status: "na",
    note: "Not applicable",
  }));
  E.setPrep(s, "events", "m", allNA);
  assert.equal(E.prepScore(m).percent, null);
  assert.equal(E.prepScore(m).ready, false);
  E.setPrep(s, "events", "m", allNA, now, true);
  assert.equal(E.prepScore(m).ready, true);
  allNA[0].note = "";
  assert.throws(() => E.setPrep(s, "events", "m", allNA), /原因/);
});

test("full six-stage lifecycle with two follow-ups blocks closure, then reopens a closed activity", () => {
  const s = blank(),
    m = makeEvent(s);
  E.setPrep(
    s,
    "events",
    "m",
    m.prep.map((p) => ({ ...p, status: "done" })),
  );
  E.transition(s, "events", "m", "Prepared", {}, now);
  E.transition(
    s,
    "events",
    "m",
    "Completed",
    { actualAt: "2026-09-22T09:00+08:00", evidence: "Verified" },
    now,
  );
  assert.throws(
    () => E.transition(s, "events", "m", "Notes", {}, now),
    /成果摘要/,
  );
  E.saveNotes(s, "events", "m", { summary: "Result" });
  E.transition(s, "events", "m", "Notes", {}, now);
  put(s, "f1", {
    kind: "followup",
    eventId: "m",
    owner: "Me",
    dueDate: "2026-09-23",
  });
  put(s, "f2", {
    kind: "followup",
    eventId: "m",
    owner: "Host",
    status: "waiting",
    waitingOn: "Team",
    expected: "Reply",
    dueDate: "2026-09-23",
    checkIn: "2026-09-23",
  });
  E.transition(s, "events", "m", "Follow-up", {}, now);
  assert.throws(
    () => E.transition(s, "events", "m", "Closed", {}, now),
    /未解决/,
  );
  for (const a of [...s.actions])
    E.putAction(s, { ...a, status: "completed", evidence: "Resolved" }, now);
  assert.equal(m.stage, "Follow-up");
  E.transition(s, "events", "m", "Closed", {}, now);
  assert.equal(E.mobileStatus(m), "Done");
  E.putAction(s, { ...s.actions[0], status: "open" }, now);
  assert.equal(m.stage, "Follow-up");
  assert.equal(m.notes.summary, "Result");
  assert.equal(s.actions.length, 2);
  assert.ok(m.history.some((h) => h.from === "Closed" && h.to === "Follow-up"));
});

test("elapsed dates never create completion; future completion and skipping required steps fail", () => {
  const s = blank(),
    m = makeEvent(s, "m", { date: "2026-09-21" });
  assert.ok(E.dashboard(s, now).rows[0].badges.includes("待核验"));
  assert.equal(m.stage, "Planned");
  assert.equal(m.actualAt, undefined);
  assert.throws(
    () =>
      E.transition(
        s,
        "events",
        "m",
        "Completed",
        { actualAt: "2026-09-21T10:00+08:00", evidence: "Verified" },
        now,
      ),
    /原因/,
  );
  assert.throws(
    () =>
      E.transition(
        s,
        "events",
        "m",
        "Completed",
        {
          actualAt: "2026-09-23T10:00+08:00",
          evidence: "Verified",
          reason: "Late",
        },
        now,
      ),
    /晚于现在/,
  );
  complete(s, "events", "m");
  assert.ok(E.dashboard(s, now).rows[0].badges.includes("补记成果"));
  assert.equal(E.mobileStatus(m), "Done");
  noteAndReview(s, "events", "m");
  E.transition(s, "events", "m", "Closed", {}, now);
  E.transition(s, "events", "m", "Follow-up", { reason: "Correction" }, now);
  assert.equal(m.notes.summary, "Actual result");
});

test("travel confirmation stays distinct from execution and generic tasks; alerts are one canonical row", () => {
  const s = blank();
  let t = makeTravel(s, { priority: "P2" });
  let d = E.dashboard(s, now);
  assert.equal(d.rows.filter((r) => r.id === "t").length, 1);
  assert.ok(d.rows[0].badges.includes("预订未确认"));
  assert.ok(d.rows[0].badges.includes("就绪预警"));
  assert.equal(t.priority, "P2");
  const a = put(s, "pack", { travelId: "t", date: "2026-09-22" });
  E.putAction(s, { ...a, status: "completed", evidence: "Packed" }, now);
  assert.equal(t.status, "unknown");
  assert.throws(
    () =>
      E.putActivity(
        s,
        "travel",
        { ...t, status: "confirmed", reference: "" },
        now,
      ),
    /确认记录/,
  );
  t = E.putActivity(
    s,
    "travel",
    { ...t, status: "confirmed", reference: "Ticket receipt" },
    now,
  );
  assert.equal(t.stage, "Planned");
  assert.ok(t.confirmedAt);
  assert.ok(!E.dashboard(s, now).rows[0].badges.includes("预订未确认"));
  complete(s, "travel", "t");
  noteAndReview(s, "travel", "t");
  E.transition(s, "travel", "t", "Closed", {}, now);
  t = E.putActivity(s, "travel", { ...t, status: "pending" }, now);
  assert.equal(t.stage, "Follow-up");
  assert.throws(
    () => E.transition(s, "travel", "t", "Closed", {}, now),
    /预订/,
  );
  assert.equal(s.travel.length, 1);
});

test("travel with a far-away date is surfaced for a due confirmation; cancellation preserves record", () => {
  const s = blank();
  let t = makeTravel(s, {
    date: "2026-10-25",
    arrivalDate: "2026-10-25",
    dueDate: "2026-09-21",
  });
  assert.equal(E.dashboard(s, now).rows[0].late, true);
  assert.equal(E.dashboard(s, now).rows[0].priority, "P1");
  t = E.putActivity(
    s,
    "travel",
    { ...t, status: "canceled", reference: "Route changed" },
    now,
  );
  assert.equal(E.dashboard(s, now).rows.length, 0);
  assert.equal(s.travel.length, 1);
  assert.equal(t.stage, "Planned");
});

test("booking readiness cannot be bypassed; changed travel times invalidate confirmed booking", () => {
  const s = blank();
  let t = makeTravel(s);
  E.saveReadiness(s, "travel", "t", {
    ticket: "text",
    ticketNA: true,
    ticketReason: "No ticket",
  });
  assert.ok(E.readinessScore(t, "travel").missing.includes("票务确认"));
  t = E.putActivity(
    s,
    "travel",
    { ...t, status: "confirmed", reference: "Receipt" },
    now,
  );
  t = E.putActivity(s, "travel", { ...t, departureTime: "16:00" }, now);
  assert.equal(t.status, "pending");
  assert.match(t.nextAction, /重新确认/);
  const stay = E.putActivity(
    s,
    "travel",
    {
      id: "h",
      title: "Hotel",
      type: "stay",
      date: "2026-09-25",
      status: "confirmed",
      reference: "Hotel receipt",
    },
    now,
  );
  assert.ok(!E.readinessScore(stay, "travel").missing.includes("住宿确认"));
});

test("old mobile vault migration is idempotent, leaves input intact, and never fabricates bookings", () => {
  const old = defaultState();
  old.events.push({ id: "m", title: "Old event", date: "2026-09-01" });
  old.travel.push({ id: "t", date: "2026-09-01", title: "Old leg" });
  old.actions.push({
    id: "a",
    title: "Old loop",
    status: "waiting",
    dueDate: "2026-09-01",
  });
  const s = E.migrateState(old);
  assert.equal(s.events[0].stage, "Planned");
  assert.equal(s.travel[0].status, "unknown");
  assert.equal(old.events[0].stage, undefined);
  assert.deepEqual(E.migrateState(s), s);
  assert.equal(s.actions.length, 1);
  assert.equal(s.actions[0].dueDate, "2026-09-01");
  assert.throws(() => E.migrateState({ ...old, schemaVersion: 99 }), /版本/);
});

test("changing a confirmed transport mode invalidates booking, prep and readiness", () => {
  const s = blank();
  let t = makeTravel(s, {
    mode: "flight",
    status: "confirmed",
    reference: "Flight receipt",
  });
  E.setPrep(
    s,
    "travel",
    t.id,
    t.prep.map((p) => ({ ...p, status: "done" })),
  );
  E.transition(s, "travel", t.id, "Prepared", {}, now);
  E.saveReadiness(s, "travel", t.id, { host: "Original host" });
  t = E.putActivity(s, "travel", { ...t, mode: "train" }, now);
  assert.equal(t.status, "pending");
  assert.equal(t.stage, "Planned");
  assert.equal(E.prepScore(t).percent, 0);
  assert.deepEqual(t.readinessData, {});
  assert.ok(E.readinessScore(t, "travel").missing.includes("票务确认"));
  assert.equal(t.reference, "Flight receipt"); // Historical evidence is retained, not treated as a new confirmation.
});

test("stays never inherit transport defaults, including legacy records and 24-hour readiness boundaries", () => {
  const s = blank();
  const stay = makeTravel(s, {
    type: "stay",
    date: "2026-09-23",
    departureTime: "12:00",
    arrivalTime: "14:00",
  });
  assert.equal(stay.departureTime, undefined);
  assert.equal(stay.arrivalTime, undefined);
  assert.equal(stay.arrivalDate, undefined);
  assert.equal(
    E.activityInstant(stay, "travel"),
    Date.parse("2026-09-23T00:00+08:00"),
  );
  assert.equal(
    E.dashboard(s, new Date("2026-09-22T00:00+08:00")).rows[0].priority,
    "P0",
  );
  assert.equal(
    E.dashboard(s, new Date("2026-09-21T23:59+08:00")).rows[0].priority,
    "P1",
  );
  const old = defaultState();
  old.travel.push({
    ...stay,
    departureTime: "12:00",
    arrivalTime: "14:00",
    departureTimeZone: "America/Toronto",
  });
  const migrated = E.migrateState(old);
  assert.equal(migrated.travel[0].departureTime, undefined);
  assert.equal(
    E.activityInstant(old.travel[0], "travel"),
    Date.parse("2026-09-23T00:00+08:00"),
  );
  assert.equal(old.travel[0].departureTime, "12:00");
});

test("start-only activities require verification after their instant while date-only records retain day semantics", () => {
  const s = blank(),
    m = makeEvent(s, "start-only", {
      start: "09:00",
      end: "",
      location: "Room",
    });
  m.prep.forEach((p) => (p.status = "done"));
  m.readinessData = Object.fromEntries(
    E.MEETING_READINESS.map(([key]) => [key, true]),
  );
  assert.equal(
    E.dashboard(s, new Date("2026-09-22T08:59+08:00")).rows.length,
    0,
  );
  assert.equal(
    E.dashboard(s, new Date("2026-09-22T09:00+08:00")).rows.length,
    0,
  );
  let d = E.dashboard(s, now);
  assert.deepEqual(d.rows[0].badges, ["待核验"]);
  assert.equal(m.stage, "Planned");
  assert.equal(m.actualAt, undefined);
  m.timeZone = "America/Toronto";
  assert.equal(E.dashboard(s, now).rows.length, 0);
  m.timeZone = "Asia/Shanghai";
  m.end = "11:00";
  assert.equal(E.dashboard(s, now).rows.length, 0);
  m.start = "";
  m.end = "";
  assert.ok(!E.dashboard(s, now).rows[0].badges.includes("待核验"));
  const stay = makeTravel(s, { type: "stay", date: "2026-09-22" });
  assert.ok(
    !E.dashboard(s, now)
      .rows.find((r) => r.id === stay.id)
      .badges.includes("待核验"),
  );
  assert.ok(
    E.dashboard(s, new Date("2026-09-23T00:00+08:00"))
      .rows.find((r) => r.id === stay.id)
      .badges.includes("待核验"),
  );
});
