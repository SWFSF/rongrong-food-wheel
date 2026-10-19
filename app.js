import {
  META,
  FOODS,
  TIPS,
  ENCOURAGEMENTS,
  PAIN_CARD,
  QUICK_DISLIKES
} from "./data.js";
import {
  STORAGE_KEY,
  PERIOD_LABELS,
  buildWheel,
  clone,
  createDefaultState,
  formatDistance,
  normalizeState,
  parseDislikeText,
  parseImportedState,
  pickEncouragement,
  pickTip,
  toShanghaiDateKey
} from "./core.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const query = new URLSearchParams(window.location.search);
const previewMode = query.get("preview");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const elements = {
  body: document.body,
  heroSubtitle: document.querySelector("#hero-subtitle"),
  filterTabs: [...document.querySelectorAll("[data-tab]")],
  periodToggle: document.querySelector("#period-toggle"),
  periodPanel: document.querySelector("#period-panel"),
  closePeriod: document.querySelector("#close-period"),
  phaseChips: [...document.querySelectorAll("[data-phase]")],
  periodTip: document.querySelector("#period-tip"),
  wheelSvg: document.querySelector("#wheel-svg"),
  wheelStatus: document.querySelector("#wheel-status"),
  spinButton: document.querySelector("#spin-button"),
  shuffleButton: document.querySelector("#shuffle-button"),
  emptyState: document.querySelector("#empty-state"),
  resultCard: document.querySelector("#result-card"),
  resultSource: document.querySelector("#result-source"),
  resultEmoji: document.querySelector("#result-emoji"),
  resultName: document.querySelector("#result-name"),
  resultLocation: document.querySelector("#result-location"),
  resultPraise: document.querySelector("#result-praise"),
  eatThis: document.querySelector("#eat-this"),
  spinAgain: document.querySelector("#spin-again"),
  copySearch: document.querySelector("#copy-search"),
  dailyEncouragement: document.querySelector("#daily-encouragement"),
  tipModeLabel: document.querySelector("#tip-mode-label"),
  dailyTipText: document.querySelector("#daily-tip-text"),
  painCard: document.querySelector("#pain-card"),
  painIntro: document.querySelector("#pain-intro"),
  painSteps: document.querySelector("#pain-steps"),
  painWarning: document.querySelector("#pain-warning"),
  sourceList: document.querySelector("#source-list"),
  openSettings: document.querySelector("#open-settings"),
  settingsDialog: document.querySelector("#settings-dialog"),
  closeSettings: document.querySelector("#close-settings"),
  settingsTabs: [...document.querySelectorAll("[data-settings-tab]")],
  settingsPanels: [...document.querySelectorAll("[data-settings-panel]")],
  settingsChips: document.querySelector("#settings-chips"),
  spicePreferenceButtons: [...document.querySelectorAll("[data-spice-pref]")],
  dislikeInput: document.querySelector("#dislike-input"),
  savePreferences: document.querySelector("#save-preferences"),
  foodSearch: document.querySelector("#food-search"),
  foodCountLabel: document.querySelector("#food-count-label"),
  foodManageList: document.querySelector("#food-manage-list"),
  tipManageList: document.querySelector("#tip-manage-list"),
  addFood: document.querySelector("#add-food"),
  addTip: document.querySelector("#add-tip"),
  exportData: document.querySelector("#export-data"),
  importData: document.querySelector("#import-data"),
  resetData: document.querySelector("#reset-data"),
  onboardingDialog: document.querySelector("#onboarding-dialog"),
  onboardingChips: document.querySelector("#onboarding-chips"),
  onboardingOther: document.querySelector("#onboarding-other"),
  foodDialog: document.querySelector("#food-dialog"),
  foodForm: document.querySelector("#food-form"),
  foodDialogTitle: document.querySelector("#food-dialog-title"),
  closeFoodDialog: document.querySelector("#close-food-dialog"),
  cancelFood: document.querySelector("#cancel-food"),
  tipDialog: document.querySelector("#tip-dialog"),
  tipForm: document.querySelector("#tip-form"),
  tipDialogTitle: document.querySelector("#tip-dialog-title"),
  closeTipDialog: document.querySelector("#close-tip-dialog"),
  cancelTip: document.querySelector("#cancel-tip"),
  toast: document.querySelector("#toast")
};

