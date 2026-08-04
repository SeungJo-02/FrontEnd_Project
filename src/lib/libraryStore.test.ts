import { beforeEach, describe, expect, it } from 'vitest'

class MemoryStorage {
  private map = new Map<string, string>()
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
  clear() {
    this.map.clear()
  }
}

const storage = new MemoryStorage()
Object.defineProperty(globalThis, 'localStorage', { value: storage, writable: true })

const { createCollection, deleteCollection, getLibraryOrder, saveLibraryOrder, applyLibraryOrder } =
  await import('./libraryStore')

const ORDER_KEY = 'shelfeed-library-order-v1'

describe('서재 정렬 저장소', () => {
  beforeEach(() => {
    storage.clear()
  })

  it('전체와 모음집의 순서를 따로 기억한다', () => {
    saveLibraryOrder([1, 2, 3, 4], null)
    saveLibraryOrder([3, 1], 'col-a')

    // 모음집 안에서 순서를 바꿔도 전체 순서는 그대로여야 한다.
    expect(getLibraryOrder(null)).toEqual([1, 2, 3, 4])
    expect(getLibraryOrder('col-a')).toEqual([3, 1])
  })

  it('모음집 순서 저장이 전체 서재 정렬을 바꾸지 않는다', () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
    const byId = (item: { id: number }) => item.id

    saveLibraryOrder([4, 3, 2, 1], null)
    saveLibraryOrder([3, 1], 'col-a')

    expect(applyLibraryOrder(items, byId, getLibraryOrder(null)).map(byId)).toEqual([4, 3, 2, 1])
  })

  it('저장된 순서가 없는 화면은 빈 배열을 준다', () => {
    saveLibraryOrder([1, 2], 'col-a')
    expect(getLibraryOrder('col-b')).toEqual([])
    expect(getLibraryOrder(null)).toEqual([])
  })

  it('화면별 분리 이전에 저장된 배열은 전체 순서로 읽는다', () => {
    storage.setItem(ORDER_KEY, JSON.stringify([5, 6, 7]))
    expect(getLibraryOrder(null)).toEqual([5, 6, 7])
    expect(getLibraryOrder('col-a')).toEqual([])
  })

  it('모음집을 지우면 그 모음의 순서도 사라진다', () => {
    const collection = createCollection('클래식')
    saveLibraryOrder([9, 8], collection.id)
    saveLibraryOrder([1, 2, 3], null)

    deleteCollection(collection.id)

    expect(getLibraryOrder(collection.id)).toEqual([])
    expect(getLibraryOrder(null)).toEqual([1, 2, 3])
  })
})
