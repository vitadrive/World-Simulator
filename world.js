// ── World / Faction 데이터 모델 (설계문서 5절의 v0.1 축소 구현) ──────
// 이번 패스에서는 "세력" 단위까지만 구현하고, 개별 인물(Person),
// Paradigm, 우호도 네트워크는 다음 패스에서 이 구조 위에 얹는다.

const FACTION_COLORS = [
  '#e0533d', '#3d7de0', '#e0c23d', '#5fbf5f', '#b25fe0',
  '#e0813d', '#3de0c2', '#e03d8f', '#8f8f3d', '#5f8fbf',
];

const CULTURES_BY_RACE = {
  human: 'human',
  elf: 'elf',
  dwarf: 'dwarf',
  orc: 'orc',
  serpentkin: 'serpentkin',
  monster: 'monster',
};

const RACES = ['human', 'elf', 'dwarf', 'orc', 'serpentkin'];
const RACE_WEIGHTS = { human: 5, elf: 5, dwarf: 5, orc: 5, serpentkin: 5, monster: 1.5 }; // 3.2: 몬스터도 드물게 세력화

function findLandTiles(terrain) {
  return terrain.tiles.filter((t) => Terrain.BIOMES[t.biome.toUpperCase()]?.passable);
}

/**
 * 시드로부터 새 세계를 생성한다.
 * @param {string} seedInput 사용자가 준 시드(빈 값이면 자동 생성)
 */
