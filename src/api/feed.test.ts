import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
vi.mock('./client', () => ({ default: { get } }))

const { getFeed, __resetFeedEndpointCache } = await import('./feed')

/** 백엔드 `ApiResponse<T>` 봉투. */
function ok<T>(data: T) {
  return { data: { status: 'SUCCESS', code: 200, data } }
}

function httpError(status: number) {
  return { isAxiosError: true, response: { status, data: {} } }
}

function unifiedItem(reviewId: number) {
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

/** 구 팔로잉 응답은 `{feedId, review}` 래퍼를 쓰고 book에 category가 없다. */
function followingItem(feedId: number, reviewId: number) {
  const { book, ...rest } = unifiedItem(reviewId)
  return {
    feedId,
    review: {
      ...rest,
      book: {
        bookId: book.bookId,
        title: book.title,
        author: book.author,
        coverImageUrl: book.coverImageUrl,
      },
    },
  }
}

/** 호출된 URL만 순서대로 뽑는다. */
function calledPaths() {
  return get.mock.calls.map(call => call[0])
}

beforeEach(() => {
  get.mockReset()
  __resetFeedEndpointCache()
})

describe('getFeed — 통합 엔드포인트가 있을 때', () => {
  it('통합 엔드포인트만 호출하고 구 엔드포인트는 건드리지 않는다', async () => {
    get.mockResolvedValueOnce(
      ok({
        content: [unifiedItem(1)],
        nextCursorCreatedAt: '2026-08-05T04:00:00',
        nextCursorId: 1,
        hasNext: true,
        size: 1,
      })
    )

    const result = await getFeed({})

    expect(calledPaths()).toEqual(['/api/v1/feed'])
    expect(result.content).toHaveLength(1)
    expect(result.nextCursor).toEqual({
      source: 'unified',
      createdAt: '2026-08-05T04:00:00',
      id: 1,
    })
  })

  it('마지막 페이지면 커서를 null로 준다', async () => {
    get.mockResolvedValueOnce(
      ok({
        content: [unifiedItem(1)],
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

    await getFeed({ cursor: { source: 'unified', createdAt: '2026-08-05T04:00:00', id: 7 } })

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
})

describe('getFeed — 통합 엔드포인트가 아직 없을 때(404 폴백)', () => {
  it('404면 구 팔로잉 피드로 넘어간다', async () => {
    get.mockRejectedValueOnce(httpError(404))
    get.mockResolvedValueOnce(
      ok({ content: [followingItem(100, 1)], nextCursor: 100, hasNext: true, size: 1 })
    )

    const result = await getFeed({})

    expect(calledPaths()).toEqual(['/api/v1/feed', '/api/v1/feed/following'])
    expect(result.content[0].reviewId).toBe(1)
    expect(result.nextCursor).toEqual({ source: 'following', feedCursor: 100 })
  })

  it('구 팔로잉 응답의 feedId 래퍼를 벗기고 category를 채운다', async () => {
    get.mockRejectedValueOnce(httpError(404))
    get.mockResolvedValueOnce(
      ok({ content: [followingItem(100, 42)], nextCursor: 100, hasNext: true, size: 1 })
    )

    const result = await getFeed({})

    // 카드가 곧바로 쓸 수 있는 통합 형태여야 한다.
    expect(result.content[0]).toMatchObject({ reviewId: 42, book: { category: null } })
    expect(result.content[0]).not.toHaveProperty('review')
  })

  it('팔로잉이 비어 있으면 같은 응답에 추천을 채워 첫 화면이 비지 않게 한다', async () => {
    // 갓 가입해 팔로우가 없는 사용자 — 이 경우 홈이 빈 화면이 되면 안 된다.
    get.mockRejectedValueOnce(httpError(404))
    get.mockResolvedValueOnce(ok({ content: [], nextCursor: null, hasNext: false, size: 0 }))
    get.mockResolvedValueOnce(
      ok({
        content: [unifiedItem(7), unifiedItem(8)],
        nextCursorId: 8,
        nextCursorLike: 3,
        hasNext: true,
        size: 2,
      })
    )

    const result = await getFeed({})

    expect(calledPaths()).toEqual([
      '/api/v1/feed',
      '/api/v1/feed/following',
      '/api/v1/feed/recommend',
    ])
    expect(result.content.map(item => item.reviewId)).toEqual([7, 8])
    expect(result.nextCursor).toEqual({ source: 'recommend', cursorLike: 3, cursorId: 8 })
  })

  it('팔로잉과 추천에 같은 감상이 있으면 한 번만 내려준다', async () => {
    get.mockRejectedValueOnce(httpError(404))
    get.mockResolvedValueOnce(
      ok({ content: [followingItem(100, 7)], nextCursor: null, hasNext: false, size: 1 })
    )
    get.mockResolvedValueOnce(
      ok({
        content: [unifiedItem(7), unifiedItem(9)],
        nextCursorId: 9,
        nextCursorLike: 1,
        hasNext: false,
        size: 2,
      })
    )

    const result = await getFeed({})

    expect(result.content.map(item => item.reviewId)).toEqual([7, 9])
  })

  it('팔로잉이 한 페이지를 다 채우고 끝나면 추천은 다음 요청으로 미룬다', async () => {
    get.mockRejectedValueOnce(httpError(404))
    get.mockResolvedValueOnce(
      ok({
        content: [followingItem(100, 1), followingItem(99, 2)],
        nextCursor: null,
        hasNext: false,
        size: 2,
      })
    )

    const result = await getFeed({ limit: 2 })

    // 이번 응답에서는 추천을 부르지 않는다.
    expect(calledPaths()).toEqual(['/api/v1/feed', '/api/v1/feed/following'])
    expect(result.hasNext).toBe(true)
    expect(result.nextCursor).toEqual({ source: 'recommend', cursorLike: null, cursorId: null })
  })

  it('추천 커서를 들고 있으면 추천만 이어서 읽는다', async () => {
    get.mockResolvedValueOnce(
      ok({
        content: [unifiedItem(11)],
        nextCursorId: 11,
        nextCursorLike: 2,
        hasNext: true,
        size: 1,
      })
    )

    const result = await getFeed({ cursor: { source: 'recommend', cursorLike: 5, cursorId: 20 } })

    // 통합·팔로잉을 다시 두드리지 않는다.
    expect(calledPaths()).toEqual(['/api/v1/feed/recommend'])
    expect(get.mock.calls[0][1].params).toMatchObject({ cursorLike: 5, cursorId: 20 })
    expect(result.content[0].reviewId).toBe(11)
  })

  it('한 번 404를 겪으면 이후에는 통합 경로를 다시 두드리지 않는다', async () => {
    get.mockRejectedValueOnce(httpError(404))
    get.mockResolvedValueOnce(
      ok({ content: [followingItem(100, 1)], nextCursor: 100, hasNext: true, size: 1 })
    )
    await getFeed({})
    get.mockClear()

    get.mockResolvedValueOnce(
      ok({ content: [followingItem(99, 2)], nextCursor: 99, hasNext: true, size: 1 })
    )
    await getFeed({ cursor: { source: 'following', feedCursor: 100 } })

    expect(calledPaths()).toEqual(['/api/v1/feed/following'])
  })

  it('404가 아닌 오류는 폴백하지 않고 그대로 알린다', async () => {
    get.mockRejectedValueOnce(httpError(500))

    await expect(getFeed({})).rejects.toThrow()
    // 서버가 살아 있는데 500이면 구 엔드포인트로 도망칠 일이 아니다.
    expect(calledPaths()).toEqual(['/api/v1/feed'])
  })
})
