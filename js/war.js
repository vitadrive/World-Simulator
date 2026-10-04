// ── 전쟁 시스템 (설계문서 7.3 전쟁/전투, 7.7 이벤트 명명) ─────────────
// 시각적 전투 묘사는 없음 — 대신 슬롯 조합으로 원인/경과/전환점/결과를
// 상세한 텍스트로 남긴다. 규모(중요도)에 비례해 사용 슬롯 수가 늘어난다
// (7.1b). 우호도가 '적대' 수준까지 떨어지면 낮은 확률로 선전포고가
// 발생한다.

// 7.1a 도메인 교차결합: 원인을 카테고리별로 묶어두고, 실제 종교/경제/정치
// 상태에 따라 그럴듯한 쪽이 더 잘 뽑히도록 가중치를 준다 (아래 pickWarCause).
const WAR_CAUSE_CATEGORIES = {
  religion: ['해묵은 종교 갈등', '이단으로 규정된 이능 계통에 대한 응징', '성지를 둘러싼 분쟁', '강요된 개종에 대한 반발'],
  economic: ['자원을 둘러싼 분쟁', '무역로를 둘러싼 마찰', '과중한 조공 요구에 대한 반발', '광산 채굴권을 둘러싼 다툼'],
  political: ['왕위 계승을 둘러싼 다툼', '섭정을 둘러싼 궁정 암투의 여파', '실권을 잃은 왕족의 복위 시도'],
  border: ['우발적인 국경 충돌', '국경 이주민을 둘러싼 갈등', '영토 경계선에 대한 해묵은 이견'],
  grudge: ['오래된 원한의 폭발', '지난 전쟁의 배상 문제로 인한 재충돌', '해묵은 복수심이 다시 불타올라'],
  alliance: ['동맹국 보호를 명분으로 한 개입', '동맹 조약 불이행에 대한 응징'],
};
TextGen.register('war.cause', Object.values(WAR_CAUSE_CATEGORIES).flat());

/** 7.1a: 두 세력의 실제 종교/경제/정치 상태를 반영해 전쟁 원인 카테고리에 가중치를 준다 */
function pickWarCause(rng, world, factionA, factionB) {
  const weights = { religion: 1, economic: 1, political: 1, border: 2.5, grudge: 1, alliance: 1 };

  // 종교: 서로 다른 종교를 믿고, 그 관계가 배타적일수록 종교 갈등이 그럴듯해짐
  if (factionA.paradigms.religion !== factionB.paradigms.religion) {
    weights.religion += 2;
    if (factionA.politicsReligionRelation !== '상호독립' || factionB.politicsReligionRelation !== '상호독립') weights.religion += 1.5;
  }

  // 경제: 자원 격차가 클수록 경제적 원인이 그럴듯해짐
  if (factionA.resources && factionB.resources) {
    const gap = Math.abs(factionA.resources.food - factionB.resources.food) + Math.abs(factionA.resources.metal - factionB.resources.metal);
    weights.economic += Math.min(4, gap / 150);
  }

  // 정치: 계급 유동성이 극단적으로 낮은(경직된) 세력은 왕위/궁정 다툼이 그럴듯해짐
  const rigidityA = 100 - factionA.classMobility;
  const rigidityB = 100 - factionB.classMobility;
  weights.political += Math.max(rigidityA, rigidityB) / 40;

  // 원한: 이미 이 둘 사이에 전쟁 이력이 있으면 "다시 불거진 원한"이 훨씬 그럴듯해짐
  const pairKey = [factionA.id, factionB.id].sort().join('|');
  if (world.warCountByPair && world.warCountByPair[pairKey]) weights.grudge += 5;

  // 동맹: 둘 중 하나가 이미 다른 전쟁에 얽혀 있다면 "동맹 개입" 명분이 그럴듯해짐
  const eitherAtWar = (world.wars || []).some(
    (w) => w.status === 'ongoing' && (w.sides.includes(factionA.id) || w.sides.includes(factionB.id))
  );
  if (eitherAtWar) weights.alliance += 2;

  const entries = Object.entries(weights).flatMap(([cat, w]) =>
    WAR_CAUSE_CATEGORIES[cat].map((phrase) => ({ value: phrase, weight: w }))
  );
  return TextGen.generateWeighted('war.cause', rng, entries);
}

