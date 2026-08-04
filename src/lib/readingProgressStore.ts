/**
 * 책별 독서 진행 로컬 저장소.
 *
 * 서재 API가 시작일·독서량을 받지 않아(상태만 전송) 이 두 값은 브라우저에 보관한다.
 * 기기 간 동기화는 되지 않으며, 백엔드에 필드가 생기면 이 모듈의 시그니처를 유지한 채
 * 내부만 교체하면 된다. (`memoStore`와 같은 방식)
 */

const STORAGE_KEY = 'shelfeed-reading-progress-v1'

export type ProgressUnit = 'page' | 'percent'

export interface ReadingProgress {
  /** `YYYY-MM-DD`. 서버 startedAt이 있으면 그것보다 우선해 표시한다. */
  startedAt: string | null
  /** 읽은 분량. unit이 page면 쪽수, percent면 0~100. */
  amount: number | null
  unit: ProgressUnit
  /** 쪽수를 퍼센트로 환산할 때 쓴다. 도서 상세에서 알 때만 채워진다. */
  totalPages: number | null
}

export const EMPTY_PROGRESS: ReadingProgress = {
  startedAt: null,
  amount: null,
  unit: 'page',
  totalPages: null,
}

type ProgressMap = Record<string, ReadingProgress>

function readAll(): ProgressMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return parsed as ProgressMap
  } catch {
    // 사생활 보호 모드·손상된 값 — 기록이 없는 것으로 취급한다.
    return {}
  }
}

export function getReadingProgress(bookId: number): ReadingProgress {
  const stored = readAll()[String(bookId)]
  return stored ? { ...EMPTY_PROGRESS, ...stored } : EMPTY_PROGRESS
}

export function saveReadingProgress(bookId: number, progress: Partial<ReadingProgress>): void {
  try {
    const all = readAll()
    all[String(bookId)] = { ...getReadingProgress(bookId), ...progress }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // 쿼터 초과·저장 불가 — 진행률 표시가 빠질 뿐 다른 동작에 영향이 없어 조용히 넘어간다.
  }
}

/**
 * 진행률(0~100)을 계산한다. 계산에 필요한 값이 없으면 null.
 *
 * @param fallbackTotalPages 저장된 totalPages가 없을 때 쓸 값(도서 상세에서 알 때)
 */
export function toPercent(
  progress: ReadingProgress,
  fallbackTotalPages?: number | null
): number | null {
  if (progress.amount == null) return null
  if (progress.unit === 'percent') return clampPercent(progress.amount)

  const total = progress.totalPages ?? fallbackTotalPages
  if (!total || total <= 0) return null
  return clampPercent((progress.amount / total) * 100)
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}
