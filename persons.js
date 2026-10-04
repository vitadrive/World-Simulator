// ── Person 시스템 (v0.2 — 설계문서 8, 8.3, 8.4, 8.5의 축소 구현) ────
// 이번 패스에서는 "주요 인물"만 개별 추적한다(배경 인구는 여전히
// faction.population 집계치로만 존재). 가족관계·중요도 스케일링·
// 우호도 네트워크는 다음 패스에서 이 위에 얹는다.

const CLASS_LABELS = ['평민', '유지', '귀족', '군주'];

const TALENT_FIELDS = ['magic', 'combat', 'diplomacy', 'scholarship', 'leadership'];
const TALENT_LABELS = { magic: '마법', combat: '무예', diplomacy: '외교', scholarship: '학문', leadership: '통솔' };

function randomTalent(rng) {
  const t = {};
  for (const f of TALENT_FIELDS) t[f] = RNG.randRange(rng, 0.1, 1.0);
  return t;
}

function randomDisposition(rng) {
  return {
    aggression: RNG.randRange(rng, 0, 1), // 0 온건적 ~ 1 호전적
    idealism: RNG.randRange(rng, 0, 1), // 0 현실주의 ~ 1 이상주의
    tradition: RNG.randRange(rng, 0, 1), // 0 개혁적 ~ 1 보수적
  };
}

function dominantTalent(person) {
  let best = TALENT_FIELDS[0];
  for (const f of TALENT_FIELDS) if (person.talent[f] > person.talent[best]) best = f;
  return best;
}

function createPerson(rng, world, faction, { originClass, isLeader = false, parentIds = [] } = {}) {
  const nameRng = rng;
  world.personIdSeq = (world.personIdSeq || 0);
  const cls = originClass ?? weightedOriginClass(rng, faction);
  const person = {
    id: 'person-' + world.personIdSeq++,
    name: Names.generateName(nameRng, faction.culture, RNG.randInt(nameRng, 2, 3)),
    race: faction.race,
    factionId: faction.id,
    bornYear: parentIds.length > 0 ? world.year : world.year - RNG.randInt(rng, 18, 45), // 자녀는 이번 해에 태어남, 그 외엔 이미 성인 상태로 "발견"
    deathYear: null,
    alive: true,
    talent: randomTalent(rng),
    disposition: randomDisposition(rng),
    originClass: cls,
    currentClass: cls,
    wealth: RNG.randRange(rng, 5, 20),
    importance: isLeader ? 10 : 1,
    isLeader,
    spouseId: null,
    childIds: [],
    parentIds,
    log: [],
  };
  return person;
}

/** 출신 계급을 배정한다 (faction 인자는 추후 세력별 편차를 줄 수 있도록 남겨둔 확장 지점) */
function weightedOriginClass(rng, faction) {
  return RNG.weightedPick(rng, [
    { value: 0, weight: 70 },
    { value: 1, weight: 20 },
    { value: 2, weight: 8 },
    { value: 3, weight: 2 },
  ]);
}

/** 8: 영향력 = f(신분, 재산, 능력) 가중합. 인물 유형(재능 최댓값)에 따라 가중치 비중이 달라짐 */
function computeInfluence(person) {
  const talentSum = TALENT_FIELDS.reduce((s, f) => s + person.talent[f], 0);
  const abilityScore = talentSum * 4 + person.importance;
  const classScore = person.currentClass * 12;
  const wealthScore = person.wealth * 0.6;

  // 상인형(재산 비중↑) vs 전사/학자형(능력 비중↑) 등 유형별 가중치 차등
  const top = dominantTalent(person);
  let wClass = 1, wWealth = 1, wAbility = 1.2;
  if (top === 'leadership') wClass = 1.4;
  if (person.wealth > 30) wWealth = 1.6; // 부를 크게 쌓은 인물(상인형)은 재산 가중치 강화

  return classScore * wClass + wealthScore * wWealth + abilityScore * wAbility;
}