// 경과(course) 슬롯은 한 전쟁 서술 안에서 중복 없이 여러 개를 뽑아야 하므로
// (7.1b), TextGenerator의 단일 pick이 아니라 sampleN으로 직접 다룬다.
const COURSE_PHRASES = [
  '기습적인 선제공격으로 시작되었다', '국경을 사이에 둔 장기 공성전으로 이어졌다',
  '대리 세력을 앞세운 간접전 양상을 띠었다', '내부 반란까지 겹치며 혼란이 가중되었다',
  '소규모 국지전이 산발적으로 이어졌다', '해상 봉쇄가 병행되며 물자난이 가중되었다',
  '용병 부대가 대거 투입되며 전선이 요동쳤다', '혹독한 겨울이 겹치며 양측 모두 고전했다',
  '외딴 요새들을 둘러싼 공방전이 거듭되었다', '기근이 겹치며 전선 유지가 어려워졌다',
];

TextGen.register('war.turning_point', [
  '한 영웅적 인물의 활약이 전세를 뒤집었다', '측근의 배신이 전황을 갈랐다',
  '역병이 돌아 병력 손실이 급격히 커졌다', '제3세력이 개입하며 판도가 바뀌었다',
  '결정적인 한 번의 전투가 승부를 갈랐다', '보급이 끊기며 전선이 무너지기 시작했다',
  '오랜 포위 끝에 성벽이 뚫렸다', '지휘관의 전사로 한쪽 사기가 급격히 꺾였다',
  '기습적인 야간 공격이 전황을 뒤집었다', '내부 밀정의 정보가 결정적인 승기를 만들었다',
]);

TextGen.register('war.outcome.annex', [
  '패배한 쪽의 영토 일부가 병합되었다', '국경이 승자 쪽으로 크게 밀려났다',
  '패배한 쪽의 핵심 거점까지 넘어갔다',
]);
TextGen.register('war.outcome.vassalize', [
  '패배한 쪽이 속국의 지위로 전락했다', '조공을 바치는 조건으로 전쟁이 마무리되었다',
  '패배한 쪽의 지도층이 승자에게 충성을 맹세했다',
]);
TextGen.register('war.outcome.stalemate', [
  '별다른 성과 없이 강화조약이 체결되었다', '양측 모두 지쳐 휴전이 선언되었다',
  '국경선만 재확인한 채 전쟁이 마무리되었다',
]);
TextGen.register('war.outcome.mutualDecline', [
  '양측 모두 크게 쇠약해진 채 전쟁이 흐지부지 끝났다',
  '승자 없이 양측 모두 국력만 크게 소진한 채 끝났다',
]);

TextGen.register('war.epithet', [
  '피의', '잊혀지지 않을', '백년에 걸친', '재앙 같은', '헛된',
  '끝나지 않을 것 같던', '형제를 등지게 한', '아무도 승리하지 못한', '전설로 남을',
]);

TextGen.register('war.name.plain', ['{a}-{b} 전쟁']);
TextGen.register('war.name.ordinal', ['제{ordinal}차 {a}-{b} 전쟁']);
TextGen.register('war.name.cause_based', ['{causeShort} 전쟁']);

function warName(rng, world, factionA, factionB, cause) {
  const key = [factionA.id, factionB.id].sort().join('|');
  world.warCountByPair = world.warCountByPair || {};
  const ordinal = (world.warCountByPair[key] || 0) + 1;
  world.warCountByPair[key] = ordinal;

  const nameKey = RNG.pick(rng, ['war.name.plain', 'war.name.ordinal', 'war.name.cause_based']);
  return TextGen.generate(nameKey, rng, {
    a: factionA.name,
    b: factionB.name,
    ordinal,
    causeShort: cause.length > 6 ? cause.slice(0, 6) : cause,
  });
}

