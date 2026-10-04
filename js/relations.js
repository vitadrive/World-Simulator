// ── 우호도(Affinity) 시스템 (설계문서 7.5) ───────────────────────
// - 방향성(비대칭): A→B와 B→A는 독립된 값
// - 진심(내면) vs 표면(공식 외교 상태) 이원화: 내부 사정으로 실제 감정과
//   다른 공식 태도를 유지할 수 있음
// - 세력-세력뿐 아니라 인물-인물, 인물-세력에도 동일 구조 적용 가능하도록
//   범용 키(관계 주체 쌍의 id 조합) 기반으로 설계

const STANCE_LEVELS = ['적대', '긴장', '중립', '우호', '동맹'];

function relationKey(aId, bId) {
  return `${aId}=>${bId}`;
}

/** 관계망을 담을 빈 저장소 생성 (world.relations로 보관) */
function createRelationNetwork() {
  return { affinity: {}, stance: {}, wasConstrained: {} };
}

function getAffinity(net, fromId, toId) {
  return net.affinity[relationKey(fromId, toId)] ?? 0; // -100 ~ +100, 기본 0(초면)
}

function setAffinity(net, fromId, toId, value) {
  net.affinity[relationKey(fromId, toId)] = Math.max(-100, Math.min(100, value));
}

function adjustAffinity(net, fromId, toId, delta) {
  setAffinity(net, fromId, toId, getAffinity(net, fromId, toId) + delta);
}

/** 공식 외교 상태(표면) — 내면 우호도와 별개로 조약·제약에 의해 유지될 수 있음 */
function getStance(net, aId, bId) {
  const key = relationKey(aId, bId) < relationKey(bId, aId) ? relationKey(aId, bId) : relationKey(bId, aId);
  return net.stance[key] || '중립';
}

function setStance(net, aId, bId, stance) {
  const key = relationKey(aId, bId) < relationKey(bId, aId) ? relationKey(aId, bId) : relationKey(bId, aId);
  net.stance[key] = stance;
}

/**
 * 최초 접촉 시 초기 우호도를 부여한다. 완전 대칭이 아니라 양쪽에
 * 독립적으로 굴려서 "A는 B를 좋아하지만 B는 내심 A가 싫은" 상황이
 * 나올 수 있게 한다.
 */
function initFirstContact(rng, net, aId, bId) {
  setAffinity(net, aId, bId, RNG.randRange(rng, -20, 25));
  setAffinity(net, bId, aId, RNG.randRange(rng, -20, 25));
  setStance(net, aId, bId, '중립');
}

/**
 * 7.5: 작은 사건(외교적 실수 등) 발생 시 처리.
 * 우호도가 높을수록 "무마"될 확률이 높고, 낮을수록 "확대"될 확률이 높다.
 * disposition(지배층 성향, -1~1 호전성)도 확대 확률에 가산된다.
 * @returns {'smoothed'|'escalated'}
 */
function resolveMinorIncident(rng, net, actorId, targetId, actorAggression = 0) {
  const affinity = getAffinity(net, targetId, actorId); // 당한 쪽이 상대를 어떻게 보는가가 기준
  const normalized = (affinity + 100) / 200; // 0~1
  const aggressionPush = Math.max(0, actorAggression) * 0.15; // 호전적일수록 확대 쪽으로 가산
  const smoothProb = Math.max(0.05, Math.min(0.95, normalized - aggressionPush));

  if (RNG.chance(rng, smoothProb)) {
    adjustAffinity(net, targetId, actorId, RNG.randRange(rng, -6, -1));
    return 'smoothed';
  } else {
    adjustAffinity(net, targetId, actorId, RNG.randRange(rng, -30, -12));
    return 'escalated';
  }
}

/**
 * 우호도와 무관하게 낮은 고정 확률로 발생하는 돌발 행동 판정 (7.2 이상 사건 레이어와 연동).
 * 우호도가 아무리 높아도 이 확률만큼은 항상 열려있다.
 */
function rollAnomalousBetrayal(rng, baseChance = 0.004) {
  return RNG.chance(rng, baseChance);
}

// ── 7.5: 진심(내면) vs 표면(공식) 이원화 ────────────────────────────

function pairKey(aId, bId) {
  return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
}

function trueStanceLabel(avgAffinity) {
  if (avgAffinity >= 60) return '동맹';
  if (avgAffinity >= 20) return '우호';
  if (avgAffinity >= -20) return '중립';
  if (avgAffinity >= -60) return '긴장';
  return '적대';
}

/** 두 세력이 같은 제3세력과 동시에 교전 중이면 "공동의 적" 제약이 걸려있다고 본다 */
function hasSharedEnemyConstraint(world, aId, bId) {
  const wars = (world.wars || []).filter((w) => w.status === 'ongoing');
  const aEnemies = wars.filter((w) => w.sides.includes(aId)).map((w) => w.sides.find((id) => id !== aId));
  const bEnemies = wars.filter((w) => w.sides.includes(bId)).map((w) => w.sides.find((id) => id !== bId));
  return aEnemies.some((e) => bEnemies.includes(e));
}

/**
 * 매 틱 두 세력의 공식 관계(표면)를 갱신한다. 제약(공동의 적)이 있으면
 * 내면 우호도가 나빠도 표면은 '우호' 이상으로 유지되고, 제약이 풀렸는데
 * 내면이 아주 나쁘면 억눌렸던 감정이 터지는 배신 사건이 발생한다.
 * @returns {'betrayal'|null}
 */
function updateStanceWithFacade(world, aId, bId, rng) {
  const net = world.relations;
  const avg = (getAffinity(net, aId, bId) + getAffinity(net, bId, aId)) / 2;
  const trueLabel = trueStanceLabel(avg);
  const constrained = hasSharedEnemyConstraint(world, aId, bId);
  const key = pairKey(aId, bId);

  if (constrained) {
    const facadeIdx = Math.max(STANCE_LEVELS.indexOf(trueLabel), STANCE_LEVELS.indexOf('우호'));
    setStance(net, aId, bId, STANCE_LEVELS[facadeIdx]);
    net.wasConstrained[key] = true;
    return null;
  }

  const wasConstrained = net.wasConstrained[key];
  net.wasConstrained[key] = false;
  if (wasConstrained && avg < -40) {
    setStance(net, aId, bId, '적대');
    return 'betrayal';
  }
  setStance(net, aId, bId, trueLabel);
  return null;
}

window.Relations = {
  STANCE_LEVELS,
  createRelationNetwork,
  getAffinity,
  setAffinity,
  adjustAffinity,
  getStance,
  setStance,
  initFirstContact,
  resolveMinorIncident,
  rollAnomalousBetrayal,
  updateStanceWithFacade,
  hasSharedEnemyConstraint,
};
