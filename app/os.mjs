import {
  uid,
  localDateTimeValue,
  validateJourneyData,
  currentStage,
  effectiveStages,
  dayNumber,
  todayInZone,
  detectConflicts,
  relationshipSummary,
  findPossiblePeopleDuplicates,
  impactOfStageChange,
  applyStageChange,
  undoLastChange,
} from "./core.mjs";
import * as E from "./execution.mjs";
import { EncryptedStore, downloadEnvelope } from "./storage.mjs";
const $ = (id) => document.getElementById(id),
  qa = (s) => [...document.querySelectorAll(s)];
const seed = await fetch("./data/journey.json", { cache: "no-store" }).then(
  (r) => {
    if (!r.ok) throw new Error("行程数据加载失败");
    return r.json();
  },
);
const validation = validateJourneyData(seed);
if (!validation.ok) throw new Error(validation.errors.join("\n"));
const store = new EncryptedStore(),
  tripTz = seed.trip.timeZone;
let state = null,
  pendingStage = null,
  pendingRestore = null,
  selectedPersonId = null,
  filter = "all",
  saving = false;
const todayKey = () => todayInZone(tripTz);
const esc = (v = "") =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const zones = [
  "Asia/Shanghai",
  "Asia/Tokyo",
  "America/Toronto",
  "America/Los_Angeles",
  "America/New_York",
  "UTC",
];
const options = (choices, value) =>
  choices
    .map((c) => {
      const [v, label] = Array.isArray(c) ? c : [c, c];
      return `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(label)}</option>`;
    })
    .join("");
const input = (name, label, value = "", type = "text", required = false) =>
  `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${required ? "required" : ""}></label>`;
const select = (name, label, choices, value) =>
  `<label>${label}<select name="${name}">${options(choices, value)}</select></label>`;
const textarea = (name, label, value = "") =>
  `<label>${label}<textarea name="${name}" rows="3">${esc(value)}</textarea></label>`;
const docChoices = [
  ["", "不关联"],
  ["bateng", "备腾教育"],
  ["drama", "抓马文娱"],
  ["yadea", "雅迪"],
  ["tencent", "腾讯"],
  ["huagai", "华盖南方"],
];
const priority = (p) => select("priority", "优先级", E.PRIORITIES, p || "P1");
const peopleOptions = () => [
  ["", "不关联"],
  ...state.people.map((p) => [p.id, p.name]),
];
function toast(text, undo = false) {
  const el = $("toast");
  el.innerHTML =
    esc(text) +
    (undo ? ' <button id="toastUndo" class="text-button">撤销</button>' : "");
  el.classList.add("show");
  if (undo)
    $("toastUndo").onclick = () =>
      commit((s) => Object.assign(s, undoLastChange(s)), "已撤销").catch(
        showError,
      );
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 5000);
}
const showError = (err) => alert(err.message || String(err));
async function commit(change, message = "已保存") {
  if (saving) throw new Error("正在保存，请稍候。");
  saving = true;
  try {
    const next = structuredClone(state);
    await change(next);
    next.revision = Math.max((state.revision || 0) + 1, next.revision || 0);
    next.updatedAt = new Date().toISOString();
    state = await store.save(next);
    renderAll();
    toast(message);
    return state;
  } finally {
    saving = false;
  }
}
function formDialog(id, title, fields, onSubmit) {
  const dialog = $(id);
  dialog.innerHTML = `<form class="dialog-form"><div class="dialog-head"><h2>${esc(title)}</h2><button type="button" class="icon-button" data-dismiss>关闭</button></div>${fields}<p class="status-text" role="alert"></p><button class="primary big" type="submit">保存</button></form>`;
  const form = dialog.querySelector("form");
  form.querySelector("[data-dismiss]").onclick = () => dialog.close();
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector("[type=submit]");
    button.disabled = true;
    try {
      await onSubmit(Object.fromEntries(new FormData(form)), form);
      dialog.close();
    } catch (err) {
      form.querySelector("[role=alert]").textContent = err.message;
    } finally {
      button.disabled = false;
    }
  };
  if (!dialog.open) dialog.showModal();
  return form;
}
const firstUse = !localStorage.getItem(store.key);
$("confirmWrap").hidden = !firstUse;
$("vaultConfirm").required = firstUse;
$("unlockForm").onsubmit = async (e) => {
  e.preventDefault();
  const password = $("vaultPassword").value;
  if (firstUse && password !== $("vaultConfirm").value) {
    $("unlockStatus").textContent = "两次输入的密码不一致。";
    return;
  }
  $("unlockStatus").textContent = "正在解锁…";
  try {
    const result = await store.unlock(password);
    state = E.migrateState(result.state);
    $("lockScreen").hidden = true;
    $("app").hidden = false;
    $("vaultPassword").value = "";
    $("vaultConfirm").value = "";
    $("unlockStatus").textContent = "";
    renderAll();
  } catch (err) {
    $("unlockStatus").textContent = err.message;
  }
};
$("lockButton").onclick = () => {
  store.lock();
  state = null;
  location.reload();
};
qa("[data-nav]").forEach(
  (btn) => (btn.onclick = () => navigate(btn.dataset.nav)),
);
function navigate(name) {
  qa(".page").forEach((p) =>
    p.classList.toggle("active", p.dataset.page === name),
  );
  qa(".bottom-nav button").forEach((b) =>
    b.classList.toggle("active", b.dataset.nav === name),
  );
  $("headerTitle").textContent = {
    today: "今日",
    risks: "风险",
    people: "人脉",
    settings: "设置",
  }[name];
  scrollTo({ top: 0 });
}
qa("[data-close]").forEach(
  (b) => (b.onclick = () => $(b.dataset.close).close()),
);
qa("[data-dismiss]").forEach(
  (b) => (b.onclick = () => b.closest("dialog").close()),
);
function renderAll() {
  renderToday();
  renderRisks();
  renderPeople();
  renderHistory();
  renderRecords();
}
const prepLabel = (score) =>
  score.percent === null ? "无适用准备项" : score.percent + "%";