/** 7.1b: 이벤트 중요도(양측 규모 합)에 비례해 슬롯 수를 늘린다 */
function warImportance(factionA, factionB) {
  const scale = (factionA.population + factionB.population) / 2000 + (factionA.territory.size + factionB.territory.size) / 40;
  return Math.max(1, Math.min(5, Math.round(scale)));
}

TextGen.register('war.declaration_assembly', ['{name}이(가) 발발했다. {cause}이(가) 원인이었다. 전쟁은 {course}.{repeatNote}']);
TextGen.register('war.repeat_conflict_note', [
  ' 두 세력 사이의 갈등이 다시 전면전으로 번진 것은 이번이 처음이 아니었다.',
  ' 오랜 대립의 역사를 가진 두 세력에게는 낯설지 않은 충돌이었다.',
]);

function declareWar(rng, world, factionA, factionB) {
  const pairKeyForHistory = [factionA.id, factionB.id].sort().join('|');
  const isRepeatConflict = !!(world.warCountByPair && world.warCountByPair[pairKeyForHistory]);
  const cause = pickWarCause(rng, world, factionA, factionB);
  const name = warName(rng, world, factionA, factionB, cause);
  const importance = warImportance(factionA, factionB);

  const war = {
    id: 'war-' + world.year + '-' + factionA.id + '-' + factionB.id,
    name,
    cause,
    sides: [factionA.id, factionB.id],
    startYear: world.year,
    endYear: null,
    status: 'ongoing',
    score: { [factionA.id]: 0, [factionB.id]: 0 },
    importance,
    courseLogged: false,
  };

  world.wars = world.wars || [];
  world.wars.push(war);
  Relations.setStance(world.relations, factionA.id, factionB.id, '전쟁');

  const courseSlots = RNG.randInt(rng, 1, importance);
  const courseBits = sampleN(COURSE_PHRASES, courseSlots, rng);

  const text = TextGen.generate('war.declaration_assembly', rng, {
    name,
    cause,
    course: courseBits.join(', '),
    repeatNote: isRepeatConflict ? TextGen.generate('war.repeat_conflict_note', rng) : '',
  });
  World.logChronicle(world, text, factionA.id);
  return war;
}

TextGen.register('war.battle_casualty', [
  '{f}의 {p}이(가) 전장에서 목숨을 잃었다.',
  '치열한 전투 중 {f}의 {p}이(가) 전사했다.',
]);
TextGen.register('war.battle_heroism', [
  '{f}의 {p}이(가) 눈부신 무공으로 전세를 이끌었다.',
  '{p}의 지휘 아래 {f}의 사기가 크게 올랐다.',
]);

function battleCasualtyEvent(rng, person, faction) {
  return TextGen.generate('war.battle_casualty', rng, { f: faction.name, p: person.name });
}
function battleHeroismEvent(rng, person, faction) {
  return TextGen.generate('war.battle_heroism', rng, { f: faction.name, p: person.name });
}

/** 세력의 전력을 종합 평가 (인구/경제/이능/지배층 성향을 반영) */
function militaryStrength(faction) {
  const s = faction.domainStrength;
  const metalBonus = faction.resources ? Math.min(20, faction.resources.metal / 15) : 0; // 10절: 금속 자원(무기/장비)이 전력에 기여
  return (
    Math.sqrt(faction.population) * 0.6 +
    s.economy * 0.4 +
    s.ability * 0.3 +
    faction.stats.militarism * 25 +
    metalBonus
  );
}

TextGen.register('war.dissolved_by_collapse', ['{name}이(가) 상대 세력의 소멸로 자연히 종결되었다.']);

