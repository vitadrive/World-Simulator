// ── 이벤트 생성 엔진 (설계문서 7절) ─────────────────────────────────
// 문장은 통짜 템플릿이 아니라 부품(슬롯)을 조합해서 만든다.
// 실제 "배열에서 하나 뽑아 빈칸을 채운다"는 절차는 이제 textgen.js의
// TextGenerator 인터페이스(TextGen.generate)에 위임한다 — 이 파일은
// 어떤 템플릿이 있는지(데이터)와 어떤 슬롯을 조합할지(순서)만 갖는다.

const FOUNDING_TERRAIN_PHRASES = {
  plains: ['드넓은 평원', '비옥한 들판', '초원 지대'],
  forest: ['울창한 숲', '숲 그늘', '나무가 우거진 땅'],
  desert: ['메마른 사막 언저리', '모래바람이 부는 땅'],
  mountain: ['산자락', '험준한 고지대', '바위투성이 산기슭'],
  tundra: ['얼어붙은 툰드라', '눈 덮인 황무지'],
  swamp: ['축축한 늪지', '안개 낀 습지'],
};
for (const [biome, phrases] of Object.entries(FOUNDING_TERRAIN_PHRASES)) {
  TextGen.register('founding.terrain.' + biome, phrases);
}
TextGen.register('founding.verb', ['부족을 이루고 정착했다', '터전을 잡았다', '깃발을 꽂았다', '첫 마을을 세웠다']);

function foundingEvent(rng, faction) {
  const biome = FOUNDING_TERRAIN_PHRASES[faction.originBiome] ? faction.originBiome : 'plains';
  const terrainPhrase = TextGen.generate('founding.terrain.' + biome, rng);
  const verb = TextGen.generate('founding.verb', rng);
  return `${faction.name}이(가) ${terrainPhrase}에 ${verb}.`;
}

TextGen.register('faction.expansion', [
  '{f}이(가) 주변 땅으로 세력을 넓혔다.',
  '{f}의 백성들이 새 땅에 정착지를 늘렸다.',
  '{f}이(가) 국경을 확장했다.',
  '{f}의 영향력이 인근 지역까지 뻗어나갔다.',
  '{f}의 개척민들이 변경에 새 마을을 세웠다.',
  '{f}이(가) 무주공산이던 땅에 깃발을 꽂았다.',
  '{f}의 영토가 한층 더 넓어졌다.',
]);
function expansionEvent(rng, faction) {
  return TextGen.generate('faction.expansion', rng, { f: faction.name });
}

TextGen.register('faction.population_milestone', [
  '{f}의 인구가 {n}명을 넘어섰다.',
  '{f}에서 풍년이 들어 인구가 {n}명까지 늘어났다.',
  '{f}의 정착지가 번성하며 인구 {n}명을 기록했다.',
  '{f}에 이주민이 몰려들어 인구 {n}명을 넘겼다.',
  '{f}의 살림이 넉넉해지며 인구가 {n}명까지 불어났다.',
]);
function populationMilestoneEvent(rng, faction) {
  return TextGen.generate('faction.population_milestone', rng, {
    f: faction.name,
    n: Math.floor(faction.population).toLocaleString('ko-KR'),
  });
}

TextGen.register('faction.decline', [
  '{f}에 흉작이 들어 인구가 줄어들었다.',
  '{f}을(를) 역병이 휩쓸어 백성들이 스러졌다.',
  '{f}에 오랜 가뭄이 들어 살림이 어려워졌다.',
  '{f}에서 유행병이 돌아 민심이 흉흉해졌다.',
  '{f}의 흉년으로 백성들이 뿔뿔이 흩어졌다.',
]);
function declineEvent(rng, faction) {
  return TextGen.generate('faction.decline', rng, { f: faction.name });
}

TextGen.register('faction.contact', [
  '{a}와(과) {b}이(가) 처음으로 국경을 맞대게 되었다.',
  '{a}의 정찰대가 {b}의 영역을 발견했다.',
  '{a}와(과) {b} 사이에 첫 접촉이 이루어졌다.',
  '{a}의 상인들이 {b}의 영토에 처음 발을 들였다.',
  '{a}와(과) {b}이(가) 서로의 존재를 처음으로 인지했다.',
]);
function contactEvent(rng, factionA, factionB) {
  return TextGen.generate('faction.contact', rng, { a: factionA.name, b: factionB.name });
}

// ── 외교 사건 (설계문서 7.5 우호도 시스템) ───────────────────────
TextGen.register('diplomacy.incident_cause', [
  '국경 지대에서의 사소한 마찰',
  '사신의 결례',
  '통상로를 둘러싼 다툼',
  '어부들 간의 시비',
  '영역을 오인한 순찰',
  '축제 중 벌어진 사소한 다툼',
  '통역 과정의 오해',
  '가축 방목권을 둘러싼 언쟁',
]);
TextGen.register('diplomacy.incident_smoothed', [
  '{a}와(과) {b} 사이에 {cause}이(가) 있었으나, 그동안 쌓아온 관계 덕에 조용히 넘어갔다.',
  '{cause}(으)로 {a}와(과) {b}의 관계가 잠시 서먹해졌지만 곧 회복되었다.',
  '{cause}이(가) 있었지만 양측 사신의 중재로 원만히 해결되었다.',
]);
TextGen.register('diplomacy.incident_escalated', [
  '{cause}을(를) 빌미로 {a}이(가) {b}에 강하게 항의하며 양측 관계가 급격히 얼어붙었다.',
  '{cause}이(가) 오래된 앙금에 불을 지피며 {a}와(과) {b}의 관계가 파국으로 치달았다.',
  '{cause}을(를) 계기로 {a}와(과) {b} 사이에 험악한 말이 오갔다.',
]);
TextGen.register('diplomacy.anomalous_betrayal', [
  '뚜렷한 이유 없이 {a}의 지도층이 {b}에 대한 태도를 돌연 바꾸었다.',
  '누구도 예상 못한 사이 {a}와(과) {b}의 관계가 하루아침에 틀어졌다.',
  '{a} 내부의 알 수 없는 사정으로 {b}를 향한 태도가 급변했다.',
]);
TextGen.register('diplomacy.facade_betrayal', [
  '공동의 적이 사라지자, {a}와(과) {b} 사이에 억눌려 있던 반목이 그대로 드러났다.',
  '그동안 겉으로만 우호적이었던 {a}와(과) {b}의 관계가 마침내 파탄에 이르렀다.',
  '더 이상 함께할 이유가 사라진 {a}와(과) {b}는 서로에 대한 오랜 불신을 감추지 않게 되었다.',
]);

function minorIncidentEvent(rng, factionA, factionB, outcome) {
  const cause = TextGen.generate('diplomacy.incident_cause', rng);
  const key = outcome === 'smoothed' ? 'diplomacy.incident_smoothed' : 'diplomacy.incident_escalated';
  return TextGen.generate(key, rng, { a: factionA.name, b: factionB.name, cause });
}

function anomalousBetrayalEvent(rng, factionA, factionB) {
  return TextGen.generate('diplomacy.anomalous_betrayal', rng, { a: factionA.name, b: factionB.name });
}

function facadeBetrayalEvent(rng, factionA, factionB) {
  return TextGen.generate('diplomacy.facade_betrayal', rng, { a: factionA.name, b: factionB.name });
}

window.Events = {
  foundingEvent,
  expansionEvent,
  populationMilestoneEvent,
  declineEvent,
  contactEvent,
  minorIncidentEvent,
  anomalousBetrayalEvent,
  facadeBetrayalEvent,
};
