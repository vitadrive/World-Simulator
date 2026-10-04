// ── 이름 생성기 (v0.1 — 설계문서 9절 가상 언어 생성기의 축소 선행판) ──
// 문화권(종족)마다 음소 취향을 다르게 주어 서로 다른 "말맛"을 내도록 함.
// 추후 9.2의 음소→글리프 매핑, 표의/상형 문자 체계로 확장될 자리.

const CULTURE_PHONEMES = {
  human: { onsets: ['b', 'd', 'r', 'k', 'm', 'v', 't', 'l', 's'], vowels: ['a', 'e', 'i', 'o'], codas: ['n', 'r', 's', 'd', ''] },
  elf: { onsets: ['l', 'th', 'y', 'ael', 'sil', 'f', 'n'], vowels: ['a', 'e', 'i', 'ae'], codas: ['l', 'n', 'th', ''] },
  dwarf: { onsets: ['b', 'd', 'g', 'k', 'th', 'gr', 'br'], vowels: ['o', 'u', 'a'], codas: ['k', 'g', 'r', 'm', 'd'] },
  orc: { onsets: ['g', 'r', 'k', 'z', 'ug', 'm', 'sh'], vowels: ['a', 'u', 'o'], codas: ['g', 'k', 'sh', 'z', 'r'] },
  serpentkin: { onsets: ['s', 'sh', 'z', 'ss', 'q'], vowels: ['i', 'e', 'a'], codas: ['s', 'ss', 'x', ''] },
  monster: { onsets: ['x', 'v', 'gr', 'kr', 'n', 'z'], vowels: ['a', 'o', 'u'], codas: ['x', 'th', 'g', ''] },
};

function makeSyllable(rng, ph) {
  return RNG.pick(rng, ph.onsets) + RNG.pick(rng, ph.vowels) + RNG.pick(rng, ph.codas);
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 문화권에 맞는 인명/지명 스타일 이름을 생성 */
function generateName(rng, culture, syllables) {
  const ph = CULTURE_PHONEMES[culture] || CULTURE_PHONEMES.human;
  const n = syllables || RNG.randInt(rng, 2, 3);
  let name = '';
  for (let i = 0; i < n; i++) name += makeSyllable(rng, ph);
  return capitalize(name);
}

const FACTION_SUFFIXES = ['왕국', '연합', '부족 동맹', '공국', '자치령', '동맹', '수호단'];
const MONSTER_FACTION_SUFFIXES = ['군단', '소굴 연합', '무리', '권속단', '어둠의 회합'];

/** 세력명 생성: "고유음절이름 + 정치체 접미사" 형태 */
function generateFactionName(rng, culture) {
  const core = generateName(rng, culture, RNG.randInt(rng, 2, 3));
  const suffixPool = culture === 'monster' ? MONSTER_FACTION_SUFFIXES : FACTION_SUFFIXES;
  const suffix = RNG.pick(rng, suffixPool);
  return `${core} ${suffix}`;
}

window.Names = { generateName, generateFactionName, CULTURE_PHONEMES };
