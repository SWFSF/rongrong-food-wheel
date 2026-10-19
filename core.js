export const APP_VERSION = 1;
export const STORAGE_KEY = "rongrong-food-wheel-state-v1";
export const PERIOD_LABELS = {
  pre: "经前",
  during: "经期",
  post: "经后"
};

const DISLIKE_ALIASES = {
  海鲜: ["海鲜", "鱼", "虾", "花甲", "蛤", "蟹", "贝"],
  乳制品: ["乳制品", "芝士", "奶", "蛋糕", "披萨"],
  太辣: [],
  冰饮: ["冰", "冷饮", "冰饮"]
};

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function toShanghaiDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function hashString(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed) {
  let value = seed >>> 0;
  return function random() {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(items, seedText) {
  const output = [...items];
  const random = mulberry32(hashString(seedText));
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }
  return output;
}

export function parseDislikeText(text = "") {
  return [...new Set(
    String(text)
      .split(/[,，、;；\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

function foodSearchText(food) {
  return [
    food.name,
    food.shortName,
    food.venue,
    food.stall,
    ...(Array.isArray(food.tags) ? food.tags : [])
  ].join(" ");
}

export function foodMatchesDislikes(food, dislikeTokens = []) {
  const text = foodSearchText(food);
  return dislikeTokens.some((token) => {
    if (token === "太辣") {
      return Number(food.spice) >= 3;
    }
    const aliases = DISLIKE_ALIASES[token] || [token];
    return aliases.some((alias) => text.includes(alias));
  });
}

export function filterFoods(foods, options = {}) {
  const {
    tab = "all",
    periodEnabled = false,
    periodPhase = "during",
    dislikes = [],
    spicePreference = "mild"
  } = options;

  return foods.filter((food) => {
    if (!food || food.enabled === false) return false;
    if (tab !== "all" && food.sourceType !== tab) return false;
    if (foodMatchesDislikes(food, dislikes)) return false;

    const preferenceCap = spicePreference === "spicy" ? 3 : 1;

    if (periodEnabled) {
      const phases = Array.isArray(food.periodPhases) ? food.periodPhases : [];
      if (!phases.includes(periodPhase)) return false;
      const periodCap = periodPhase === "during" ? 1 : 2;
      const maximumSpice = Math.min(preferenceCap, periodCap);
      if (Number(food.spice) > maximumSpice) return false;
    } else if (Number(food.spice) > preferenceCap) {
      return false;
    }

    return true;
  });
}

export function recentFoodIds(history = [], dateKey, days = 3) {
  const start = new Date(`${dateKey}T00:00:00+08:00`);
  start.setDate(start.getDate() - (days - 1));
  const startKey = [
    start.getFullYear(),
    String(start.getMonth() + 1).padStart(2, "0"),
    String(start.getDate()).padStart(2, "0")
  ].join("-");

  return new Set(
    history
      .filter((entry) => entry && entry.date >= startKey && entry.date <= dateKey)
      .map((entry) => entry.foodId)
  );
}

export function buildWheel(options) {
  const {
    foods,
    tab = "all",
    periodEnabled = false,
    periodPhase = "during",
    dislikes = [],
    spicePreference = "mild",
    dateKey,
    page = 0,
    history = [],
    dataRevision = 0,
    count = 16
  } = options;

  const eligible = filterFoods(foods, {
    tab,
    periodEnabled,
    periodPhase,
    dislikes,
    spicePreference
  });
  const recent = recentFoodIds(history, dateKey);
  const seed = [
    dateKey,
    tab,
    periodEnabled ? periodPhase : "off",
    [...dislikes].sort().join("|"),
    spicePreference,
    String(page),
    String(dataRevision)
  ].join("::");
  const shuffled = seededShuffle(eligible, seed);
  const ordered = [
    ...shuffled.filter((food) => !recent.has(food.id)),
    ...shuffled.filter((food) => recent.has(food.id))
  ];

  return ordered.slice(0, count);
}

export function pickTip(tips, options = {}) {
  const {
    dateKey,
    periodEnabled = false,
    periodPhase = "during"
  } = options;
  const category = periodEnabled ? "care" : "daily";
  const phase = periodEnabled ? periodPhase : "general";
  const eligible = tips.filter((tip) => (
    tip.enabled !== false
    && tip.category === category
    && (tip.phase === phase || tip.phase === "general")
  ));
  if (!eligible.length) return null;
  const index = hashString(`${dateKey}::tip::${category}::${phase}`) % eligible.length;
  return eligible[index];
}

export function pickEncouragement(items, dateKey, variant = "daily") {
  if (!items.length) return "";
  const index = hashString(`${dateKey}::encouragement::${variant}`) % items.length;
  return items[index];
}

export function createDefaultState(foods, tips) {
  return {
    version: APP_VERSION,
    dataRevision: 1,
    foods: clone(foods),
    tips: clone(tips),
    preferences: {
      dislikes: [],
      spicePreference: "mild",
      onboardingDone: false
    },
    period: {
      enabled: false,
      phase: "during"
    },
    tab: "all",
    page: 0,
    history: []
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeFood(food) {
  if (!isPlainObject(food) || typeof food.id !== "string" || typeof food.name !== "string") {
    return null;
  }
  if (!["canteen", "takeaway"].includes(food.sourceType)) return null;
  return {
    id: food.id,
    name: food.name,
    shortName: typeof food.shortName === "string" && food.shortName ? food.shortName : food.name.slice(0, 5),
    emoji: typeof food.emoji === "string" && food.emoji ? food.emoji : "🍽️",
    sourceType: food.sourceType,
    venue: typeof food.venue === "string" ? food.venue : "未填写",
    floor: typeof food.floor === "string" ? food.floor : "",
    stall: typeof food.stall === "string" ? food.stall : "",
    distanceKm: Number.isFinite(Number(food.distanceKm)) ? Number(food.distanceKm) : null,
    tags: Array.isArray(food.tags) ? food.tags.filter((tag) => typeof tag === "string") : [],
    spice: Math.min(3, Math.max(0, Number(food.spice) || 0)),
    periodPhases: Array.isArray(food.periodPhases)
      ? food.periodPhases.filter((phase) => ["pre", "during", "post"].includes(phase))
      : [],
    searchTerm: typeof food.searchTerm === "string" ? food.searchTerm : "",
    source: typeof food.source === "string" ? food.source : "",
    enabled: food.enabled !== false
  };
}

function normalizeTip(tip) {
  if (!isPlainObject(tip) || typeof tip.id !== "string" || typeof tip.title !== "string") {
    return null;
  }
  return {
    id: tip.id,
    title: tip.title,
    body: typeof tip.body === "string" ? tip.body : "",
    phase: ["general", "pre", "during", "post"].includes(tip.phase) ? tip.phase : "general",
    category: ["daily", "care"].includes(tip.category) ? tip.category : "daily",
    enabled: tip.enabled !== false
  };
}

export function normalizeState(raw, seedFoods, seedTips) {
  const fallback = createDefaultState(seedFoods, seedTips);
  if (!isPlainObject(raw)) return fallback;

  const normalizedFoods = Array.isArray(raw.foods)
    ? raw.foods.map(normalizeFood).filter(Boolean)
    : [];
  const normalizedTips = Array.isArray(raw.tips)
    ? raw.tips.map(normalizeTip).filter(Boolean)
    : [];

  if (!normalizedFoods.length) return fallback;

  const tab = ["all", "canteen", "takeaway"].includes(raw.tab) ? raw.tab : "all";
  const phase = ["pre", "during", "post"].includes(raw.period?.phase)
    ? raw.period.phase
    : "during";

  return {
    version: APP_VERSION,
    dataRevision: Number.isFinite(Number(raw.dataRevision))
      ? Math.max(1, Number(raw.dataRevision))
      : 1,
    foods: normalizedFoods,
    tips: normalizedTips.length ? normalizedTips : fallback.tips,
    preferences: {
      dislikes: Array.isArray(raw.preferences?.dislikes)
        ? raw.preferences.dislikes.filter((item) => typeof item === "string")
        : [],
      spicePreference: raw.preferences?.spicePreference === "spicy" ? "spicy" : "mild",
      onboardingDone: Boolean(raw.preferences?.onboardingDone)
    },
    period: {
      enabled: Boolean(raw.period?.enabled),
      phase
    },
    tab,
    page: Number.isFinite(Number(raw.page)) ? Math.max(0, Number(raw.page)) : 0,
    history: Array.isArray(raw.history)
      ? raw.history
        .filter((entry) => (
          entry
          && typeof entry.foodId === "string"
          && typeof entry.date === "string"
        ))
        .slice(-50)
      : []
  };
}

export function parseImportedState(text, seedFoods, seedTips) {
  try {
    return normalizeState(JSON.parse(text), seedFoods, seedTips);
  } catch {
    return null;
  }
}

export function formatDistance(distanceKm) {
  if (!Number.isFinite(distanceKm)) return "";
  return `约 ${distanceKm.toFixed(1)} km`;
}

export function addDays(dateKey, amount) {
  const date = new Date(`${dateKey}T12:00:00+08:00`);
  date.setDate(date.getDate() + amount);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}