function generateWorld(seedInput) {
  const seedStr = seedInput && seedInput.trim() ? seedInput.trim() : `seed-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const ctx = RNG.createSeedContext(seedStr);

  const worldRng = ctx.stream('world');
  const width = RNG.randInt(worldRng, 55, 85);
  const height = RNG.randInt(worldRng, 38, 58);

  const terrainRng = ctx.stream('terrain');
  const terrain = Terrain.generateTerrain(terrainRng, width, height);

  applyManaAnomalies(ctx.stream('mana-anomaly'), terrain);

  const factionRng = ctx.stream('faction');
  const factionCount = RNG.randInt(factionRng, 4, 9);
  const factions = spawnFactions(factionRng, ctx, terrain, factionCount);

  const world = {
    seed: seedStr,
    seedCtx: ctx,
    width,
    height,
    terrain,
    factions,
    year: 0,
    chronicle: [], // {year, text}
    independents: [], // 8.2 무소속 독립 개체(로스트 테크놀로지 유물 등)
    persons: [], // 5, 8절: 지도자·주목할 만한 인물만 개별 추적
    subFactions: [], // 8.1: 세력 내 파벌·종파·군벌
    relations: Relations.createRelationNetwork(), // 7.5 우호도 네트워크
    influenceGraph: Paradigms.initInfluenceGraph(ctx.stream('influence-graph')), // 6.1
    simRng: ctx.stream('simulation'), // 틱 루프 전체에서 지속적으로 쓰이는 스트림
  };

  Paradigms.generateParadigmPool(ctx.stream('paradigm-pool'), ctx, world);
  const paradigmAssignRng = ctx.stream('paradigm-assign');
  for (const f of factions) {
    Paradigms.assignFactionParadigms(paradigmAssignRng, world, f);
  }

  Scripts.generateScriptPool(ctx.stream('script-pool'), ctx, world);
  const scriptAssignRng = ctx.stream('script-assign');
  for (const f of factions) {
    Scripts.assignFactionScript(scriptAssignRng, world, f);
  }

  for (const f of factions) {
    Persons.createFounder(ctx.stream('founder-' + f.id), world, f);
  }

  const monsterCount = RNG.randInt(worldRng, 2, 5);
  Independents.spawnThreatMonsters(worldRng, ctx, world, monsterCount);

  const sageCount = RNG.randInt(worldRng, 1, 3);
  Independents.spawnLegendaries(worldRng, ctx, world, sageCount);

  for (const f of factions) {
    f.revisions.push({ year: 0, territorySize: f.territory.size, population: Math.floor(f.population) });
  }

  logChronicle(world, `세계 「${seedStr}」가 생성되었다. (가로 ${width} × 세로 ${height} 타일)`);
  for (const f of factions) {
    logChronicle(world, Events.foundingEvent(ctx.stream('event-' + f.id), f), f.id);
  }

  return world;
}

/** 2.2 이능 편차 지역: 희박한 확률로 마나 친화/반발 지역을 지정하고 원인을 부여 */
function applyManaAnomalies(rng, terrain) {
  const causes = [
    '아득한 옛날 있었던 마법 재앙의 잔재가 남아있다',
    '유독 짙은 지맥이 이 아래 흐르고 있다',
    '오래전 있었던 소환 사고로 차원의 흔적이 남았다',
    '희귀한 마나 광물이 지하에 밀집해 있다',
  ];
  const anomalyChance = 0.0025; // 매우 희박
  for (const tile of terrain.tiles) {
    if (tile.biome === 'ocean' || tile.biome === 'lake') continue;
    if (RNG.chance(rng, anomalyChance)) {
      const boost = RNG.chance(rng, 0.5);
      tile.manaAnomaly = {
        type: boost ? 'amplify' : 'dampen',
        cause: RNG.pick(rng, causes),
      };
    }
  }
}

function spawnFactions(rng, ctx, terrain, count) {
  const land = findLandTiles(terrain);
  const used = new Set();
  const factions = [];

  for (let i = 0; i < count && land.length > 0; i++) {
    let tile;
    let attempts = 0;
    do {
      tile = RNG.pick(rng, land);
      attempts++;
    } while (used.has(`${tile.x},${tile.y}`) && attempts < 200);
    used.add(`${tile.x},${tile.y}`);

    const race = RNG.weightedPick(rng, RACES.concat('monster').map((r) => ({ value: r, weight: RACE_WEIGHTS[r] })));
    const culture = CULTURES_BY_RACE[race];
    const nameRng = ctx.stream('name-faction-' + i);
    const name = Names.generateFactionName(nameRng, culture);

    const emblemRng = ctx.stream('emblem-' + i);
    const faction = {
      id: 'faction-' + i,
      name,
      race,
      culture,
      color: FACTION_COLORS[i % FACTION_COLORS.length],
      emblem: Emblems.generateEmblem(emblemRng),
      capital: { x: tile.x, y: tile.y },
      originBiome: tile.biome,
      territory: new Set([`${tile.x},${tile.y}`]),
      population: RNG.randInt(rng, 40, 150),
      // 7.6 범용 지표 기반 확률 시스템의 세력 단위 지표 — 다음 패스에서 세분화
      stats: {
        capital_wealth: RNG.randRange(rng, 10, 30),
        militarism: RNG.randRange(rng, 0.2, 0.8), // 지배층 성향의 축소판
      },
      // 8.4 계급 유동성 지표 — 다음 패스에서 정치/경제 Paradigm과 연결
      classMobility: RNG.randRange(rng, 20, 80),
      mobilityMomentum: 0, // 8.5: 개인 계급 변동 누적이 세력 전체 유동성에 주는 피드백
      knownFactionIds: new Set(),
      revisions: [], // 11.1 위키 리비전 히스토리 — 주기적 영토/인구 스냅샷
      foundedYear: 0,
      collapsedYear: null,
      alive: true,
    };
    tile.ownerFactionId = faction.id;
    Economy.initFactionResources(faction);
    factions.push(faction);
  }

  return factions;
}

function logChronicle(world, text, factionId) {
  world.chronicle.push({ year: world.year, text, factionId: factionId || null });
}

/**
 * 8.1: 하위세력의 독립(반란 성공) 시 부모 세력에서 영토·인구·자원 일부를 떼어
 * 새로운 정식 세력을 만든다. spawnFactions와 구조를 동일하게 맞춘다.
 */
function spinOffFaction(world, parent, opts) {
  const id = 'faction-split-' + world.factions.length;
  const nameRng = world.seedCtx.stream('spinoff-name-' + id);
  const race = opts.race || parent.race;
  const culture = CULTURES_BY_RACE[race] || parent.culture;
  const name = opts.name || Names.generateFactionName(nameRng, culture);
  const emblemRng = world.seedCtx.stream('spinoff-emblem-' + id);

  const faction = {
    id,
    name,
    race,
    culture,
    color: FACTION_COLORS[world.factions.length % FACTION_COLORS.length],
    emblem: Emblems.generateEmblem(emblemRng),
    capital: opts.capital || parent.capital,
    originBiome: parent.originBiome,
    territory: new Set(opts.territoryKeys),
    population: Math.max(20, opts.population),
    stats: { capital_wealth: parent.stats.capital_wealth * 0.5, militarism: RNG.randRange(nameRng, 0.3, 0.9) },
    classMobility: parent.classMobility,
    classMobilityTarget: parent.classMobilityTarget,
    mobilityMomentum: 0,
    knownFactionIds: new Set([parent.id]),
    revisions: [{ year: world.year, territorySize: opts.territoryKeys.length, population: Math.floor(opts.population) }],
    foundedYear: world.year,
    collapsedYear: null,
    alive: true,
    politicsReligionRelation: parent.politicsReligionRelation,
    scriptId: parent.scriptId,
    paradigms: Object.assign({}, parent.paradigms),
    domainStrength: Object.assign({}, parent.domainStrength),
  };

  for (const key of opts.territoryKeys) {
    const [x, y] = key.split(',').map(Number);
    const tile = world.terrain.tiles[y * world.terrain.width + x];
    if (tile) tile.ownerFactionId = id;
    parent.territory.delete(key);
  }

  Economy.initFactionResources(faction);
  if (parent.resources) {
    for (const type of Economy.RESOURCE_TYPES) {
      faction.resources[type] = parent.resources[type] * 0.2;
      parent.resources[type] *= 0.8;
    }
  }

  if (opts.subFactionDomain && opts.subFactionParadigmId) {
    faction.paradigms[opts.subFactionDomain] = opts.subFactionParadigmId;
    const p = Paradigms.findParadigm(world, opts.subFactionParadigmId);
    if (p) p.adherents.add(id);
  }

  if (opts.leaderPerson) {
    opts.leaderPerson.isLeader = true;
    opts.leaderPerson.factionId = id;
    opts.leaderPerson.currentClass = 3;
    faction.leaderId = opts.leaderPerson.id;
  }

  world.factions.push(faction);
  parent.knownFactionIds.add(id);

  const relRng = world.seedCtx.stream('spinoff-relation-' + id);
  Relations.initFirstContact(relRng, world.relations, parent.id, id);
  // 반란으로 갈라선 사이이므로 초기 우호도를 강제로 낮게 덮어쓴다
  Relations.setAffinity(world.relations, parent.id, id, -60);
  Relations.setAffinity(world.relations, id, parent.id, -40);

  return faction;
}

TextGen.register('faction.collapse', [
  '{f}이(가) 마지막 남은 땅마저 잃고 역사 속으로 사라졌다.',
  '더 이상 영토를 지켜내지 못한 {f}이(가) 멸망했다.',
  '{f}의 백성들은 뿔뿔이 흩어지고, 나라의 이름만이 기록으로 남았다.',
]);

/** 영토를 완전히 잃은 세력을 소멸 처리한다 (전쟁 병합, 재해 등으로 마지막 땅을 잃었을 때 호출) */
function checkFactionCollapse(world, faction, rng) {
  if (!faction.alive || faction.territory.size > 0) return false;
  faction.alive = false;
  faction.collapsedYear = world.year;
  const text = TextGen.generate('faction.collapse', rng || world.simRng, { f: faction.name });
  logChronicle(world, text, faction.id);
  return true;
}

window.World = { generateWorld, logChronicle, checkFactionCollapse, spinOffFaction, FACTION_COLORS, RACES };
