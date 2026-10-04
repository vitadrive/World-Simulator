// ── 무소속 독립 개체 (설계문서 8.2) ────────────────────────────────
// 세력화되지 않은 강력한 존재. 이번 패스는 "위협형 몬스터"만 다룬다.
// 로스트 테크놀로지 유물(6.2, paradigms.js에서 생성)도 이 배열에 함께
// 쌓이지만, 그쪽은 사건에 부수하는 정적 기록이고 이 파일은 매 틱
// 행동하는 위협 개체를 다룬다.

const MONSTER_EPITHETS = ['탐식하는', '어둠의', '고대의', '피에 굶주린', '이름 없는'];
const MONSTER_KINDS = ['거대 야수', '고룡', '망령', '마수', '심연의 괴물'];

function spawnThreatMonsters(rng, ctx, world, count) {
  for (let i = 0; i < count; i++) {
    const nameRng = ctx.stream('monster-' + i);
    const name = `${RNG.pick(nameRng, MONSTER_EPITHETS)} ${Names.generateName(nameRng, 'monster', 2)}`;
    const kind = RNG.pick(nameRng, MONSTER_KINDS);
    world.independents.push({
      id: 'monster-' + i,
      type: 'monster',
      name: `${name} (${kind})`,
      power: RNG.randRange(nameRng, 15, 60),
      alive: true,
      slainYear: null,
      slainBy: null,
    });
  }
}

TextGen.register('monster.raid', [
  '{m}이(가) {f}의 변경을 습격해 백성들을 해쳤다.',
  '{m}이(가) 나타나 {f}의 마을 하나를 폐허로 만들었다.',
  '{m}의 그림자가 {f}의 영토를 스치고 지나가며 큰 피해를 남겼다.',
  '{m}이(가) {f}의 가축과 곡식을 닥치는 대로 해쳤다.',
]);
TextGen.register('monster.slain', [
  '{f}의 {p}이(가) {m}을(를) 물리쳤다.',
  '{p}이(가) 오랜 사투 끝에 {m}을(를) 쓰러뜨렸다.',
  '{p}이(가) 이끄는 토벌대가 {m}을(를) 처단했다.',
]);
TextGen.register('monster.slain_anonymous', ['{f}의 백성들이 힘을 모아 {m}을(를) 물리쳤다.']);
TextGen.register('monster.growth_rumor', ['{m}의 힘이 날로 흉포해지고 있다는 소문이 돌았다.']);

function raidEvent(rng, monster, faction) {
  return TextGen.generate('monster.raid', rng, { m: monster.name, f: faction.name });
}
function slainEvent(rng, monster, faction, person) {
  return TextGen.generate('monster.slain', rng, { m: monster.name, f: faction.name, p: person.name });
}

/** 매 틱, 위협형 몬스터들의 습격/성장/토벌을 처리한다 */
function tickThreats(world, rng) {
  const monsters = world.independents.filter((i) => i.type === 'monster' && i.alive);
  const aliveFactions = world.factions.filter((f) => f.alive && f.territory.size > 0);
  if (aliveFactions.length === 0) return;

  for (const monster of monsters) {
    if (RNG.chance(rng, 0.015)) {
      monster.power += RNG.randRange(rng, 1, 4);
      if (RNG.chance(rng, 0.2)) World.logChronicle(world, TextGen.generate('monster.growth_rumor', rng, { m: monster.name }), null);
    }

    if (!RNG.chance(rng, 0.03)) continue;
    const target = RNG.pick(rng, aliveFactions);
    const defense = War.militaryStrength(target) * RNG.randRange(rng, 0.8, 1.2);

    if (defense > monster.power * 1.3) {
      // 토벌 성공: 무예 재능이 있는 인물이 있으면 그가 처치, 없으면 무명의 병사
      const candidates = world.persons.filter((p) => p.factionId === target.id && p.alive);
      const hero = candidates.length > 0 ? RNG.pick(rng, candidates) : null;
      monster.alive = false;
      monster.slainYear = world.year;
      monster.slainBy = target.id;
      if (hero) {
        hero.importance += 4;
        hero.wealth += RNG.randRange(rng, 10, 25);
        World.logChronicle(world, slainEvent(rng, monster, target, hero), target.id);
      } else {
        World.logChronicle(world, TextGen.generate('monster.slain_anonymous', rng, { f: target.name, m: monster.name }), target.id);
      }
    } else {
      target.population = Math.max(5, target.population - target.population * 0.03);
      World.logChronicle(world, raidEvent(rng, monster, target), target.id);
    }
  }
}

