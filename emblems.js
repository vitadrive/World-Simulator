// ── 세력 문장(heraldry) 절차적 생성 (설계문서 9절) ────────────────────
// 마법진과 같은 방식으로, 규칙 기반 도형 조합으로 방패 모양의 문장을
// SVG로 생성한다. 형태(분할 방식) + 색상 2~3가지 + 상징물(charge)의
// 조합으로 세력마다 고유한 문장을 만든다.

const SHIELD_PATH = 'M50 4 L92 16 L92 55 C92 80 72 94 50 100 C28 94 8 80 8 55 L8 16 Z';

const PALETTE = [
  '#7a1f2b', '#1f3a5f', '#1f5f3a', '#5f3a1f', '#3a1f5f',
  '#5f5f1f', '#1f5f5f', '#7a4a1f', '#2b2b2b', '#c9a35f',
];

const DIVISIONS = ['solid', 'per-pale', 'per-fess', 'per-bend', 'quartered', 'chevron'];

const CHARGES = ['star', 'circle', 'cross', 'wave', 'mountain', 'tree', 'claw', 'moon', 'sun', 'drop'];

function pickTwoDistinct(rng, arr) {
  const a = RNG.pick(rng, arr);
  let b = RNG.pick(rng, arr);
  let guard = 0;
  while (b === a && guard++ < 10) b = RNG.pick(rng, arr);
  return [a, b];
}

function divisionSvg(division, colorA, colorB) {
  switch (division) {
    case 'per-pale':
      return `<path d="${SHIELD_PATH}" fill="${colorA}"/><path d="M50 4 L92 16 L92 55 C92 80 72 94 50 100 Z" fill="${colorB}"/>`;
    case 'per-fess':
      return `<path d="${SHIELD_PATH}" fill="${colorA}"/><path d="M8 50 L92 50 L92 55 C92 80 72 94 50 100 C28 94 8 80 8 55 Z" fill="${colorB}"/>`;
    case 'per-bend':
      return `<path d="${SHIELD_PATH}" fill="${colorA}"/><path d="M8 16 L92 16 L92 55 C92 80 72 94 50 100 Z" fill="${colorB}" opacity="0.85"/>`;
    case 'quartered':
      return `<path d="${SHIELD_PATH}" fill="${colorA}"/><rect x="50" y="4" width="42" height="48" fill="${colorB}"/><rect x="8" y="52" width="42" height="48" fill="${colorB}"/>`;
    case 'chevron':
      return `<path d="${SHIELD_PATH}" fill="${colorA}"/><path d="M8 55 L50 25 L92 55 L92 70 L50 42 L8 70 Z" fill="${colorB}"/>`;
    default:
      return `<path d="${SHIELD_PATH}" fill="${colorA}"/>`;
  }
}

function chargeSvg(charge, color) {
  const c = color;
  switch (charge) {
    case 'star':
      return `<path d="M50 30 L56 46 L73 46 L59 56 L64 72 L50 62 L36 72 L41 56 L27 46 L44 46 Z" fill="${c}"/>`;
    case 'circle':
      return `<circle cx="50" cy="55" r="18" fill="${c}"/>`;
    case 'cross':
      return `<rect x="43" y="30" width="14" height="50" fill="${c}"/><rect x="27" y="47" width="46" height="14" fill="${c}"/>`;
    case 'wave':
      return `<path d="M20 55 Q30 45 40 55 T60 55 T80 55 L80 68 Q70 58 60 68 T40 68 T20 68 Z" fill="${c}"/>`;
    case 'mountain':
      return `<path d="M20 75 L42 40 L55 58 L65 45 L82 75 Z" fill="${c}"/>`;
    case 'tree':
      return `<path d="M50 32 L62 52 L54 52 L64 68 L36 68 L46 52 L38 52 Z" fill="${c}"/><rect x="47" y="68" width="6" height="12" fill="${c}"/>`;
    case 'claw':
      return `<path d="M35 35 Q50 30 65 35 L58 75 Q50 80 42 75 Z" fill="${c}" opacity="0.9"/>`;
    case 'moon':
      return `<path d="M60 30 A24 24 0 1 0 60 80 A18 20 0 1 1 60 30 Z" fill="${c}"/>`;
    case 'sun':
      return `<circle cx="50" cy="55" r="12" fill="${c}"/>` + Array.from({ length: 8 })
        .map((_, i) => {
          const angle = (Math.PI * 2 * i) / 8;
          const x1 = 50 + Math.cos(angle) * 16, y1 = 55 + Math.sin(angle) * 16;
          const x2 = 50 + Math.cos(angle) * 26, y2 = 55 + Math.sin(angle) * 26;
          return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${c}" stroke-width="3"/>`;
        })
        .join('');
    case 'drop':
      return `<path d="M50 32 C62 50 62 62 50 70 C38 62 38 50 50 32 Z" fill="${c}"/>`;
    default:
      return '';
  }
}

/** 세력마다 고유한 문장을 절차적으로 생성한다 */
function generateEmblem(rng) {
  const [colorA, colorB] = pickTwoDistinct(rng, PALETTE);
  let chargeColor = RNG.pick(rng, PALETTE);
  let guard = 0;
  while ((chargeColor === colorA || chargeColor === colorB) && guard++ < 10) chargeColor = RNG.pick(rng, PALETTE);

  const division = RNG.pick(rng, DIVISIONS);
  const charge = RNG.pick(rng, CHARGES);

  const svg = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    ${divisionSvg(division, colorA, colorB)}
    ${chargeSvg(charge, chargeColor)}
    <path d="${SHIELD_PATH}" fill="none" stroke="#0b0b0f" stroke-width="2.5"/>
  </svg>`;

  return { svg, colorA, colorB, chargeColor, division, charge };
}

window.Emblems = { generateEmblem, PALETTE, DIVISIONS, CHARGES };
