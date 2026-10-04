// ── 아카이브(위키) 뷰 (설계문서 11절의 v0.1 축소 구현) ────────────────
// 이번 패스 범위: 개요 / 세력 목록·상세 / 인물 목록·상세 / 전체 연대기.
// 리비전 히스토리(11.1의 지도 스냅샷)는 아직 구현하지 않음 — 지금은
// 최종 시점의 정보만 보여준다. 가족관계 트리도 다음 패스로 남겨둔다.
// 인물/세력 이름은 클릭 가능한 링크로 상호 연결한다.

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function personLink(id, label) {
  return `<a href="#" class="arc-link" data-nav="person:${id}">${esc(label)}</a>`;
}
function factionLink(id, label) {
  return `<a href="#" class="arc-link" data-nav="faction:${id}">${esc(label)}</a>`;
}
function factionClipLink(id, label) {
  return `<a href="#" class="arc-link" data-nav="faction-clip:${id}">${esc(label)}</a>`;
}

/** 특정 세력이 존재했던 기간(탄생~소멸)의 연대기만 잘라서 보여준다 */
function renderFactionClip(world, factionId) {
  const f = world.factions.find((x) => x.id === factionId);
  if (!f) return `<p>세력을 찾을 수 없습니다.</p>`;
  const start = f.foundedYear ?? 0;
  const end = f.collapsedYear ?? world.year;
  const entries = world.chronicle.filter(
    (e) => e.year >= start && e.year <= end && (e.factionId === f.id || e.text.includes(f.name))
  );
  const lines =
    entries.map((e) => `<div class="chronicle-entry"><span class="year">${e.year}년</span> ${e.text}</div>`).join('') ||
    '<p class="arc-dim">이 기간 동안 남은 기록이 없다.</p>';

  return `
    <p>${factionLink(f.id, '← 세력 상세로 돌아가기')}</p>
    <h3>${esc(f.name)} — 흥망사</h3>
    <p class="arc-sub">${start}년 ~ ${f.alive ? `${end}년(현재)` : `${end}년(소멸)`} · 총 ${entries.length}건의 기록</p>
    ${lines}
  `;
}

function renderOverview(world) {
  const aliveFactions = world.factions.filter((f) => f.alive);
  const totalWars = (world.wars || []).length;
  const totalPersons = world.persons.length;
  const extinctParadigms = Object.values(world.paradigmPool)
    .flat()
    .filter((p) => p.status === 'extinct').length;

  return `
    <h3>세계 「${esc(world.seed)}」</h3>
    <p class="arc-sub">가로 ${world.width} × 세로 ${world.height} 타일 · ${world.year.toLocaleString('ko-KR')}년 경과</p>
    <div class="arc-stat-grid">
      <div class="arc-stat"><b>${aliveFactions.length}</b><span>현존 세력</span></div>
      <div class="arc-stat"><b>${totalWars}</b><span>전쟁 발발</span></div>
      <div class="arc-stat"><b>${totalPersons}</b><span>기록된 인물</span></div>
      <div class="arc-stat"><b>${world.independents.length}</b><span>전해지는 유물</span></div>
      <div class="arc-stat"><b>${extinctParadigms}</b><span>소멸한 사상</span></div>
    </div>
    <h4>문자 체계</h4>
    ${renderScriptListInline(world)}
    <h4>이능 사전</h4>
    ${renderAbilityCompendiumInline(world)}
    <h4>기물 사전</h4>
    ${renderArtifactCompendiumInline(world)}
    <h4>세력 목록</h4>
    ${renderFactionListInline(world)}
  `;
}

function renderAbilityCompendiumInline(world) {
  const abilities = (world.paradigmPool.ability || []);
  if (abilities.length === 0) return '<p class="arc-dim">이 세계에는 알려진 이능 계통이 없다.</p>';
  const rows = abilities
    .map((p) => {
      const statusNote = p.status === 'extinct' ? ` <span class="arc-dim">(${p.extinctYear}년 소멸 — 로스트 테크놀로지)</span>` : ` · 신봉 세력 ${p.adherents.size}곳`;
      return `<li><b>${esc(p.name)}</b>${statusNote}<br><span class="arc-sub">${esc(p.lore || '')}</span></li>`;
    })
    .join('');
  return `<ul class="arc-list">${rows}</ul>`;
}

