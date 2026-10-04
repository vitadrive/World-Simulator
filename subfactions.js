// ── 하위세력(파벌·종파) 시스템 (설계문서 8.1) ─────────────────────────
// 세력 내부에서 소수 사상(다른 종교/정치 노선)을 따르는 무리가 생겨나고,
// 부모 세력에 대한 충성도가 표류하다가 너무 낮아지면 반란이 일어난다.
// 반란은 진압되거나(부모가 더 강함), 독립에 성공해 새로운 정식 세력이
// 된다(world.js의 spinOffFaction 재사용) — 상위세력과 동일한 규칙 체계를
// 그대로 물려받는다.

const SUBFACTION_LABEL = { religion: '종파', politics: '정파' };

TextGen.register('subfaction.formation', [
  '{parent} 내에서 {para}을(를) 따르는 무리가 세를 불려 하나의 {label}(으)로 자리 잡았다.',
  '{parent}의 일부 백성들이 {para}에 심취해 독자적인 {label}을(를) 이루었다.',
  '{parent} 변두리에서 {para}을(를) 신봉하는 {label}이(가) 은밀히 세를 넓혀갔다.',
]);
TextGen.register('subfaction.suppress', [
  '{parent}이(가) {sub}의 반란을 무력으로 진압했다.',
  '{sub}이(가) 봉기했으나 {parent}의 힘 앞에 좌절되었다.',
  '{parent}의 군대가 {sub}의 저항을 신속히 진압했다.',
]);
TextGen.register('subfaction.secession', [
  '{sub}이(가) {parent}로부터 독립을 쟁취해 {newf}(으)로 새로이 일어섰다.',
  '{parent}의 통제를 벗어난 {sub}이(가) {newf}을(를) 선포했다.',
  '오랜 갈등 끝에 {sub}이(가) {parent}와 결별하고 {newf}(으)로 독립했다.',
]);

function formationEvent(rng, sub, parent, paradigmName) {
  return TextGen.generate('subfaction.formation', rng, { parent: parent.name, para: paradigmName, label: SUBFACTION_LABEL[sub.domain] });
}
function suppressEvent(rng, sub, parent) {
  return TextGen.generate('subfaction.suppress', rng, { parent: parent.name, sub: sub.name });
}
function secessionEvent(rng, sub, parent, newFaction) {
  return TextGen.generate('subfaction.secession', rng, { parent: parent.name, sub: sub.name, newf: newFaction.name });
}

/** 세력 하나당 최대 보유 가능한 활성 하위세력 수 */
const MAX_ACTIVE_PER_PARENT = 2;

function trySpawnSubFaction(rng, ctx, world, parent) {
  if (parent.territory.size < 8 || parent.population < 400) return null;
  const activeCount = world.subFactions.filter((sf) => sf.parentId === parent.id && sf.active).length;
  if (activeCount >= MAX_ACTIVE_PER_PARENT) return null;
  if (!RNG.chance(rng, 0.003)) return null;

  const domain = RNG.pick(rng, ['religion', 'politics']);
  const candidates = world.paradigmPool[domain].filter((p) => p.status !== 'extinct' && p.id !== parent.paradigms[domain]);
  if (candidates.length === 0) return null;
  const altParadigm = RNG.pick(rng, candidates);

  const label = SUBFACTION_LABEL[domain];
  const sub = {
    id: 'sub-' + world.subFactions.length,
    parentId: parent.id,
    domain,
    paradigmId: altParadigm.id,
    name: `${parent.name}의 ${altParadigm.name} ${label}`,
    loyalty: RNG.randRange(rng, 40, 65),
    sizeShare: RNG.randRange(rng, 0.1, 0.32),
    active: true,
    formedYear: world.year,
  };
  world.subFactions.push(sub);
  altParadigm.adherents.add(parent.id);

  World.logChronicle(world, formationEvent(rng, sub, parent, altParadigm.name), parent.id);
  return sub;
}

/** 부모 세력 영토 중 일부(비중만큼)를 무작위로 떼어낸다 (연속 영역 보장은 하지 않는 단순화) */
function pickTerritoryShare(parent, share, rng) {
  const keys = Array.from(parent.territory);
  const count = Math.max(1, Math.floor(keys.length * share));
  const copy = keys.slice();
  const out = [];
  for (let i = 0; i < count && copy.length > 0; i++) {
    const idx = Math.floor(rng() * copy.length);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
}

function pickOrCreateLeader(rng, world, parent) {
  const candidates = world.persons.filter((p) => p.factionId === parent.id && p.alive && !p.isLeader && p.currentClass >= 1);
  if (candidates.length > 0) return RNG.pick(rng, candidates);
  return Persons.createPerson(rng, world, parent);
}

function resolveRebellion(rng, world, sub, parent) {
  const baseStrength = War.militaryStrength(parent);
  const parentStrength = baseStrength * (1 - sub.sizeShare);
  // 부모 세력이 경직되어 있을수록(계급 유동성이 낮을수록) 억눌린 반란 세력이 더 격렬하게 싸운다
  const oppressionFactor = 1 + (100 - parent.classMobility) / 100;
  const rebelStrength = baseStrength * sub.sizeShare * oppressionFactor * RNG.randRange(rng, 0.8, 1.4);

  if (parentStrength > rebelStrength || parent.territory.size === 0) {
    sub.loyalty = RNG.randRange(rng, 35, 55);
    parent.population = Math.max(5, parent.population * 0.96);
    World.logChronicle(world, suppressEvent(rng, sub, parent), parent.id);
  } else {
    const territoryKeys = pickTerritoryShare(parent, sub.sizeShare, rng);
    const population = parent.population * sub.sizeShare;
    parent.population = Math.max(5, parent.population - population);

    const leader = pickOrCreateLeader(rng, world, parent);
    if (!world.persons.includes(leader)) world.persons.push(leader);

    const newFaction = World.spinOffFaction(world, parent, {
      territoryKeys,
      population,
      race: parent.race,
      subFactionDomain: sub.domain,
      subFactionParadigmId: sub.paradigmId,
      leaderPerson: leader,
    });
    sub.active = false;
    World.logChronicle(world, secessionEvent(rng, sub, parent, newFaction), newFaction.id);
  }
}

function tickSubFactions(world, ctx, rng) {
  for (const faction of world.factions) {
    if (!faction.alive) continue;
    trySpawnSubFaction(rng, ctx, world, faction);
  }

  for (const sub of world.subFactions) {
    if (!sub.active) continue;
    const parent = world.factions.find((f) => f.id === sub.parentId);
    if (!parent || !parent.alive) {
      sub.active = false;
      continue;
    }

    // 충성도 표류: 부모의 계급 유동성(포용력)이 높을수록 충성도가 유지되기 쉬움.
    // 유동성이 낮은(경직된) 세력은 목표치 자체가 낮아 실제로 반란까지 갈 수 있어야 한다.
    const target = 5 + parent.classMobility * 0.5;
    sub.loyalty = Math.max(0, Math.min(100, sub.loyalty + (target - sub.loyalty) * 0.02 + RNG.randRange(rng, -1.5, 1.5)));

    if (sub.loyalty < 20 && RNG.chance(rng, 0.02)) {
      resolveRebellion(rng, world, sub, parent);
    }
  }
}

window.SubFactions = { tickSubFactions, SUBFACTION_LABEL };
