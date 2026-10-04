// ── Paradigm 시스템 (설계문서 6, 6.1, 6.2, 6.3) ─────────────────────
// 정치/종교/경제/이능 네 도메인에 공통 Paradigm 구조를 적용한다.
// 이번 패스 범위: 초기 사상 풀 생성 → 세력별 배정 → 도메인 강도 수치가
// 영향 그래프를 따라 서로 영향을 주고받으며 표류 → 세력이 이따금
// 더 우세한 경쟁 사상으로 갈아타는 "개종/전향" → 마지막 신봉자를 잃은
// Paradigm은 소멸(6.2 로스트 테크놀로지로 연결).
// 외교 노선(Paradigm)과 영향 그래프의 사건 기반 급변(6.3의 '다' 방식)은
// 다음 패스로 남겨둔다 — 지금은 표류(6.3의 '나' 방식)만 구현.

const DOMAINS = ['politics', 'religion', 'economy', 'ability', 'diplomacy'];
const DOMAIN_LABEL = { politics: '정치', religion: '종교', economy: '경제', ability: '이능', diplomacy: '외교' };

const ARCHETYPES = {
  politics: [
    { name: '봉건 왕정', mobilityBias: -0.6, theocratic: false },
    { name: '상업 공화정', mobilityBias: 0.4, theocratic: false },
    { name: '부족 연맹', mobilityBias: 0.1, theocratic: false },
    { name: '신정 체제', mobilityBias: -0.3, theocratic: true },
    { name: '군벌 지배', mobilityBias: -0.2, theocratic: false },
  ],
  religion: [
    { name: '다신 신앙', zealBias: 0.3 },
    { name: '단일신교', zealBias: 0.6 },
    { name: '조상 숭배', zealBias: 0.2 },
    { name: '금욕 고행 교단', zealBias: 0.5 },
    { name: '자연 정령 신앙', zealBias: 0.25 },
  ],
  economy: [
    { name: '농경 공동체', tradeBias: 0.1 },
    { name: '상업 중심 경제', tradeBias: 0.7 },
    { name: '광업 위주 경제', tradeBias: 0.3 },
    { name: '약탈 경제', tradeBias: 0.2, plunderBias: 0.6 },
    { name: '장인 길드 경제', tradeBias: 0.45 },
  ],
  ability: [
    { name: '원소 마법', kind: 'magic' },
    { name: '오러(신체 강화술)', kind: 'aura' },
    { name: '무공(내공술)', kind: 'martial-ki' },
    { name: '초능력(정신계)', kind: 'psychic' },
    { name: '주술(정령 교감)', kind: 'shamanic' },
  ],
  diplomacy: [
    { name: '고립주의', warBias: -0.5, allianceBias: -0.2 },
    { name: '팽창주의', warBias: 0.6, allianceBias: -0.1 },
    { name: '동맹 중시 외교', warBias: -0.2, allianceBias: 0.5 },
    { name: '실리 외교', warBias: 0.1, allianceBias: 0.1 },
    { name: '호전적 외교', warBias: 0.5, allianceBias: -0.3 },
  ],
};

// ── 이능 사전(설정집) — 이능 계통의 발현 원리를 슬롯 조합으로 상세 서술 ──
const ABILITY_SOURCE_PHRASES = {
  magic: ['대기 중에 떠도는 마나를 끌어모아', '고대 마법진에 새겨진 문양의 힘을 빌려', '원소의 정수와 계약을 맺어', '별자리의 배열에서 힘을 읽어내어'],
  aura: ['수련자 자신의 생명력을 응축시켜', '단전에 쌓은 기운을 신체 밖으로 방출하여', '정신을 극한까지 집중해 육체의 한계를 넘어서'],
  'martial-ki': ['오랜 수련으로 축적한 내공을 경락에 순환시켜', '스승에게서 전수받은 심법으로 기운을 다스려', '호흡과 동작을 일치시켜 내부의 기를 증폭시켜'],
  psychic: ['타인의 정신에 직접 파장을 실어보내어', '깊은 명상으로 의식을 신체 밖까지 확장시켜', '뇌 속에 잠든 미지의 영역을 일깨워'],
  shamanic: ['정령과의 오랜 교감으로 힘을 빌려와', '조상의 영혼에게 기원하여', '자연의 순환에 스스로를 동조시켜'],
};
for (const [kind, phrases] of Object.entries(ABILITY_SOURCE_PHRASES)) {
  TextGen.register('ability.source.' + kind, phrases);
}
TextGen.register('ability.manifest', [
  '눈에 보이는 형태로 발현시킨다', '순간적인 폭발적 힘으로 방출한다', '서서히 스며들 듯 작용시킨다',
  '주변 공간을 왜곡시키는 형태로 나타낸다', '자신 또는 대상의 신체에 각인시킨다',
]);
TextGen.register('ability.cost', [
  '다만 그 대가로 술자의 수명이 조금씩 깎여나간다', '다만 과도하게 사용하면 정신이 피폐해진다',
  '다만 반드시 정해진 대가(제물, 기억, 감정 등)를 치러야 한다', '다만 사용 직후 상당한 탈진 상태에 빠진다',
  '다만 숙련되지 않으면 술자 자신에게 위해가 되돌아온다',
]);

