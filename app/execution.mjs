// Selectively ported from PR #15's pure execution rules. Records stay in the
// mobile OS events/travel/actions collections; no second vault or activity copy.
import {
  dateOnly,
  todayInZone,
  zonedEpochMinutes,
  travelInterval,
} from "./core.mjs";
export const STAGES = [
  "Planned",
  "Prepared",
  "Completed",
  "Notes",
  "Follow-up",
  "Closed",
];
export const PRIORITIES = ["P0", "P1", "P2"];
export const ACTION_STATES = [
  "open",
  "active",
  "waiting",
  "completed",
  "canceled",
];
export const PREP = [
  "明确目标",
  "复核背景资料",
  "准备三个问题 / 执行步骤",
  "核对材料",
  "确认联系人、地点与交通",
];
export const MEETING_READINESS = [
  ["dateConfirmed", "日期确认", true],
  ["timeConfirmed", "时间确认", true],
  ["locationConfirmed", "地点确认", true],
  ["contact", "联系人确认", true],
  ["objective", "目标"],
  ["research", "背景资料"],
  ["question1", "问题 1"],
  ["question2", "问题 2"],
  ["question3", "问题 3"],
  ["documents", "材料"],
  ["followupObjective", "跟进目标"],
];
export const TRAVEL_READINESS = [
  ["ticket", "票务确认", true],
  ["departure", "出发信息", true],
  ["terminal", "航站楼 / 车站", true],
  ["arrival", "抵达信息"],
  ["hotel", "住宿确认", true],
  ["localTransport", "当地交通"],
  ["documents", "证件要求已核对", true],
  ["host", "接待联系人"],
  ["calendar", "日历事项"],
];
const required = (v, message) => {
  if (!String(v || "").trim()) throw new Error(message);
};
const member = (v, choices) => {
  if (!choices.includes(v)) throw new Error("无效状态");
};
const validDate = (v) => {
  if (v) dateOnly(v);
};
export function validateDeadline(value) {
  if (!value) return;
  if (value.length === 10) return validDate(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Error("定时期限必须包含有效时间和时区。");
  validDate(value.slice(0, 10));
}
export const deadlineDay = (value) =>
  !value
    ? ""
    : value.length === 10
      ? value
      : todayInZone("Asia/Shanghai", new Date(value));
export const overdue = (value, date, now = new Date()) =>
  !!value && (value.length === 10 ? value < date : Date.parse(value) < +now);
export const deadlineInstant = (value) =>
  !value
    ? Infinity
    : Date.parse(value.length === 10 ? value + "T23:59:59.999+08:00" : value);
export const isOpen = (a) => !["completed", "canceled"].includes(a.status);
export const addDays = (date, n) =>
  new Date(+dateOnly(date) + n * 86400000).toISOString().slice(0, 10);
export const mobileStatus = (r) =>
  ["Planned", "Prepared"].includes(r.stage)
    ? "Upcoming"
    : ["Completed", "Notes", "Closed"].includes(r.stage)
      ? "Done"
      : "Follow-up";
function history(r, from, to, reason, now = new Date()) {
  r.history = [
    ...(r.history || []),
    { from, to, reason, at: now.toISOString() },
  ];
}
export function newActivity(input = {}) {
  return {
    kind: "meeting",
    priority: "P1",
    stage: "Planned",
    prep: PREP.map((title) => ({ title, status: "todo", note: "" })),
    readinessData: {},
    notes: {
      summary: "",
      statements: "",
      observations: "",
      judgments: "",
      references: "",
    },
    history: [],
    ...input,
  };
}
export function migrateState(input) {
  if (input?.schemaVersion !== 1)
    throw new Error("不支持的保险库版本，请保留原备份。");
  const s = structuredClone(input);
  for (const key of [
    "events",
    "travel",
    "actions",
    "people",
    "organizations",
    "interactions",
    "notes",
    "history",
    "riskOverrides",
  ]) {
    if (s[key] === undefined) s[key] = [];
    if (!Array.isArray(s[key])) throw new Error("保险库记录格式无效。");
    const ids = new Set();
    for (const r of s[key]) {
      if (!r.id && key !== "riskOverrides") throw new Error("记录缺少编号。");
      if (r.id && ids.has(r.id)) throw new Error("记录编号重复。");
      ids.add(r.id);
    }
  }
  s.stageOverrides ||= {};
  s.events = s.events.map((r) => newActivity(r));
  s.travel = s.travel.map((r) =>
    newActivity({
      kind: "trip",
      type: "transport",
      status: "unknown",
      nextAction: "核对预订",
      ...r,
    }),
  );
  s.actions = s.actions.map((r) => ({
    priority: "P1",
    status: "open",
    owner: r.status === "waiting" ? "对方" : "我",
    ...r,
  }));
  for (const r of [...s.events, ...s.travel]) {
    member(r.stage, STAGES);
    member(r.priority, PRIORITIES);
    if (
      !Array.isArray(r.prep) ||
      r.prep.length !== PREP.length ||
      !r.notes ||
      !Array.isArray(r.history)
    )
      throw new Error("活动记录不完整。");
  }
  s.executionVersion = 1;
  return s;
}
export function activity(s, collection, id) {
  member(collection, ["events", "travel"]);
  const r = s[collection].find((r) => r.id === id);
  if (!r) throw new Error("活动不存在。");
  return r;
}
export function linkedActions(s, collection, id) {
  return s.actions.filter((a) =>
    collection === "events" ? a.eventId === id : a.travelId === id,
  );
}
function reopen(s, collection, id, reason, now) {
  if (!id) return;
  const r = activity(s, collection, id);
  if (r.stage === "Closed") {
    history(r, "Closed", "Follow-up", reason, now);
    r.stage = "Follow-up";
  }
}
export function putAction(s, input, now = new Date()) {
  const old = s.actions.find((a) => a.id === input.id),
    a = { priority: "P1", status: "open", ...old, ...input };
  required(a.id, "缺少行动编号");
  required(a.title, "请填写下一步行动");
  member(a.priority, PRIORITIES);
  member(a.status, ACTION_STATES);
  for (const key of ["date", "requestedAt", "lastContact"]) validDate(a[key]);
  validateDeadline(a.dueDate);
  validateDeadline(a.checkIn);
  if (a.eventId) activity(s, "events", a.eventId);
  if (a.travelId) activity(s, "travel", a.travelId);
  if (a.personId && !s.people.some((p) => p.id === a.personId))
    throw new Error("关联人物不存在。");
  if (
    a.staleDays &&
    (!Number.isInteger(Number(a.staleDays)) ||
      Number(a.staleDays) < 1 ||
      Number(a.staleDays) > 365)
  )
    throw new Error("无回复天数须为 1–365。");
  if (a.status === "waiting") {
    required(a.waitingOn, "请填写等待谁");
    required(a.expected, "请填写等待什么");
    required(a.checkIn, "请填写下次跟进日期");
  }
  if (a.kind === "followup" && isOpen(a)) {
    required(a.owner, "请填写负责人");
    required(a.dueDate, "请填写跟进目标日期");
  }
  if (!isOpen(a))
    required(
      a.evidence,
      a.status === "completed" ? "请填写交付或确认记录" : "请填写取消原因",
    );
  a.history = structuredClone(old?.history || []);
  history(a, old?.status || "new", a.status, a.evidence || "更新行动", now);
  if (old) s.actions[s.actions.indexOf(old)] = a;
  else s.actions.push(a);
  if (isOpen(a)) {
    reopen(s, "events", a.eventId, "关联行动新增或重开", now);
    reopen(s, "travel", a.travelId, "关联行动新增或重开", now);
  }
  return a;
}
export function actionTiming(a, date = todayInZone(), now = new Date()) {
  const targetLate = overdue(a.dueDate, date, now),
    checkLate = a.status === "waiting" && overdue(a.checkIn, date, now);
  const contact = a.lastContact || a.requestedAt;
  const stale =
    a.status === "waiting" &&
    Number(a.staleDays) > 0 &&
    !!contact &&
    addDays(contact, Number(a.staleDays)) <= date;
  return {
    targetLate,
    checkLate,
    late: targetLate || checkLate,
    stale,
    due:
      deadlineDay(a.dueDate) === date ||
      (a.status === "waiting" && deadlineDay(a.checkIn) === date),
  };
}
export function putActivity(s, collection, input, now = new Date()) {
  member(collection, ["events", "travel"]);
  const old = s[collection].find((r) => r.id === input.id),
    r = newActivity({ ...old, ...input });
  r.history = structuredClone(old?.history || []);
  required(r.id, "缺少活动编号");
  required(r.title, "请填写活动标题");
  required(r.date, "请填写日期");
  validDate(r.date);
  member(r.priority, PRIORITIES);
  if (collection === "events") {
    member(r.kind, ["meeting", "visit", "task"]);
    if (r.start) {
      zonedEpochMinutes(r.date, r.start, r.timeZone);
      if (
        r.end &&
        zonedEpochMinutes(r.endDate || r.date, r.end, r.timeZone) <
          zonedEpochMinutes(r.date, r.start, r.timeZone)
      )
        throw new Error("结束早于开始，请核对日期。");
    }
  } else {
    r.kind = "trip";
    r.type ||= "transport";
    r.status ||= "unknown";
    member(r.type, ["transport", "stay"]);
    member(r.status, ["unknown", "pending", "confirmed", "canceled"]);
    validateDeadline(r.dueDate);
    if (r.type === "transport") travelInterval(r);
    if (["confirmed", "canceled"].includes(r.status))
      required(
        r.reference,
        r.status === "confirmed" ? "请填写预订确认记录" : "请填写取消原因",
      );
    else required(r.nextAction, "请填写下一步确认行动");
    if (r.status === "confirmed" && old?.status !== "confirmed")
      r.confirmedAt = now.toISOString();
  }
  const timingKeys =
    collection === "events"
      ? ["date", "start", "end", "endDate", "timeZone", "location", "personId"]
      : [
          "date",
          "departureTime",
          "arrivalDate",
          "arrivalTime",
          "departureTimeZone",
          "arrivalTimeZone",
          "from",
          "to",
          "type",
        ];
  if (old && timingKeys.some((k) => r[k] !== old[k])) {
    r.readinessData = {};
    r.readinessConfirmed = false;
    r.prep = PREP.map((title) => ({ title, status: "todo", note: "" }));
    if (r.stage === "Prepared") {
      history(r, "Prepared", "Planned", "安排变更，重新准备", now);
      r.stage = "Planned";
    }
    if (collection === "travel" && r.status === "confirmed") {
      r.status = "pending";
      r.nextAction = "安排已变更，请重新确认预订";
    }
  }
  history(r, old?.stage || "new", r.stage, "更新安排", now);
  if (old) s[collection][s[collection].indexOf(old)] = r;
  else s[collection].push(r);
  if (collection === "travel" && ["unknown", "pending"].includes(r.status))
    reopen(s, collection, r.id, "预订重新待确认", now);
  return r;
}
export function prepScore(r) {
  const applicable = r.prep.filter((p) => p.status !== "na"),
    missing = applicable.filter((p) => p.status !== "done");
  return {
    percent: applicable.length
      ? Math.round(
          ((applicable.length - missing.length) / applicable.length) * 100,
        )
      : null,
    ready: applicable.length ? !missing.length : !!r.readinessConfirmed,
    missing: missing.map((p) => p.title),
  };
}
export function setPrep(
  s,
  collection,
  id,
  items,
  now = new Date(),
  readinessConfirmed = false,
) {
  const r = activity(s, collection, id);
  if (items.length !== PREP.length) throw new Error("准备清单不完整。");
  for (const p of items) {
    member(p.status, ["todo", "done", "na"]);
    if (p.status === "na") required(p.note, "不适用须填写原因");
  }
  r.readinessConfirmed = !!readinessConfirmed;
  r.prep = items.map((p, i) => ({ ...p, title: PREP[i] }));
  if (r.stage === "Prepared" && !prepScore(r).ready) {
    history(r, "Prepared", "Planned", "准备项目重新打开", now);
    r.stage = "Planned";
  }
}
export function saveReadiness(s, collection, id, data) {
  const r = activity(s, collection, id),
    specs = collection === "travel" ? TRAVEL_READINESS : MEETING_READINESS,
    clean = {};
  for (const [key] of specs) {
    clean[key] =
      typeof data[key] === "boolean"
        ? data[key]
        : String(data[key] || "").trim();
    if (data[key + "NA"]) {
      required(data[key + "Reason"], "不适用须填写原因");
      clean[key + "NA"] = true;
      clean[key + "Reason"] = String(data[key + "Reason"]).trim();
    }
  }
  r.readinessData = clean;
}
export function readinessScore(r, collection = "events") {
  const data = r.readinessData || {},
    specs = collection === "travel" ? TRAVEL_READINESS : MEETING_READINESS;
  const values =
    collection === "travel"
      ? {
          ...data,
          ticket:
            r.type === "transport" ? r.status === "confirmed" : data.ticket,
          hotel: r.type === "stay" ? r.status === "confirmed" : data.hotel,
          departure: r.type === "stay" ? r.date : !!r.date && !!r.departureTime,
          arrival: r.type === "stay" ? data.arrival : !!r.arrivalTime,
        }
      : {
          ...data,
          dateConfirmed: !!r.date && data.dateConfirmed,
          timeConfirmed: !!r.start && data.timeConfirmed,
          locationConfirmed: !!r.location && data.locationConfirmed,
        };
  // A booking's own confirmation cannot be bypassed with a free-text or N/A field.
  const ownKey =
    collection === "travel" ? (r.type === "stay" ? "hotel" : "ticket") : null;
  const applicable = specs.filter(
      ([key]) => key === ownKey || !data[key + "NA"],
    ),
    missing = applicable.filter(([key]) => !values[key]);
  return {
    percent: applicable.length
      ? Math.round(
          ((applicable.length - missing.length) / applicable.length) * 100,
        )
      : null,
    missing: missing.map(([, label]) => label),
    critical: missing
      .filter(([, , critical]) => critical)
      .map(([, label]) => label),
  };
}
export function transition(
  s,
  collection,
  id,
  target,
  input = {},
  now = new Date(),
) {
  const r = activity(s, collection, id),
    from = r.stage;
  member(target, STAGES);
  const forward = STAGES.indexOf(target) === STAGES.indexOf(from) + 1,
    exception = from === "Planned" && target === "Completed",
    correction = STAGES.indexOf(target) < STAGES.indexOf(from);
  if (!forward && !exception && !correction)
    throw new Error("请按活动流程推进。");
  if (exception || correction) required(input.reason, "请填写补录或更正原因");
  if (target === "Prepared" && !prepScore(r).ready)
    throw new Error("请完成适用准备项目。");
  if (target === "Completed") {
    required(input.actualAt, "请填写实际完成时间");
    if (
      !/T.*(Z|[+-]\d{2}:\d{2})$/.test(input.actualAt) ||
      !Number.isFinite(Date.parse(input.actualAt))
    )
      throw new Error("实际完成时间必须包含时区。");
    if (Date.parse(input.actualAt) > +now)
      throw new Error("实际完成时间不能晚于现在。");
    required(input.evidence, "请填写完成记录");
  }
  const linked = linkedActions(s, collection, id);
  if (target === "Notes") required(r.notes.summary, "请先保存成果摘要");
  if (target === "Follow-up" && forward) {
    if (!linked.length)
      required(input.noFollowup, "请创建后续行动，或填写无需跟进原因");
    for (const a of linked.filter(isOpen)) {
      required(a.owner, "跟进行动需要负责人");
      required(a.dueDate, "跟进行动需要目标日期");
    }
  }
  if (target === "Closed") {
    if (linked.some(isOpen)) throw new Error("尚有未解决行动，请先处理。");
    if (collection === "travel" && ["unknown", "pending"].includes(r.status))
      throw new Error("预订尚未确认。");
    if (!linked.length && !r.noFollowup)
      throw new Error("请先记录无需跟进原因。");
  }
  if (target === "Completed") {
    r.actualAt = input.actualAt;
    r.completionEvidence = input.evidence;
  }
  if (target === "Follow-up" && forward)
    r.noFollowup = linked.length ? "" : input.noFollowup;
  history(
    r,
    from,
    target,
    input.reason || input.evidence || input.noFollowup || "用户确认",
    now,
  );
  r.stage = target;
}
export function saveNotes(s, collection, id, notes) {
  const r = activity(s, collection, id);
  if (STAGES.indexOf(r.stage) < 2) throw new Error("请先登记实际完成。");
  required(notes.summary, "请填写成果摘要");
  r.notes = { ...r.notes, ...notes };
}
export function activityInstant(r, collection) {
  if (!r.date) return null;
  return (
    zonedEpochMinutes(
      r.date,
      (collection === "travel" ? r.departureTime : r.start) || "00:00",
      collection === "travel" ? r.departureTimeZone || r.timeZone : r.timeZone,
    ) * 60000
  );
}
export function dashboard(s, now = new Date(), timeZone = "Asia/Shanghai") {
  const date = todayInZone(timeZone, now),
    rows = new Map();
  const add = (key, row) => {
    const old = rows.get(key);
    if (old) {
      old.badges = [...new Set([...old.badges, ...row.badges])];
      old.priority = [old.priority, row.priority].sort()[0];
      old.late ||= row.late;
    } else rows.set(key, row);
  };
  const open = s.actions.filter(isOpen);
  for (const a of open) {
    const timing = actionTiming(a, date, now);
    if (a.date !== date && !timing.due && !timing.late && !timing.stale)
      continue;
    add("action:" + a.id, {
      ...a,
      collection: "actions",
      badges: [
        ...(a.status === "waiting" ? ["Waiting For"] : []),
        ...(a.kind === "followup" ? ["后续跟进"] : []),
        ...(timing.stale ? ["等待回复超时"] : []),
        ...(timing.late ? ["逾期"] : []),
      ],
      late: timing.late,
    });
  }
  let next = null;
  for (const collection of ["events", "travel"])
    for (const r of s[collection]) {
      if (
        r.stage === "Closed" ||
        (collection === "travel" && r.status === "canceled")
      )
        continue;
      const instant = activityInstant(r, collection),
        upcoming = ["Planned", "Prepared"].includes(r.stage),
        score = readinessScore(r, collection),
        prep = prepScore(r),
        badges = [];
      const scheduledDay =
        instant === null ? "" : todayInZone(timeZone, new Date(instant));
      const end = r.end || r.arrivalTime;
      const actualEnd =
        collection === "travel" && r.type !== "stay" && r.departureTime
          ? travelInterval(r).end * 60000
          : r.end
            ? zonedEpochMinutes(r.endDate || r.date, r.end, r.timeZone) * 60000
            : null;
      const elapsed =
        instant !== null &&
        (end && actualEnd !== null ? actualEnd < +now : scheduledDay < date);
      const hours =
        instant === null ? Infinity : Math.max(0, (instant - +now) / 3600000);
      let priority = r.priority || "P1",
        late = false;
      if (upcoming) {
        if (elapsed) {
          badges.push("待核验");
          late = true;
        } else if (scheduledDay === date || hours <= 72) {
          if (!prep.ready) badges.push("准备缺项");
          if (score.missing.length) {
            badges.push("就绪预警");
            priority = [
              priority,
              hours <= 24 && score.critical.length ? "P0" : "P1",
            ].sort()[0];
          }
        }
        if (
          collection === "events" &&
          instant !== null &&
          instant >= +now &&
          (!next || instant < next.instant)
        )
          next = { ...r, instant };
      } else if (["Completed", "Notes"].includes(r.stage))
        badges.push(r.stage === "Completed" ? "补记成果" : "复核下一步");
      else if (
        r.stage === "Follow-up" &&
        !linkedActions(s, collection, r.id).some(isOpen)
      )
        badges.push("可确认关闭");
      if (
        collection === "travel" &&
        ["unknown", "pending"].includes(r.status) &&
        (scheduledDay <= addDays(date, 7) ||
          (r.dueDate &&
            (deadlineDay(r.dueDate) === date || overdue(r.dueDate, date, now))))
      ) {
        badges.push("预订未确认");
        late ||= overdue(r.dueDate, date, now);
      }
      if (!badges.length) continue;
      add(collection + ":" + r.id, {
        ...r,
        collection,
        priority,
        late,
        badges,
        prep,
        score,
      });
    }
  return {
    rows: [...rows.values()].sort(
      (a, b) =>
        a.priority.localeCompare(b.priority) ||
        Number(!!b.late) - Number(!!a.late) ||
        deadlineInstant(a.dueDate) - deadlineInstant(b.dueDate) ||
        (a.date || "9999").localeCompare(b.date || "9999") ||
        a.id.localeCompare(b.id),
    ),
    waiting: open.filter((a) => a.status === "waiting"),
    next,
  };
}
