// ── 천재지변 · 영구적 지형 변형 (설계문서 2.3, 7.4) ──────────────────
// 화산활동으로 숲이 타버렸다가 시간이 지나 비옥한 평야로 되살아나거나,
// 홍수로 저지대가 그대로 호수가 되어 남는 식의 "돌이킬 수 없는 변화"와
// "시간이 지나 회복되는 변화"를 모두 다룬다.

function clusterAround(terrain, startX, startY, radius, predicate) {
  const visited = new Set();
  const out = [];
  const queue = [{ x: startX, y: startY, d: 0 }];
  while (queue.length > 0) {
    const { x, y, d } = queue.shift();
    const key = `${x},${y}`;
    if (visited.has(key) || d > radius) continue;
    visited.add(key);
    const tile = Simulation.tileAt(terrain, x, y);
    if (!tile || !predicate(tile)) continue;
    out.push(tile);
    for (const n of Simulation.neighborsOf(terrain, x, y)) {
      queue.push({ x: n.x, y: n.y, d: d + 1 });
    }
  }
  return out;
}

TextGen.register('disaster.location', ['영지 인근', '변경 지대', '수도 부근', '오래된 정착지 근처', '주요 교역로 인근']);
TextGen.register('disaster.volcanic', [
  '{f}의 {loc}에서 화산이 폭발해 숲과 들이 불타올랐다.',
  '{f}의 {loc}에 갑작스레 용암이 흘러나와 큰 피해를 남겼다.',
]);
TextGen.register('disaster.flood', [
  '{f}의 {loc}에 큰 홍수가 나 저지대가 물에 잠겼다.',
  '{f}의 {loc}에 폭우가 이어지며 강이 범람했다.',
]);
TextGen.register('disaster.drought', [
  '{f}의 영토에 극심한 가뭄이 들어 땅이 메말라갔다.',
  '{f}에 몇 달째 비가 내리지 않아 우물이 말라갔다.',
]);
TextGen.register('disaster.earthquake', [
  '{f}의 영토에 큰 지진이 일어나 산기슭이 무너져 내렸다.',
  '{f}의 땅이 크게 흔들리며 여러 마을이 무너졌다.',
]);
TextGen.register('disaster.regrowth', [
  '한때 잿더미였던 {f}의 땅이 되살아나 비옥한 평야로 넓어졌다.',
  '{f}의 불탔던 땅에 다시 초목이 우거지기 시작했다.',
]);
TextGen.register('disaster.regrowth_unowned', ['한때 잿더미였던 땅이 되살아나 비옥한 평야로 넓어졌다.']);

function volcanicEvent(rng, faction) {
  return TextGen.generate('disaster.volcanic', rng, { f: faction.name, loc: TextGen.generate('disaster.location', rng) });
}
function floodEvent(rng, faction) {
  return TextGen.generate('disaster.flood', rng, { f: faction.name, loc: TextGen.generate('disaster.location', rng) });
}
function droughtEvent(rng, faction) {
  return TextGen.generate('disaster.drought', rng, { f: faction.name });
}
function earthquakeEvent(rng, faction) {
  return TextGen.generate('disaster.earthquake', rng, { f: faction.name });
}
function regrowthEvent(rng, faction) {
  if (faction) return TextGen.generate('disaster.regrowth', rng, { f: faction.name });
  return TextGen.generate('disaster.regrowth_unowned', rng);
}

