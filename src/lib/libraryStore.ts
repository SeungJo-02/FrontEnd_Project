/**
 * 서재 개인화(모음집 · 정렬 순서) 로컬 저장소.
 *
 * 서재 API는 상태 필터와 커서 페이징만 제공하고 사용자 정의 순서나 모음집 개념이 없다.
 * 두 기능 모두 브라우저에 보관하며, 서버 API가 생기면 이 모듈의 시그니처를 유지한 채
 * 내부만 교체하면 된다. (`memoStore`·`readingProgressStore`와 같은 방식)
 */

const COLLECTIONS_KEY = 'shelfeed-collections-v1'
const ORDER_KEY = 'shelfeed-library-order-v1'

export const COLLECTION_NAME_MAX = 20

export interface BookCollection {
  id: string
  name: string
  /** 이 모음에 담긴 서재책 ID. 담은 순서를 유지한다. */
  libraryBookIds: number[]
  createdAt: string
  updatedAt: string
}

export class LibraryStorageError extends Error {}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    // 사생활 보호 모드·손상된 값 — 기록이 없는 것으로 취급한다.
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    throw new LibraryStorageError('저장 공간이 부족해 변경사항을 저장하지 못했습니다.')
  }
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `col-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ── 모음집 ──────────────────────────────────────────────────────

/** 만든 순서(오래된 것부터)로 반환한다. 손상된 항목은 걸러낸다. */
export function getCollections(): BookCollection[] {
  const raw = readJson<unknown>(COLLECTIONS_KEY, [])
  if (!Array.isArray(raw)) return []
  return (raw as BookCollection[]).filter(
    item =>
      item &&
      typeof item.id === 'string' &&
      typeof item.name === 'string' &&
      Array.isArray(item.libraryBookIds)
  )
}

export function createCollection(name: string): BookCollection {
  const now = new Date().toISOString()
  const collection: BookCollection = {
    id: createId(),
    name: name.trim().slice(0, COLLECTION_NAME_MAX),
    libraryBookIds: [],
    createdAt: now,
    updatedAt: now,
  }
  writeJson(COLLECTIONS_KEY, [...getCollections(), collection])
  return collection
}

export function renameCollection(id: string, name: string): void {
  const next = getCollections().map(item =>
    item.id === id
      ? {
          ...item,
          name: name.trim().slice(0, COLLECTION_NAME_MAX),
          updatedAt: new Date().toISOString(),
        }
      : item
  )
  writeJson(COLLECTIONS_KEY, next)
}

export function deleteCollection(id: string): void {
  writeJson(
    COLLECTIONS_KEY,
    getCollections().filter(item => item.id !== id)
  )
  // 모음이 사라지면 그 모음의 정렬도 쓸모가 없다 — 같이 지운다.
  const orders = readOrderMap()
  if (id in orders) {
    delete orders[id]
    writeJson(ORDER_KEY, orders)
  }
}

/** 모음에 책을 넣거나 뺀다. 새로 넣은 책은 뒤에 붙는다. */
export function toggleCollectionBook(id: string, libraryBookId: number): void {
  const next = getCollections().map(item => {
    if (item.id !== id) return item
    const has = item.libraryBookIds.includes(libraryBookId)
    return {
      ...item,
      libraryBookIds: has
        ? item.libraryBookIds.filter(value => value !== libraryBookId)
        : [...item.libraryBookIds, libraryBookId],
      updatedAt: new Date().toISOString(),
    }
  })
  writeJson(COLLECTIONS_KEY, next)
}

// ── 사용자 정의 정렬 ────────────────────────────────────────────

/**
 * 정렬은 보고 있는 화면마다 따로 기억한다.
 *
 * 모음집은 서재의 일부만 보여주므로, 모음 안에서 바꾼 순서를 하나뿐인 순서로 저장하면
 * 전체 서재로 돌아왔을 때 그 몇 권만 앞으로 끌려나오며 원래 순서가 망가진다.
 * 그래서 전체(`ALL_SCOPE`)와 각 모음(모음 id)의 순서를 분리해 보관한다.
 */
const ALL_SCOPE = '__all__'

type OrderMap = Record<string, number[]>

function toIdList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((id): id is number => typeof id === 'number') : []
}

function readOrderMap(): OrderMap {
  const raw = readJson<unknown>(ORDER_KEY, null)
  // 화면별 분리 이전에는 전체 순서를 배열 하나로 저장했다 — 전체 순서로 옮겨 읽는다.
  if (Array.isArray(raw)) return { [ALL_SCOPE]: toIdList(raw) }
  if (!raw || typeof raw !== 'object') return {}

  const map: OrderMap = {}
  for (const [scope, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(value)) map[scope] = toIdList(value)
  }
  return map
}

/** 모음집 id, 또는 전체 서재면 null. */
export function getLibraryOrder(collectionId: string | null = null): number[] {
  return readOrderMap()[collectionId ?? ALL_SCOPE] ?? []
}

export function saveLibraryOrder(
  libraryBookIds: number[],
  collectionId: string | null = null
): void {
  writeJson(ORDER_KEY, { ...readOrderMap(), [collectionId ?? ALL_SCOPE]: libraryBookIds })
}

/**
 * 저장된 순서를 목록에 반영한다.
 *
 * 저장된 순서에 없는 책(새로 담은 책)은 원래 순서를 유지한 채 뒤로 밀린다 —
 * 정렬이 안정적이라 드래그하지 않은 항목끼리의 상대 순서는 그대로다.
 */
export function applyLibraryOrder<T>(
  items: T[],
  getId: (item: T) => number,
  /** 저장소 대신 쓸 순서. 호출부가 순서를 state로 들고 있을 때 넘긴다. */
  customOrder?: number[]
): T[] {
  const order = customOrder ?? getLibraryOrder()
  if (order.length === 0) return items

  const rank = new Map(order.map((id, index) => [id, index]))
  return [...items].sort(
    (a, b) =>
      (rank.get(getId(a)) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(getId(b)) ?? Number.MAX_SAFE_INTEGER)
  )
}