let state = loadState();
let currentDateKey = toShanghaiDateKey();
let currentWheel = [];
let currentResult = null;
let currentRotation = 0;
let isSpinning = false;
let onboardingSelection = new Set(state.preferences.dislikes);
let toastTimer = 0;
let lastShownDate = currentDateKey;

applyPreviewState();
bindEvents();
renderStaticContent();
refreshAll();
registerServiceWorker();
scheduleDailyCheck();
maybeShowOnboarding();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState(FOODS, TIPS);
    return normalizeState(JSON.parse(raw), FOODS, TIPS);
  } catch {
    return createDefaultState(FOODS, TIPS);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    showToast("保存失败，请检查浏览器存储空间");
    return false;
  }
}

function applyPreviewState() {
  if (previewMode === "period") {
    state.period.enabled = true;
    state.period.phase = "during";
  }
  if (previewMode === "result") {
    state.period.enabled = false;
  }
}

function bindEvents() {
  elements.filterTabs.forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = button.dataset.tab;
      state.page = 0;
      saveState();
      hideResult();
      updateFilterUI();
      updateWheel();
    });
  });

  elements.periodToggle.addEventListener("click", () => {
    state.period.enabled = !state.period.enabled;
    state.page = 0;
    saveState();
    hideResult();
    updatePeriodUI();
    updateWheel();
    updateDailyContent();
    if (state.period.enabled) {
      showToast(`已切换到${PERIOD_LABELS[state.period.phase]}餐单`);
    }
  });

  elements.closePeriod.addEventListener("click", () => {
    state.period.enabled = false;
    state.page = 0;
    saveState();
    hideResult();
    updatePeriodUI();
    updateWheel();
    updateDailyContent();
  });

  elements.phaseChips.forEach((button) => {
    button.addEventListener("click", () => {
      state.period.phase = button.dataset.phase;
      state.page = 0;
      saveState();
      hideResult();
      updatePeriodUI();
      updateWheel();
      updateDailyContent();
    });
  });

  elements.spinButton.addEventListener("click", spinWheel);
  elements.spinAgain.addEventListener("click", spinWheel);
  elements.shuffleButton.addEventListener("click", () => {
    if (isSpinning) return;
    state.page += 1;
    saveState();
    hideResult();
    updateWheel();
    showToast("换了一批新口味");
  });

  elements.eatThis.addEventListener("click", rememberChoice);
  elements.copySearch.addEventListener("click", copySearchTerm);

  elements.openSettings.addEventListener("click", openSettings);
  elements.closeSettings.addEventListener("click", () => elements.settingsDialog.close());
  elements.settingsTabs.forEach((button) => {
    button.addEventListener("click", () => setSettingsTab(button.dataset.settingsTab));
  });
  elements.settingsChips.addEventListener("click", handleQuickDislikeClick);
  elements.spicePreferenceButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.preferences.spicePreference = button.dataset.spicePref;
      state.page = 0;
      saveState();
      renderSpicePreference();
      hideResult();
      updateWheel();
    });
  });
  elements.onboardingChips.addEventListener("click", handleOnboardingChipClick);
  elements.savePreferences.addEventListener("click", savePreferences);
  elements.foodSearch.addEventListener("input", renderFoodManager);
  elements.addFood.addEventListener("click", () => openFoodEditor());
  elements.addTip.addEventListener("click", () => openTipEditor());
  elements.exportData.addEventListener("click", exportData);
  elements.importData.addEventListener("change", importData);
  elements.resetData.addEventListener("click", resetData);

  elements.closeFoodDialog.addEventListener("click", closeFoodEditor);
  elements.cancelFood.addEventListener("click", closeFoodEditor);
  document.querySelector("#food-source-type").addEventListener("change", toggleDistanceField);
  elements.foodForm.addEventListener("submit", saveFoodFromForm);
  elements.closeTipDialog.addEventListener("click", closeTipEditor);
  elements.cancelTip.addEventListener("click", closeTipEditor);
  elements.tipForm.addEventListener("submit", saveTipFromForm);
  elements.foodManageList.addEventListener("click", handleFoodManagerClick);
  elements.tipManageList.addEventListener("click", handleTipManagerClick);

  elements.onboardingDialog.addEventListener("submit", handleOnboardingSubmit);
  elements.onboardingDialog.addEventListener("close", () => {
    state.preferences.onboardingDone = true;
    saveState();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkDateRollover();
  });
}

