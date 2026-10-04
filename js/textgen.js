// ── TextGenerator 인터페이스 (설계문서 9절) ───────────────────────────
// 지금까지는 각 파일(events.js, persons.js, war.js ...)이 각자
// "배열에서 하나 뽑고 {placeholder}를 채운다"는 로직을 개별적으로
// 손으로 짜서 흩어놓고 있었다. 이 파일은 그 로직을 하나의 인터페이스
// 뒤로 모아, 나중에 절차적 생성(TemplateTextGenerator) 대신 실제
// AI 호출로 문장을 만드는 AITextGenerator를 통째로 바꿔 끼울 수
// 있게 한다 — 두 구현 모두 같은 시그니처 generate(key, rng, params)
// 를 따르기만 하면 된다.
//
// 각 도메인 파일(전쟁, 인물, 경제 …)은 자기 template 배열의 소유권은
// 그대로 유지한 채, register()로 이 공용 생성기에 등록만 하고
// generate()를 호출해서 문장을 얻는다. 데이터(어떤 문구가 있는지)는
// 도메인 파일에 남고, "무작위로 하나 골라 빈칸을 채운다"는 절차만
// 이 파일로 모인 것.

/** {key} 형태의 자리표시자를 params 객체 값으로 전부 치환한다 (반복 등장도 한 번에 처리) */
function fillTemplate(template, params) {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(params, key) ? params[key] : match
  );
}

/**
 * TextGenerator 인터페이스: 이 시그니처를 따르는 어떤 객체든
 * window.TextGen 자리에 대신 꽂아 넣을 수 있다.
 *   generate(key: string, rng: () => number, params?: object): string
 */
class TemplateTextGenerator {
  constructor() {
    this.pools = {}; // key -> string[] (자리표시자를 포함할 수 있는 템플릿 문자열들)
  }

  /** 도메인 파일이 자신의 템플릿 풀을 등록한다. 같은 key로 다시 부르면 풀을 합친다 */
  register(key, templates) {
    this.pools[key] = (this.pools[key] || []).concat(templates);
  }

  /** 등록되지 않았던 key를 통째로 새로 지정(덮어쓰기)할 때 사용 */
  set(key, templates) {
    this.pools[key] = templates;
  }

  generate(key, rng, params = {}) {
    const pool = this.pools[key];
    if (!pool || pool.length === 0) {
      throw new Error(`TextGenerator: "${key}" 템플릿 풀이 비어있거나 등록되지 않았습니다.`);
    }
    const template = RNG.pick(rng, pool);
    return fillTemplate(template, params);
  }

  /**
   * 세계 상태(다른 도메인의 값 등)에 따라 후보마다 가중치를 다르게 줘서 고른다.
   * weightedEntries: [{ value: '템플릿 문자열', weight: number }, ...]
   * 이 메서드 덕분에 "전쟁 원인"처럼 종교/경제 상태를 실제로 참조해
   * 그럴듯한 쪽이 더 잘 뽑히게(7.1a 도메인 교차결합) 만들 수 있다.
   */
  generateWeighted(key, rng, weightedEntries, params = {}) {
    if (!weightedEntries || weightedEntries.length === 0) {
      return this.generate(key, rng, params);
    }
    const template = RNG.weightedPick(rng, weightedEntries);
    return fillTemplate(template, params);
  }
}

window.TextGen = new TemplateTextGenerator();
window.TemplateTextGenerator = TemplateTextGenerator; // 참고/테스트용으로 클래스 자체도 노출
window.fillTemplate = fillTemplate;
