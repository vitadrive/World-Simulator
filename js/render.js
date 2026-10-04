// ── 도트맵 렌더링 (v0.1) ─────────────────────────────────────────
// 지형은 바이옴 색으로, 세력 영토는 세력 색을 옅게 덧씌워 표시.
// 수도는 굵은 테두리의 사각형으로 강조.

function renderWorld(canvas, world, tileSize) {
  const ctx = canvas.getContext('2d');
  const { terrain, width, height } = world;
  canvas.width = width * tileSize;
  canvas.height = height * tileSize;
  ctx.imageSmoothingEnabled = false;

  const factionById = {};
  for (const f of world.factions) factionById[f.id] = f;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = terrain.tiles[y * width + x];
      const biome = Terrain.BIOMES[tile.biome.toUpperCase()];
      ctx.fillStyle = biome.color;
      ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);

      if (tile.ownerFactionId) {
        const f = factionById[tile.ownerFactionId];
        if (f) {
          ctx.fillStyle = hexToRgba(f.color, 0.45);
          ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
        }
      }

      if (tile.manaAnomaly) {
        ctx.fillStyle = tile.manaAnomaly.type === 'amplify' ? 'rgba(200,120,255,0.55)' : 'rgba(90,90,90,0.55)';
        ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      }

      if (tile.deformation) {
        const overlay = DEFORMATION_OVERLAY[tile.deformation.type];
        if (overlay) {
          ctx.fillStyle = overlay;
          ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
        }
      }
    }
  }

  for (const f of world.factions) {
    const cx = f.capital.x * tileSize;
    const cy = f.capital.y * tileSize;
    ctx.fillStyle = f.color;
    ctx.fillRect(cx - 1, cy - 1, tileSize + 2, tileSize + 2);
    ctx.strokeStyle = '#0b0b0f';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 1, cy - 1, tileSize + 2, tileSize + 2);
  }
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const DEFORMATION_OVERLAY = {
  scorched: 'rgba(60,30,20,0.55)',
  parched: 'rgba(120,100,40,0.35)',
  desertified: 'rgba(140,110,50,0.4)',
  collapsed: 'rgba(70,70,70,0.4)',
  flooded: 'rgba(40,90,140,0.3)',
  regrown_fertile: 'rgba(120,200,90,0.25)',
};

window.Render = { renderWorld };
