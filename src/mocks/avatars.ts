/**
 * Mock 사용자 아바타 — 닉네임에 맞춰 그린 SVG.
 *
 * 예전에는 `picsum.photos`에서 무작위 사진을 받아 썼다. 이름과 아무 관계없는 그림인 데다
 * 네트워크가 없으면 Storybook에서 아바타가 통째로 비었고, 새로고침마다 그림이 바뀌어
 * 시각 회귀 확인에도 방해가 됐다. 직접 그린 SVG를 data URI로 박아 오프라인에서도 늘
 * 같은 그림이 나오도록 한다.
 *
 * 색은 앱의 따뜻한 팔레트(primary `hsl(34 37% 54%)`) 계열에서 골라, 한 세트로 보이되
 * 서로 구분되게 했다.
 */

/** 도형 색. 배경과 대비되도록 밝은 크림 한 가지로 통일한다. */
const INK = 'hsl(40, 30%, 96%)'
/** 겹쳐 그리는 보조 도형 — 같은 색을 옅게 써서 깊이만 준다. */
const INK_SOFT = 'hsl(40, 30%, 96%, 0.55)'

/**
 * SVG를 `<img src>`에 바로 넣을 수 있는 data URI로 만든다.
 *
 * base64 대신 URL 인코딩을 쓴다 — 원본 마크업이 그대로 남아 나중에 읽고 고치기 쉽다.
 */
