// ── 경제/자원 시스템 (설계문서 10절) ─────────────────────────────────
// 그동안 "경제력"은 domainStrength.economy라는 추상적 숫자 하나뿐이었다.
// 이 모듈은 그 위에 식량/금속/마나자원이라는 세 가지 구체적 자원의
// 생산·소비·무역·위기(기근 등)를 얹어, economy 도메인 강도와 서로
// 영향을 주고받게 만든다.

const RESOURCE_TYPES = ['food', 'metal', 'mana'];
const RESOURCE_LABEL = { food: '식량', metal: '금속', mana: '마나자원' };

// 바이옴 1칸당 자원 산출량(추정치) — 지형 특성을 그대로 자원 생산에 반영
// (인구 부양력 공식(simulation.js의 capacity)과 대략 맞아떨어지도록 보정된 값)
const BIOME_YIELD = {
  plains: { food: 4.5, metal: 0, mana: 0 },
  forest: { food: 2.4, metal: 0.3, mana: 0.1 },
  desert: { food: 0.5, metal: 0.4, mana: 0.1 },
  mountain: { food: 0, metal: 1.8, mana: 0.2 },
  tundra: { food: 1.0, metal: 0.4, mana: 0.1 },
  swamp: { food: 1.8, metal: 0.1, mana: 0.5 },
  lake: { food: 1.2, metal: 0, mana: 0.3 },
  ocean: { food: 0, metal: 0, mana: 0 },
};

function initFactionResources(faction) {
  faction.resources = { food: 120, metal: 60, mana: 20 };
  faction.resourceProduction = { food: 0, metal: 0, mana: 0 }; // 표시/디버그용 최근 생산량
}

/** 영토 표본을 뽑아 자원 생산량을 추정한다 (성능을 위해 전량 순회 대신 샘플링) */
function estimateProduction(world, faction) {
  const keys = Array.from(faction.territory);
  if (keys.length === 0) return { food: 0, metal: 0, mana: 0 };
  const sampleKeys = keys.length > 60 ? sampleArray(keys, 60, world.simRng) : keys;

  const totals = { food: 0, metal: 0, mana: 0 };
  for (const key of sampleKeys) {
    const [x, y] = key.split(',').map(Number);
    const tile = world.terrain.tiles[y * world.terrain.width + x];
    if (!tile) continue;
    const yield_ = BIOME_YIELD[tile.biome] || { food: 0.5, metal: 0.1, mana: 0 };
    totals.food += yield_.food;
    totals.metal += yield_.metal;
    totals.mana += yield_.mana;
    if (tile.manaAnomaly) totals.mana += tile.manaAnomaly.type === 'amplify' ? 1.5 : -0.5;
  }

  const scale = keys.length / sampleKeys.length; // 표본 → 전체 영토로 환산
  return { food: totals.food * scale, metal: totals.metal * scale, mana: Math.max(0, totals.mana) * scale };
}

function sampleArray(arr, n, rng) {
  const copy = arr.slice();
  const out = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(rng() * copy.length);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
}

TextGen.register('economy.famine', [
  '{f}에 극심한 식량 부족이 닥쳐 백성들이 굶주렸다.',
  '창고가 텅 비며 {f} 전역에 기근이 들었다.',
  '{f}에 식량난이 심각해져 곳곳에서 아사자가 나왔다.',
]);
TextGen.register('economy.boom.food', ['{f}이(가) 풍족한 수확으로 크게 번영했다.']);
TextGen.register('economy.boom.metal', ['{f}의 광산에서 대규모 금속 광맥이 발견되었다.']);
TextGen.register('economy.boom.mana', ['{f}에 마나가 넘쳐흘러 이능 연구가 활기를 띠었다.']);

function famineEvent(rng, faction) {
  return TextGen.generate('economy.famine', rng, { f: faction.name });
}
function resourceBoomEvent(rng, faction, type) {
  return TextGen.generate('economy.boom.' + type, rng, { f: faction.name });
}

