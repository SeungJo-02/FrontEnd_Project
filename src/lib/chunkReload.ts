/** 방금 새로고침했는지 판단하는 기준. 이보다 오래됐으면 다시 시도해도 된다. */
const RELOAD_COOLDOWN_MS = 10_000
const RELOAD_KEY = 'shelfeed-chunk-reload-at'

function readLastReload(): number {
  try {
    return Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
  } catch {
    // 사생활 보호 모드 — 기록을 못 읽으면 새로고침을 한 적 없는 것으로 본다.
    return 0
  }
}

function markReload(): void {
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // 기록을 못 남겨도 새로고침 자체는 시도한다. 다만 재발 시 한 번 더 새로고침될 수 있다.
  }
}

/**
 * 코드 분할 청크를 불러오는 함수를 감싸, 배포로 파일이 사라졌으면 한 번 새로고침해 복구한다.
 *
 * 새 버전을 배포하면 청크 파일명의 해시가 바뀌어 이전 파일이 사라진다. 배포 전에 열어둔
 * 탭은 사라진 이름을 계속 참조하므로, 그 탭에서 페이지를 이동하는 순간 동적 import가
 * 실패하며 화면이 깨진다. 사용자가 할 수 있는 일은 새로고침뿐이라 앱이 대신 해준다.
 *
 * 새로고침 직후 또 실패하면 배포 문제가 아니라 진짜 오류이므로 그대로 던져 에러 화면이
 * 뜨게 한다. 무한 새로고침을 막는 장치이기도 하다.
 *
 * @example
 * const HomeFeedPage = lazy(withChunkReload(() => import('@/pages/HomeFeedPage')))
 */
export function withChunkReload<T>(load: () => Promise<T>): () => Promise<T> {
  return () =>
    load().catch((error: unknown) => {
      if (Date.now() - readLastReload() < RELOAD_COOLDOWN_MS) throw error

      markReload()
      window.location.reload()
      // 새로고침이 진행되는 동안 렌더를 멈춘다 — 에러 화면이 잠깐 스치는 걸 막는다.
      return new Promise<T>(() => {})
    })
}
