/**
 * 알라딘 검색 결과에 섞여 나오는 "세트/전집 상품"인지 제목으로 판별한다.
 *
 * 검색 API에 상품 종류 필터가 없어(`query`/`limit`/`page`만 받음) 제목 패턴으로 거른다.
 * 한 권을 읽고 기록하는 앱이라 `1~14권 세트` 같은 묶음 상품은 서재에 담아도 의미가 없다.
 *
 * 오탐을 줄이려고 "묶음 상품에서만 관용적으로 쓰이는 표현"만 넣었다. 예를 들어 권수 범위
 * (`29~42권`)나 `전 10권`은 단권 제목에 거의 등장하지 않는다.
 */
const BOX_SET_PATTERNS: RegExp[] = [
  // 29~42권 / 1 ~ 14 권 — 권수 범위 표기
  /\d+\s*[~∼-]\s*\d+\s*권/,
  // 전 10권 / 전10권
  /전\s*\d+\s*권/,
  // 세트 A - ... / 박스세트 / 스페셜 세트
  /세트/,
  /전집/,
  /합본/,
  /박스/,
  /패키지/,
  // BOX SET / SPECIAL SET (영문 상품명)
  /\bset\b/i,
]

/**
 * 제목이 묶음 상품처럼 보이면 true.
 *
 * @example
 * isBoxSetTitle('나의 히어로 아카데미아 세트 A - 1~14권 + 초판 부록') // true
 * isBoxSetTitle('나의 히어로 아카데미아 35') // false
 */
export function isBoxSetTitle(title: string): boolean {
  if (!title) return false
  return BOX_SET_PATTERNS.some(pattern => pattern.test(title))
}
