const DAY_MS = 86400000;
export const SCHEMA_VERSION = 1;

export function uid(prefix = "item") {
  const random =
    globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

export function dateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || ""))
    throw new Error(`Invalid date: ${value}`);
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value)
    throw new Error(`Invalid date: ${value}`);
  return date;
}

export function todayInZone(timeZone = "Asia/Shanghai", now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(now)
    .reduce((a, p) => (p.type !== "literal" && (a[p.type] = p.value), a), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Date-only values keep their calendar day; timed values use the journey zone.
export function calendarDay(value, timeZone = "Asia/Shanghai") {
  if (!value) return "";
  if (value.length === 10) {
    dateOnly(value);
    return value;
  }
  return todayInZone(timeZone, new Date(value));
}

export function validateJourneyData(data) {
  const errors = [];
  if (!data || data.schemaVersion !== SCHEMA_VERSION)
    errors.push("Unsupported journey schema version.");
  if (!data?.trip?.id) errors.push("Trip is missing a stable id.");
  const ids = new Set();
  for (const stage of data?.stages || []) {
    if (!stage.id) errors.push("A stage is missing a stable id.");
    else if (ids.has(stage.id)) errors.push(`Duplicate stage id: ${stage.id}`);
    else ids.add(stage.id);
    try {
      if (dateOnly(stage.end) < dateOnly(stage.start))
        errors.push(`${stage.id || "stage"} ends before it starts.`);
    } catch (error) {
      errors.push(error.message);
    }
  }
  const sorted = [...(data?.stages || [])].sort((a, b) =>
    a.start.localeCompare(b.start),
  );
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = dateOnly(sorted[i - 1].end),
      currentStart = dateOnly(sorted[i].start);
    const gap = (currentStart - prevEnd) / DAY_MS;
    if (gap < 1) errors.push(`${sorted[i - 1].id} overlaps ${sorted[i].id}.`);
  }
  return { ok: errors.length === 0, errors };
}

export function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    updatedAt: new Date().toISOString(),
    stageOverrides: {},
    events: [],
    travel: [],
    people: [],
    organizations: [],
    actions: [],
    interactions: [],
    notes: [],
    history: [],
    riskOverrides: [],
  };
}