function renderArtifactCompendiumInline(world) {
  const artifacts = (world.independents || []).filter((i) => i.type === 'artifact');
  if (artifacts.length === 0) return '<p class="arc-dim">아직 전해지는 유물이 없다.</p>';
  const rows = artifacts
    .map((a) => `<li><b>${esc(a.name)}</b> <span class="arc-dim">(${a.lostYear}년 실전)</span><br><span class="arc-sub">${esc(a.description)}</span></li>`)
    .join('');
  return `<ul class="arc-list">${rows}</ul>`;
}

function renderScriptListInline(world) {
  const rows = (world.scriptPool || [])
    .map((s) => {
      const sample = Scripts.renderInscription(world, s.id, s.name.replace(' 문자', ''));
      return `<li><b>${esc(s.name)}</b> (${Scripts.SCRIPT_KIND_LABEL[s.kind]}) · 사용 세력 ${s.adherentFactionIds.size}곳 <span class="arc-inscription" style="display:inline-flex">${sample}</span></li>`;
    })
    .join('');
  return `<ul class="arc-list">${rows || '<li class="arc-dim">없음</li>'}</ul>`;
}

function renderSubFactionsInline(world, faction) {
  const subs = (world.subFactions || []).filter((s) => s.parentId === faction.id);
  if (subs.length === 0) return '<p class="arc-dim">알려진 하위세력이 없다.</p>';
  const rows = subs
    .map((s) => `<li>${esc(s.name)} — 충성도 ${s.loyalty.toFixed(0)} ${s.active ? '' : '<span class="arc-dim">(해소됨)</span>'}</li>`)
    .join('');
  return `<ul class="arc-list">${rows}</ul>`;
}

function renderFactionListInline(world) {
  const sorted = [...world.factions].sort((a, b) => b.population - a.population);
  return `<ul class="arc-list">${sorted
    .map(
      (f) =>
        `<li><span class="swatch" style="background:${f.color}"></span> ${factionLink(f.id, f.name)} <span class="arc-dim">— 인구 ${Math.floor(f.population).toLocaleString('ko-KR')}, 영토 ${f.territory.size}</span></li>`
    )
    .join('')}</ul>`;
}

function renderPersonListInline(world, limit) {
  const alive = world.persons
    .map((p) => ({ p, influence: Persons.computeInfluence(p) }))
    .sort((a, b) => b.influence - a.influence)
    .slice(0, limit || 30);
  return `<ul class="arc-list">${alive
    .map(({ p }) => {
      const f = world.factions.find((ff) => ff.id === p.factionId);
      const status = p.alive ? '' : ' <span class="arc-dim">(고인)</span>';
      return `<li>${personLink(p.id, p.name)} <span class="arc-dim">— ${Persons.CLASS_LABELS[p.currentClass]}${f ? ', ' + esc(f.name) : ''}</span>${status}</li>`;
    })
    .join('')}</ul>`;
}