function classTitle(person, faction) {
  const base = CLASS_LABELS[person.currentClass] || '평민';
  if (person.isLeader && faction && faction.leaderId === person.id) return `${base} · 지도자`;
  return base;
}

/** 세력 건국 시 초대 지도자를 생성 */
function createFounder(rng, world, faction) {
  const person = createPerson(rng, world, faction, { originClass: 3, isLeader: true });
  world.persons.push(person);
  faction.leaderId = person.id;
  return person;
}

const RISE_REASON_PHRASES = {
  combat: ['전장에서 세운 공로로', '뛰어난 무공을 인정받아', '수많은 전투에서 승리를 이끌어'],
  magic: ['비범한 마법적 재능을 인정받아', '이능을 통해 기적을 보이며', '남다른 이능 수련의 성과로'],
  diplomacy: ['탁월한 외교적 수완으로', '동맹을 성사시킨 공으로', '분쟁을 원만히 중재한 공으로'],
  scholarship: ['학문적 업적을 인정받아', '박식함으로 명성을 얻어', '귀중한 지식을 정리해 남긴 공로로'],
  leadership: ['따르는 이가 늘어나며', '지도력을 인정받아', '위기 속에서 침착하게 무리를 이끌어'],
};
for (const [talent, phrases] of Object.entries(RISE_REASON_PHRASES)) {
  TextGen.register('person.rise_reason.' + talent, phrases);
}
const FALL_REASON_PHRASES = [
  '무리한 판단으로 신망을 잃고',
  '뜻하지 않은 스캔들에 휘말려',
  '재산을 탕진하고',
  '정쟁에서 밀려나',
  '중대한 실책으로 신뢰를 잃고',
  '뇌물 수수 사실이 드러나',
];
TextGen.register('person.fall_reason', FALL_REASON_PHRASES);
TextGen.register('person.death_leader', ['{f}의 지도자 {p}이(가) 세상을 떠났다.']);
TextGen.register('person.death_commoner', ['{cls} {p}이(가) 생을 마감했다.']);
TextGen.register('person.succession', ['{f}에서 {p}이(가) 새 지도자로 추대되었다.']);

function personRiseEvent(rng, person) {
  const top = dominantTalent(person);
  const reason = TextGen.generate('person.rise_reason.' + top, rng);
  return `${person.name}이(가) ${reason} ${CLASS_LABELS[person.currentClass]} 신분에 올랐다.`;
}

function personFallEvent(rng, person, prevClassIdx) {
  const reason = TextGen.generate('person.fall_reason', rng);
  return `${person.name}이(가) ${reason} ${CLASS_LABELS[prevClassIdx]}에서 ${CLASS_LABELS[person.currentClass]} 신분으로 몰락했다.`;
}

function personDeathEvent(rng, person, faction) {
  if (person.isLeader) {
    return TextGen.generate('person.death_leader', rng, { f: faction.name, p: person.name });
  }
  return TextGen.generate('person.death_commoner', rng, { cls: CLASS_LABELS[person.currentClass], p: person.name });
}

function successionEvent(rng, newLeader, faction) {
  return TextGen.generate('person.succession', rng, { f: faction.name, p: newLeader.name });
}

// ── 가족관계 (설계문서 8절 인물 기록) ────────────────────────────────
const MARRIAGE_ADULT_MIN_AGE = 18;
const CHILDBEARING_MAX_AGE = 50;

function isAdult(person, year) {
  return year - person.bornYear >= MARRIAGE_ADULT_MIN_AGE;
}

