// ── 메인 UI 와이어링 (v0.1) ──────────────────────────────────────

// ── 전역 오류 핸들러 ──────────────────────────────────────────────
// 스크립트 오류로 버튼이 반응하지 않는 상황을 화면에서 바로 알 수 있도록,
// 콘솔을 열 수 없는 환경(태블릿 등)에서도 오류 내용을 배너로 보여준다.
const errorBannerEl = document.getElementById('error-banner');
window.addEventListener('error', (ev) => {
  showErrorBanner(`스크립트 오류: ${ev.message} (${ev.filename ? ev.filename.split('/').pop() : ''}:${ev.lineno})`);
});
window.addEventListener('unhandledrejection', (ev) => {
  showErrorBanner(`처리되지 않은 오류: ${ev.reason}`);
});
function showErrorBanner(msg) {
  if (!errorBannerEl) return;
  errorBannerEl.textContent = msg;
  errorBannerEl.style.display = '';
}

let world = null;
let playing = false;
let speed = 1; // 1틱 실행 당 프레임 간격 배수
let frameCounter = 0;
let tileSize = 6;

const canvas = document.getElementById('map-canvas');
const chronicleEl = document.getElementById('chronicle-list');
const factionListEl = document.getElementById('faction-list');
const yearEl = document.getElementById('year-display');
const seedInput = document.getElementById('seed-input');
const seedDisplay = document.getElementById('seed-display');
const playBtn = document.getElementById('play-btn');
const speedSelect = document.getElementById('speed-select');

function newWorld() {
  stopReplay();
  world = World.generateWorld(seedInput.value);
  worldEnded = false;
  seedDisplay.textContent = world.seed;
  yearEl.textContent = world.year;
  showSimView();
  renderAll();
}

const personListEl = document.getElementById('person-list');

function renderAll() {
  Render.renderWorld(canvas, world, tileSize);
  renderFactionList();
  renderPersonList();
  renderChronicle();
  yearEl.textContent = world.year.toLocaleString('ko-KR');
}

function renderPersonList() {
  const factionById = {};
  for (const f of world.factions) factionById[f.id] = f;

  const alive = world.persons.filter((p) => p.alive);
  const limit = viewMode === 'person' ? 30 : 12;
  const ranked = alive
    .map((p) => ({ p, influence: Persons.computeInfluence(p) }))
    .sort((a, b) => b.influence - a.influence)
    .slice(0, limit);

  personListEl.innerHTML = ranked
    .map(({ p, influence }) => {
      const f = factionById[p.factionId];
      const label = Persons.classTitle(p, f);
      const extra = viewMode === 'person' ? `<span class="pmeta">${Persons.TALENT_LABELS[Persons.dominantTalent(p)]} · 영향력 ${influence.toFixed(1)}</span>` : '';
      return `
        <div class="person-row" data-pid="${p.id}">
          <span class="swatch" style="background:${f ? f.color : '#666'}"></span>
          <span class="pname">${p.name}</span>
          <span class="pclass">${label}</span>
          <span class="pmeta">${f ? f.name : '무소속'}</span>
          ${extra}
        </div>`;
    })
    .join('');
}

function renderFactionList() {
  factionListEl.innerHTML = '';
  const sorted = [...world.factions].filter((f) => f.alive).sort((a, b) => b.population - a.population);
  for (const f of sorted) {
    const row = document.createElement('div');
    row.className = 'faction-row';
    row.dataset.fid = f.id;
    row.innerHTML = `
      <span class="emblem-thumb">${f.emblem ? f.emblem.svg : ''}</span>
      <span class="fname">${f.name}</span>
      <span class="fmeta">인구 ${Math.floor(f.population).toLocaleString('ko-KR')} · 영토 ${f.territory.size}</span>
    `;
    factionListEl.appendChild(row);
  }
}

const MAX_CHRONICLE_LINES = 300;