function renderStaticContent() {
  elements.sourceList.replaceChildren(
    ...META.sources.map((source) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = source.label;
      const note = document.createElement("span");
      note.textContent = `：${source.note}`;
      item.append(link, note);
      return item;
    })
  );

  elements.painIntro.textContent = PAIN_CARD.intro;
  elements.painWarning.textContent = PAIN_CARD.warning;
  elements.painSteps.replaceChildren(
    ...PAIN_CARD.steps.map((step) => {
      const item = document.createElement("li");
      const title = document.createElement("strong");
      title.textContent = step.label;
      item.append(title, document.createTextNode(step.text));
      return item;
    })
  );

  renderQuickChips(elements.settingsChips, state.preferences.dislikes);
  renderQuickChips(elements.onboardingChips, [...onboardingSelection]);
}

function refreshAll() {
  updateFilterUI();
  updatePeriodUI();
  updateDailyContent();
  updateWheel();
  renderSettingsData();
  if (previewMode === "result" && currentWheel.length) {
    showResult(currentWheel[0], false);
  }
}

function updateFilterUI() {
  elements.filterTabs.forEach((button) => {
    const active = button.dataset.tab === state.tab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  elements.periodToggle.setAttribute("aria-pressed", String(state.period.enabled));
}

function updatePeriodUI() {
  elements.body.classList.toggle("period-on", state.period.enabled);
  elements.periodToggle.setAttribute("aria-pressed", String(state.period.enabled));
  elements.periodPanel.hidden = !state.period.enabled;
  elements.painCard.hidden = !state.period.enabled;
  elements.heroSubtitle.textContent = state.period.enabled
    ? "今天不急，挑一份热的，慢慢照顾好自己。"
    : "16 种好味道，转一下就有答案。";

  elements.phaseChips.forEach((button) => {
    const active = button.dataset.phase === state.period.phase;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function updateDailyContent() {
  const dailyEncouragement = pickEncouragement(ENCOURAGEMENTS, currentDateKey, "daily");
  elements.dailyEncouragement.textContent = dailyEncouragement;

  const tip = pickTip(state.tips, {
    dateKey: currentDateKey,
    periodEnabled: state.period.enabled,
    periodPhase: state.period.phase
  });
  elements.tipModeLabel.textContent = state.period.enabled
    ? `${PERIOD_LABELS[state.period.phase]}照顾`
    : "日常照顾";
  elements.dailyTipText.textContent = tip
    ? `${tip.title}：${tip.body}`
    : "暂时没有启用的提醒，可以在设置里添加一条。";

  const periodTip = pickTip(state.tips, {
    dateKey: currentDateKey,
    periodEnabled: true,
    periodPhase: state.period.phase
  });
  elements.periodTip.textContent = periodTip
    ? `${periodTip.title} · ${periodTip.body}`
    : "经期模式已开启，可以慢慢挑一份热乎的。";
}

function updateWheel() {
  currentWheel = buildWheel({
    foods: state.foods,
    tab: state.tab,
    periodEnabled: state.period.enabled,
    periodPhase: state.period.phase,
    dislikes: state.preferences.dislikes,
    spicePreference: state.preferences.spicePreference,
    dateKey: currentDateKey,
    page: state.page,
    history: state.history,
    dataRevision: state.dataRevision,
    count: META.wheelSize
  });

  renderWheel(currentWheel);
  const dateLabel = formatDateLabel(currentDateKey);
  elements.wheelStatus.textContent = currentWheel.length
    ? `今天有 ${currentWheel.length} 道候选 · ${dateLabel}`
    : `今天没有符合条件的选择 · ${dateLabel}`;

  const empty = currentWheel.length === 0;
  elements.emptyState.hidden = !empty;
  elements.spinButton.disabled = empty;
  elements.shuffleButton.disabled = empty;
  elements.wheelSvg.style.visibility = empty ? "hidden" : "visible";
}

function renderWheel(items) {
  elements.wheelSvg.replaceChildren();
  if (!items.length) {
    elements.wheelSvg.setAttribute("aria-label", "没有符合当前筛选条件的美食");
    return;
  }

  const colors = ["#f9d9dc", "#fff0bf", "#d9f0e2", "#eadff4"];
  const center = 200;
  const radius = 195;
  const sliceAngle = 360 / items.length;

  items.forEach((food, index) => {
    const start = -90 + index * sliceAngle - sliceAngle / 2;
    const end = start + sliceAngle;
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", describeSlice(center, radius, start, end));
    path.setAttribute("fill", colors[index % colors.length]);
    path.setAttribute("class", "wheel-slice");
    path.setAttribute("data-index", String(index));
    path.setAttribute("data-food-id", food.id);
    elements.wheelSvg.append(path);

    const angle = -90 + index * sliceAngle;
    const emojiPoint = polarPoint(center, center, 108, angle);
    const labelPoint = polarPoint(center, center, 151, angle);

    const emoji = document.createElementNS(SVG_NS, "text");
    emoji.setAttribute("x", String(emojiPoint.x));
    emoji.setAttribute("y", String(emojiPoint.y));
    emoji.setAttribute("text-anchor", "middle");
    emoji.setAttribute("dominant-baseline", "middle");
    emoji.setAttribute("class", "wheel-emoji");
    emoji.textContent = food.emoji;
    elements.wheelSvg.append(emoji);

    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", String(labelPoint.x));
    label.setAttribute("y", String(labelPoint.y));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("dominant-baseline", "middle");
    label.setAttribute("class", "wheel-label");
    label.textContent = food.shortName || food.name.slice(0, 5);
    elements.wheelSvg.append(label);
  });

  const centerCircle = document.createElementNS(SVG_NS, "circle");
  centerCircle.setAttribute("cx", String(center));
  centerCircle.setAttribute("cy", String(center));
  centerCircle.setAttribute("r", "67");
  centerCircle.setAttribute("class", "wheel-center-rim");
  elements.wheelSvg.append(centerCircle);

  elements.wheelSvg.setAttribute(
    "aria-label",
    `美食转盘，共 ${items.length} 格：${items.map((food) => food.name).join("、")}`
  );
}

function describeSlice(cx, radius, startAngle, endAngle) {
  const start = polarPoint(cx, cx, radius, startAngle);
  const end = polarPoint(cx, cx, radius, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${cx} ${cx}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    "Z"
  ].join(" ");
}

function polarPoint(cx, cy, radius, angleDegrees) {
  const radians = (angleDegrees * Math.PI) / 180;
  return {
    x: Number((cx + radius * Math.cos(radians)).toFixed(3)),
    y: Number((cy + radius * Math.sin(radians)).toFixed(3))
  };
}

async function spinWheel() {
  if (isSpinning || !currentWheel.length) return;
  isSpinning = true;
  elements.spinButton.disabled = true;
  elements.spinAgain.disabled = true;
  elements.shuffleButton.disabled = true;
  elements.spinButton.querySelector(".spin-main").textContent = "转呀转";
  elements.spinButton.querySelector(".spin-small").textContent = "等一下下";
  elements.resultCard.hidden = true;

  const selectedIndex = secureRandomIndex(currentWheel.length);
  const selected = currentWheel[selectedIndex];
  const desired = (360 - selectedIndex * (360 / currentWheel.length)) % 360;
  const normalized = ((currentRotation % 360) + 360) % 360;
  const alignment = (desired - normalized + 360) % 360;
  const jitter = (Math.random() * 8) - 4;
  currentRotation += 360 * 6 + alignment + jitter;
  elements.wheelSvg.classList.add("is-spinning");
  elements.wheelSvg.style.transform = `rotate(${currentRotation}deg)`;
  elements.wheelSvg.style.setProperty("--wheel-rotation", `${currentRotation}deg`);

  await delay(reduceMotion ? 80 : 3450);
  elements.wheelSvg.classList.remove("is-spinning");
  elements.spinButton.disabled = false;
  elements.spinAgain.disabled = false;
  elements.shuffleButton.disabled = false;
  elements.spinButton.querySelector(".spin-main").textContent = "再转一次";
  elements.spinButton.querySelector(".spin-small").textContent = "换一个";
  isSpinning = false;
  showResult(selected, true);
}

function showResult(food, shouldScroll) {
  currentResult = food;
  elements.resultCard.dataset.foodId = food.id;
  elements.resultCard.hidden = false;
  elements.resultSource.textContent = food.sourceType === "canteen" ? "食堂" : "外卖";
  elements.resultSource.classList.toggle("is-takeaway", food.sourceType === "takeaway");
  elements.resultEmoji.textContent = food.emoji;
  elements.resultName.textContent = food.name;

  if (food.sourceType === "canteen") {
    elements.resultLocation.textContent = [
      food.venue,
      food.floor,
      food.stall
    ].filter(Boolean).join(" · ");
    elements.copySearch.hidden = true;
  } else {
    const distance = formatDistance(food.distanceKm);
    elements.resultLocation.textContent = [
      food.venue,
      distance ? `${distance}（直线距离）` : "",
      "去外卖平台搜店名"
    ].filter(Boolean).join(" · ");
    elements.copySearch.hidden = false;
  }

  elements.resultPraise.textContent = pickEncouragement(
    ENCOURAGEMENTS,
    currentDateKey,
    food.id
  );
  elements.eatThis.textContent = "就吃这个";
  elements.eatThis.disabled = false;

  if (shouldScroll) {
    window.setTimeout(() => {
      elements.resultCard.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "nearest"
      });
    }, 80);
  }
}

function hideResult() {
  currentResult = null;
  elements.resultCard.hidden = true;
}

function rememberChoice() {
  if (!currentResult) return;
  const alreadyLoggedToday = state.history.some((entry) => (
    entry.foodId === currentResult.id && entry.date === currentDateKey
  ));
  if (!alreadyLoggedToday) {
    state.history.push({
      foodId: currentResult.id,
      date: currentDateKey,
      at: new Date().toISOString()
    });
    state.history = state.history.slice(-50);
    saveState();
  }
  elements.eatThis.textContent = "记住啦 ✓";
  elements.eatThis.disabled = true;
  showToast("好呀，下一顿有着落啦");
}

async function copySearchTerm() {
  if (!currentResult) return;
  const term = currentResult.searchTerm || `${currentResult.venue} ${currentResult.name}`;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(term);
    } else {
      fallbackCopy(term);
    }
    showToast(`已复制「${term}」，去外卖平台搜一下`);
  } catch {
    fallbackCopy(term);
    showToast("搜索词已复制");
  }
}

function fallbackCopy(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

function openSettings() {
  renderSettingsData();
  elements.settingsDialog.showModal();
}

function setSettingsTab(tabName) {
  elements.settingsTabs.forEach((button) => {
    const active = button.dataset.settingsTab === tabName;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  elements.settingsPanels.forEach((panel) => {
    const active = panel.dataset.settingsPanel === tabName;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
}

function renderSettingsData() {
  elements.dislikeInput.value = state.preferences.dislikes.join("，");
  renderSpicePreference();
  renderQuickChips(elements.settingsChips, state.preferences.dislikes);
  renderFoodManager();
  renderTipManager();
}

function renderSpicePreference() {
  elements.spicePreferenceButtons.forEach((button) => {
    const active = button.dataset.spicePref === state.preferences.spicePreference;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderQuickChips(container, selectedValues) {
  container.replaceChildren(
    ...QUICK_DISLIKES.map((label) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "quick-chip";
      button.dataset.dislike = label;
      button.textContent = label;
      button.classList.toggle("is-active", selectedValues.includes(label));
      button.setAttribute("aria-pressed", String(selectedValues.includes(label)));
      return button;
    })
  );
}

function handleQuickDislikeClick(event) {
  const button = event.target.closest("[data-dislike]");
  if (!button) return;
  toggleDislike(button.dataset.dislike, state.preferences.dislikes);
  state.preferences.dislikes = [...new Set(state.preferences.dislikes)];
  state.page = 0;
  saveState();
  renderSettingsData();
  hideResult();
  updateWheel();
}

function handleOnboardingChipClick(event) {
  const button = event.target.closest("[data-dislike]");
  if (!button) return;
  const label = button.dataset.dislike;
  if (onboardingSelection.has(label)) {
    onboardingSelection.delete(label);
  } else {
    onboardingSelection.add(label);
  }
  renderQuickChips(elements.onboardingChips, [...onboardingSelection]);
}

function toggleDislike(label, target) {
  const index = target.indexOf(label);
  if (index >= 0) {
    target.splice(index, 1);
  } else {
    target.push(label);
  }
}

function savePreferences() {
  state.preferences.dislikes = parseDislikeText(elements.dislikeInput.value);
  state.page = 0;
  saveState();
  renderSettingsData();
  hideResult();
  updateWheel();
  showToast("口味已经记住啦");
}

function handleOnboardingSubmit(event) {
  event.preventDefault();
  const other = parseDislikeText(elements.onboardingOther.value);
  state.preferences.dislikes = [...new Set([...onboardingSelection, ...other])];
  state.preferences.onboardingDone = true;
  state.page = 0;
  saveState();
  renderSettingsData();
  hideResult();
  updateWheel();
  elements.onboardingDialog.close(event.submitter?.value || "save");
  showToast("以后随时都能在设置里改");
}

function maybeShowOnboarding() {
  if (previewMode || state.preferences.onboardingDone) return;
  window.setTimeout(() => {
    if (!elements.settingsDialog.open && !elements.onboardingDialog.open) {
      elements.onboardingDialog.showModal();
    }
  }, 650);
}

function renderFoodManager() {
  const search = elements.foodSearch.value.trim();
  const foods = state.foods.filter((food) => {
    if (!search) return true;
    return [food.name, food.venue, food.floor, food.stall, ...(food.tags || [])]
      .join(" ")
      .includes(search);
  });

  elements.foodCountLabel.textContent = `共 ${state.foods.length} 道，当前显示 ${foods.length} 道`;
  elements.foodManageList.replaceChildren(
    ...foods.map((food) => {
      const row = document.createElement("div");
      row.className = "manage-row";
      row.classList.toggle("is-disabled", food.enabled === false);
      row.dataset.foodId = food.id;

      const icon = document.createElement("span");
      icon.className = "manage-row-icon";
      icon.textContent = food.emoji;

      const copy = document.createElement("div");
      copy.className = "manage-row-copy";
      const title = document.createElement("strong");
      title.textContent = food.name;
      const meta = document.createElement("span");
      meta.textContent = [
        food.sourceType === "canteen" ? "食堂" : "外卖",
        food.venue,
        food.floor,
        food.stall
      ].filter(Boolean).join(" · ");
      copy.append(title, meta);

      const actions = document.createElement("div");
      actions.className = "manage-actions";
      const editButton = makeIconButton("edit", "编辑菜品");
      editButton.dataset.action = "edit-food";
      const deleteButton = makeIconButton("delete", "删除菜品");
      deleteButton.dataset.action = "delete-food";
      deleteButton.classList.add("delete");
      actions.append(editButton, deleteButton);
      row.append(icon, copy, actions);
      return row;
    })
  );
}

function renderTipManager() {
  elements.tipManageList.replaceChildren(
    ...state.tips.map((tip) => {
      const row = document.createElement("div");
      row.className = "manage-row";
      row.classList.toggle("is-disabled", tip.enabled === false);
      row.dataset.tipId = tip.id;

      const icon = document.createElement("span");
      icon.className = "manage-row-icon";
      icon.textContent = tip.category === "care" ? "♡" : "✿";

      const copy = document.createElement("div");
      copy.className = "manage-row-copy";
      const title = document.createElement("strong");
      title.textContent = tip.title;
      const meta = document.createElement("span");
      meta.textContent = `${tip.category === "care" ? "经期照顾" : "日常提醒"} · ${
        tip.phase === "general" ? "日常" : PERIOD_LABELS[tip.phase]
      }`;
      copy.append(title, meta);

      const actions = document.createElement("div");
      actions.className = "manage-actions";
      const editButton = makeIconButton("edit", "编辑提醒");
      editButton.dataset.action = "edit-tip";
      const deleteButton = makeIconButton("delete", "删除提醒");
      deleteButton.dataset.action = "delete-tip";
      deleteButton.classList.add("delete");
      actions.append(editButton, deleteButton);
      row.append(icon, copy, actions);
      return row;
    })
  );
}

function makeIconButton(type, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mini-button";
  button.setAttribute("aria-label", label);
  button.innerHTML = type === "edit"
    ? '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 14.7-.8 3 3-.8L15 8a2.1 2.1 0 0 0-3-3L4 14.7Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="m10.9 6.2 3 3" stroke="currentColor" stroke-width="1.5"/></svg>'
    : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 6.5h11M8 6.5V4.8h4v1.7M6 6.5l.7 9h6.6l.7-9M8.5 9v4.3M11.5 9v4.3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return button;
}

function handleFoodManagerClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const row = event.target.closest("[data-food-id]");
  if (!row) return;
  const food = state.foods.find((item) => item.id === row.dataset.foodId);
  if (!food) return;

  if (button.dataset.action === "edit-food") {
    openFoodEditor(food);
  } else if (button.dataset.action === "delete-food") {
    if (!window.confirm(`删除「${food.name}」？`)) return;
    state.foods = state.foods.filter((item) => item.id !== food.id);
    state.dataRevision += 1;
    state.page = 0;
    saveState();
    renderFoodManager();
    hideResult();
    updateWheel();
    showToast("菜品已删除");
  }
}

function handleTipManagerClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const row = event.target.closest("[data-tip-id]");
  if (!row) return;
  const tip = state.tips.find((item) => item.id === row.dataset.tipId);
  if (!tip) return;

  if (button.dataset.action === "edit-tip") {
    openTipEditor(tip);
  } else if (button.dataset.action === "delete-tip") {
    if (!window.confirm(`删除提醒「${tip.title}」？`)) return;
    state.tips = state.tips.filter((item) => item.id !== tip.id);
    saveState();
    renderTipManager();
    updateDailyContent();
    showToast("提醒已删除");
  }
}

function openFoodEditor(food = null) {
  elements.foodForm.reset();
  elements.foodDialogTitle.textContent = food ? "编辑菜品" : "添加菜品";
  document.querySelector("#food-id").value = food?.id || "";
  document.querySelector("#food-name").value = food?.name || "";
  document.querySelector("#food-emoji").value = food?.emoji || "🍽️";
  document.querySelector("#food-source-type").value = food?.sourceType || "canteen";
  document.querySelector("#food-venue").value = food?.venue || "丰园";
  document.querySelector("#food-floor").value = food?.floor || "";
  document.querySelector("#food-stall").value = food?.stall || "";
  document.querySelector("#food-distance").value = food?.distanceKm ?? "";
  document.querySelector("#food-spice").value = String(food?.spice ?? 1);
  document.querySelector("#food-tags").value = (food?.tags || []).join("，");
  document.querySelector("#food-enabled").checked = food?.enabled !== false;
  document.querySelectorAll("#food-form .check-fieldset input").forEach((checkbox) => {
    checkbox.checked = (food?.periodPhases || []).includes(checkbox.value);
  });
  toggleDistanceField();
  elements.foodDialog.showModal();
}

function toggleDistanceField() {
  const isTakeaway = document.querySelector("#food-source-type").value === "takeaway";
  document.querySelector("#distance-field").hidden = !isTakeaway;
}

function closeFoodEditor() {
  elements.foodDialog.close();
}

function saveFoodFromForm(event) {
  event.preventDefault();
  const existingId = document.querySelector("#food-id").value;
  const name = document.querySelector("#food-name").value.trim();
  const sourceType = document.querySelector("#food-source-type").value;
  const distanceValue = document.querySelector("#food-distance").value;
  const newFood = {
    id: existingId || `custom-food-${Date.now()}`,
    name,
    shortName: name.slice(0, 5),
    emoji: document.querySelector("#food-emoji").value.trim() || "🍽️",
    sourceType,
    venue: document.querySelector("#food-venue").value.trim(),
    floor: document.querySelector("#food-floor").value.trim(),
    stall: document.querySelector("#food-stall").value.trim(),
    distanceKm: sourceType === "takeaway" && distanceValue
      ? Number(distanceValue)
      : null,
    tags: parseDislikeText(document.querySelector("#food-tags").value),
    spice: Number(document.querySelector("#food-spice").value),
    periodPhases: [...document.querySelectorAll("#food-form .check-fieldset input:checked")]
      .map((checkbox) => checkbox.value),
    searchTerm: `${document.querySelector("#food-venue").value.trim()} ${name}`.trim(),
    source: "手动添加",
    enabled: document.querySelector("#food-enabled").checked
  };

  if (existingId) {
    state.foods = state.foods.map((food) => (food.id === existingId ? newFood : food));
  } else {
    state.foods.unshift(newFood);
  }
  state.dataRevision += 1;
  state.page = 0;
  saveState();
  closeFoodEditor();
  renderFoodManager();
  hideResult();
  updateWheel();
  showToast(existingId ? "菜品已更新" : "新菜品已加入转盘");
}

function openTipEditor(tip = null) {
  elements.tipForm.reset();
  elements.tipDialogTitle.textContent = tip ? "编辑提醒" : "添加提醒";
  document.querySelector("#tip-id").value = tip?.id || "";
  document.querySelector("#tip-title").value = tip?.title || "";
  document.querySelector("#tip-body").value = tip?.body || "";
  document.querySelector("#tip-phase").value = tip?.phase || "general";
  document.querySelector("#tip-category").value = tip?.category || "daily";
  document.querySelector("#tip-enabled").checked = tip?.enabled !== false;
  elements.tipDialog.showModal();
}

function closeTipEditor() {
  elements.tipDialog.close();
}

function saveTipFromForm(event) {
  event.preventDefault();
  const existingId = document.querySelector("#tip-id").value;
  const newTip = {
    id: existingId || `custom-tip-${Date.now()}`,
    title: document.querySelector("#tip-title").value.trim(),
    body: document.querySelector("#tip-body").value.trim(),
    phase: document.querySelector("#tip-phase").value,
    category: document.querySelector("#tip-category").value,
    enabled: document.querySelector("#tip-enabled").checked
  };

  if (existingId) {
    state.tips = state.tips.map((tip) => (tip.id === existingId ? newTip : tip));
  } else {
    state.tips.unshift(newTip);
  }
  saveState();
  closeTipEditor();
  renderTipManager();
  updateDailyContent();
  showToast(existingId ? "提醒已更新" : "新提醒已添加");
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `蓉蓉饭饭备份-${currentDateKey}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("备份文件已导出");
}

function importData(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    showToast("备份文件太大，无法导入");
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const imported = parseImportedState(String(reader.result), FOODS, TIPS);
    if (!imported) {
      showToast("这个文件不是有效的饭饭备份");
      return;
    }
    state = imported;
    state.preferences.onboardingDone = true;
    currentDateKey = toShanghaiDateKey();
    saveState();
    renderSettingsData();
    refreshAll();
    showToast("备份已恢复");
  });
  reader.readAsText(file);
}

function resetData() {
  if (!window.confirm("恢复默认会清除你添加的菜品、提醒和忌口，确定吗？")) return;
  state = createDefaultState(FOODS, TIPS);
  state.preferences.onboardingDone = true;
  onboardingSelection = new Set();
  currentDateKey = toShanghaiDateKey();
  saveState();
  renderStaticContent();
  renderSettingsData();
  refreshAll();
  elements.settingsDialog.close();
  showToast("已恢复默认内容");
}

function checkDateRollover() {
  const nextDateKey = toShanghaiDateKey();
  if (nextDateKey === currentDateKey) return;
  currentDateKey = nextDateKey;
  state.page = 0;
  hideResult();
  saveState();
  updateDailyContent();
  updateWheel();
  if (nextDateKey !== lastShownDate) {
    lastShownDate = nextDateKey;
    showToast("新的一天，饭饭菜单换好啦");
  }
}

function scheduleDailyCheck() {
  window.setInterval(checkDateRollover, 30000);
}

function formatDateLabel(dateKey) {
  const [, month, day] = dateKey.split("-");
  return `${Number(month)} 月 ${Number(day)} 日`;
}

function secureRandomIndex(length) {
  if (window.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0] % length;
  }
  return Math.floor(Math.random() * length);
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 2300);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // 离线缓存失败时，页面仍可在线使用。
    });
  });
}