TextGen.register('person.marriage', [
  '{a}와(과) {b}이(가) 혼인을 맺었다.',
  '{f}에서 {a}와(과) {b}의 혼례가 성대히 치러졌다.',
  '{a}와(과) {b}이(가) 백년가약을 맺었다.',
]);
TextGen.register('person.royal_marriage', [
  '{fa}의 {a}와(과) {fb}의 {b}이(가) 정략혼을 맺어 두 세력의 관계가 한층 가까워졌다.',
  '{fa}와(과) {fb}이(가) {a}와(과) {b}의 혼인으로 굳건한 동맹을 다졌다.',
]);
TextGen.register('person.birth', [
  '{a}와(과) {b} 사이에서 {c}이(가) 태어났다.',
  '{f}에 새 생명 {c}이(가) 태어났다.',
  '{a}와(과) {b}의 슬하에 {c}이(가) 태어나 가문의 경사가 되었다.',
]);
TextGen.register('person.heir_succession', [
  '{f}에서 선대의 뒤를 이어 {p}이(가) 새 지도자로 즉위했다.',
  '{p}이(가) 부모의 자리를 물려받아 {f}을(를) 이끌게 되었다.',
  '{f}의 왕위가 순조롭게 {p}에게 계승되었다.',
]);

function marriageEvent(rng, a, b, faction) {
  return TextGen.generate('person.marriage', rng, { a: a.name, b: b.name, f: faction.name });
}
function royalMarriageEvent(rng, a, factionA, b, factionB) {
  return TextGen.generate('person.royal_marriage', rng, { a: a.name, fa: factionA.name, b: b.name, fb: factionB.name });
}
function birthEvent(rng, a, b, child, faction) {
  return TextGen.generate('person.birth', rng, { a: a.name, b: b.name, c: child.name, f: faction.name });
}
function heirSuccessionEvent(rng, heir, faction) {
  return TextGen.generate('person.heir_succession', rng, { f: faction.name, p: heir.name });
}

/** 같은 세력 내 미혼 성인 두 명을 혼인시킨다 */
function tryFactionMarriage(rng, world, faction) {
  const candidates = world.persons.filter(
    (p) => p.factionId === faction.id && p.alive && !p.spouseId && isAdult(p, world.year)
  );
  if (candidates.length < 2) return null;
  if (!RNG.chance(rng, 0.02)) return null;

  const a = RNG.pick(rng, candidates);
  const rest = candidates.filter((p) => p.id !== a.id);
  const b = RNG.pick(rng, rest);
  a.spouseId = b.id;
  b.spouseId = a.id;
  return { a, b };
}

/** 우호적인 두 세력의 지도층 간 정략혼 */
function tryRoyalMarriage(rng, world, factionA, factionB) {
  if (!RNG.chance(rng, 0.01)) return null;
  const aCandidates = world.persons.filter((p) => p.factionId === factionA.id && p.alive && !p.spouseId && isAdult(p, world.year) && p.currentClass >= 2);
  const bCandidates = world.persons.filter((p) => p.factionId === factionB.id && p.alive && !p.spouseId && isAdult(p, world.year) && p.currentClass >= 2);
  if (aCandidates.length === 0 || bCandidates.length === 0) return null;

  const a = RNG.pick(rng, aCandidates);
  const b = RNG.pick(rng, bCandidates);
  a.spouseId = b.id;
  b.spouseId = a.id;
  return { a, b };
}

/** 혼인한 부부에게서 자녀가 태어난다 */
function tryChildbirth(rng, world, person) {
  if (!person.spouseId) return null;
  const spouse = world.persons.find((p) => p.id === person.spouseId);
  if (!spouse || !spouse.alive) return null;
  if (person.id > spouse.id) return null; // 부부 쌍당 한 번만 처리 (id 작은 쪽에서만 시도)

  const age = world.year - person.bornYear;
  const spouseAge = world.year - spouse.bornYear;
  if (age > CHILDBEARING_MAX_AGE || spouseAge > CHILDBEARING_MAX_AGE) return null;
  if (!RNG.chance(rng, 0.05)) return null;

  const faction = world.factions.find((f) => f.id === person.factionId);
  if (!faction) return null;

  const higherClass = Math.max(person.currentClass, spouse.currentClass);
  const child = createPerson(rng, world, faction, { originClass: higherClass, parentIds: [person.id, spouse.id] });
  world.persons.push(child);
  person.childIds.push(child.id);
  spouse.childIds.push(child.id);
  return { person, spouse, child, faction };
}

