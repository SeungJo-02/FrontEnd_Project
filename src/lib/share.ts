/**
 * 공유 유틸 — Web Share API(navigator.share)를 우선 사용하고,
 * 미지원 환경(주로 데스크톱 브라우저)에서는 링크를 클립보드에 복사하는 폴백으로 동작한다.
 *
 * 반환값으로 호출부가 사용자 피드백(공유됨/복사됨/실패)을 분기할 수 있다.
 */
export type ShareResult = 'shared' | 'copied' | 'failed'

export interface ShareLinkOptions {
  /** 공유 다이얼로그 제목 (Web Share API title) */
  title: string
  /** 공유 본문 텍스트 (선택) */
  text?: string
  /** 앱 내 상대 경로(예: `/review/12`) 또는 절대 URL. 상대 경로면 현재 origin을 붙인다. */
  path: string
}

/**
 * 상대 경로를 현재 origin 기준 절대 URL로 변환한다. 이미 절대 URL이면 그대로 둔다.
 */
function toAbsoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  return `${window.location.origin}${path.startsWith('/') ? '' : '/'}${path}`
}

/**
 * 링크를 공유하거나(가능하면) 클립보드에 복사한다.
 *
 * - Web Share API 지원 시: 네이티브 공유 시트를 띄운다. 사용자가 취소(AbortError)하면
 *   별도 폴백 없이 'shared'로 간주(사용자가 의도적으로 닫은 것이므로 복사로 이어가지 않음).
 * - 미지원 시: `navigator.clipboard.writeText`로 URL 복사 → 'copied'.
 * - 둘 다 불가하면 'failed'.
 */
export async function shareLink({ title, text, path }: ShareLinkOptions): Promise<ShareResult> {
  const url = toAbsoluteUrl(path)

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url })
      return 'shared'
    } catch (error) {
      // 사용자가 공유 시트를 취소한 경우는 실패가 아니므로 복사로 이어가지 않는다.
      if (error instanceof DOMException && error.name === 'AbortError') return 'shared'
      // 그 외 오류(권한 등)는 클립보드 폴백으로 진행
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url)
      return 'copied'
    } catch {
      return 'failed'
    }
  }

  return 'failed'
}