function generateAbilityLore(rng, archetype) {
  const kind = ABILITY_SOURCE_PHRASES[archetype.kind] ? archetype.kind : 'magic';
  const source = TextGen.generate('ability.source.' + kind, rng);
  const manifest = TextGen.generate('ability.manifest', rng);
  const cost = TextGen.generate('ability.cost', rng);
  return `${source} ${manifest}. ${cost}.`;
}

/** 세계 생성 시 도메인별로 소수의 사상 풀을 만든다(설계문서 6절 Paradigm 엔티티) */
function generateParadigmPool(rng, ctx, world) {
  const pool = { politics: [], religion: [], economy: [], ability: [], diplomacy: [] };

  for (const domain of DOMAINS) {
    const archetypes = ARCHETYPES[domain];
    const poolSize = domain === 'ability' ? RNG.randInt(rng, 2, 4) : RNG.randInt(rng, 2, 3);
    const chosen = sampleUnique(rng, archetypes, poolSize);
    for (const archetype of chosen) {
      const nameRng = ctx.stream('paradigm-name-' + domain + '-' + pool[domain].length);
      const culture = RNG.pick(nameRng, Object.keys(Names.CULTURE_PHONEMES));
      const properName = Names.generateName(nameRng, culture, RNG.randInt(nameRng, 2, 3));
      pool[domain].push({
        id: `paradigm-${domain}-${pool[domain].length}`,
        domain,
        archetype,
        name: `${properName}${archetypeSuffix(domain)}`,
        foundedYear: -RNG.randInt(rng, 50, 400),
        adherents: new Set(),
        status: 'rising', // rising | dominant | declining | extinct
        extinctYear: null,
        lore: domain === 'ability' ? generateAbilityLore(nameRng, archetype) : null,
      });
    }
  }

  world.paradigmPool = pool;
  return pool;
}

function archetypeSuffix(domain) {
  if (domain === 'religion') return '교';
  if (domain === 'ability') return '류';
  if (domain === 'politics') return '주의';
  if (domain === 'economy') return '체제';
  if (domain === 'diplomacy') return ' 노선';
  return '';
}

function sampleUnique(rng, arr, n) {
  const copy = arr.slice();
  const out = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(rng() * copy.length);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
}

/** 세력에 도메인별 초기 Paradigm을 배정한다 */
function assignFactionParadigms(rng, world, faction) {
  faction.paradigms = {};
  faction.domainStrength = { politics: RNG.randRange(rng, 25, 45), religion: RNG.randRange(rng, 25, 45), economy: RNG.randRange(rng, 25, 45), ability: 0, diplomacy: RNG.randRange(rng, 25, 45) };

  // 도메인 배정마다 세력+도메인 전용 서브시드를 써서, 공유 시퀀스의 특정 위치가
  // 우연히 특정 값대(예: 작은 풀에서 매번 같은 인덱스)로 쏠리는 상관관계를 원천 차단한다.
  for (const domain of ['politics', 'religion', 'economy', 'diplomacy']) {
    const pickRng = world.seedCtx.stream('assign-' + domain + '-' + faction.id);
    const p = RNG.pick(pickRng, world.paradigmPool[domain]);
    p.adherents.add(faction.id);
    faction.paradigms[domain] = p.id;
  }

  // 이능 계통은 모든 세력이 갖고 있지는 않음 (약 65% 확률로 보유)
  const abilityRng = world.seedCtx.stream('assign-ability-' + faction.id);
  if (RNG.chance(abilityRng, 0.65)) {
    const p = RNG.pick(abilityRng, world.paradigmPool.ability);
    p.adherents.add(faction.id);
    faction.paradigms.ability = p.id;
    faction.domainStrength.ability = RNG.randRange(rng, 10, 25);
  } else {
    faction.paradigms.ability = null;
  }

  // 정치-종교 관계 유형 (6.1: 항상 상호 연관)
  const politicsArchetype = findParadigm(world, faction.paradigms.politics).archetype;
  if (politicsArchetype.theocratic) {
    faction.politicsReligionRelation = '신정합일';
  } else {
    const relRng = world.seedCtx.stream('assign-relation-' + faction.id);
    faction.politicsReligionRelation = RNG.chance(relRng, 0.5) ? '상호독립' : '상호대립';
  }

  // 정치 성향에 따른 계급 유동성 목표치 (8.4와 연동, 서서히 그쪽으로 수렴)
  faction.classMobilityTarget = 50 + politicsArchetype.mobilityBias * 40;
}