function avatar(background: string, shapes: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">` +
    `<rect width="100" height="100" fill="${background}"/>${shapes}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** SVG 텍스트에 그대로 넣으면 안 되는 문자를 엔티티로 바꾼다. */
function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * 사람 이름을 첫 글자 아바타로 만든다.
 *
 * "김지우" 같은 실제 이름은 그림으로 옮길 만한 뜻이 없어, 성을 딴 글자를 쓴다
 * (Gmail·Slack이 쓰는 방식). 닉네임에 뜻이 담긴 계정은 위의 그림 아바타를 쓴다.
 */
export function initialAvatar(name: string, background: string): string {
  const initial = escapeXml([...name][0] ?? '?')
  return avatar(
    background,
    `<text x="50" y="52" text-anchor="middle" dominant-baseline="central"` +
      ` font-family="system-ui, -apple-system, Apple SD Gothic Neo, sans-serif"` +
      ` font-size="44" font-weight="700" fill="${INK}">${initial}</text>`
  )
}

/** 독서광 — 펼친 책과 반짝임. 책에 푹 빠진 사람. */
export const AVATAR_BOOKLOVER = avatar(
  'hsl(34, 37%, 54%)',
  `<path d="M50 44 C42 38 32 36 22 37 L22 71 C32 70 42 72 50 78 Z" fill="${INK}"/>
   <path d="M50 44 C58 38 68 36 78 37 L78 71 C68 70 58 72 50 78 Z" fill="${INK_SOFT}"/>
   <path d="M74 20 L76.5 26.5 L83 29 L76.5 31.5 L74 38 L71.5 31.5 L65 29 L71.5 26.5 Z" fill="${INK}"/>
   <circle cx="26" cy="24" r="3" fill="${INK_SOFT}"/>`
)

/** 책벌레지니 — 책에서 고개를 내민 책벌레. */
export const AVATAR_BOOKWORM = avatar(
  'hsl(150, 26%, 42%)',
  `<rect x="24" y="50" width="52" height="30" rx="4" fill="${INK}"/>
   <rect x="24" y="50" width="9" height="30" rx="4" fill="${INK_SOFT}"/>
   <circle cx="46" cy="46" r="7" fill="${INK}"/>
   <circle cx="58" cy="35" r="8" fill="${INK}"/>
   <circle cx="70" cy="26" r="9" fill="${INK}"/>
   <circle cx="67" cy="24" r="2.2" fill="hsl(150, 26%, 34%)"/>
   <circle cx="74" cy="24" r="2.2" fill="hsl(150, 26%, 34%)"/>`
)

/**
 * 문학소년 — 펼친 책을 들고 있는 소년.
 *
 * 어깨(옅은 색) 위에 책(진한 색)을 겹쳐 그린다. 책을 네모로 두면 어깨와 뭉개져
 * 앞치마처럼 보여서, 가운데가 접힌 펼친 책 모양으로 실루엣을 살렸다.
 */
export const AVATAR_LITERARYBOY = avatar(
  'hsl(212, 30%, 50%)',
  `<circle cx="50" cy="30" r="14" fill="${INK}"/>
   <path d="M50 18 C41.5 18 36 23 35 29 L65 29 C64 23 58.5 18 50 18 Z" fill="${INK_SOFT}"/>
   <path d="M26 86 C26 68 36 56 50 56 C64 56 74 68 74 86 Z" fill="${INK_SOFT}"/>
   <path d="M50 68 C44.5 64.5 37 63.5 31 64 L31 81 C37 80.5 44.5 81.5 50 85 Z" fill="${INK}"/>
   <path d="M50 68 C55.5 64.5 63 63.5 69 64 L69 81 C63 80.5 55.5 81.5 50 85 Z" fill="${INK}"/>
   <path d="M50 68 L50 85" stroke="hsl(212, 30%, 50%)" stroke-width="2.5" stroke-linecap="round"/>`
)

/** 지혜로운숲 — 오래된 숲. */
export const AVATAR_WISEFOREST = avatar(
  'hsl(158, 30%, 36%)',
  `<path d="M50 16 L66 44 L34 44 Z" fill="${INK}"/>
   <path d="M50 34 L68 62 L32 62 Z" fill="${INK}"/>
   <rect x="46" y="60" width="8" height="24" rx="2" fill="${INK_SOFT}"/>
   <path d="M24 40 L34 60 L14 60 Z" fill="${INK_SOFT}"/>
   <rect x="21" y="58" width="6" height="18" rx="2" fill="${INK_SOFT}"/>
   <path d="M76 40 L86 60 L66 60 Z" fill="${INK_SOFT}"/>
   <rect x="73" y="58" width="6" height="18" rx="2" fill="${INK_SOFT}"/>`
)

/** 북트래커 — 읽은 책을 표시해 나가는 체크리스트. */
export const AVATAR_BOOKTRACKER = avatar(
  'hsl(18, 45%, 52%)',
  `<rect x="24" y="18" width="52" height="64" rx="6" fill="${INK}"/>
   <rect x="40" y="14" width="20" height="9" rx="4" fill="${INK_SOFT}"/>
   <path d="M32 36 l5 5 l9 -10" fill="none" stroke="hsl(18, 45%, 52%)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
   <rect x="50" y="34" width="18" height="4" rx="2" fill="hsl(18, 45%, 52%)" opacity="0.45"/>
   <path d="M32 52 l5 5 l9 -10" fill="none" stroke="hsl(18, 45%, 52%)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
   <rect x="50" y="50" width="18" height="4" rx="2" fill="hsl(18, 45%, 52%)" opacity="0.45"/>
   <circle cx="36" cy="68" r="5" fill="none" stroke="hsl(18, 45%, 52%)" stroke-width="3" opacity="0.45"/>
   <rect x="50" y="66" width="18" height="4" rx="2" fill="hsl(18, 45%, 52%)" opacity="0.25"/>`
)

/** 새벽감성 — 지평선 위로 막 떠오르는 해와 남은 별. */
export const AVATAR_DAWN = avatar(
  'hsl(272, 26%, 52%)',
  `<circle cx="50" cy="62" r="18" fill="${INK}"/>
   <rect x="0" y="62" width="100" height="38" fill="hsl(272, 26%, 40%)"/>
   <rect x="14" y="70" width="72" height="3" rx="1.5" fill="${INK_SOFT}"/>
   <path d="M28 24 L30 30 L36 32 L30 34 L28 40 L26 34 L20 32 L26 30 Z" fill="${INK}"/>
   <circle cx="72" cy="30" r="3" fill="${INK_SOFT}"/>
   <circle cx="62" cy="18" r="2" fill="${INK_SOFT}"/>`
)