function renderFactionDetail(world, factionId) {
  const f = world.factions.find((x) => x.id === factionId);
  if (!f) return `<p>세력을 찾을 수 없습니다.</p>`;

  const politics = Paradigms.findParadigm(world, f.paradigms.politics);
  const religion = Paradigms.findParadigm(world, f.paradigms.religion);
  const economy = Paradigms.findParadigm(world, f.paradigms.economy);
  const ability = f.paradigms.ability ? Paradigms.findParadigm(world, f.paradigms.ability) : null;
  const diplomacy = Paradigms.findParadigm(world, f.paradigms.diplomacy);
  const scriptEl = Scripts.findScript(world, f.scriptId);

  const leader = world.persons.find((p) => p.id === f.leaderId);
  const members = world.persons.filter((p) => p.factionId === f.id).sort((a, b) => Persons.computeInfluence(b) - Persons.computeInfluence(a));

  const relatedWars = (world.wars || []).filter((w) => w.sides.includes(f.id));
  const relatedChronicle = world.chronicle.filter((e) => e.factionId === f.id);

  return `
    <h3><span class="emblem-large">${f.emblem ? f.emblem.svg : ''}</span> ${esc(f.name)}</h3>
    <p class="arc-sub">${factionClipLink(f.id, '📜 이 세력의 흥망사만 잘라서 보기')}</p>
    <p class="arc-inscription">${Scripts.renderInscription(world, f.scriptId, f.name)}</p>
    <p class="arc-sub">${esc(f.race)} · 원류지: ${esc(f.originBiome)} · 인구 ${Math.floor(f.population).toLocaleString('ko-KR')} · 영토 ${f.territory.size}칸</p>
    <p class="arc-sub">사용 문자: ${scriptEl ? `${esc(scriptEl.name)} (${Scripts.SCRIPT_KIND_LABEL[scriptEl.kind]})` : '없음'}</p>
    <p>지도자: ${leader ? personLink(leader.id, leader.name) : '없음'}</p>
    <h4>사상</h4>
    <ul class="arc-list">
      <li>정치: ${politics ? esc(politics.name) : '-'} (관계: ${esc(f.politicsReligionRelation)})</li>
      <li>종교: ${religion ? esc(religion.name) : '-'}</li>
      <li>경제: ${economy ? esc(economy.name) : '-'}</li>
      <li>이능: ${ability ? `${esc(ability.name)} — <span class="arc-dim">${esc(ability.lore || '')}</span>` : '없음'}</li>
      <li>외교: ${diplomacy ? esc(diplomacy.name) : '-'}</li>
    </ul>
    <h4>도메인 강도</h4>
    <ul class="arc-list">
      <li>정치 ${f.domainStrength.politics.toFixed(0)} / 종교 ${f.domainStrength.religion.toFixed(0)} / 경제 ${f.domainStrength.economy.toFixed(0)} / 이능 ${f.domainStrength.ability.toFixed(0)} / 외교 ${f.domainStrength.diplomacy.toFixed(0)}</li>
      <li>계급 유동성 ${f.classMobility.toFixed(0)}</li>
    </ul>
    <h4>자원 (10절)</h4>
    <ul class="arc-list">
      <li>식량 ${(f.resources?.food ?? 0).toFixed(0)} (생산 ${(f.resourceProduction?.food ?? 0).toFixed(1)}/년)</li>
      <li>금속 ${(f.resources?.metal ?? 0).toFixed(0)} (생산 ${(f.resourceProduction?.metal ?? 0).toFixed(1)}/년)</li>
      <li>마나자원 ${(f.resources?.mana ?? 0).toFixed(0)} (생산 ${(f.resourceProduction?.mana ?? 0).toFixed(1)}/년)</li>
    </ul>
    <h4>영토·인구 변화 (${(f.revisions || []).length}개 기록)</h4>
    <ul class="arc-list">${(f.revisions || [])
      .map((r) => `<li>${r.year}년 — 영토 ${r.territorySize}칸, 인구 ${r.population.toLocaleString('ko-KR')}명</li>`)
      .join('') || '<li class="arc-dim">기록 없음</li>'}</ul>
    <h4>하위세력</h4>
    ${renderSubFactionsInline(world, f)}
    <h4>구성원 (${members.length}명)</h4>
    ${renderPersonListInlineFor(members)}
    <h4>전쟁 이력 (${relatedWars.length}건)</h4>
    <ul class="arc-list">${relatedWars.map((w) => `<li>${esc(w.name)} (${w.startYear}~${w.endYear ?? '진행 중'})</li>`).join('') || '<li class="arc-dim">없음</li>'}</ul>
    <h4>관련 연대기 (${relatedChronicle.length}건)</h4>
    ${renderTimelineList(relatedChronicle.slice(-40))}
  `;
}

function renderPersonListInlineFor(members) {
  return `<ul class="arc-list">${members
    .slice(0, 20)
    .map((p) => `<li>${personLink(p.id, p.name)} <span class="arc-dim">— ${Persons.CLASS_LABELS[p.currentClass]}${p.isLeader ? ' · 지도자' : ''}${p.alive ? '' : ' (고인)'}</span></li>`)
    .join('')}</ul>`;
}