function findParadigm(world, paradigmId) {
  if (!paradigmId) return null;
  for (const domain of DOMAINS) {
    const found = world.paradigmPool[domain].find((p) => p.id === paradigmId);
    if (found) return found;
  }
  return null;
}

/** 세력의 외교 노선 성향값을 반환 (전쟁/동맹 확률 보정에 사용) */
function getDiplomacyBias(world, faction) {
  const p = findParadigm(world, faction.paradigms && faction.paradigms.diplomacy);
  return p ? p.archetype : { warBias: 0, allianceBias: 0 };
}

/** 6.1 도메인 간 영향 그래프: 세계마다 가중치가 시드 기반으로 소폭 랜덤 초기화된다 */
function initInfluenceGraph(rng) {
  return {
    'economy->ability': RNG.randRange(rng, 0.15, 0.45),
    'ability->economy': RNG.randRange(rng, 0.1, 0.3),
    'religion->ability': RNG.randRange(rng, 0.1, 0.35),
    'ability->religion': RNG.randRange(rng, 0.05, 0.2),
    'politics->economy': RNG.randRange(rng, 0.1, 0.3),
  };
}

/** 6.3: 가중치의 완만한 표류(사건에 의한 급변은 다음 패스) */
function driftInfluenceGraph(world, rng) {
  for (const key of Object.keys(world.influenceGraph)) {
    const delta = RNG.randRange(rng, -0.01, 0.01);
    world.influenceGraph[key] = Math.max(0.02, Math.min(0.8, world.influenceGraph[key] + delta));
  }
}

/** 2.2: 영토 내 이능 편차 지역(마나 증폭/반발)이 이능 강도 성장에 주는 보정치 */
function manaAnomalyModifier(world, faction) {
  const keys = Array.from(faction.territory);
  if (keys.length === 0) return 0;
  const sample = keys.length > 40 ? keys.slice(0, 40) : keys; // 표본만 확인(성능)
  let net = 0;
  for (const key of sample) {
    const [x, y] = key.split(',').map(Number);
    const tile = world.terrain.tiles[y * world.terrain.width + x];
    if (!tile || !tile.manaAnomaly) continue;
    net += tile.manaAnomaly.type === 'amplify' ? 1 : -1;
  }
  return net / sample.length; // 대략 -1~1 범위
}

