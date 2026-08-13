/**
 * 프로필 사진이 없는 사용자를 위한 자동 아바타.
 *
 * 서비스 초기에는 대부분의 사용자가 사진을 올리지 않는다. 그때 전원에게 같은 사람
 * 아이콘을 보여주면 피드에서 누가 누구인지 구분되지 않는다. 닉네임에서 결정론적으로
 * 색과 이니셜을 뽑아내 **사람마다 다른 아바타**를 만든다.
 *
 * 결정론적이라 같은 사용자는 어느 화면에서든 항상 같은 아바타로 보인다. 서버에 저장하는
 * 값이 아니므로 마이그레이션도 필요 없고, 나중에 실제 사진을 올리면 그쪽이 우선한다.
 */

/**
 * 배경/글자 색 쌍. 배경은 연하게, 글자는 같은 계열을 진하게 써서 서로 다른 색이 나와도
 * 따뜻한 브랜드 톤에서 벗어나지 않게 한다.
 */
const PALETTE: ReadonlyArray<{ bg: string; fg: string }> = [
  { bg: '#EADFC8', fg: '#7C5B2A' }, // 모래
  { bg: '#DCE6DB', fg: '#4B6A47' }, // 세이지
  { bg: '#EEDFE3', fg: '#7E4E5D' }, // 로즈
  { bg: '#DBE3EC', fg: '#44607E' }, // 블루그레이
  { bg: '#F0E1D1', fg: '#8B5A32' }, // 테라코타
  { bg: '#E2DCEA', fg: '#5C4C79' }, // 라벤더
  { bg: '#DAE8E7', fg: '#3D6562' }, // 틸
  { bg: '#ECE7D2', fg: '#77692D' }, // 올리브
]

/** 문자열 → 안정적인 정수. 같은 닉네임이면 항상 같은 값이 나와야 한다. */
function hash(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * 아바타에 새길 한 글자를 고른다.
 *
 * 한글 닉네임은 첫 음절이 그대로 이니셜 구실을 한다("책속의유나" → "책").
 * 라틴 문자는 대문자로 올린다. 이모지처럼 서로게이트 쌍으로 된 문자도 깨지지 않도록
 * 코드포인트 단위로 자른다.
 */
function initialOf(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''
  const [first] = Array.from(trimmed)
  return (first ?? '').toUpperCase()
}

export interface GeneratedAvatar {
  initial: string
  bg: string
  fg: string
}

/**
 * 닉네임으로부터 아바타의 색과 이니셜을 만든다.
 * 이름이 비어 있으면 null — 호출부에서 기본 사람 아이콘으로 넘어간다.
 */
export function generateAvatar(name: string | null | undefined): GeneratedAvatar | null {
  if (!name) return null
  const initial = initialOf(name)
  if (!initial) return null

  const palette = PALETTE[hash(name) % PALETTE.length]
  // PALETTE는 비어 있지 않으므로 항상 잡히지만, noUncheckedIndexedAccess 대비로 좁혀둔다.
  if (!palette) return null

  return { initial, bg: palette.bg, fg: palette.fg }
}
