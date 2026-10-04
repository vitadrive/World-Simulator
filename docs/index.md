# ARCHITECTURE — 코드 구조 가이드

최종 갱신: 2026-10-04 (기준: 저장소 `index.html` 및 js 파일 전체)

## 1. 기본 원칙

- 바닐라 JS, 번들러 없음. 각 파일은 끝에서 `window.<Namespace> = {...}` 로 공개한다. ES module 아님.
- **같은 시드 → 같은 결과**. 시뮬레이션 안에서 `Math.random`을 쓰지 않는다 (시드 자동 생성 시에만 `Date.now`/`Math.random` 사용).
- 문장 생성은 전부 `TextGen`(textgen.js)을 거친다. 데이터(문구 목록)는 각 도메인 파일에 두고 `TextGen.register(key, [...])`로 등록한다.
- 1틱 = 1년.

## 2. 스크립트 로딩 순서 (index.html)

순서가 깨지면 로드 시점에 오류가 난다. 아래는 **로드 시점**에 다른 모듈을 쓰는 경우다.

| 순서 | 파일 | 로드 시점 의존 |
|---|---|---|
| 1 | rng.js | 없음 |
| 2 | textgen.js | RNG (호출 시점) |
| 3 | terrain.js | RNG |
| 4 | names.js | RNG |
| 5 | emblems.js | RNG |
| 6 | scripts.js | **Names.CULTURE_PHONEMES** (로드 시 음소 수집) |
| 7 | events.js | **TextGen.register** |
| 8 | persons.js | TextGen.register |
| 9 | relations.js | RNG |
| 10 | economy.js | TextGen.register |
| 11 | paradigms.js | TextGen.register |
| 12 | world.js | TextGen.register |
| 13 | simulation.js | — |
| 14 | war.js | TextGen.register |
| 15 | subfactions.js | TextGen.register |
| 16 | disasters.js | TextGen.register |
| 17 | independents.js | TextGen.register |
| 18 | render.js, archive.js, main.js | — (main.js는 마지막에 `newWorld()` 실행) |

규칙: 새 파일이 로드 시점에 `TextGen.register`를 부르면 textgen.js 뒤에, `Names`를 읽으면 names.js 뒤에 둔다. 다른 모듈은 함수 **호출 시점**에만 쓰면 순서 무관.

## 3. 모듈 책임

| 파일 | 네임스페이스 | 책임 (설계문서 절) |
|---|---|---|
| rng.js | `RNG` | 해시, mulberry32, 서브시드 스트림, randRange/randInt/pick/weightedPick/chance (2.4) |
| textgen.js | `TextGen` | register / generate / generateWeighted (9) |
| terrain.js | `Terrain` | 값 노이즈 지형, 바이옴 (2.1) |
| names.js | `Names` | 문화권별 음소 이름·세력명 생성 |
| emblems.js | `Emblems` | 방패 문장 SVG (9) |
| scripts.js | `Scripts` | 문자 체계 풀, 글리프, 이름 표기 (9.2) |
| events.js | `Events` | 건국·확장·인구·쇠퇴·접촉·외교 사건 문구 (7) |
| persons.js | `Persons` | 인물 생성, 영향력, 계급 변동, 혼인·출산·계승, 사망 (8~8.5) |
| relations.js | `Relations` | 우호도, 공식 외교 상태, 진심/표면 (7.5) |
| economy.js | `Economy` | 자원 생산·소비·무역·기근 (10) |
| paradigms.js | `Paradigms` | 사상 풀, 배정, 영향 그래프, 전향, 소멸 (6~6.3) |
| world.js | `World` | 세계 생성, 연대기 기록, 세력 소멸, 분리독립 세력 생성 |
| simulation.js | `Simulation` | **틱 루프**, 성장·확장·인물 처리 |
| war.js | `War` | 선전포고, 전쟁 진행·종결·영토 이전 (7.3, 7.7) |
| subfactions.js | `SubFactions` | 종파·정파, 반란 (8.1) |
| disasters.js | `Disasters` | 재해, 영구 지형 변형, 회복 (2.3, 7.4) |
| independents.js | `Independents` | 위협 몬스터, 은둔 현자 (8.2) |
| render.js | `Render` | 캔버스 지도 렌더 |
| archive.js | `Archive` | 위키형 아카이브 HTML 생성 (11) |
| main.js | — | UI 연결, 관찰 모드, 아카이브 라우팅, 리플레이 |

## 4. 틱 순서 (`Simulation.tick`)

```
year += 1
Paradigms.driftInfluenceGraph
for 생존 세력:
  simulateFactionGrowth → simulateExpansion → simulatePersons
  → Paradigms.tickFactionParadigms → simulateConversions → Economy.tickEconomy
simulateDiplomacy      (쌍마다: 공식관계 갱신, 선전포고 시도, 정략혼, 무역, 이상사건, 사소한 사건)
simulateWars           (진행 중 전쟁 tickWar)
SubFactions.tickSubFactions
Disasters.tryDisaster, processRecoveries
Independents.tickThreats, tickLegendaries
recordRevisions        (20년마다 세력 스냅샷)
```

## 5. 핵심 데이터 모델

**world**: seed, seedCtx, width, height, terrain, factions[], year, chronicle[{year,text,factionId}], independents[], persons[], subFactions[], relations{affinity,stance,wasConstrained}, influenceGraph, simRng, paradigmPool{도메인:[]}, scriptPool[], wars[], warCountByPair, pendingRecoveries[], personIdSeq