window.Independents = { spawnThreatMonsters, tickThreats };

// ── 무소속 지성체 (은둔 현자·방랑자·예언자) ───────────────────────────
const SAGE_TITLES = ['은둔 현자', '방랑자', '예언자', '떠돌이 학자', '숲의 은자'];

function spawnLegendaries(rng, ctx, world, count) {
  for (let i = 0; i < count; i++) {
    const nameRng = ctx.stream('legendary-' + i);
    const culture = RNG.pick(nameRng, Object.keys(Names.CULTURE_PHONEMES));
    const name = Names.generateName(nameRng, culture, RNG.randInt(nameRng, 2, 3));
    const title = RNG.pick(nameRng, SAGE_TITLES);
    const talentField = RNG.pick(nameRng, Persons.TALENT_FIELDS);
    world.independents.push({
      id: 'sage-' + i,
      type: 'sage',
      name: `${title} ${name}`,
      talentField,
      alive: true,
      recruitedBy: null,
    });
  }
}

const VISIT_TALENT_KEYS = { scholarship: 'sage.visit.scholarship', arcane: 'sage.visit.arcane', diplomacy: 'sage.visit.diplomacy', combat: 'sage.visit.combat', leadership: 'sage.visit.leadership' };
TextGen.register('sage.visit.scholarship', ['{s}이(가) {f}에 머물며 지식을 나누어, 학문이 진일보했다.']);
TextGen.register('sage.visit.arcane', ['{s}이(가) {f}을(를) 찾아와 이능의 비법을 전수했다.']);
TextGen.register('sage.visit.diplomacy', ['{s}이(가) {f}의 궁정에 머물며 지혜로운 조언을 남겼다.']);
TextGen.register('sage.visit.combat', ['{s}이(가) {f}의 전사들에게 무예를 가르치고 떠났다.']);
TextGen.register('sage.visit.leadership', ['{s}이(가) {f}의 지도자에게 통치의 지혜를 전했다.']);
TextGen.register('sage.recruit', ['{s}이(가) {f}에 완전히 정착해 그 일원이 되었다.']);
TextGen.register('sage.death', ['{s}이(가) 긴 여정 끝에 조용히 생을 마감했다는 소식이 전해졌다.']);

function tickLegendaries(world, rng) {
  const sages = world.independents.filter((i) => i.type === 'sage' && i.alive);
  const aliveFactions = world.factions.filter((f) => f.alive && f.territory.size > 0);
  if (aliveFactions.length === 0) return;

  for (const sage of sages) {
    if (RNG.chance(rng, 0.002)) {
      // 은둔 지성체도 언젠가는 생을 마감한다
      sage.alive = false;
      World.logChronicle(world, TextGen.generate('sage.death', rng, { s: sage.name }), null);
      continue;
    }

    if (!RNG.chance(rng, 0.02)) continue;
    const target = RNG.pick(rng, aliveFactions);

    if (RNG.chance(rng, 0.15)) {
      // 정착(영구 합류): 해당 세력의 정식 인물이 되어 독립 개체 목록에서 빠짐
      sage.alive = false;
      sage.recruitedBy = target.id;
      const person = Persons.createPerson(rng, world, target);
      person.name = sage.name.split(' ').slice(-1)[0]; // 칭호를 떼고 본명만
      person.talent[sage.talentField] = Math.max(person.talent[sage.talentField], 0.85);
      person.importance += 3;
      world.persons.push(person);
      World.logChronicle(world, TextGen.generate('sage.recruit', rng, { s: sage.name, f: target.name }), target.id);
    } else {
      // 잠시 방문: 도메인 강도나 인물에 작은 도움을 주고 떠남
      const visitKey = VISIT_TALENT_KEYS[sage.talentField] || VISIT_TALENT_KEYS.scholarship;
      World.logChronicle(world, TextGen.generate(visitKey, rng, { s: sage.name, f: target.name }), target.id);
      if (sage.talentField === 'arcane') target.domainStrength.ability = Math.min(100, target.domainStrength.ability + 3);
      else if (sage.talentField === 'scholarship' || sage.talentField === 'diplomacy') target.domainStrength.economy = Math.min(100, target.domainStrength.economy + 2);
      const leader = world.persons.find((p) => p.id === target.leaderId);
      if (leader) leader.importance += 1;
    }
  }
}

Independents.spawnLegendaries = spawnLegendaries;
Independents.tickLegendaries = tickLegendaries;
