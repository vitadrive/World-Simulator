// ── 난수 생성 아키텍처 (설계문서 2.4) ───────────────────────────────
// - 문자열/숫자 시드를 32비트 정수로 해싱
// - master seed에서 서브시스템별 독립 스트림(서브시드)을 파생
// - mulberry32: 재현 가능하고 가벼운 32비트 PRNG (리플레이 호환을 위해 결정론적)

/**
 * 문자열을 32비트 정수로 해싱한다 (cyrb53의 단순화 버전).
 * @param {string} str
 * @returns {number} 32비트 부호 없는 정수
 */
function hashStringToInt(str) {
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return (h1 >>> 0);
}

/**
 * mulberry32 PRNG. 시드 하나로 결정론적 난수 스트림을 생성한다.
 * @param {number} seed 32비트 정수 시드
 * @returns {() => number} 0 이상 1 미만의 실수를 반환하는 함수
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 임의의 시드값(문자열 또는 숫자)으로부터 마스터 시드를 만들고,
 * 서브시스템 라벨별로 독립된 PRNG 스트림을 파생해주는 컨텍스트를 반환한다.
 * 서브시드 분리(설계문서 2.4)로 지형/세력/이벤트 등이 서로 불필요하게
 * 상관되지 않도록 한다.
 */
function createSeedContext(rawSeed) {
  const masterSeedStr = String(rawSeed);
  const masterSeedInt = hashStringToInt(masterSeedStr);

  const streams = {};

  function stream(label) {
    if (!streams[label]) {
      const subSeed = hashStringToInt(masterSeedStr + '::' + label);
      streams[label] = mulberry32(subSeed);
    }
    return streams[label];
  }

  return {
    masterSeedStr,
    masterSeedInt,
    stream, // stream('terrain'), stream('faction'), stream('event') ...
  };
}

/** [min, max) 구간의 실수 난수 */
function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

/** [min, max] 구간의 정수 난수 (양 끝 포함) */
function randInt(rng, min, max) {
  return Math.floor(randRange(rng, min, max + 1));
}

/** 배열에서 무작위 원소 하나 선택 */
function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/** 가중치 배열([{value, weight}, ...])에 따라 하나를 선택 */
function weightedPick(rng, items) {
  const total = items.reduce((sum, it) => sum + it.weight, 0);
  let r = rng() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it.value;
  }
  return items[items.length - 1].value;
}

/** rng() < p 인지 여부를 반환하는 확률 판정 헬퍼 */
function chance(rng, p) {
  return rng() < p;
}

window.RNG = {
  hashStringToInt,
  mulberry32,
  createSeedContext,
  randRange,
  randInt,
  pick,
  weightedPick,
  chance,
};