**tile**: x, y, elevation, moisture, temperature, biome, deformation, manaAnomaly, ownerFactionId

**faction**: id, name, race, culture, color, emblem, capital, originBiome, territory(Set "x,y"), population, stats{capital_wealth, militarism}, classMobility, classMobilityTarget, mobilityMomentum, knownFactionIds(Set), revisions[], foundedYear, collapsedYear, alive, paradigms{politics,religion,economy,ability,diplomacy}, domainStrength{…}, politicsReligionRelation, scriptId, leaderId, resources{food,metal,mana}, resourceProduction, `_starving`, `_lastMilestone`

**person**: id, name, race, factionId, bornYear, deathYear, alive, talent{magic,combat,diplomacy,scholarship,leadership}, disposition{aggression,idealism,tradition}, originClass, currentClass(0평민~3군주), wealth, importance, isLeader, spouseId, childIds, parentIds, log

**paradigm**: id, domain, archetype, name, foundedYear, adherents(Set of factionId), status(rising|dominant|declining|extinct), extinctYear, lore

**war**: id, name, cause, sides[2], startYear, endYear, status(ongoing|ended), score{id:number}, importance, courseLogged

**subFaction**: id, parentId, domain, paradigmId, name, loyalty, sizeShare, active, formedYear

**independents[]**: `monster`{power, alive, slainYear, slainBy} / `sage`{talentField, alive, recruitedBy} / `artifact`{originParadigmId, lostYear, description}

## 6. RNG 스트림

`world.seedCtx.stream(label)`로 라벨별 독립 스트림을 얻는다. 사용 중인 라벨: `world`, `terrain`, `mana-anomaly`, `faction`, `name-faction-<i>`, `emblem-<i>`, `influence-graph`, `paradigm-pool`, `paradigm-name-<domain>-<n>`, `paradigm-assign`, `assign-<domain>-<factionId>`, `assign-relation-<factionId>`, `script-pool`, `script-assign`, `script-name-<i>`, `founder-<factionId>`, `event-<factionId>`, `simulation`, `spinoff-name|emblem|relation-<id>`, `monster-<i>`, `legendary-<i>`.

틱 중의 모든 확률 판정은 `world.simRng` 하나를 공유한다. 틱 안에서 호출 순서가 바뀌면 같은 시드라도 결과가 달라지므로, 순서를 바꾸는 수정은 재현성에 영향이 있다.

## 7. 확장 방법

**새 사건 문구 추가**: 해당 도메인 파일에서 `TextGen.register('도메인.이름', [...문구])` 후 `TextGen.generate('도메인.이름', rng, {슬롯})`. 키 이름은 `도메인.대상` 형식. 슬롯은 `{name}` 형태.

**새 틱 단계 추가**: `simulation.js`의 `tick()`에 호출을 넣는다. 세력 단위면 생존 세력 루프 안, 전역이면 루프 뒤.

**새 모듈 추가**: 파일 생성 → 끝에 `window.Xxx = {...}` → `index.html`에서 의존 모듈 뒤에 `<script>` 추가 → 이 문서의 2·3절 갱신.

**새 세력 필드 추가**: `world.js`의 `spawnFactions`와 `spinOffFaction` **두 곳 모두**에 초기값을 넣는다 (한쪽만 넣으면 분리독립 세력에서 undefined).

**새 사상 도메인 추가**: `paradigms.js`의 `DOMAINS`, `ARCHETYPES`, `archetypeSuffix`, `assignFactionParadigms`의 초기 강도, `domainStrength` 표시부(main.js, archive.js)를 함께 수정.

## 8. 코드 검토에서 발견한 확인 필요 사항

실행으로 검증한 것이 아니라 코드를 읽고 발견한 것이다. 수정 전에 재현 확인을 권장.

1. **`persons.js` tryClassMobility**: `person.disposition.reformism`을 읽고 쓰지만 `randomDisposition`에는 `reformism`이 없다. `undefined + 0.06`이 `NaN`이 되어 계급 변동 때마다 NaN이 저장된다 (현재 화면에 표시되지 않아 눈에 안 띔). 또 성향 값은 0~1 범위인데 `clampDisp`는 -1~1로 자르므로 범위 규칙도 어긋나 있다 (`war.js` 전공 보너스도 같은 방식).
2. **`independents.js` 현자 방문**: `talentField`는 `Persons.TALENT_FIELDS`(magic 등)에서 뽑는데 방문 문구 키와 도메인 보너스는 `arcane`을 기준으로 한다. 따라서 `magic` 현자는 학문 문구로 대체되고 이능 강도 보너스가 적용되지 않는다.
3. **`relations.js` 전쟁 상태**: `declareWar`가 stance를 '전쟁'으로 설정하지만 다음 틱의 `updateStanceWithFacade`가 우호도 기준 라벨로 덮어쓴다. 현재 '전쟁' 값을 읽는 코드는 없다.
4. **`world.js` spinOffFaction**: 분리독립 세력은 `scriptId`를 물려받지만 `script.adherentFactionIds`에 추가되지 않아 개요의 "사용 세력 N곳" 수가 어긋난다.
5. **중복 유틸**: 무작위 표본 추출 함수가 `sampleArray`(simulation, economy), `sampleUnique`(paradigms), `sampleN`(war), `pickTerritoryShare`(subfactions)로 5곳에 중복. `RNG`로 통합 후보.
6. **`paradigms.js` manaAnomalyModifier**: 영토 앞 40칸을 고정 표본으로 쓰므로 세력의 이능 보정이 영토 일부에 편중된다 (다른 곳은 무작위 표본).