/** 매 틱, 낮은 확률로 세력 영토 근방에 재해가 발생한다 */
function tryDisaster(rng, world) {
  if (!RNG.chance(rng, 0.01)) return;

  const alive = world.factions.filter((f) => f.alive && f.territory.size > 0);
  if (alive.length === 0) return;
  const faction = RNG.pick(rng, alive);
  const anchorKey = RNG.pick(rng, Array.from(faction.territory));
  const [ax, ay] = anchorKey.split(',').map(Number);
  const anchorTile = Simulation.tileAt(world.terrain, ax, ay);
  if (!anchorTile) return;

  const type = RNG.weightedPick(rng, [
    { value: 'volcanic', weight: anchorTile.biome === 'mountain' || anchorTile.biome === 'forest' ? 3 : 1 },
    { value: 'flood', weight: anchorTile.biome === 'plains' || anchorTile.biome === 'swamp' ? 3 : 1 },
    { value: 'drought', weight: anchorTile.biome === 'plains' || anchorTile.biome === 'desert' ? 2 : 1 },
    { value: 'earthquake', weight: anchorTile.biome === 'mountain' ? 2 : 0.5 },
  ]);

  const radius = RNG.randInt(rng, 1, 3);

  if (type === 'volcanic') {
    const cluster = clusterAround(world.terrain, ax, ay, radius, (t) => t.biome === 'forest' || t.biome === 'plains' || t.biome === 'mountain');
    for (const t of cluster) t.deformation = { type: 'scorched', sinceYear: world.year };
    faction.population *= 0.85;
    World.logChronicle(world, volcanicEvent(rng, faction), faction.id);
    world.pendingRecoveries = world.pendingRecoveries || [];
    world.pendingRecoveries.push({
      tileKeys: cluster.map((t) => `${t.x},${t.y}`),
      recoverYear: world.year + RNG.randInt(rng, 25, 55),
      toBiome: 'plains',
      factionId: faction.id,
    });
  } else if (type === 'flood') {
    const cluster = clusterAround(world.terrain, ax, ay, radius, (t) => t.biome === 'plains' || t.biome === 'swamp');
    for (const t of cluster) {
      t.biome = 'lake'; // 2.3: 영구적 지형 변형 — 회복되지 않고 그대로 호수로 정착
      t.deformation = { type: 'flooded', permanent: true, sinceYear: world.year };
      if (t.ownerFactionId === faction.id) {
        faction.territory.delete(`${t.x},${t.y}`);
        t.ownerFactionId = null;
      }
    }
    faction.population *= 0.9;
    World.logChronicle(world, floodEvent(rng, faction), faction.id);
    World.checkFactionCollapse(world, faction, rng);
  } else if (type === 'drought') {
    const cluster = clusterAround(world.terrain, ax, ay, radius, (t) => t.biome === 'plains' || t.biome === 'forest');
    const permanent = RNG.chance(rng, 0.3);
    for (const t of cluster) {
      if (permanent) {
        t.biome = 'desert'; // 반복된 가뭄 끝에 영구적으로 사막화되는 경우
        t.deformation = { type: 'desertified', permanent: true, sinceYear: world.year };
      } else {
        t.deformation = { type: 'parched', sinceYear: world.year };
      }
    }
    faction.population *= 0.88;
    World.logChronicle(world, droughtEvent(rng, faction), faction.id);
  } else if (type === 'earthquake') {
    const cluster = clusterAround(world.terrain, ax, ay, radius, (t) => t.biome === 'mountain');
    for (const t of cluster) t.deformation = { type: 'collapsed', sinceYear: world.year };
    faction.population *= 0.93;
    World.logChronicle(world, earthquakeEvent(rng, faction), faction.id);
  }
}

/** 화산 피해 지역 등, 시간이 지나 회복되는 변형을 처리한다 */
function processRecoveries(world) {
  if (!world.pendingRecoveries || world.pendingRecoveries.length === 0) return;
  const due = world.pendingRecoveries.filter((r) => r.recoverYear <= world.year);
  if (due.length === 0) return;

  world.pendingRecoveries = world.pendingRecoveries.filter((r) => r.recoverYear > world.year);

  for (const rec of due) {
    for (const key of rec.tileKeys) {
      const [x, y] = key.split(',').map(Number);
      const tile = Simulation.tileAt(world.terrain, x, y);
      if (!tile) continue;
      tile.biome = rec.toBiome;
      tile.deformation = { type: 'regrown_fertile', sinceYear: world.year };
    }
    const faction = world.factions.find((f) => f.id === rec.factionId);
    World.logChronicle(world, regrowthEvent(world.simRng, faction), rec.factionId);
  }
}

window.Disasters = { tryDisaster, processRecoveries, clusterAround };