/** 사망한 지도자의 생존 자녀 중 맏이를 후계자로 세운다 (없으면 null) */
function findHeir(world, leader) {
  const children = (leader.childIds || [])
    .map((id) => world.persons.find((p) => p.id === id))
    .filter((p) => p && p.alive)
    .sort((a, b) => a.bornYear - b.bornYear);
  return children[0] || null;
}

function promoteToHeir(heir, faction) {
  heir.isLeader = true;
  heir.currentClass = 3;
  heir.importance += 10;
  faction.leaderId = heir.id;
}

// ── 노화·사망 (8절 인물 생애) ────────────────────────────────────
const AGE_MAX_EXPECTANCY = { human: 70, elf: 300, dwarf: 180, orc: 55, serpentkin: 120, monster: 200 };

function mortalityChance(person, year) {
  const maxAge = AGE_MAX_EXPECTANCY[person.race] || 70;
  const age = year - person.bornYear;
  const lifeFraction = age / maxAge;
  if (lifeFraction < 0.55) return 0.0015;
  if (lifeFraction < 0.85) return 0.008;
  if (lifeFraction < 1.0) return 0.04;
  return 0.15;
}

// ── 8.4/8.5: 계급 유동성에 따른 개인 계급 변동 ──────────────────────
const TIER_UP_DIFFICULTY = [1.0, 0.5, 0.15]; // commoner→gentry, gentry→noble, noble→(군주는 계승만)
const TIER_DOWN_RISK = [0, 1.0, 0.55]; // commoner는 더 내려갈 곳 없음

function clampDisp(v) {
  return Math.max(-1, Math.min(1, v));
}

function tryClassMobility(rng, person, faction) {
  if (person.isLeader) return null; // 지도자는 계승으로만 교체
  const mobility = faction.classMobility / 100;
  const talentSum = TALENT_FIELDS.reduce((s, f) => s + person.talent[f], 0) / TALENT_FIELDS.length;

  if (person.currentClass < 2) {
    // 2(귀족)까지만 행적으로 오를 수 있음, 3(군주)은 계승 전용
    const upProb = 0.012 * talentSum * mobility * TIER_UP_DIFFICULTY[person.currentClass];
    if (RNG.chance(rng, upProb)) {
      person.currentClass += 1;
      person.wealth += RNG.randRange(rng, 5, 20);
      person.importance += 2;
      // 8.3: 자수성가의 경험이 성향을 서서히 바꾼다 — 변화가 가능하다는 확신이 개혁 성향을 키움
      person.disposition.reformism = clampDisp(person.disposition.reformism + 0.06);
      return 'up';
    }
  }

  if (person.currentClass > 0) {
    const prevIdx = person.currentClass;
    const downProb = 0.003 * mobility * TIER_DOWN_RISK[person.currentClass];
    if (RNG.chance(rng, downProb)) {
      person.currentClass -= 1;
      person.wealth *= 0.4;
      person.importance += 1;
      // 8.3: 몰락의 경험은 기존 질서에 대한 환멸로 이어짐
      person.disposition.reformism = clampDisp(person.disposition.reformism + 0.08);
      person.disposition.idealism = clampDisp(person.disposition.idealism - 0.04);
      return prevIdx; // 하락 전 등급을 반환(문구 생성용)
    }
  }

  return null;
}

window.Persons = {
  CLASS_LABELS,
  TALENT_FIELDS,
  TALENT_LABELS,
  createPerson,
  createFounder,
  computeInfluence,
  classTitle,
  dominantTalent,
  RISE_REASON_PHRASES,
  FALL_REASON_PHRASES,
  personRiseEvent,
  personFallEvent,
  personDeathEvent,
  successionEvent,
  mortalityChance,
  tryClassMobility,
  isAdult,
  tryFactionMarriage,
  tryRoyalMarriage,
  tryChildbirth,
  findHeir,
  promoteToHeir,
  marriageEvent,
  royalMarriageEvent,
  birthEvent,
  heirSuccessionEvent,
};
