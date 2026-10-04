// ── 시뮬레이션 틱 루프 (v0.1) ────────────────────────────────────
// 1틱 = 1년. 이번 패스는 "세력의 성장/쇠퇴/확장/접촉"이라는 가장 굵은
// 뼈대만 다룬다. 인물(Person), 우호도(Affinity), Paradigm, 전쟁 등은
// 이 뼈대 위에 다음 패스에서 얹을 예정.

const BIOME_GROWTH_MODIFIER = {
  plains: 1.3,
  forest: 1.1,
  swamp: 0.8,
  desert: 0.6,
  mountain: 0.7,
  tundra: 0.5,
  ocean: 0,
  lake: 0,
};

function tileAt(terrain, x, y) {
  if (x < 0 || y < 0 || x >= terrain.width || y >= terrain.height) return null;
  return terrain.tiles[y * terrain.width + x];
}

function neighborsOf(terrain, x, y) {
  return [
    tileAt(terrain, x + 1, y),
    tileAt(terrain, x - 1, y),
    tileAt(terrain, x, y + 1),
    tileAt(terrain, x, y - 1),
  ].filter(Boolean);
}

function averageBiomeModifier(world, faction) {
  let sum = 0;
  let n = 0;
  // 성능을 위해 영토가 크면 표본만 추출
  const keys = Array.from(faction.territory);
  const sampleKeys = keys.length > 60 ? sampleArray(keys, 60, world.simRng) : keys;
  for (const key of sampleKeys) {
    const [x, y] = key.split(',').map(Number);
    const tile = tileAt(world.terrain, x, y);
    if (!tile) continue;
    sum += BIOME_GROWTH_MODIFIER[tile.biome] ?? 0.8;
    n++;
  }
  return n > 0 ? sum / n : 0.8;
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

function tick(world) {
  world.year += 1;
  const rng = world.simRng;

  Paradigms.driftInfluenceGraph(world, rng);

  for (const faction of world.factions) {
    if (!faction.alive) continue;
    simulateFactionGrowth(world, faction, rng);
    simulateExpansion(world, faction, rng);
    simulatePersons(world, faction, rng);
    Paradigms.tickFactionParadigms(world, faction, rng);
    simulateConversions(world, faction, rng);
    Economy.tickEconomy(world, faction, rng);
  }

  simulateDiplomacy(world, rng);
  simulateWars(world, rng);
  SubFactions.tickSubFactions(world, world.seedCtx, rng);
  Disasters.tryDisaster(rng, world);
  Disasters.processRecoveries(world);
  Independents.tickThreats(world, rng);
  Independents.tickLegendaries(world, rng);
  recordRevisions(world);
}

/** 11.1: 20년마다 세력별 영토·인구 스냅샷을 리비전으로 남긴다 */
function recordRevisions(world) {
  if (world.year % 20 !== 0) return;
  for (const faction of world.factions) {
    if (!faction.alive) continue;
    faction.revisions.push({
      year: world.year,
      territorySize: faction.territory.size,
      population: Math.floor(faction.population),
    });
  }
}

/** 진행 중인 전쟁을 매 틱 처리한다 */
function simulateWars(world, rng) {
  if (!world.wars) return;
  for (const war of world.wars) {
    if (war.status !== 'ongoing') continue;
    War.tickWar(world, war, rng);
  }
}

/** 6절: 정치/종교/경제/이능 각 도메인에서 이따금 전향(개종/노선 변경)이 일어난다 */
function simulateConversions(world, faction, rng) {
  for (const domain of Paradigms.DOMAINS) {
    if (domain === 'ability' && !faction.paradigms.ability) continue; // 이능 미보유 세력은 전향 대상 없음
    const result = Paradigms.tryConversion(rng, world, faction, domain);
    if (!result) continue;

    World.logChronicle(world, Paradigms.conversionEvent(rng, faction, result.current || { name: '무주공산 상태' }, result.target), faction.id);

    if (result.extinctResult) {
      World.logChronicle(world, Paradigms.extinctionEvent(rng, result.extinctResult), null);
      if (domain === 'ability') {
        World.logChronicle(world, Paradigms.lostTechEvent(rng, result.extinctResult), null);
        world.independents.push({
          id: 'artifact-' + world.independents.length,
          type: 'artifact',
          name: `${result.extinctResult.name}의 유물`,
          originParadigmId: result.extinctResult.id,
          lostYear: world.year,
          description: `한때 ${result.extinctResult.name}을(를) 따르던 이들이 남긴 유산으로, 그 원리는 이제 전해지지 않는다.`,
        });
      }
    }
  }
}

/** 7.5: 서로 아는 세력 쌍마다 낮은 확률로 사소한 외교 사건을 굴린다 */
function simulateDiplomacy(world, rng) {
  const net = world.relations;
  const processed = new Set();

  for (const faction of world.factions) {
    if (!faction.alive) continue;
    for (const otherId of faction.knownFactionIds) {
      const pairKey = [faction.id, otherId].sort().join('|');
      if (processed.has(pairKey)) continue;
      processed.add(pairKey);

      const other = world.factions.find((f) => f.id === otherId);
      if (!other || !other.alive) continue;

      // 7.5: 공식 관계(표면)를 갱신 — 공동의 적이 사라지며 억눌린 반목이 터질 수 있음
      const facadeResult = Relations.updateStanceWithFacade(world, faction.id, other.id, rng);
      if (facadeResult === 'betrayal') {
        World.logChronicle(world, Events.facadeBetrayalEvent(rng, faction, other), faction.id);
      }

      // 우호도가 적대 수준까지 떨어졌다면 낮은 확률로 선전포고
      War.tryDeclareWar(rng, world, faction, other);

      // 우호적인 관계라면 낮은 확률로 정략혼
      const aTob0 = Relations.getAffinity(net, faction.id, other.id);
      const bToa0 = Relations.getAffinity(net, other.id, faction.id);
      if (Math.min(aTob0, bToa0) > 25) {
        const royal = Persons.tryRoyalMarriage(rng, world, faction, other);
        if (royal) {
          const allianceBiasA = Paradigms.getDiplomacyBias(world, faction).allianceBias || 0;
          const allianceBiasB = Paradigms.getDiplomacyBias(world, other).allianceBias || 0;
          const bonus = 15 + ((allianceBiasA + allianceBiasB) / 2) * 15;
          Relations.adjustAffinity(net, faction.id, other.id, bonus);
          Relations.adjustAffinity(net, other.id, faction.id, bonus);
          World.logChronicle(world, Persons.royalMarriageEvent(rng, royal.a, faction, royal.b, other), faction.id);
        }
      }

      // 10절: 자원 흑자/적자에 따른 무역
      const trade = Economy.tryTrade(rng, world, faction, other);
      if (trade) {
        World.logChronicle(world, trade.text, trade.actorId);
      }

      // 우호도 무시하고 발생하는 이상 사건 (7.2 연동)
      if (Relations.rollAnomalousBetrayal(rng)) {
        const [a, b] = RNG.chance(rng, 0.5) ? [faction, other] : [other, faction];
        Relations.adjustAffinity(net, b.id, a.id, RNG.randRange(rng, -50, -25));
        World.logChronicle(world, Events.anomalousBetrayalEvent(rng, a, b), a.id);
        continue;
      }

      if (!RNG.chance(rng, 0.02)) continue; // 평상시엔 대개 아무 일도 없음

      const actor = RNG.chance(rng, 0.5) ? faction : other;
      const target = actor === faction ? other : faction;
      const outcome = Relations.resolveMinorIncident(rng, net, actor.id, target.id, actor.stats.militarism * 2 - 1);
      World.logChronicle(world, Events.minorIncidentEvent(rng, actor, target, outcome), actor.id);
    }
  }
}

const MAX_NOTABLES_PER_FACTION = 40;

function simulatePersons(world, faction, rng) {
  const factionPersons = world.persons.filter((p) => p.factionId === faction.id && p.alive);

  for (const person of factionPersons) {
    // 사망 판정
    if (RNG.chance(rng, Persons.mortalityChance(person, world.year))) {
      person.alive = false;
      person.deathYear = world.year;
      World.logChronicle(world, Persons.personDeathEvent(rng, person, faction), faction.id);

      if (person.isLeader) {
        const heir = Persons.findHeir(world, person);
        if (heir) {
          Persons.promoteToHeir(heir, faction);
          World.logChronicle(world, Persons.heirSuccessionEvent(rng, heir, faction), faction.id);
        } else {
          const newLeader = Persons.createFounder(rng, world, faction);
          World.logChronicle(world, Persons.successionEvent(rng, newLeader, faction), faction.id);
        }
      }
      continue;
    }

    // 계급 변동 판정 (지도자는 tryClassMobility 내부에서 자동 제외됨)
    const result = Persons.tryClassMobility(rng, person, faction);
    if (result === 'up') {
      World.logChronicle(world, Persons.personRiseEvent(rng, person), faction.id);
      faction.mobilityMomentum += 1; // 8.5: 상승 사례가 쌓이면 유동성 지표를 서서히 밀어올림
    } else if (typeof result === 'number') {
      World.logChronicle(world, Persons.personFallEvent(rng, person, result), faction.id);
      faction.mobilityMomentum -= 1;
    }
  }

  // 새 주목할 만한 인물 등장 (인구 규모에 비례, 상한 있음)
  const aliveCount = factionPersons.length;
  if (aliveCount < MAX_NOTABLES_PER_FACTION) {
    const spawnProb = Math.min(0.12, faction.population / 30000);
    if (RNG.chance(rng, spawnProb)) {
      const person = Persons.createPerson(rng, world, faction);
      world.persons.push(person);
    }
  }

  // 가족관계: 혼인 및 출산
  const marriage = Persons.tryFactionMarriage(rng, world, faction);
  if (marriage) {
    World.logChronicle(world, Persons.marriageEvent(rng, marriage.a, marriage.b, faction), faction.id);
  }
  for (const person of factionPersons) {
    const birth = Persons.tryChildbirth(rng, world, person);
    if (birth) {
      World.logChronicle(world, Persons.birthEvent(rng, birth.person, birth.spouse, birth.child, birth.faction), faction.id);
    }
  }
}

function simulateFactionGrowth(world, faction, rng) {
  const modifier = averageBiomeModifier(world, faction);
  const capacity = faction.territory.size * 220 * modifier;
  const logisticBrake = Math.max(0, 1 - faction.population / Math.max(capacity, 1));
  const foodSecurity = faction._starving ? 0.3 : 1; // 10절: 식량 자원이 고갈된 상태면 인구 성장이 크게 둔화
  const growthRate = 0.045 * modifier * logisticBrake * foodSecurity;

  faction.population = Math.max(5, faction.population * (1 + growthRate));

  // 흉작/역병 등 쇠퇴 이벤트 (7.4 전염병·천재지변의 v0.1 축소판)
  if (RNG.chance(rng, 0.02)) {
    faction.population *= RNG.randRange(rng, 0.75, 0.92);
    World.logChronicle(world, Events.declineEvent(rng, faction), faction.id);
  }

  // 인구 마일스톤 기록
  const milestoneStep = 500;
  faction._lastMilestone = faction._lastMilestone || 0;
  if (Math.floor(faction.population / milestoneStep) > faction._lastMilestone) {
    faction._lastMilestone = Math.floor(faction.population / milestoneStep);
    World.logChronicle(world, Events.populationMilestoneEvent(rng, faction), faction.id);
  }
}

function simulateExpansion(world, faction, rng) {
  const pressure = faction.population / Math.max(faction.territory.size * 130, 1);
  const expansionProb = Math.min(0.5, 0.03 + pressure * 0.12);
  if (!RNG.chance(rng, expansionProb)) return;

  // 영토가 커질수록 무작위로 고른 타일이 내부 타일일 확률이 높아지므로,
  // 실제로 비어있는 이웃을 가진 "경계" 타일을 찾을 때까지 여러 후보를 시도한다.
  const frontier = Array.from(faction.territory);
  const attemptsMax = Math.min(20, frontier.length);
  const candidates = sampleArray(frontier, attemptsMax, rng);

  for (const tryTile of candidates) {
    const [x, y] = tryTile.split(',').map(Number);
    const neighbors = neighborsOf(world.terrain, x, y).filter(
      (t) => Terrain.BIOMES[t.biome.toUpperCase()]?.passable
    );
    const openNeighbors = neighbors.filter((t) => t.ownerFactionId !== faction.id);
    if (openNeighbors.length === 0) continue;

    const target = RNG.pick(rng, openNeighbors);
    const key = `${target.x},${target.y}`;

    if (target.ownerFactionId === null) {
      target.ownerFactionId = faction.id;
      faction.territory.add(key);
      if (RNG.chance(rng, 0.15)) {
        World.logChronicle(world, Events.expansionEvent(rng, faction), faction.id);
      }
    } else {
      const other = world.factions.find((f) => f.id === target.ownerFactionId);
      if (other && !faction.knownFactionIds.has(other.id)) {
        faction.knownFactionIds.add(other.id);
        other.knownFactionIds.add(faction.id);
        Relations.initFirstContact(rng, world.relations, faction.id, other.id);
        World.logChronicle(world, Events.contactEvent(rng, faction, other), faction.id);
      }
    }
    return; // 이번 틱엔 한 번만 시도
  }
  // attemptsMax번 다 시도해도 열린 이웃이 없으면 이번 틱은 확장 없이 넘어감
}

window.Simulation = { tick, neighborsOf, tileAt };