function tickWar(world, war, rng) {
  const a = world.factions.find((f) => f.id === war.sides[0]);
  const b = world.factions.find((f) => f.id === war.sides[1]);
  if (!a || !b) { war.status = 'ended'; return; }

  // 전쟁 도중 한쪽이 재해 등 다른 이유로 이미 소멸했다면, 생존한 쪽의 승리로 즉시 종결
  if (!a.alive || !b.alive) {
    war.status = 'ended';
    war.endYear = world.year;
    const survivor = a.alive ? a : b.alive ? b : null;
    if (survivor) {
      World.logChronicle(world, TextGen.generate('war.dissolved_by_collapse', rng, { name: war.name }), survivor.id);
    }
    return;
  }

  const strA = militaryStrength(a) * RNG.randRange(rng, 0.85, 1.15);
  const strB = militaryStrength(b) * RNG.randRange(rng, 0.85, 1.15);
  war.score[a.id] += strA;
  war.score[b.id] += strB;

  // 전쟁으로 인한 소모(양측 인구 소폭 감소, 금속 자원 소모)
  a.population = Math.max(5, a.population - a.population * 0.01);
  b.population = Math.max(5, b.population - b.population * 0.01);
  if (a.resources) a.resources.metal = Math.max(0, a.resources.metal - 8);
  if (b.resources) b.resources.metal = Math.max(0, b.resources.metal - 8);

  // 낮은 확률로 전환점 이벤트
  if (RNG.chance(rng, 0.04)) {
    World.logChronicle(world, `${war.name}: ${TextGen.generate('war.turning_point', rng)}`, a.id);
  }

  // 관련 인물 중 무예 재능이 높은 이가 이따금 활약하거나 전사
  for (const faction of [a, b]) {
    const notables = world.persons.filter((p) => p.factionId === faction.id && p.alive && !p.isLeader);
    if (notables.length === 0) continue;
    const soldier = RNG.pick(rng, notables);
    if (RNG.chance(rng, 0.01)) {
      soldier.alive = false;
      soldier.deathYear = world.year;
      World.logChronicle(world, battleCasualtyEvent(rng, soldier, faction), faction.id);
    } else if (RNG.chance(rng, 0.008) && soldier.talent.combat > 0.6) {
      soldier.importance += 3;
      soldier.wealth += RNG.randRange(rng, 5, 15);
      // 8.3: 전장에서의 성공은 호전적 성향을 강화한다
      soldier.disposition.aggression = Math.max(-1, Math.min(1, soldier.disposition.aggression + 0.07));
      World.logChronicle(world, battleHeroismEvent(rng, soldier, faction), faction.id);
    }
  }

  const duration = world.year - war.startYear;
  const gap = Math.abs(war.score[a.id] - war.score[b.id]);
  const endProb = Math.min(0.35, 0.015 * duration * 0.1 + gap / 4000);
  if (RNG.chance(rng, endProb) && duration >= 1) {
    concludeWar(world, war, a, b, rng);
  }
}

TextGen.register('war.epithet_naming', ['후대 사람들은 이를 「{epithet} {duration}년 전쟁」이라 불렀다. ']);
TextGen.register('war.conclusion_assembly', ['{name}이(가) {duration}년 만에 끝났다. {outcome}{territoryNote}. {epithetLine}']);

