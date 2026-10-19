import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  buildWheel,
  createDefaultState,
  filterFoods,
  parseDislikeText,
  parseImportedState,
  pickTip,
  toShanghaiDateKey
} from "../core.js";
import { FOODS, TIPS } from "../data.js";

test("上海时区日期键在 UTC 下午跨日", () => {
  assert.equal(
    toShanghaiDateKey(new Date("2026-10-19T16:30:00Z")),
    "2026-10-20"
  );
});

test("食堂和外卖筛选返回正确类型", () => {
  const canteen = filterFoods(FOODS, { tab: "canteen" });
  const takeaway = filterFoods(FOODS, { tab: "takeaway" });
  assert.ok(canteen.every((food) => food.sourceType === "canteen"));
  assert.ok(takeaway.every((food) => food.sourceType === "takeaway"));
  assert.ok(canteen.length >= 16);
  assert.ok(takeaway.length >= 16);
});

test("经前、经期、经后各自都有至少 16 道候选", () => {
  for (const phase of ["pre", "during", "post"]) {
    const eligible = filterFoods(FOODS, {
      periodEnabled: true,
      periodPhase: phase
    });
    assert.ok(eligible.length >= 16, `${phase} only has ${eligible.length}`);
    assert.ok(eligible.every((food) => food.periodPhases.includes(phase)));
  }
});

test("经期模式自动收紧辣度", () => {
  const eligible = filterFoods(FOODS, {
    periodEnabled: true,
    periodPhase: "during"
  });
  assert.ok(eligible.every((food) => food.spice <= 1));
});

test("默认微辣，切到正常吃辣后放开辣度", () => {
  const mild = filterFoods(FOODS, {});
  const spicy = filterFoods(FOODS, { spicePreference: "spicy" });
  assert.ok(mild.every((food) => food.spice <= 1));
  assert.ok(spicy.length > mild.length);
  assert.ok(spicy.some((food) => food.spice >= 2));
});

test("同一天同筛选得到稳定的 16 道菜", () => {
  const options = {
    foods: FOODS,
    dateKey: "2026-10-19",
    tab: "all",
    page: 0,
    dataRevision: 1
  };
  const first = buildWheel(options).map((food) => food.id);
  const second = buildWheel(options).map((food) => food.id);
  assert.deepEqual(first, second);
  assert.equal(first.length, 16);
});

test("换一天会换一批菜", () => {
  const base = {
    foods: FOODS,
    tab: "all",
    page: 0,
    dataRevision: 1
  };
  const today = buildWheel({ ...base, dateKey: "2026-10-19" })
    .map((food) => food.id);
  const tomorrow = buildWheel({ ...base, dateKey: addDays("2026-10-19", 1) })
    .map((food) => food.id);
  assert.notDeepEqual(today, tomorrow);
});

test("近期吃过的菜在候选充足时被压到后面", () => {
  const history = [{
    foodId: FOODS[0].id,
    date: "2026-10-19",
    at: "2026-10-19T04:00:00.000Z"
  }];
  const wheel = buildWheel({
    foods: FOODS,
    dateKey: "2026-10-19",
    tab: "all",
    page: 0,
    history,
    dataRevision: 1
  });
  assert.ok(!wheel.some((food) => food.id === FOODS[0].id));
});

test("忌口拆词和海鲜别名筛选有效", () => {
  assert.deepEqual(parseDislikeText("花生，香菜  芒果"), ["花生", "香菜", "芒果"]);
  const filtered = filterFoods(FOODS, { dislikes: ["海鲜"] });
  assert.ok(filtered.every((food) => !food.name.includes("虾")));
  assert.ok(filtered.every((food) => !food.name.includes("花甲")));
});

test("每日提醒可由日期稳定选出", () => {
  const options = {
    dateKey: "2026-10-19",
    periodEnabled: true,
    periodPhase: "during"
  };
  assert.equal(pickTip(TIPS, options).id, pickTip(TIPS, options).id);
});

test("损坏的导入数据会被拒绝", () => {
  assert.equal(parseImportedState("{bad json", FOODS, TIPS), null);
});

test("默认状态和导入状态具备版本与完整字段", () => {
  const state = createDefaultState(FOODS, TIPS);
  assert.equal(state.version, 1);
  assert.equal(state.foods.length, FOODS.length);
  const imported = parseImportedState(JSON.stringify(state), FOODS, TIPS);
  assert.equal(imported.foods.length, FOODS.length);
  assert.equal(imported.preferences.onboardingDone, false);
});