function activityCard(r, collection) {
  const score = E.prepScore(r);
  return `<button class="record-card" data-record="${esc(r.id)}" data-collection="${collection}"><strong>${esc(r.title)}</strong><span>${esc(r.date || "日期待定")} ${esc(r.start || r.departureTime || "时间待定")} · ${E.mobileStatus(r)}</span><span>准备度 ${prepLabel(score)}${score.missing.length ? " · 缺：" + esc(score.missing.join("、")) : ""}</span></button>`;
}
function bindRecords(root) {
  root
    .querySelectorAll("[data-record]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          b.dataset.collection === "actions"
            ? openAction(b.dataset.record)
            : openActivity(b.dataset.collection, b.dataset.record)),
    );
}
function renderToday() {
  const date = todayKey(),
    stage = currentStage(seed, state, date),
    risks = detectConflicts(state),
    d = E.dashboard(state);
  $("dayBadge").textContent = `DAY ${dayNumber(seed, date) || "—"} / 71`;
  $("todayDate").textContent = date;
  $("todayCity").textContent = stage?.city || "行程之外";
  $("todaySummary").textContent = stage?.summary || "当前日期不在71天项目内";
  $("stageRange").textContent = stage ? `${stage.start} — ${stage.end}` : "—";
  $("riskCount").textContent = risks.length;
  $("editStageButton").disabled = !stage;
  $("editStageButton").dataset.stageId = stage?.id || "";
  $("stageCard").innerHTML = stage
    ? `<p><strong>${esc(stage.city)}</strong></p><p>${stage.start} → ${stage.end}</p><p>${esc(stage.summary)}</p>`
    : "当前没有行程阶段。";
  const counts = Object.fromEntries(
    E.PRIORITIES.map((p) => [p, d.rows.filter((r) => r.priority === p).length]),
  );
  $("priorityFilters").innerHTML = ["all", ...E.PRIORITIES]
    .map(
      (p) =>
        `<button type="button" data-priority="${p}" aria-pressed="${p === filter}">${p === "all" ? "全部" : p} ${p === "all" ? d.rows.length : counts[p]}</button>`,
    )
    .join("");
  $("priorityFilters")
    .querySelectorAll("button")
    .forEach(
      (b) =>
        (b.onclick = () => {
          filter = b.dataset.priority;
          renderToday();
        }),
    );
  $("queueSummary").textContent =
    `${d.rows.filter((r) => r.late).length} 项逾期 / 待核验 · ${d.waiting.length} 项 Waiting For${d.next ? " · 下一场 " + d.next.title + " " + (d.next.start || "时间待定") : ""}`;
  const rows = d.rows.filter((r) => filter === "all" || r.priority === filter);
  $("dailyQueue").innerHTML =
    rows
      .map(
        (r) =>
          `<button class="record-card" data-record="${esc(r.id)}" data-collection="${r.collection}"><strong><span class="pill">${r.priority}</span> ${esc(r.title)}</strong><span>${esc(r.badges.join(" · "))}</span>${r.prep ? `<span>准备度 ${prepLabel(r.prep)} · 缺：${esc(r.prep.missing.join("、") || "无")}</span>` : ""}${r.score?.missing.length ? `<span>资料缺项：${esc(r.score.missing.join("、"))}</span>` : ""}${r.collection === "travel" ? `<span>计划 ${esc(r.date)} · 确认截止 ${esc(r.dueDate || "未设")} · 下一步 ${esc(r.nextAction || "核对安排")}</span>` : ""}${r.status === "waiting" ? `<span>等 ${esc(r.waitingOn || "对方")} · 目标 ${esc(r.dueDate || "未设")} · 跟进 ${esc(r.checkIn || "待补")}</span>` : ""}</button>`,
      )
      .join("") || '<p class="empty-state">今天没有这个优先级的待办。</p>';
  bindRecords($("dailyQueue"));
  const agenda = [
    ...state.events.map((r) => ({ r, collection: "events" })),
    ...state.travel
      .filter((r) => r.status !== "canceled")
      .map((r) => ({ r, collection: "travel" })),
  ]
    .filter(({ r, collection }) => {
      const instant = E.activityInstant(r, collection);
      return (
        instant !== null && todayInZone(tripTz, new Date(instant)) === date
      );
    })
    .sort(
      (a, b) =>
        E.activityInstant(a.r, a.collection) -
        E.activityInstant(b.r, b.collection),
    );
  $("todayCount").textContent = `${agenda.length} 项`;
  $("todayAgenda").innerHTML =
    agenda.map(({ r, collection }) => activityCard(r, collection)).join("") ||
    "暂无手动事项";
  bindRecords($("todayAgenda"));
  $("topRiskWrap").hidden = !risks.length;
  if (risks.length) renderRiskCard($("topRisk"), risks[0]);
}
function renderRiskCard(el, r) {
  el.className = `risk-card ${r.level}`;
  el.innerHTML = `<span class="risk-label">${r.level.toUpperCase()}</span><h3>${esc(r.title)}</h3><p>${esc(r.detail)}</p><button class="text-button">Keep anyway</button>`;
  el.querySelector("button").onclick = async () => {
    const reason = prompt("保留安排的原因（可选）", "");
    if (reason === null) return;
    try {
      await commit(
        (s) =>
          s.riskOverrides.push({
            id: uid("risk"),
            riskId: r.id,
            fingerprint: r.fingerprint,
            reason,
            at: new Date().toISOString(),
          }),
        "已保留安排",
      );
    } catch (err) {
      showError(err);
    }
  };
}
function renderRisks() {
  const risks = detectConflicts(state),
    root = $("riskList");
  root.innerHTML = risks.length ? "" : "当前没有检测到冲突。";
  risks.forEach((r) => {
    const el = document.createElement("article");
    renderRiskCard(el, r);
    root.appendChild(el);
  });
}
function renderRecords() {
  const kind = $("recordFilter").value,
    q = $("recordSearch").value.trim().toLowerCase();
  let rows = [];
  if (
    ["actions", "waiting", "due", "overdue", "future", "undated"].includes(kind)
  )
    rows = state.actions
      .filter((a) => {
        if (kind === "actions") return true;
        if (!E.isOpen(a)) return false;
        const timing = E.actionTiming(a, todayKey());
        if (kind === "waiting") return a.status === "waiting";
        if (kind === "due") return timing.due;
        if (kind === "overdue") return timing.late;
        if (kind === "undated") return !a.date && !a.dueDate && !a.checkIn;
        return (
          !timing.late &&
          !timing.due &&
          [a.date, E.deadlineDay(a.dueDate), E.deadlineDay(a.checkIn)].some(
            (date) => date > todayKey(),
          )
        );
      })
      .map((a) => ({ ...a, collection: "actions" }));
  else
    for (const collection of ["events", "travel"])
      rows.push(
        ...state[collection]
          .filter((r) =>
            kind === "closed"
              ? r.stage === "Closed"
              : r.stage !== "Closed" && E.mobileStatus(r) === kind,
          )
          .map((r) => ({ ...r, collection })),
      );
  rows = rows.filter(
    (r) =>
      !q ||
      [
        r.title,
        r.notes?.summary,
        r.waitingOn,
        state.people.find((p) => p.id === r.personId)?.name,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
  );
  $("recordList").innerHTML =
    rows
      .map((r) =>
        r.collection === "actions"
          ? `<button class="record-card" data-record="${esc(r.id)}" data-collection="actions"><strong>${esc(r.title)}</strong><span>${r.priority} · ${esc(r.status)} · ${esc(r.dueDate || "未设目标日期")}</span></button>`
          : activityCard(r, r.collection),
      )
      .join("") || '<p class="muted">没有匹配记录。</p>';
  bindRecords($("recordList"));
}
$("recordFilter").onchange = renderRecords;
$("recordSearch").oninput = renderRecords;
function openEvent(id) {
  const old = state.events.find((r) => r.id === id),
    r = old || {
      date: todayKey(),
      start: "10:00",
      end: "11:00",
      timeZone: tripTz,
      kind: "meeting",
    };
  formDialog(
    "eventDialog",
    old ? "编辑安排" : "新增会面 / 事项",
    input("title", "标题", r.title, "text", true) +
      select(
        "kind",
        "类型",
        [
          ["meeting", "会面"],
          ["visit", "参访"],
          ["task", "重要任务"],
        ],
        r.kind,
      ) +
      input("date", "日期", r.date, "date", true) +
      input("start", "开始时间", r.start, "time") +
      input("end", "结束时间", r.end, "time") +
      input("endDate", "结束日期（跨午夜填写）", r.endDate, "date") +
      input("location", "地点 / 会议链接", r.location) +
      select("timeZone", "当地时区", zones, r.timeZone) +
      select("personId", "关联人物", peopleOptions(), r.personId || "") +
      select("doc", "准备 / 成果参考卡", docChoices, r.doc || "") +
      priority(r.priority),
    async (data) => {
      await commit((s) =>
        E.putActivity(s, "events", { ...data, id: id || uid("event") }),
      );
      if (id) openActivity("events", id);
    },
  );
}
$("addEventButton").onclick = () => openEvent();
function openTravel(id) {
  const old = state.travel.find((r) => r.id === id),
    r = old || {
      type: "transport",
      mode: "flight",
      date: todayKey(),
      arrivalDate: todayKey(),
      departureTime: "12:00",
      arrivalTime: "14:00",
      status: "unknown",
      nextAction: "核对预订",
      departureTimeZone: tripTz,
      arrivalTimeZone: tripTz,
    };
  const fields =
    input("title", "标题", r.title, "text", true) +
    select(
      "type",
      "安排类型",
      [
        ["transport", "交通"],
        ["stay", "住宿"],
      ],
      r.type,
    ) +
    input("date", "出发 / 入住日期", r.date, "date", true) +
    `<div id="transportFields">` +
    select(
      "mode",
      "交通类型",
      [
        ["flight", "航班"],
        ["train", "高铁 / 火车"],
        ["car", "汽车"],
        ["other", "其他"],
      ],
      r.mode,
    ) +
    input("departureTime", "出发当地时间", r.departureTime, "time", true) +
    select(
      "departureTimeZone",
      "出发地时区",
      zones,
      r.departureTimeZone || r.timeZone || tripTz,
    ) +
    input("arrivalDate", "到达日期", r.arrivalDate || r.date, "date", true) +
    input("arrivalTime", "到达当地时间", r.arrivalTime, "time", true) +
    select(
      "arrivalTimeZone",
      "到达地时区",
      zones,
      r.arrivalTimeZone || r.timeZone || tripTz,
    ) +
    input("from", "出发地", r.from) +
    input("to", "目的地", r.to) +
    `</div>` +
    select(
      "status",
      "预订状态",
      [
        ["unknown", "未核验"],
        ["pending", "待确认"],
        ["confirmed", "已确认"],
        ["canceled", "已取消"],
      ],
      r.status,
    ) +
    input("reference", "确认记录 / 取消原因", r.reference) +
    input("nextAction", "下一步确认行动", r.nextAction) +
    input("dueDate", "确认截止日期", r.dueDate, "date") +
    priority(r.priority);
  const form = formDialog(
    "travelDialog",
    old ? "交通 / 住宿确认" : "新增交通 / 住宿",
    fields,
    async (data) => {
      await commit((s) =>
        E.putActivity(s, "travel", { ...data, id: id || uid("travel") }),
      );
      if (id) openActivity("travel", id);
    },
  );
  const toggle = () => {
    const hidden = form.elements.type.value === "stay";
    $("transportFields").hidden = hidden;
    $("transportFields")
      .querySelectorAll("input,select")
      .forEach((control) => (control.disabled = hidden));
    for (const name of ["departureTime", "arrivalTime", "arrivalDate"])
      form.elements[name].required = !hidden;
  };
  form.elements.type.onchange = toggle;
  toggle();
}
$("addTravelButton").onclick = () => openTravel();
function openActivity(collection, id) {
  const r = E.activity(state, collection, id),
    dialog = $("activityDialog"),
    prep = E.prepScore(r),
    info = E.readinessScore(r, collection),
    linked = E.linkedActions(state, collection, id);
  dialog.innerHTML = `<div class="dialog-form"><div class="dialog-head"><h2>${esc(r.title)}</h2><button class="icon-button" data-dismiss>关闭</button></div><p>${E.mobileStatus(r)} · ${esc(r.date)} ${esc(r.start || r.departureTime || "")} ${esc(r.timeZone || r.departureTimeZone || tripTz)}</p>${collection === "travel" ? `<p>预订：${esc(r.status)} · ${esc(r.reference || r.nextAction || "")}<br>到达：${esc(r.arrivalDate || r.date)} ${esc(r.arrivalTime || "")} ${esc(r.arrivalTimeZone || r.timeZone || tripTz)}</p>` : ""}<p>准备度 ${prepLabel(prep)} · 缺：${esc(prep.missing.join("、") || "无")}</p>${docChoices.some(([key]) => key && key === r.doc) ? `<p><a href="docs/visits/${r.doc}.md" target="_blank">准备参考卡</a> · <a href="docs/outcomes/${r.doc}.md" target="_blank">成果参考卡</a></p>` : ""}<p>资料完整度 ${info.percent ?? "—"}% · 缺：${esc(info.missing.join("、") || "无")}</p><div class="quick-grid"><button data-edit>编辑安排${collection === "travel" ? " / 确认" : ""}</button><button data-prep>准备清单</button><button data-ready>补齐资料</button><button data-action>＋ 后续行动</button></div><div class="stack" id="stageActions"></div><h3>关联行动</h3><div id="linkedActions">${linked.map((a) => `<button class="record-card" data-record="${esc(a.id)}" data-collection="actions"><strong>${esc(a.title)}</strong><span>${esc(a.status)} · ${esc(a.owner || "未设负责人")} · ${esc(a.dueDate || "未设目标日期")}</span></button>`).join("") || "暂无"}</div>${r.notes.summary ? `<h3>成果摘要</h3><p class="preserve">${esc(r.notes.summary)}</p>` : ""}<details><summary>完整流程与历史</summary><p>${E.STAGES.join(" → ")}</p><p>当前：${r.stage}</p><label>更正到<select id="correctionTarget">${options(
    E.STAGES.filter(
      (stage) => E.STAGES.indexOf(stage) < E.STAGES.indexOf(r.stage),
    ),
    null,
  )}</select></label><button id="correctStage" ${r.stage === "Planned" ? "disabled" : ""}>更正阶段（需原因）</button><div class="timeline">${r.history.map((h) => `<p>${esc(h.at)} · ${esc(h.from)} → ${esc(h.to)}<br>${esc(h.reason)}</p>`).join("")}</div></details></div>`;
  dialog.querySelector("[data-dismiss]").onclick = () => dialog.close();
  dialog.querySelector("[data-edit]").onclick = () =>
    collection === "travel" ? openTravel(id) : openEvent(id);
  dialog.querySelector("[data-prep]").onclick = () => openPrep(collection, id);
  dialog.querySelector("[data-ready]").onclick = () =>
    openReadiness(collection, id);
  dialog.querySelector("[data-action]").onclick = () =>
    openAction(null, {
      [collection === "events" ? "eventId" : "travelId"]: id,
      personId: r.personId,
      kind: "followup",
    });
  bindRecords($("linkedActions"));
  const actions = $("stageActions");
  function button(label, fn) {
    const b = document.createElement("button");
    b.className = "primary";
    b.textContent = label;
    b.onclick = fn;
    actions.appendChild(b);
  }
  if (["Planned", "Prepared"].includes(r.stage))
    button("记录 Done · 实际完成", () => openCompletion(collection, id));
  if (["Completed", "Notes", "Follow-up"].includes(r.stage))
    button(r.stage === "Completed" ? "补记成果" : "编辑成果", () =>
      openNotes(collection, id),
    );
  if (r.stage === "Notes")
    button("复核 Follow-up", () => openFollowup(collection, id));
  if (r.stage === "Follow-up")
    button("全部处理完 · 关闭", async () => {
      try {
        await commit((s) => E.transition(s, collection, id, "Closed"));
        openActivity(collection, id);
      } catch (err) {
        showError(err);
      }
    });
  $("correctStage").onclick = async () => {
    const reason = prompt("更正原因", "");
    if (!reason) return;
    try {
      await commit((s) =>
        E.transition(s, collection, id, $("correctionTarget").value, {
          reason,
        }),
      );
      openActivity(collection, id);
    } catch (err) {
      showError(err);
    }
  };
  if (!dialog.open) dialog.showModal();
}
function openPrep(collection, id) {
  const r = E.activity(state, collection, id);
  formDialog(
    "prepDialog",
    "准备清单",
    r.prep
      .map(
        (p, i) =>
          select(
            "status" + i,
            p.title,
            [
              ["todo", "待复核"],
              ["done", "已完成"],
              ["na", "不适用"],
            ],
            p.status,
          ) + input("note" + i, "备注 / 不适用原因", p.note),
      )
      .join("") +
      `<label class="check"><input name="readinessConfirmed" type="checkbox" ${r.readinessConfirmed ? "checked" : ""}>所有项目不适用时，我已明确确认准备就绪</label>` +
      select(
        "markPrepared",
        "保存后",
        [
          ["no", "保留当前阶段"],
          ["yes", "标记准备完成"],
        ],
        "no",
      ),
    async (data) => {
      await commit((s) => {
        E.setPrep(
          s,
          collection,
          id,
          r.prep.map((p, i) => ({
            ...p,
            status: data["status" + i],
            note: data["note" + i],
          })),
          new Date(),
          data.readinessConfirmed === "on",
        );
        if (data.markPrepared === "yes")
          E.transition(s, collection, id, "Prepared");
      });
      openActivity(collection, id);
    },
  );
}
function openReadiness(collection, id) {
  const r = E.activity(state, collection, id),
    specs = collection === "travel" ? E.TRAVEL_READINESS : E.MEETING_READINESS,
    data = r.readinessData || {};
  const automatic =
    collection === "travel"
      ? [
          r.type === "stay" ? "hotel" : "ticket",
          "departure",
          ...(r.type === "stay" ? [] : ["arrival"]),
        ]
      : [];
  formDialog(
    "readinessDialog",
    "资料与确认",
    `<p class="muted">资料完整度与本人复核的准备清单分别记录。预订确认从交通 / 住宿记录读取。</p>` +
      specs
        .map(([key, label]) =>
          automatic.includes(key)
            ? `<p>${label}：请在「编辑安排 / 确认」中维护</p>`
            : `<fieldset><legend>${label}</legend>${
                key.endsWith("Confirmed")
                  ? select(
                      key,
                      "确认状态",
                      [
                        ["", "未确认"],
                        ["yes", "已确认"],
                      ],
                      data[key] ? "yes" : "",
                    )
                  : input(key, "内容 / 确认依据", data[key])
              }<details><summary>不适用</summary><label class="check"><input name="${key}NA" type="checkbox" ${data[key + "NA"] ? "checked" : ""}>不适用</label>${input(key + "Reason", "原因", data[key + "Reason"])}</details></fieldset>`,
        )
        .join(""),
    async (values) => {
      for (const [key] of specs) {
        if (key.endsWith("Confirmed")) values[key] = values[key] === "yes";
        values[key + "NA"] = values[key + "NA"] === "on";
      }
      await commit((s) => E.saveReadiness(s, collection, id, values));
      openActivity(collection, id);
    },
  );
}
function openCompletion(collection, id) {
  const r = E.activity(state, collection, id);
  formDialog(
    "completionDialog",
    "记录实际完成",
    input(
      "actualAt",
      "实际完成时间（设备当地时间）",
      localDateTimeValue(),
      "datetime-local",
      true,
    ) +
      input("evidence", "完成记录", "", "text", true) +
      input(
        "reason",
        r.stage === "Planned" ? "未登记准备的补录原因" : "补充说明",
        "",
        "text",
        r.stage === "Planned",
      ),
    async (data) => {
      data.actualAt = new Date(data.actualAt).toISOString();
      await commit((s) => E.transition(s, collection, id, "Completed", data));
      openActivity(collection, id);
    },
  );
}
function openNotes(collection, id) {
  const r = E.activity(state, collection, id);
  formDialog(
    "notesDialog",
    "成果记录",
    [
      ["summary", "成果摘要"],
      ["statements", "对方陈述"],
      ["observations", "现场观察"],
      ["judgments", "个人判断"],
      ["references", "出处 / 资料链接"],
    ]
      .map(([k, label]) => textarea(k, label, r.notes[k]))
      .join(""),
    async (data) => {
      await commit((s) => {
        E.saveNotes(s, collection, id, data);
        if (E.activity(s, collection, id).stage === "Completed")
          E.transition(s, collection, id, "Notes");
      });
      openActivity(collection, id);
    },
  );
}
function openFollowup(collection, id) {
  formDialog(
    "followupDialog",
    "复核下一步",
    `<p>关联行动需有负责人和目标日期；没有后续行动时，请说明原因。</p>` +
      textarea("noFollowup", "无需跟进的原因"),
    async (data) => {
      await commit((s) => E.transition(s, collection, id, "Follow-up", data));
      openActivity(collection, id);
    },
  );
}
function openAction(id, preset = {}) {
  const old = state.actions.find((a) => a.id === id),
    a = old || {
      status: "open",
      owner: "我",
      dueDate: todayKey(),
      date: todayKey(),
      requestedAt: todayKey(),
      ...preset,
    };
  const link = a.eventId
    ? "events:" + a.eventId
    : a.travelId
      ? "travel:" + a.travelId
      : "";
  const links = [
    ["", "不关联"],
    ...["events", "travel"].flatMap((c) =>
      state[c].map((r) => [c + ":" + r.id, r.title]),
    ),
  ];
  const form = formDialog(
    "loopDialog",
    old ? "更新待办 / 跟进" : "新增待办 / 跟进",
    input("title", "下一步行动", a.title, "text", true) +
      priority(a.priority) +
      select(
        "status",
        "状态",
        [
          ["open", "待办"],
          ["active", "进行中"],
          ["waiting", "Waiting For"],
          ["completed", "已完成"],
          ["canceled", "已取消"],
        ],
        a.status,
      ) +
      input("owner", "负责人", a.owner) +
      input("dueDate", "目标日期", E.deadlineDay(a.dueDate), "date") +
      `<div class="filter-row">${[0, 1, 3, 7].map((n) => `<button type="button" data-days="${n}">${n === 0 ? "今天" : n === 1 ? "明天" : n + "天后"}</button>`).join("")}</div>` +
      `<div id="waitingFields">` +
      input("waitingOn", "等待谁", a.waitingOn) +
      input("expected", "等待什么", a.expected) +
      input("checkIn", "下次跟进日期", E.deadlineDay(a.checkIn), "date") +
      input("requestedAt", "发出请求日期", a.requestedAt, "date") +
      input("lastContact", "最近联系日期", a.lastContact, "date") +
      input("staleDays", "无回复提醒（天）", a.staleDays, "number") +
      `</div>` +
      input("evidence", "交付 / 确认记录 / 取消原因", a.evidence) +
      `<details><summary>关联与更多选项</summary>` +
      select("personId", "人物", peopleOptions(), a.personId || "") +
      select("link", "关联活动", links, link) +
      select(
        "kind",
        "行动类型",
        [
          ["task", "待办"],
          ["followup", "后续跟进"],
        ],
        a.kind || "task",
      ) +
      input("date", "安排日期", a.date, "date") +
      input(
        "dueAt",
        "定时目标（可选，设备当地时间）",
        a.dueDate?.length > 10 ? localDateTimeValue(new Date(a.dueDate)) : "",
        "datetime-local",
      ) +
      input(
        "checkInAt",
        "定时跟进（可选，设备当地时间）",
        a.checkIn?.length > 10 ? localDateTimeValue(new Date(a.checkIn)) : "",
        "datetime-local",
      ) +
      input("channel", "沟通渠道", a.channel) +
      textarea("note", "备注", a.note) +
      `</details>`,
    async (data) => {
      if (data.dueAt) data.dueDate = new Date(data.dueAt).toISOString();
      if (data.checkInAt) data.checkIn = new Date(data.checkInAt).toISOString();
      delete data.dueAt;
      delete data.checkInAt;
      const [collection, recordId] = data.link.split(":");
      delete data.link;
      const result = {
        ...data,
        id: id || uid("action"),
        eventId: collection === "events" ? recordId : null,
        travelId: collection === "travel" ? recordId : null,
      };
      await commit((s) => E.putAction(s, result));
      if ($("activityDialog").open && recordId)
        openActivity(collection, recordId);
      if ($("personDetailDialog").open && selectedPersonId)
        openPerson(selectedPersonId);
    },
  );
  const toggle = () => {
    $("waitingFields").hidden = form.elements.status.value !== "waiting";
  };
  form.elements.status.onchange = toggle;
  toggle();
  form.querySelectorAll("[data-days]").forEach(
    (b) =>
      (b.onclick = () => {
        form.elements.dueDate.value = E.addDays(
          todayKey(),
          Number(b.dataset.days),
        );
        form.elements.dueAt.value = "";
      }),
  );
  if (link) {
    const back = document.createElement("button");
    back.type = "button";
    back.textContent = "打开关联活动";
    back.onclick = () => {
      const [collection, id] = link.split(":");
      $("loopDialog").close();
      openActivity(collection, id);
    };
    form.appendChild(back);
  }
}
$("addActionButton").onclick = () => openAction();
$("editStageButton").onclick = () => {
  const r = effectiveStages(seed, state).find(
    (s) => s.id === $("editStageButton").dataset.stageId,
  );
  if (!r) return;
  $("stageId").value = r.id;
  $("stageCity").value = r.city;
  $("stageStart").value = r.start;
  $("stageEnd").value = r.end;
  $("stageReason").value = "";
  $("stageDialog").showModal();
};
$("previewStageButton").onclick = () => {
  try {
    const id = $("stageId").value,
      patch = {
        city: $("stageCity").value.trim(),
        start: $("stageStart").value,
        end: $("stageEnd").value,
      };
    const impact = impactOfStageChange(seed, state, id, patch);
    pendingStage = { id, patch, reason: $("stageReason").value, impact };
    $("impactBody").innerHTML = Object.entries({
      事项: impact.counts.events,
      交通: impact.counts.travel,
      待办: impact.counts.actions,
      新增风险: Math.max(0, impact.newRisks),
    })
      .map(
        ([label, n]) => `<div><span>${label}</span><strong>${n}</strong></div>`,
      )
      .join("");
    $("stageDialog").close();
    $("impactDialog").showModal();
  } catch (err) {
    showError(err);
  }
};
$("applyStageButton").onclick = async () => {
  if (!pendingStage) return;
  try {
    await commit((s) =>
      Object.assign(
        s,
        applyStageChange(
          seed,
          s,
          pendingStage.id,
          pendingStage.patch,
          pendingStage.reason,
        ),
      ),
    );
    $("impactDialog").close();
    pendingStage = null;
    toast("行程已更新", true);
  } catch (err) {
    showError(err);
  }
};
$("addPersonButton").onclick = () => {
  $("personForm").reset();
  $("personDialog").showModal();
};
$("personForm").onsubmit = async (e) => {
  e.preventDefault();
  const candidate = {
    id: uid("person"),
    name: $("personName").value.trim(),
    aliases: $("personAliases")
      .value.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    tags: $("personTags")
      .value.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    nextTouch: $("personNextTouch").value || null,
  };
  const duplicates = findPossiblePeopleDuplicates(state, candidate);
  if (
    duplicates.length &&
    !confirm(
      `可能已有人物：${duplicates.map((d) => d.name).join("、")}。仍然新增？`,
    )
  )
    return;
  try {
    await commit((s) => {
      const orgName = $("personOrg").value.trim();
      if (orgName) {
        let org = s.organizations.find(
          (o) => o.name.toLowerCase() === orgName.toLowerCase(),
        );
        if (!org) {
          org = { id: uid("org"), name: orgName };
          s.organizations.push(org);
        }
        candidate.organizationId = org.id;
      }
      s.people.push(candidate);
    });
    $("personDialog").close();
  } catch (err) {
    showError(err);
  }
};
$("peopleSearch").oninput = renderPeople;
function renderPeople() {
  const q = $("peopleSearch").value.trim().toLowerCase(),
    people = state.people.filter(
      (p) =>
        !q ||
        [
          p.name,
          ...(p.aliases || []),
          state.organizations.find((o) => o.id === p.organizationId)?.name,
          ...(p.tags || []),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
    );
  $("peopleList").innerHTML =
    people
      .map((p) => {
        const sum = relationshipSummary(state, p.id);
        return `<button class="person-card" data-person="${esc(p.id)}"><div><h3>${esc(p.name)}</h3><p>Next touch：${esc(p.nextTouch || "未设")}</p></div><span>${sum.openLoops} Open</span></button>`;
      })
      .join("") || "还没有匹配人物。";
  $("peopleList")
    .querySelectorAll("[data-person]")
    .forEach((b) => (b.onclick = () => openPerson(b.dataset.person)));
}
function openPerson(id) {
  selectedPersonId = id;
  const sum = relationshipSummary(state, id);
  $("personDetailName").textContent = sum.person.name;
  $("personDetailBody").innerHTML =
    `<p>Open loops：${sum.openLoops} · Waiting For：${sum.waiting.length}</p><h3>全部关联行动</h3>${
      state.actions
        .filter((a) => a.personId === id)
        .map(
          (a) =>
            `<button class="record-card" data-record="${esc(a.id)}" data-collection="actions"><strong>${esc(a.title)}</strong><span>${esc(a.status)} · 目标 ${esc(a.dueDate || "未设")} · 跟进 ${esc(a.checkIn || "未设")}</span></button>`,
        )
        .join("") || "暂无"
    }<h3>互动记录</h3><div class="timeline">${sum.timeline.map((i) => `<p>${esc(i.text)}<br><span>${esc(/Z$|[+-]\d{2}:\d{2}$/.test(i.at) ? new Date(i.at).toLocaleString() : i.at.replace("T", " "))}</span></p>`).join("") || "暂无"}</div>`;
  bindRecords($("personDetailBody"));
  if (!$("personDetailDialog").open) $("personDetailDialog").showModal();
}
$("addOpenLoopButton").onclick = () =>
  openAction(null, { personId: selectedPersonId });
$("addInteractionButton").onclick = () => {
  $("interactionAt").value = localDateTimeValue();
  $("interactionText").value = "";
  $("interactionDialog").showModal();
};
$("interactionForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await commit((s) =>
      s.interactions.push({
        id: uid("interaction"),
        personId: selectedPersonId,
        at: new Date($("interactionAt").value).toISOString(),
        text: $("interactionText").value.trim(),
      }),
    );
    $("interactionDialog").close();
    openPerson(selectedPersonId);
  } catch (err) {
    showError(err);
  }
};
$("backupButton").onclick = async () => {
  try {
    const envelope = await store.makeBackup();
    downloadEnvelope(envelope, `71-day-backup-${todayKey()}.enc.json`);
    localStorage.setItem("71day-last-backup", envelope.createdAt);
    renderHistory();
    toast("加密备份已生成");
  } catch (err) {
    showError(err);
  }
};
$("restoreInput").onchange = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const envelope = JSON.parse(await file.text());
    pendingRestore = await store.previewBackup(envelope, store.password);
    const older = pendingRestore.revision < (state.revision || 0);
    $("restoreBody").innerHTML =
      `<p>备份 Revision ${pendingRestore.revision} / 当前 ${state.revision || 0}</p><p>人物 ${pendingRestore.counts.people} · 事项 ${pendingRestore.counts.events} · 交通 ${pendingRestore.counts.travel} · 待办 ${pendingRestore.counts.actions}</p>${older ? "<p>备份比当前状态旧，恢复会覆盖当前记录。</p>" : ""}`;
    $("restoreConfirmButton").textContent = older
      ? "仍然恢复旧备份"
      : "恢复数据";
    $("restoreDialog").showModal();
  } catch (err) {
    showError(err);
  } finally {
    e.target.value = "";
  }
};
$("restoreConfirmButton").onclick = async () => {
  if (!pendingRestore || saving) return;
  if (
    pendingRestore.revision < (state.revision || 0) &&
    !confirm("确定用较旧备份覆盖当前状态吗？")
  )
    return;
  saving = true;
  try {
    state = await store.restore(pendingRestore.incoming);
    pendingRestore = null;
    $("restoreDialog").close();
    renderAll();
    toast("备份已恢复");
  } catch (err) {
    showError(err);
  } finally {
    saving = false;
  }
};
$("undoButton").onclick = () =>
  commit(
    (s) => Object.assign(s, undoLastChange(s)),
    "已撤销最近一次变更",
  ).catch(showError);
function renderHistory() {
  const list = [...state.history].reverse().slice(0, 20);
  $("historyList").innerHTML =
    list
      .map(
        (h) =>
          `<article class="history-card"><strong>行程修改${h.undoneAt ? " · 已撤销" : ""}</strong><p>${esc(h.reason || "未填写原因")}</p><p>${esc(JSON.stringify(h.after || {}))}</p></article>`,
      )
      .join("") || "还没有变更历史。";
  const last = localStorage.getItem("71day-last-backup");
  $("backupMeta").textContent = last
    ? `上次备份：${new Date(last).toLocaleString()}`
    : "尚未创建备份";
}
if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("./sw.js").catch(() => {});
