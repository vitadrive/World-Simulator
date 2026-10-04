// ── 지형 생성 (설계문서 2.1) ─────────────────────────────────────
// 마인크래프트류에서 쓰이는 방식을 참고한 "값 노이즈(value noise)" 기반
// 절차적 지형 생성. 고도(elevation)와 습도(moisture) 두 개의 독립적인
// 노이즈 필드를 만들고, 이를 위도(y좌표) 기반 기온과 조합해 바이옴을 정한다.

/**
 * 간단한 2D 값 노이즈 생성기.
 * 격자점마다 난수값을 배정한 뒤 이웃 4점을 부드럽게(smoothstep) 보간한다.
 * 여러 옥타브를 겹쳐 자연스러운 굴곡을 만든다.
 */
function createValueNoise2D(rng, gridSize = 32) {
  const lattice = [];
  for (let y = 0; y <= gridSize; y++) {
    const row = [];
    for (let x = 0; x <= gridSize; x++) {
      row.push(rng());
    }
    lattice.push(row);
  }

  function smoothstep(t) {
    return t * t * (3 - 2 * t);
  }

  function latticeValue(xi, yi) {
    const xw = ((xi % gridSize) + gridSize) % gridSize;
    const yw = ((yi % gridSize) + gridSize) % gridSize;
    return lattice[yw][xw];
  }

  // nx, ny: 0~1 정규화 좌표
  function sample(nx, ny) {
    const gx = nx * gridSize;
    const gy = ny * gridSize;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const tx = smoothstep(gx - x0);
    const ty = smoothstep(gy - y0);

    const v00 = latticeValue(x0, y0);
    const v10 = latticeValue(x0 + 1, y0);
    const v01 = latticeValue(x0, y0 + 1);
    const v11 = latticeValue(x0 + 1, y0 + 1);

    const top = v00 + (v10 - v00) * tx;
    const bottom = v01 + (v11 - v01) * tx;
    return top + (bottom - top) * ty;
  }

  return sample;
}

/** 여러 옥타브를 겹쳐 더 자연스러운 노이즈를 만든다 */
function createOctaveNoise2D(rng, octaves = 4, baseGrid = 6) {
  const layers = [];
  for (let i = 0; i < octaves; i++) {
    layers.push({
      sample: createValueNoise2D(rng, baseGrid * Math.pow(2, i)),
      amplitude: 1 / Math.pow(2, i),
    });
  }
  const totalAmp = layers.reduce((s, l) => s + l.amplitude, 0);

  return function (nx, ny) {
    let v = 0;
    for (const layer of layers) {
      v += layer.sample(nx, ny) * layer.amplitude;
    }
    return v / totalAmp; // 0~1
  };
}

const BIOMES = {
  OCEAN: { id: 'ocean', name: '바다', color: '#1b3a5c', passable: false },
  LAKE: { id: 'lake', name: '호수', color: '#2c5d82', passable: false },
  PLAINS: { id: 'plains', name: '평원', color: '#7fa650', passable: true },
  FOREST: { id: 'forest', name: '숲', color: '#3e6b3a', passable: true },
  DESERT: { id: 'desert', name: '사막', color: '#d8c27a', passable: true },
  MOUNTAIN: { id: 'mountain', name: '산맥', color: '#8a8378', passable: true },
  TUNDRA: { id: 'tundra', name: '툰드라', color: '#c9d6d3', passable: true },
  SWAMP: { id: 'swamp', name: '늪지', color: '#4a5a3a', passable: true },
};

/**
 * 월드 지형을 생성한다.
 * @param {Function} rng terrain 서브시드 스트림
 * @param {number} width
 * @param {number} height
 * @returns {{tiles: Array, width:number, height:number}}
 */
function generateTerrain(rng, width, height) {
  const elevationNoise = createOctaveNoise2D(rng, 5, 5);
  const moistureNoise = createOctaveNoise2D(rng, 4, 6);
  const seaLevel = RNG.randRange(rng, 0.32, 0.42);

  const tiles = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const ny = y / height;

      // 가장자리로 갈수록 고도를 낮춰 대륙이 바다로 둘러싸이게(섬 형태) 함
      const edgeFalloff =
        1 -
        Math.pow(Math.min(1, Math.hypot((nx - 0.5) * 2, (ny - 0.5) * 2)), 2);

      let elevation = elevationNoise(nx, ny) * 0.8 + edgeFalloff * 0.2;
      const moisture = moistureNoise(nx + 5.2, ny + 5.2);

      // 위도 기반 기온: 상/하단은 춥고 중앙은 따뜻함
      const latitude = Math.abs(ny - 0.5) * 2; // 0(적도)~1(극지)
      const temperature = 1 - latitude;

      let biome;
      if (elevation < seaLevel) {
        biome = BIOMES.OCEAN;
      } else if (elevation < seaLevel + 0.03 && moisture > 0.7) {
        biome = BIOMES.LAKE;
      } else if (elevation > 0.82) {
        biome = BIOMES.MOUNTAIN;
      } else if (temperature < 0.28) {
        biome = BIOMES.TUNDRA;
      } else if (moisture < 0.32 && temperature > 0.5) {
        biome = BIOMES.DESERT;
      } else if (moisture > 0.68 && temperature > 0.4) {
        biome = BIOMES.SWAMP;
      } else if (moisture > 0.5) {
        biome = BIOMES.FOREST;
      } else {
        biome = BIOMES.PLAINS;
      }

      tiles.push({
        x,
        y,
        elevation,
        moisture,
        temperature,
        biome: biome.id,
        // 2.3 영구적 지형 변형을 위한 자리 — 이후 재해/이능으로 덮어씀
        deformation: null,
        // 2.2 이능 편차 지역 — 이후 world.js에서 희박한 확률로 부여
        manaAnomaly: null,
        ownerFactionId: null,
      });
    }
  }

  return { tiles, width, height, seaLevel, biomes: BIOMES };
}

window.Terrain = { generateTerrain, BIOMES, createOctaveNoise2D };