function renderChronicle() {
  // 성능을 위해 마지막 N줄만 표시 (전체 로그는 world.chronicle에 계속 누적됨 — 11절 아카이브의 전신)
  const recent = world.chronicle.slice(-MAX_CHRONICLE_LINES);
  chronicleEl.innerHTML = recent
    .map((e) => `<div class="chronicle-entry"><span class="year">${e.year}년</span> ${e.text}</div>`)
    .join('');
  chronicleEl.scrollTop = chronicleEl.scrollHeight;
}

function step() {
  if (worldEnded) return;
  Simulation.tick(world);
  renderAll();
}

function loop() {
  if (playing && !worldEnded) {
    frameCounter++;
    const interval = Math.max(1, Math.floor(12 / speed));
    if (frameCounter >= interval) {
      frameCounter = 0;
      step();
    }
  }
  requestAnimationFrame(loop);
}

document.getElementById('new-world-btn').addEventListener('click', newWorld);
document.getElementById('step-btn').addEventListener('click', () => {
  if (!world) newWorld();
  step();
});

playBtn.addEventListener('click', () => {
  playing = !playing;
  playBtn.textContent = playing ? '일시정지' : '재생';
  playBtn.classList.toggle('active', playing);
});

speedSelect.addEventListener('change', () => {
  speed = Number(speedSelect.value);
});

// ── 관찰 모드 전환 (설계문서 4절: 세력권 모드 ↔ 인물 모드) ────────────
let viewMode = 'faction';
const sidePanelEl = document.querySelector('.side-panel');
const inspectorEl = document.getElementById('inspector');
const modeFactionBtn = document.getElementById('mode-faction-btn');
const modePersonBtn = document.getElementById('mode-person-btn');

function setViewMode(mode) {
  viewMode = mode;
  sidePanelEl.classList.toggle('mode-person', mode === 'person');
  modeFactionBtn.classList.toggle('active', mode === 'faction');
  modePersonBtn.classList.toggle('active', mode === 'person');
  if (world) renderPersonList(); // 모드에 따라 표시 개수/정보량이 달라지므로 즉시 갱신
}
modeFactionBtn.addEventListener('click', () => setViewMode('faction'));
modePersonBtn.addEventListener('click', () => setViewMode('person'));