export function effectiveStages(seed, state) {
  return seed.stages
    .map((stage) => ({ ...stage, ...(state.stageOverrides?.[stage.id] || {}) }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function currentStage(
  seed,
  state,
  date = todayInZone(seed.trip.timeZone),
) {
  return (
    effectiveStages(seed, state).find(
      (stage) => stage.start <= date && date <= stage.end,
    ) || null
  );
}

export function dayNumber(seed, date = todayInZone(seed.trip.timeZone)) {
  const n =
    Math.floor((dateOnly(date) - dateOnly(seed.trip.start)) / DAY_MS) + 1;
  return Math.max(0, Math.min(71, n));
}

export function localDateTimeValue(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function zonedEpochMinutes(
  date,
  time = "00:00",
  timeZone = "Asia/Shanghai",
) {
  dateOnly(date);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error("请输入有效时间。");
  const [y, m, d] = date.split("-").map(Number),
    [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const represented = (epoch) => {
    const p = Object.fromEntries(
      formatter
        .formatToParts(new Date(epoch))
        .filter((p) => p.type !== "literal")
        .map((p) => [p.type, +p.value]),
    );
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  };
  let candidate = wall;
  for (let i = 0; i < 4; i++) {
    const difference = wall - represented(candidate);
    if (!difference) return candidate / 60000;
    candidate += difference;
  }
  throw new Error("该当地时间不存在（夏令时切换），请选择其他时间。");
}

export function travelInterval(leg) {
  const departureZone =
    leg.departureTimeZone || leg.timeZone || "Asia/Shanghai";
  const arrivalZone = leg.arrivalTimeZone || leg.timeZone || departureZone;
  const start = zonedEpochMinutes(leg.date, leg.departureTime, departureZone);
  let end = zonedEpochMinutes(
    leg.arrivalDate || leg.date,
    leg.arrivalTime || leg.departureTime,
    arrivalZone,
  );
  // Old records omitted arrivalDate and used an implicit overnight arrival.
  if (end < start && !leg.arrivalDate) end += 1440;
  if (end < start)
    throw new Error("到达时刻早于出发时刻，请核对到达日期和两地时区。");
  return { start, end };
}

export function detectConflicts(state, options = {}) {
  const defaultMeetingBuffer = options.defaultMeetingBuffer ?? 30;
  const airportBuffer = options.airportBuffer ?? 120;
  const stationBuffer = options.stationBuffer ?? 60;
  const items = [];
  for (const event of state.events || []) {
    if (!event.date || !event.start) continue;
    const start = zonedEpochMinutes(event.date, event.start, event.timeZone),
      end = zonedEpochMinutes(
        event.endDate || event.date,
        event.end || event.start,
        event.timeZone,
      );
    items.push({
      id: event.id,
      type: "event",
      title: event.title || "Event",
      date: event.date,
      start,
      end,
      location: event.location || "",
      source: event,
    });
  }
  for (const leg of state.travel || []) {
    if (
      leg.status === "canceled" ||
      leg.type === "stay" ||
      !leg.date ||
      !leg.departureTime
    )
      continue;
    const { start, end } = travelInterval(leg);
    items.push({
      id: leg.id,
      type: "travel",
      title: leg.title || `${leg.from || ""} → ${leg.to || ""}`,
      date: leg.date,
      start,
      end,
      location: leg.from || "",
      source: leg,
    });
  }
  items.sort((a, b) => a.start - b.start);
  const risks = [];
  let active = [];
  const retention = Math.max(
    defaultMeetingBuffer,
    airportBuffer,
    stationBuffer,
    60,
  );
  for (const b of items) {
    active = active.filter((a) => a.end + retention > b.start);
    for (const a of active) {
      if (a.end > b.start) {
        risks.push({
          id: `overlap:${a.id}:${b.id}`,
          level: "critical",
          kind: "overlap",
          title: "时间冲突",
          detail: `${a.title} 与 ${b.title} 时间重叠`,
          items: [a.id, b.id],
        });
        continue;
      }
      const gap = b.start - a.end;
      let required =
        a.location && b.location && a.location !== b.location
          ? Math.max(defaultMeetingBuffer, 60)
          : defaultMeetingBuffer;
      if (b.type === "travel") {
        const mode = (b.source.mode || "").toLowerCase();
        required = /flight|航班|airport|机场/.test(mode + " " + b.title)
          ? airportBuffer
          : /train|高铁|rail|车站/.test(mode + " " + b.title)
            ? stationBuffer
            : defaultMeetingBuffer;
      }
      if (gap < required) {
        risks.push({
          id: `buffer:${a.id}:${b.id}`,
          level: gap < Math.max(15, required / 2) ? "critical" : "warning",
          kind: "buffer",
          title: "转场时间偏紧",
          detail: `${a.title} → ${b.title} 仅 ${gap} 分钟；建议至少 ${required} 分钟`,
          items: [a.id, b.id],
          gap,
          required,
        });
      }
    }
    active.push(b);
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const risk of risks) {
    risk.fingerprint = JSON.stringify([
      risk.kind,
      risk.level,
      risk.gap ?? null,
      risk.required ?? null,
      risk.items.map((id) => {
        const item = byId.get(id);
        return [
          id,
          item.type,
          item.start,
          item.end,
          item.location,
          item.source.to || "",
          item.source.mode || "",
        ];
      }),
    ]);
  }
  // Legacy pair-only acknowledgements cannot prove this schedule was reviewed.
  return risks.filter(
    (r) =>
      !(state.riskOverrides || []).some(
        (o) => o.riskId === r.id && o.fingerprint === r.fingerprint,
      ),
  );
}

export function relationshipSummary(state, personId) {
  const person = (state.people || []).find((p) => p.id === personId);
  if (!person) return null;
  const interactions = (state.interactions || [])
    .filter((i) => i.personId === personId)
    .sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  const actions = (state.actions || []).filter(
    (a) =>
      a.personId === personId && !["completed", "canceled"].includes(a.status),
  );
  const waiting = actions.filter((a) => a.status === "waiting");
  const owed = actions.filter((a) => a.status !== "waiting");
  return {
    person,
    lastInteraction: interactions[0] || null,
    nextTouch: person.nextTouch || null,
    openLoops: actions.length,
    waiting,
    owed,
    timeline: [...interactions].slice(0, 20),
  };
}

export function findPossiblePeopleDuplicates(state, candidate) {
  const norm = (s) =>
    (s || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[·._-]/g, "");
  const names = [candidate.name, ...(candidate.aliases || [])]
    .filter(Boolean)
    .map(norm);
  return (state.people || []).filter((p) => {
    const existing = [p.name, ...(p.aliases || [])].filter(Boolean).map(norm);
    return (
      names.some((n) => existing.includes(n)) ||
      (candidate.email &&
        p.email &&
        candidate.email.toLowerCase() === p.email.toLowerCase()) ||
      (candidate.phone && p.phone && candidate.phone === p.phone)
    );
  });
}

export function impactOfStageChange(seed, state, stageId, patch) {
  const stage = effectiveStages(seed, state).find((s) => s.id === stageId);
  if (!stage) throw new Error("Stage not found.");
  const after = { ...stage, ...patch };
  if (dateOnly(after.end) < dateOnly(after.start))
    throw new Error("结束日期不能早于开始日期。");
  const inside = (date) => date && stage.start <= date && date <= stage.end;
  const counts = { events: 0, travel: 0, actions: 0, notes: 0 };
  for (const e of state.events || []) if (inside(e.date)) counts.events++;
  for (const t of state.travel || []) if (inside(t.date)) counts.travel++;
  for (const a of state.actions || [])
    if (inside(calendarDay(a.dueDate, seed.trip.timeZone))) counts.actions++;
  for (const n of state.notes || []) if (n.stageId === stageId) counts.notes++;
  const preview = structuredClone(state);
  preview.stageOverrides = {
    ...(preview.stageOverrides || {}),
    [stageId]: { ...(preview.stageOverrides?.[stageId] || {}), ...patch },
  };
  // Validate the complete canonical sequence with every existing override applied.
  const sequence = seed.stages.map((s) => ({
    ...s,
    ...preview.stageOverrides[s.id],
  }));
  sequence.forEach((s, i) => {
    if (dateOnly(s.end) < dateOnly(s.start))
      throw new Error("结束日期不能早于开始日期。");
    if (i && dateOnly(s.start) <= dateOnly(sequence[i - 1].end))
      throw new Error(
        `阶段重叠或顺序无效：${sequence[i - 1].city} / ${s.city}`,
      );
  });
  return {
    stage,
    before: { start: stage.start, end: stage.end, city: stage.city },
    after: { start: after.start, end: after.end, city: after.city },
    counts,
    newRisks: detectConflicts(preview).length - detectConflicts(state).length,
  };
}

export function applyStageChange(seed, state, stageId, patch, reason = "") {
  const impact = impactOfStageChange(seed, state, stageId, patch);
  const next = structuredClone(state);
  const before = next.stageOverrides?.[stageId] || {};
  next.stageOverrides = {
    ...(next.stageOverrides || {}),
    [stageId]: { ...before, ...patch },
  };
  next.revision = (next.revision || 0) + 1;
  next.updatedAt = new Date().toISOString();
  next.history = [
    ...(next.history || []),
    {
      id: uid("change"),
      type: "stage-change",
      stageId,
      before,
      after: next.stageOverrides[stageId],
      reason,
      at: next.updatedAt,
      impact,
    },
  ];
  return next;
}

export function undoLastChange(state) {
  const history = [...(state.history || [])];
  const last = [...history]
    .reverse()
    .find((h) => h.type === "stage-change" && !h.undoneAt);
  if (!last) return state;
  const next = structuredClone(state);
  next.stageOverrides = { ...(next.stageOverrides || {}) };
  if (Object.keys(last.before || {}).length)
    next.stageOverrides[last.stageId] = last.before;
  else delete next.stageOverrides[last.stageId];
  const target = next.history.find((h) => h.id === last.id);
  target.undoneAt = new Date().toISOString();
  next.revision = (next.revision || 0) + 1;
  next.updatedAt = target.undoneAt;
  return next;
}

export function countsForBackup(state) {
  return {
    events: (state.events || []).length,
    travel: (state.travel || []).length,
    people: (state.people || []).length,
    actions: (state.actions || []).length,
    notes: (state.notes || []).length,
    history: (state.history || []).length,
  };
}