function concludeWar(world, war, a, b, rng) {
  war.status = 'ended';
  war.endYear = world.year;
  const winner = war.score[a.id] > war.score[b.id] ? a : b;
  const loser = winner === a ? b : a;
  const scoreGapRatio = Math.max(war.score[a.id], war.score[b.id]) / Math.max(1, Math.min(war.score[a.id], war.score[b.id]));

  let outcomeType;
  if (scoreGapRatio > 2.2) outcomeType = 'annex';
  else if (scoreGapRatio > 1.5) outcomeType = 'vassalize';
  else if (RNG.chance(rng, 0.3)) outcomeType = 'mutualDecline';
  else outcomeType = 'stalemate';

  let territoryNote = '';
  if (outcomeType === 'annex' || outcomeType === 'vassalize') {
    const transferred = transferBorderTiles(world, loser, winner, outcomeType === 'annex' ? 0.25 : 0.1, rng);
    territoryNote = transferred > 0 ? ` (${transferred}개 지역이 넘어갔다)` : '';
    loser.population *= 0.85;
    World.checkFactionCollapse(world, loser, rng);
  } else {
    loser.population *= 0.93;
    winner.population *= 0.97;
  }

  Relations.setStance(world.relations, a.id, b.id, outcomeType === 'stalemate' ? '중립' : '긴장');
  Relations.adjustAffinity(world.relations, loser.id, winner.id, -20);
  Relations.adjustAffinity(world.relations, winner.id, loser.id, -8);

  const duration = war.endYear - war.startYear;
  let epithetLine = '';
  if (duration > 15 || RNG.chance(rng, 0.15)) {
    epithetLine = TextGen.generate('war.epithet_naming', rng, { epithet: TextGen.generate('war.epithet', rng), duration });
  }

  const outcomeText = TextGen.generate('war.outcome.' + outcomeType, rng);
  World.logChronicle(
    world,
    TextGen.generate('war.conclusion_assembly', rng, {
      name: war.name,
      duration,
      outcome: outcomeText,
      territoryNote,
      epithetLine,
    }).trim(),
    winner.id
  );
}

/** 승전국이 패전국의 접경 지역 일부를 병합 */
function transferBorderTiles(world, loser, winner, fraction, rng) {
  const loserTiles = Array.from(loser.territory);
  const borderTiles = loserTiles.filter((key) => {
    const [x, y] = key.split(',').map(Number);
    return Simulation.neighborsOf(world.terrain, x, y).some((t) => t.ownerFactionId === winner.id);
  });
  const pool = borderTiles.length > 0 ? borderTiles : loserTiles;
  const count = Math.max(1, Math.floor(pool.length * fraction));
  const chosen = sampleN(pool, count, rng);

  for (const key of chosen) {
    const [x, y] = key.split(',').map(Number);
    const tile = Simulation.tileAt(world.terrain, x, y);
    tile.ownerFactionId = winner.id;
    loser.territory.delete(key);
    winner.territory.add(key);
  }
  return chosen.length;
}

function sampleN(arr, n, rng) {
  const copy = arr.slice();
  const out = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(rng() * copy.length);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
}

/** 우호도가 낮고(적대 수준) 아직 전쟁 중이 아닐 때, 낮은 확률로 선전포고 */
function tryDeclareWar(rng, world, factionA, factionB) {
  const activeWar = (world.wars || []).find(
    (w) => w.status === 'ongoing' && w.sides.includes(factionA.id) && w.sides.includes(factionB.id)
  );
  if (activeWar) return null;

  const aTob = Relations.getAffinity(world.relations, factionA.id, factionB.id);
  const bToa = Relations.getAffinity(world.relations, factionB.id, factionA.id);
  const worstAffinity = Math.min(aTob, bToa);

  // 외교 노선(6절): 팽창주의/호전적 외교는 문턱을 낮추고, 고립·동맹 중시는 문턱을 높인다
  const biasA = Paradigms.getDiplomacyBias(world, factionA).warBias || 0;
  const biasB = Paradigms.getDiplomacyBias(world, factionB).warBias || 0;
  const threshold = -55 - ((biasA + biasB) / 2) * 30;
  if (worstAffinity > threshold) return null;

  const warProb = Math.max(0.005, Math.min(0.1, 0.03 + ((biasA + biasB) / 2) * 0.04));
  if (!RNG.chance(rng, warProb)) return null;
  return declareWar(rng, world, factionA, factionB);
}

window.War = {
  declareWar,
  tickWar,
  tryDeclareWar,
  militaryStrength,
  warImportance,
};