function escInsp(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderTileInspector(tile, faction) {
  const biomeLabel = Terrain.BIOMES[tile.biome.toUpperCase()]?.name || tile.biome;
  const deformNote = tile.deformation ? `<li>지형 변형: ${escInsp(tile.deformation.type)}</li>` : '';
  const anomalyNote = tile.manaAnomaly
    ? `<li>이능 편차: ${tile.manaAnomaly.type === 'amplify' ? '증폭' : '반발'} — ${escInsp(tile.manaAnomaly.cause)}</li>`
    : '';
  inspectorEl.innerHTML = `
    <h3>타일 (${tile.x}, ${tile.y})</h3>
    <div class="insp-sub">${biomeLabel}</div>
    <ul>
      <li>소속: ${faction ? escInsp(faction.name) : '무소속 지역'}</li>
      ${deformNote}
      ${anomalyNote}
    </ul>
  `;
}

function renderFactionInspector(f) {
  const s = f.domainStrength;
  inspectorEl.innerHTML = `
    <h3><span class="emblem-thumb" style="width:20px;height:20px;">${f.emblem ? f.emblem.svg : ''}</span> ${escInsp(f.name)}</h3>
    <div class="insp-sub">${escInsp(f.race)} · 인구 ${Math.floor(f.population).toLocaleString('ko-KR')} · 영토 ${f.territory.size}칸</div>
    <ul>
      <li>도메인 — 정치 ${s.politics.toFixed(0)} / 종교 ${s.religion.toFixed(0)} / 경제 ${s.economy.toFixed(0)} / 이능 ${s.ability.toFixed(0)} / 외교 ${s.diplomacy.toFixed(0)}</li>
      <li>계급 유동성 ${f.classMobility.toFixed(0)}</li>
      <li>자원 — 식량 ${(f.resources?.food ?? 0).toFixed(0)} · 금속 ${(f.resources?.metal ?? 0).toFixed(0)} · 마나 ${(f.resources?.mana ?? 0).toFixed(0)}</li>
    </ul>
  `;
}

function renderPersonInspector(p) {
  const f = world.factions.find((x) => x.id === p.factionId);
  const label = Persons.classTitle(p, f);
  const top = Persons.dominantTalent(p);
  const disp = p.disposition;
  inspectorEl.innerHTML = `
    <h3>${escInsp(p.name)}</h3>
    <div class="insp-sub">${escInsp(p.race)} · ${label} · 소속: ${f ? escInsp(f.name) : '무소속'}</div>
    <ul>
      <li>주된 재능: ${Persons.TALENT_LABELS[top]} (${(p.talent[top] * 100).toFixed(0)})</li>
      <li>성향 — 호전성 ${(disp.aggression * 100).toFixed(0)} · 이상주의 ${(disp.idealism * 100).toFixed(0)} · 보수성 ${(disp.tradition * 100).toFixed(0)}</li>
      <li>영향력 ${Persons.computeInfluence(p).toFixed(1)} · 재산 ${p.wealth.toFixed(0)}</li>
    </ul>
  `;
}

canvas.addEventListener('click', (ev) => {
  if (!world) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = Math.floor(((ev.clientX - rect.left) * scaleX) / tileSize);
  const y = Math.floor(((ev.clientY - rect.top) * scaleY) / tileSize);
  const tile = Simulation.tileAt(world.terrain, x, y);
  if (!tile) return;
  const faction = tile.ownerFactionId ? world.factions.find((f) => f.id === tile.ownerFactionId) : null;
  renderTileInspector(tile, faction);
});

factionListEl.addEventListener('click', (ev) => {
  const row = ev.target.closest('[data-fid]');
  if (!row || !world) return;
  const f = world.factions.find((x) => x.id === row.dataset.fid);
  if (f) renderFactionInspector(f);
});

personListEl.addEventListener('click', (ev) => {
  const row = ev.target.closest('[data-pid]');
  if (!row || !world) return;
  const p = world.persons.find((x) => x.id === row.dataset.pid);
  if (p) renderPersonInspector(p);
});

// ── 아카이브 뷰 (설계문서 11절) ───────────────────────────────────
const simViewEl = document.getElementById('sim-view');
const archiveViewEl = document.getElementById('archive-view');
const archiveContentEl = document.getElementById('archive-content');
const tabSimBtn = document.getElementById('tab-sim');
const tabArchiveBtn = document.getElementById('tab-archive');
const endWorldBtn = document.getElementById('end-world-btn');
const archiveNavBtns = document.querySelectorAll('.arc-nav-btn');

let currentArchiveRoute = 'overview';
let worldEnded = false;

function showSimView() {
  stopReplay();
  simViewEl.style.display = '';
  archiveViewEl.style.display = 'none';
  tabSimBtn.classList.add('active');
  tabArchiveBtn.classList.remove('active');
}

function showArchiveView() {
  simViewEl.style.display = 'none';
  archiveViewEl.style.display = '';
  tabSimBtn.classList.remove('active');
  tabArchiveBtn.classList.add('active');
  renderArchiveRoute();
}

function renderArchiveRoute() {
  archiveNavBtns.forEach((b) => b.classList.toggle('active', b.dataset.nav === currentArchiveRoute.split(':')[0]));

  if (currentArchiveRoute !== 'replay') stopReplay();

  if (currentArchiveRoute === 'overview') {
    archiveContentEl.innerHTML = Archive.renderOverview(world);
  } else if (currentArchiveRoute === 'timeline') {
    archiveContentEl.innerHTML = Archive.renderTimeline(world);
  } else if (currentArchiveRoute === 'replay') {
    renderReplayView();
  } else if (currentArchiveRoute.startsWith('faction-clip:')) {
    archiveContentEl.innerHTML = Archive.renderFactionClip(world, currentArchiveRoute.split(':')[1]);
  } else if (currentArchiveRoute.startsWith('faction:')) {
    archiveContentEl.innerHTML = Archive.renderFactionDetail(world, currentArchiveRoute.split(':')[1]);
  } else if (currentArchiveRoute.startsWith('person:')) {
    archiveContentEl.innerHTML = Archive.renderPersonDetail(world, currentArchiveRoute.split(':')[1]);
  }
  archiveContentEl.scrollTop = 0;
}

// ── 리플레이 (설계문서 11절: 저장된 로그를 원하는 배속으로 재생) ──────
let replayInterval = null;

function stopReplay() {
  if (replayInterval) {
    clearInterval(replayInterval);
    replayInterval = null;
  }
}

function renderReplayView() {
  stopReplay();
  const minYear = 0;
  const maxYear = world.year;
  let replayYear = minYear;

  archiveContentEl.innerHTML = `
    <h3>리플레이</h3>
    <p class="arc-sub">기록된 연대기를 처음부터 원하는 배속으로 다시 재생합니다.</p>
    <div class="replay-controls">
      <button id="replay-play-btn">재생</button>
      <input id="replay-scrubber" type="range" min="${minYear}" max="${maxYear}" value="${minYear}" />
      <span id="replay-year-label">${minYear}년 / ${maxYear}년</span>
      <select id="replay-speed-select">
        <option value="1">1배속</option>
        <option value="5" selected>5배속</option>
        <option value="20">20배속</option>
        <option value="50">50배속</option>
      </select>
    </div>
    <div id="replay-log" class="chronicle-list replay-log"></div>
  `;

  const playBtn = document.getElementById('replay-play-btn');
  const scrubber = document.getElementById('replay-scrubber');
  const yearLabel = document.getElementById('replay-year-label');
  const speedSelect = document.getElementById('replay-speed-select');
  const logEl = document.getElementById('replay-log');

  function renderLogUpTo(year) {
    const entries = world.chronicle.filter((e) => e.year <= year);
    logEl.innerHTML = entries
      .map((e) => `<div class="chronicle-entry"><span class="year">${e.year}년</span> ${e.text}</div>`)
      .join('');
    logEl.scrollTop = logEl.scrollHeight;
  }

  renderLogUpTo(replayYear);

  playBtn.addEventListener('click', () => {
    if (replayInterval) {
      stopReplay();
      playBtn.textContent = '재생';
      return;
    }
    if (replayYear >= maxYear) replayYear = minYear; // 끝까지 본 뒤 다시 누르면 처음부터
    playBtn.textContent = '일시정지';
    replayInterval = setInterval(() => {
      replayYear = Math.min(maxYear, replayYear + Number(speedSelect.value));
      scrubber.value = replayYear;
      yearLabel.textContent = `${replayYear}년 / ${maxYear}년`;
      renderLogUpTo(replayYear);
      if (replayYear >= maxYear) {
        stopReplay();
        playBtn.textContent = '재생';
      }
    }, 200);
  });

  scrubber.addEventListener('input', () => {
    stopReplay();
    playBtn.textContent = '재생';
    replayYear = Number(scrubber.value);
    yearLabel.textContent = `${replayYear}년 / ${maxYear}년`;
    renderLogUpTo(replayYear);
  });
}

// 아카이브 내부 링크 클릭 위임 처리
archiveContentEl.addEventListener('click', (ev) => {
  const link = ev.target.closest('[data-nav]');
  if (!link) return;
  ev.preventDefault();
  currentArchiveRoute = link.dataset.nav;
  renderArchiveRoute();
});

archiveNavBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    currentArchiveRoute = btn.dataset.nav;
    renderArchiveRoute();
  });
});

tabSimBtn.addEventListener('click', showSimView);
tabArchiveBtn.addEventListener('click', showArchiveView);

endWorldBtn.addEventListener('click', () => {
  worldEnded = true;
  playing = false;
  playBtn.textContent = '재생';
  playBtn.classList.remove('active');
  currentArchiveRoute = 'overview';
  showArchiveView();
});

// 초기 세계 생성
newWorld();
requestAnimationFrame(loop);