function renderPersonDetail(world, personId) {
  const p = world.persons.find((x) => x.id === personId);
  if (!p) return `<p>인물을 찾을 수 없습니다.</p>`;
  const f = world.factions.find((x) => x.id === p.factionId);
  const bornNote = p.bornYear < 0 ? '(기록 이전 출생)' : `${p.bornYear}년생`;
  const lifeStatusShort = p.alive
    ? `현재 ${world.year - p.bornYear}세로 생존해 있다.`
    : `${p.deathYear}년, ${p.deathYear - p.bornYear}세의 나이로 생을 마감했다.`;

  // 8절: 중요도가 낮은 인물은 한두 줄로만 간략히 기록 (배경 인물)
  if (p.importance < 5) {
    const parent = (p.parentIds || []).map((id) => world.persons.find((x) => x.id === id)).filter(Boolean)[0];
    const lineage = parent ? `${personLink(parent.id, parent.name)}의 자녀` : `이름 없는 ${esc(p.race)} 가문 출신`;
    return `
      <h3>${esc(p.name)}</h3>
      <p class="arc-sub">${esc(p.race)} · ${bornNote} · 소속: ${f ? factionLink(f.id, f.name) : '무소속'}</p>
      <p class="arc-dim">${lineage}, ${esc(Persons.CLASS_LABELS[p.currentClass])}(으)로 ${p.alive ? '살아가고 있다' : `${p.deathYear}년 생을 마감했다`}. 기록으로 남을 만한 특별한 행적은 전해지지 않는다.</p>
    `;
  }

  const top = Persons.dominantTalent(p);

  const talentList = Persons.TALENT_FIELDS.map(
    (k) => `<li>${Persons.TALENT_LABELS[k]}: ${(p.talent[k] * 100).toFixed(0)}</li>`
  ).join('');

  const disp = p.disposition;
  const dispText = `호전성 ${(disp.aggression * 100).toFixed(0)} · 이상주의 ${(disp.idealism * 100).toFixed(0)} · 보수성 ${(disp.tradition * 100).toFixed(0)}`;

  const lifeStatus = lifeStatusShort;

  const spouse = p.spouseId ? world.persons.find((x) => x.id === p.spouseId) : null;
  const children = (p.childIds || []).map((id) => world.persons.find((x) => x.id === id)).filter(Boolean);
  const parents = (p.parentIds || []).map((id) => world.persons.find((x) => x.id === id)).filter(Boolean);

  const familyLines = [];
  if (parents.length > 0) familyLines.push(`<li>부모: ${parents.map((x) => personLink(x.id, x.name)).join(', ')}</li>`);
  if (spouse) familyLines.push(`<li>배우자: ${personLink(spouse.id, spouse.name)}</li>`);
  if (children.length > 0) familyLines.push(`<li>자녀: ${children.map((x) => personLink(x.id, x.name)).join(', ')}</li>`);
  const familySection = familyLines.length > 0 ? `<h4>가족관계</h4><ul class="arc-list">${familyLines.join('')}</ul>` : '';

  // 중요도가 중간 수준이면 재능/성향은 요약 한 줄로만, 아주 높으면(15+) 전체 상세
  const detailed = p.importance >= 15;
  const talentSection = detailed
    ? `<h4>재능 (주력: ${Persons.TALENT_LABELS[top]})</h4><ul class="arc-list">${talentList}</ul><h4>성향</h4><p class="arc-sub">${dispText}</p>`
    : `<p class="arc-sub">주된 재능: ${Persons.TALENT_LABELS[top]} · 성향: ${dispText}</p>`;

  return `
    <h3>${esc(p.name)}</h3>
    <p class="arc-inscription">${f ? Scripts.renderInscription(world, f.scriptId, p.name) : ''}</p>
    <p class="arc-sub">${esc(p.race)} · ${bornNote} · 소속: ${f ? factionLink(f.id, f.name) : '무소속'}</p>
    <p>${esc(Persons.CLASS_LABELS[p.currentClass])}${p.originClass !== p.currentClass ? ` (출신: ${esc(Persons.CLASS_LABELS[p.originClass])})` : ''}${p.isLeader ? ' · 지도자' : ''}</p>
    <p>${lifeStatus}</p>
    ${familySection}
    ${talentSection}
    <h4>영향력 지표</h4>
    <p class="arc-sub">${Persons.computeInfluence(p).toFixed(1)} (재산 ${p.wealth.toFixed(0)}, 업적치 ${p.importance})</p>
  `;
}

function renderTimelineList(entries) {
  return `<ul class="arc-timeline">${entries
    .map((e) => `<li><span class="year">${e.year}년</span> ${esc(e.text)}</li>`)
    .join('')}</ul>`;
}

function renderTimeline(world) {
  return `<h3>전체 연대기</h3>${renderTimelineList(world.chronicle)}`;
}

window.Archive = {
  renderOverview,
  renderFactionListInline,
  renderPersonListInline,
  renderFactionDetail,
  renderPersonDetail,
  renderTimeline,
  renderFactionClip,
};
