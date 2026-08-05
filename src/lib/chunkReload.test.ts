import { beforeEach, describe, expect, it, vi } from 'vitest'

const RELOAD_KEY = 'shelfeed-chunk-reload-at'

const store = new Map<string, string>()
const reload = vi.fn()
/** true면 sessionStorage 접근이 터진다 (사생활 보호 모드 흉내). */
let storageBroken = false

Object.defineProperty(globalThis, 'sessionStorage', {
  value: {
    getItem: (key: string) => {
      if (storageBroken) throw new Error('storage 사용 불가')
      return store.get(key) ?? null
    },
    setItem: (key: string, value: string) => {
      if (storageBroken) throw new Error('storage 사용 불가')
      store.set(key, value)
    },
  },
  writable: true,
})
Object.defineProperty(globalThis, 'window', {
  value: { location: { reload } },
  writable: true,
})

const { withChunkReload } = await import('./chunkReload')

/** 프로미스가 제한 시간 안에 결판나는지 본다. 새로고침 중에는 영원히 대기해야 한다. */
function settleState(promise: Promise<unknown>): Promise<'resolved' | 'rejected' | 'pending'> {
  return Promise.race([
    promise.then(
      () => 'resolved' as const,
      () => 'rejected' as const
    ),
    new Promise<'pending'>(resolve => setTimeout(() => resolve('pending'), 20)),
  ])
}

beforeEach(() => {
  store.clear()
  reload.mockClear()
  storageBroken = false
})

describe('withChunkReload', () => {
  it('불러오기에 성공하면 결과를 그대로 넘긴다', async () => {
    const load = withChunkReload(() => Promise.resolve({ default: 'Page' }))

    await expect(load()).resolves.toEqual({ default: 'Page' })
    expect(reload).not.toHaveBeenCalled()
  })

  it('청크가 사라졌으면 새로고침한다', async () => {
    const load = withChunkReload(() => Promise.reject(new Error('Failed to fetch module')))

    // 새로고침이 진행되는 동안 에러 화면이 스치지 않도록 대기 상태로 남아야 한다.
    await expect(settleState(load())).resolves.toBe('pending')
    expect(reload).toHaveBeenCalledTimes(1)
    expect(store.get(RELOAD_KEY)).toBeDefined()
  })

  it('새로고침 직후 또 실패하면 무한 반복하지 않고 에러를 알린다', async () => {
    store.set(RELOAD_KEY, String(Date.now()))
    const load = withChunkReload(() => Promise.reject(new Error('진짜 오류')))

    await expect(load()).rejects.toThrow('진짜 오류')
    expect(reload).not.toHaveBeenCalled()
  })

  it('한참 전에 새로고침했다면 다시 시도한다', async () => {
    // 쿨다운(10초)을 훌쩍 넘긴 기록 — 이번 실패는 새 배포로 봐야 한다.
    store.set(RELOAD_KEY, String(Date.now() - 60_000))
    const load = withChunkReload(() => Promise.reject(new Error('Failed to fetch module')))

    await expect(settleState(load())).resolves.toBe('pending')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('sessionStorage를 못 써도 새로고침은 시도한다', async () => {
    storageBroken = true
    const load = withChunkReload(() => Promise.reject(new Error('Failed to fetch module')))

    await expect(settleState(load())).resolves.toBe('pending')
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
