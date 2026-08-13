import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
vi.mock('./client', () => ({ default: { get } }))

const { getFeed } = await import('./feed')

/** 백엔드 `ApiResponse<T>` 봉투. */
function ok<T>(data: T) {
  return { data: { status: 'SUCCESS', code: 200, data } }
}

function httpError(status: number) {
  return { isAxiosError: true, response: { status, data: {} } }
}

function feedItem(reviewId: number) {
  return {
    reviewId,
    user: { userId: 1, nickname: '독자', profileImageUrl: null },
    book: { bookId: 10, title: '책', author: '저자', coverImageUrl: null, category: null },
    rating: 4,
    content: '감상',
    quote: null,
    isSpoiler: false,
    likeCount: 0,
    commentCount: 0,
    isLiked: false,
    tags: [],
    createdAt: '2026-08-05T04:00:00',
  }
}

/** 호출된 URL만 순서대로 뽑는다. */
function calledPaths() {
  return get.mock.calls.map(call => call[0])
}

beforeEach(() => {
  get.mockReset()
})

describe('getFeed', () => {
  it('통합 엔드포인트 하나만 호출한다', async () => {
    get.mockResolvedValueOnce(
      ok({
        content: [feedItem(1)],
        nextCursorCreatedAt: '2026-08-05T04:00:00',
        nextCursorId: 1,
        hasNext: true,
        size: 1,
      })
    )

    const result = await getFeed({})

    expect(calledPaths()).toEqual(['/api/v1/feed'])
    expect(result.content).toHaveLength(1)
    expect(result.nextCursor).toEqual({ createdAt: '2026-08-05T04:00:00', id: 1 })
  })

  it('마지막 페이지면 커서를 null로 준다', async () => {
    get.mockResolvedValueOnce(
      ok({
        content: [feedItem(1)],
        nextCursorCreatedAt: null,
        nextCursorId: null,
        hasNext: false,
        size: 1,
      })
    )

    const result = await getFeed({})

    expect(result.nextCursor).toBeNull()
    expect(result.hasNext).toBe(false)
  })

  it('받은 커서를 다음 요청에 한 쌍으로 되돌려준다', async () => {
    get.mockResolvedValue(
      ok({ content: [], nextCursorCreatedAt: null, nextCursorId: null, hasNext: false, size: 0 })
    )

    await getFeed({ cursor: { createdAt: '2026-08-05T04:00:00', id: 7 } })

    expect(get.mock.calls[0][1].params).toMatchObject({
      limit: 20,
      cursorCreatedAt: '2026-08-05T04:00:00',
      cursorId: 7,
    })
  })

  it('첫 페이지에는 커서 파라미터를 아예 붙이지 않는다', async () => {
    get.mockResolvedValue(
      ok({ content: [], nextCursorCreatedAt: null, nextCursorId: null, hasNext: false, size: 0 })
    )

    await getFeed({})

    expect(get.mock.calls[0][1].params).toEqual({ limit: 20 })
  })

  it('한쪽 커서만 내려오면 다음 페이지가 없는 것으로 본다', async () => {
    // 커서는 (시각, ID) 한 쌍이라야 의미가 있다. 짝이 맞지 않으면 이어 읽지 않는다.
    get.mockResolvedValueOnce(
      ok({
        content: [feedItem(1)],
        nextCursorCreatedAt: '2026-08-05T04:00:00',
        nextCursorId: null,
        hasNext: true,
        size: 1,
      })
    )

    const result = await getFeed({})

    expect(result.nextCursor).toBeNull()
  })

  it('오류는 폴백하지 않고 그대로 알린다', async () => {
    // 구 엔드포인트는 서버에서 제거됐다. 404든 500이든 도망칠 곳이 없다.
    get.mockRejectedValueOnce(httpError(404))

    await expect(getFeed({})).rejects.toThrow()
    expect(calledPaths()).toEqual(['/api/v1/feed'])
  })

  it('서버 오류도 그대로 알린다', async () => {
    get.mockRejectedValueOnce(httpError(500))

    await expect(getFeed({})).rejects.toThrow()
    expect(calledPaths()).toEqual(['/api/v1/feed'])
  })
})