/** 매 틱 세력의 자원을 생산·소비하고, 부족/풍요 사건과 economy 도메인 강도에 반영한다 */
function tickEconomy(world, faction, rng) {
  if (!faction.resources) initFactionResources(faction);

  const production = estimateProduction(world, faction);
  faction.resourceProduction = production;

  const pop = faction.population;
  const consumption = {
    food: pop / 55,
    metal: (pop / 4000) * (1 + faction.stats.militarism) + faction.territory.size * 0.08, // 병기 소모 + 영토 유지비
    mana: faction.domainStrength.ability / 12,
  };

  for (const type of RESOURCE_TYPES) {
    faction.resources[type] = faction.resources[type] + production[type] - consumption[type];
  }

  // 식량 고갈: 기근 발생 — 실제 부족 상태가 인구 감소로 이어짐(장식적 흉작 이벤트와는 별개의 인과적 위기)
  // 이벤트는 "풍족 → 고갈"로 넘어가는 전환 시점에만 기록해 매 틱 스팸이 되지 않게 한다.
  const wasStarving = faction._starving || false;
  if (faction.resources.food < 0) {
    faction.resources.food = 0;
    faction.population = Math.max(5, faction.population * 0.985);
    if (!wasStarving) World.logChronicle(world, famineEvent(rng, faction), faction.id);
    faction._starving = true;
  } else {
    faction._starving = false;
  }

  // 금속/마나도 음수 방지(부족하면 그냥 0에서 멈춤 — 성장 저해로만 작용)
  faction.resources.metal = Math.max(0, faction.resources.metal);
  faction.resources.mana = Math.max(0, faction.resources.mana);

  // 자원 풍요 → economy 도메인 강도에 소폭 환류 (10절: 경제가 이능/기술과 상호 영향)
  const abundance = Math.min(faction.resources.food / 400, 1) + Math.min(faction.resources.metal / 300, 1);
  faction.domainStrength.economy = Math.min(100, faction.domainStrength.economy + abundance * 0.02);

  // 마나자원이 고갈되면 이능 강도 성장에 제동이 걸림(마나 없이는 이능이 정체됨)
  if (faction.resources.mana < 5) {
    faction.domainStrength.ability = Math.max(0, faction.domainStrength.ability - 0.05);
  }

  // 드물게 자원 풍요 이벤트
  if (RNG.chance(rng, 0.004)) {
    const type = RNG.weightedPick(rng, RESOURCE_TYPES.map((t) => ({ value: t, weight: faction.resources[t] > (t === 'food' ? 350 : t === 'metal' ? 250 : 80) ? 3 : 0.1 })));
    World.logChronicle(world, resourceBoomEvent(rng, faction, type), faction.id);
  }
}

TextGen.register('economy.trade', [
  '{a}이(가) {b}에 {res}을(를) 실어보내며 교역이 활발해졌다.',
  '{a}와(과) {b} 사이에 {res} 교역로가 새로 열렸다.',
  '{a}의 상단이 {b}에 {res}을(를) 정기적으로 공급하기 시작했다.',
]);

function tradeEvent(rng, factionA, factionB, resourceLabel) {
  return TextGen.generate('economy.trade', rng, { a: factionA.name, b: factionB.name, res: resourceLabel });
}

/** 우호적인 두 세력 사이에 자원 흑자 쪽에서 적자 쪽으로 소량 무역이 일어난다 */
function tryTrade(rng, world, factionA, factionB) {
  const avgAffinity = (Relations.getAffinity(world.relations, factionA.id, factionB.id) + Relations.getAffinity(world.relations, factionB.id, factionA.id)) / 2;
  if (avgAffinity < 15) return null;
  if (!RNG.chance(rng, 0.03)) return null;

  for (const type of RESOURCE_TYPES) {
    const threshold = type === 'food' ? 200 : type === 'metal' ? 150 : 50;
    const diff = factionA.resources[type] - factionB.resources[type];
    if (Math.abs(diff) < threshold) continue;
    const [surplus, deficit] = diff > 0 ? [factionA, factionB] : [factionB, factionA];
    const amount = Math.abs(diff) * 0.15;
    surplus.resources[type] -= amount;
    deficit.resources[type] += amount;
    surplus.domainStrength.economy = Math.min(100, surplus.domainStrength.economy + 0.3);
    deficit.domainStrength.economy = Math.min(100, deficit.domainStrength.economy + 0.3);
    return { text: tradeEvent(rng, surplus, deficit, RESOURCE_LABEL[type]), actorId: surplus.id };
  }
  return null;
}

window.Economy = {
  RESOURCE_TYPES,
  RESOURCE_LABEL,
  BIOME_YIELD,
  initFactionResources,
  estimateProduction,
  tickEconomy,
  tryTrade,
};