/** 도메인 강도 갱신 + 계급 유동성의 완만한 수렴 */
function tickFactionParadigms(world, faction, rng) {
  const g = world.influenceGraph;
  const s = faction.domainStrength;
  const noise = () => RNG.randRange(rng, -0.6, 0.6);
  const room = (v) => 1 - v / 100; // 값이 상한에 가까울수록 성장분을 줄이는 로지스틱 감쇠
  const meanRevert = (v, baseline = 45) => (baseline - v) * 0.004; // 극단으로 발산하지 않도록 평균 회귀

  const anomalyBoost = manaAnomalyModifier(world, faction) * 0.15; // 편차 지역 보유 시 이능 성장에 가감(다른 성장항과 비슷한 스케일)

  const abilityGain = (s.economy * g['economy->ability'] * 0.01 + s.religion * g['religion->ability'] * 0.01 + anomalyBoost) * room(s.ability);
  const economyGain = (s.ability * g['ability->economy'] * 0.01 + s.politics * g['politics->economy'] * 0.006) * room(s.economy);
  const religionGain = s.ability * g['ability->religion'] * 0.008 * room(s.religion);

  // 정치-종교 관계 유형 (6.1): 신정합일은 서로 수렴, 상호대립은 서로 억제, 상호독립은 무관
  let politicsCoupling = 0;
  let religionCoupling = 0;
  if (faction.politicsReligionRelation === '신정합일') {
    politicsCoupling = (s.religion - s.politics) * 0.02;
    religionCoupling = (s.politics - s.religion) * 0.02;
  } else if (faction.politicsReligionRelation === '상호대립') {
    politicsCoupling = -s.religion * 0.004;
    religionCoupling = -s.politics * 0.004;
  }

  s.ability = clamp(s.ability + abilityGain + meanRevert(s.ability, 30) + noise() * 0.3, 0, 100);
  s.economy = clamp(s.economy + economyGain + meanRevert(s.economy) + noise(), 0, 100);
  s.religion = clamp(s.religion + religionGain + religionCoupling + meanRevert(s.religion) + noise(), 0, 100);
  s.politics = clamp(s.politics + politicsCoupling + meanRevert(s.politics) + noise(), 0, 100);
  s.diplomacy = clamp((s.diplomacy ?? 35) + meanRevert(s.diplomacy ?? 35) + noise(), 0, 100);

  // 8.4 계급 유동성: 정치 성향이 가리키는 목표치로 서서히 수렴 + 미세 표류
  // 8.5: 최근 개인 계급 변동(상승/하락)이 누적되면 유동성 지표 자체도 그쪽으로 서서히 밀림
  const momentumPush = (faction.mobilityMomentum || 0) * 0.15;
  faction.classMobility = clamp(
    faction.classMobility + (faction.classMobilityTarget - faction.classMobility) * 0.01 + momentumPush * 0.01 + RNG.randRange(rng, -0.3, 0.3),
    5,
    95
  );
  faction.mobilityMomentum = (faction.mobilityMomentum || 0) * 0.9; // 서서히 감쇠(최근 동향일수록 영향이 큼)
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

TextGen.register('paradigm.conversion', [
  '{f}이(가) {old}을(를) 버리고 {new}(으)로 노선을 바꾸었다.',
  '{f}의 지도층이 {new}을(를) 새로이 받아들였다.',
  '{f}에서 {new}이(가) {old}을(를) 대신해 자리 잡았다.',
  '{f}의 백성들 사이에서 {new}이(가) 빠르게 퍼져나갔다.',
]);
function conversionEvent(rng, faction, oldP, newP) {
  return TextGen.generate('paradigm.conversion', rng, { f: faction.name, old: oldP.name, new: newP.name });
}

TextGen.register('paradigm.extinction', [
  '{p}이(가) 마지막 신봉 세력을 잃고 역사 속으로 사라졌다.',
  '더 이상 {p}을(를) 따르는 이가 남지 않아, 그 명맥이 끊어졌다.',
  '{p}은(는) 이제 옛 기록에만 남은 이름이 되었다.',
]);
function extinctionEvent(rng, paradigm) {
  return TextGen.generate('paradigm.extinction', rng, { p: paradigm.name });
}

TextGen.register('paradigm.lost_tech', [
  '{p}의 비법을 온전히 전수받은 이가 더는 남지 않았다 — 로스트 테크놀로지가 되었다.',
  '{p}이(가) 남긴 지식은 이제 아무도 재현할 수 없는 잊힌 기술이 되었다.',
  '{p}의 진정한 원리를 아는 이가 사라지며, 그 지혜는 전설로만 남았다.',
]);
function lostTechEvent(rng, paradigm) {
  return TextGen.generate('paradigm.lost_tech', rng, { p: paradigm.name });
}

/** 6절: 이따금 세력이 같은 도메인 내 더 우세한 경쟁 사상으로 갈아탄다(전향) */
function tryConversion(rng, world, faction, domain) {
  const pool = world.paradigmPool[domain];
  if (!pool || pool.length < 2) return null;
  if (!RNG.chance(rng, 0.006)) return null;

  const currentId = faction.paradigms[domain];
  const current = pool.find((p) => p.id === currentId) || null;
  const rivals = pool.filter((p) => p.id !== currentId && p.status !== 'extinct');
  if (rivals.length === 0) return null;

  // 신봉자 수가 많은(우세한) 사상일수록 전향 대상이 되기 쉬움 (밴드왜건)
  const target = RNG.weightedPick(
    rng,
    rivals.map((p) => ({ value: p, weight: 1 + p.adherents.size * 3 }))
  );

  if (current) current.adherents.delete(faction.id);
  target.adherents.add(faction.id);
  faction.paradigms[domain] = target.id;

  let extinctResult = null;
  if (current && current.adherents.size === 0 && current.status !== 'extinct') {
    current.status = 'extinct';
    current.extinctYear = world.year;
    extinctResult = current;
  }

  return { current, target, extinctResult };
}

window.Paradigms = {
  DOMAINS,
  DOMAIN_LABEL,
  ARCHETYPES,
  generateParadigmPool,
  assignFactionParadigms,
  findParadigm,
  getDiplomacyBias,
  initInfluenceGraph,
  driftInfluenceGraph,
  tickFactionParadigms,
  tryConversion,
  conversionEvent,
  extinctionEvent,
  lostTechEvent,
};
