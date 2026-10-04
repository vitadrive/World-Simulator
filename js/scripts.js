// ── 문자 체계 (설계문서 9.2) ────────────────────────────────────────
// 표음문자: 이름 생성기(names.js)가 실제로 쓰는 모든 음절 조각(onset/
// vowel/coda)을 하나의 "공통 음소 목록"으로 모아, 그 각각에 고유
// 글리프를 절차 생성해 매핑한다. 이러면 어떤 세력 이름이든 완벽하게
// (미매핑 없이) 해당 문자로 "표기"할 수 있다.
// 표의/상형문자: 임의 생성된 이름을 의미 단위로 분해할 방법이 없으므로
// (개념-이름 매핑 자체가 존재하지 않음), 이번 패스에서는 "그 문자 특유의
// 장식적 기록"만 보여준다 — 실제 이름을 뜻으로 옮기는 것은 범위 밖.
// 이 한계는 로스트 테크놀로지처럼 "해독 여부"가 있는 편이 오히려
// 그럴듯하므로 의도적으로 남겨둔다.

const SCRIPT_KINDS = ['phonetic', 'ideographic', 'pictographic'];
const SCRIPT_KIND_LABEL = { phonetic: '표음문자', ideographic: '표의문자', pictographic: '상형문자' };

const CONCEPTS = ['왕', '전쟁', '신', '물', '불', '산', '하늘', '죽음', '삶', '금', '이능', '나무', '달', '해', '피', '돌'];

/** names.js의 모든 문화권 onset/vowel/coda를 모아 중복 없는 음소 토큰 집합을 만든다 */
function collectPhonemeTokens() {
  const set = new Set();
  for (const culture of Object.values(Names.CULTURE_PHONEMES)) {
    for (const group of [culture.onsets, culture.vowels, culture.codas]) {
      for (const tok of group) {
        if (tok) set.add(tok);
      }
    }
  }
  return Array.from(set).sort((a, b) => b.length - a.length); // 긴 토큰부터 매칭되도록 정렬
}

const PHONEME_TOKENS = collectPhonemeTokens();

/** 문자열 하나를 정해진 토큰 집합으로 그리디하게 분해한다 (매칭 안 되면 글자 단위로 쪼갬) */
function tokenize(name) {
  const s = name.toLowerCase();
  const out = [];
  let i = 0;
  outer: while (i < s.length) {
    for (const tok of PHONEME_TOKENS) {
      if (s.startsWith(tok, i) && tok.length > 0) {
        out.push(tok);
        i += tok.length;
        continue outer;
      }
    }
    out.push(s[i]); // 매칭 실패 시 글자 하나만 폴백 토큰으로
    i += 1;
  }
  return out;
}

const STROKE_KINDS = ['line', 'diag', 'arc', 'dot', 'cross', 'hook'];

/** 토큰 하나 + 문자 스타일 시드로부터 고유하고 결정론적인 글리프를 생성한다 */
function glyphFor(token, styleSeed, kind) {
  const rng = RNG.mulberry32(RNG.hashStringToInt(styleSeed + '::' + token));
  const strokeCount = kind === 'pictographic' ? RNG.randInt(rng, 3, 5) : RNG.randInt(rng, 2, 4);
  const parts = [];
  for (let i = 0; i < strokeCount; i++) {
    const stroke = RNG.pick(rng, STROKE_KINDS);
    const x1 = RNG.randInt(rng, 3, 17), y1 = RNG.randInt(rng, 3, 17);
    const x2 = RNG.randInt(rng, 3, 17), y2 = RNG.randInt(rng, 3, 17);
    if (stroke === 'line' || stroke === 'diag') {
      parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`);
    } else if (stroke === 'arc') {
      const r = RNG.randInt(rng, 3, 8);
      parts.push(`<path d="M${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2}" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>`);
    } else if (stroke === 'dot') {
      parts.push(`<circle cx="${x1}" cy="${y1}" r="1.4" fill="currentColor"/>`);
    } else if (stroke === 'cross') {
      parts.push(`<line x1="${x1 - 3}" y1="${y1}" x2="${x1 + 3}" y2="${y1}" stroke="currentColor" stroke-width="1.4"/><line x1="${x1}" y1="${y1 - 3}" x2="${x1}" y2="${y1 + 3}" stroke="currentColor" stroke-width="1.4"/>`);
    } else if (stroke === 'hook') {
      parts.push(`<path d="M${x1} ${y1} L${x1} ${y2} Q${x1} ${y2} ${x2} ${y2}" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>`);
    }
  }
  return `<svg class="glyph" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
}

/** 세계 생성 시 문자 체계 풀을 만든다 (Paradigm 풀과 유사한 방식) */
function generateScriptPool(rng, ctx, world) {
  const poolSize = RNG.randInt(rng, 2, 4);
  const scripts = [];
  for (let i = 0; i < poolSize; i++) {
    const nameRng = ctx.stream('script-name-' + i);
    const culture = RNG.pick(nameRng, Object.keys(Names.CULTURE_PHONEMES));
    const properName = Names.generateName(nameRng, culture, RNG.randInt(nameRng, 2, 3));
    const kind = RNG.pick(nameRng, SCRIPT_KINDS);
    scripts.push({
      id: 'script-' + i,
      name: `${properName} 문자`,
      kind,
      styleSeed: world.seed + '::script::' + i,
      adherentFactionIds: new Set(),
    });
  }
  world.scriptPool = scripts;
  return scripts;
}

function findScript(world, scriptId) {
  return (world.scriptPool || []).find((s) => s.id === scriptId) || null;
}

/** 세력에 문자 체계를 배정한다 */
function assignFactionScript(rng, world, faction) {
  const script = RNG.pick(rng, world.scriptPool);
  script.adherentFactionIds.add(faction.id);
  faction.scriptId = script.id;
}

/** 이름을 해당 문자 체계로 "표기"한 SVG 문자열을 만든다 */
function renderInscription(world, scriptId, name) {
  const script = findScript(world, scriptId);
  if (!script) return '';

  if (script.kind === 'phonetic') {
    const tokens = tokenize(name);
    return tokens.map((tok) => glyphFor(tok, script.styleSeed, script.kind)).join('');
  }

  // 표의/상형문자: 실제 의미 대응이 없으므로, 이름 길이에 비례한 "장식적 기록"만 생성
  // (해당 문자가 실존했다는 분위기용 — 이 이름을 그대로 옮긴 표기는 아님)
  const decorRng = RNG.mulberry32(RNG.hashStringToInt(script.styleSeed + '::' + name));
  const count = RNG.randInt(decorRng, 2, 4);
  const glyphs = [];
  for (let i = 0; i < count; i++) {
    const concept = RNG.pick(decorRng, CONCEPTS);
    glyphs.push(glyphFor(concept, script.styleSeed, script.kind));
  }
  return glyphs.join('');
}

window.Scripts = {
  SCRIPT_KINDS,
  SCRIPT_KIND_LABEL,
  CONCEPTS,
  generateScriptPool,
  findScript,
  assignFactionScript,
  renderInscription,
  tokenize,
  PHONEME_TOKENS,
};
