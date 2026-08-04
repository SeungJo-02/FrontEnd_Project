/**
 * 책별 메모 로컬 저장소.
 *
 * 백엔드에 메모 API가 아직 없어 브라우저 localStorage에 보관한다. 기기 간 동기화는
 * 되지 않으며, 서버 API가 생기면 이 모듈의 함수 시그니처만 유지한 채 내부를 교체하면 된다.
 */

const STORAGE_PREFIX = 'shelfeed-memos-v1:'

export interface BookMemo {
  id: string
  content: string
  /** 첨부 이미지(data URL). 용량 문제로 한 메모당 1장만 허용한다. */
  imageDataUrl: string | null
  createdAt: string
  updatedAt: string
}

export class MemoStorageError extends Error {}

function keyFor(bookId: number): string {
  return `${STORAGE_PREFIX}${bookId}`
}

/** 저장된 메모를 최신 수정순으로 반환한다. 값이 깨져 있으면 빈 배열로 복구한다. */
export function getMemos(bookId: number): BookMemo[] {
  try {
    const raw = localStorage.getItem(keyFor(bookId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return (parsed as BookMemo[])
      .filter(memo => memo && typeof memo.id === 'string' && typeof memo.content === 'string')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } catch {
    // 사생활 보호 모드·손상된 값 — 메모가 없는 것으로 취급한다.
    return []
  }
}

export function getMemo(bookId: number, memoId: string): BookMemo | null {
  return getMemos(bookId).find(memo => memo.id === memoId) ?? null
}

function persist(bookId: number, memos: BookMemo[]): void {
  try {
    localStorage.setItem(keyFor(bookId), JSON.stringify(memos))
  } catch {
    // 이미지 첨부로 5MB 쿼터를 넘기는 경우가 대부분이라 원인을 짚어준다.
    throw new MemoStorageError(
      '저장 공간이 부족해 메모를 저장하지 못했습니다. 첨부 이미지를 빼고 다시 시도해주세요.'
    )
  }
}

/**
 * 메모를 새로 만들거나(memoId 없음) 기존 메모를 수정한다.
 *
 * @throws {MemoStorageError} localStorage 쿼터 초과 등 저장 실패 시
 */
export function saveMemo(
  bookId: number,
  input: { id?: string; content: string; imageDataUrl?: string | null }
): BookMemo {
  const now = new Date().toISOString()
  const memos = getMemos(bookId)
  const existingIndex = input.id ? memos.findIndex(memo => memo.id === input.id) : -1

  const memo: BookMemo =
    existingIndex >= 0
      ? {
          ...memos[existingIndex],
          content: input.content,
          imageDataUrl: input.imageDataUrl ?? null,
          updatedAt: now,
        }
      : {
          id: input.id ?? createId(),
          content: input.content,
          imageDataUrl: input.imageDataUrl ?? null,
          createdAt: now,
          updatedAt: now,
        }

  const next =
    existingIndex >= 0 ? memos.map((m, i) => (i === existingIndex ? memo : m)) : [memo, ...memos]
  persist(bookId, next)
  return memo
}

export function deleteMemo(bookId: number, memoId: string): void {
  persist(
    bookId,
    getMemos(bookId).filter(memo => memo.id !== memoId)
  )
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `memo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
