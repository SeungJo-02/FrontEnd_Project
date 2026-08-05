import axios from 'axios'
import apiClient from './client'
import { ApiResponse, normalizeAxiosError, parseApiResponse } from './_helpers'

export interface FeedReviewUser {
  userId: number
  nickname: string
  profileImageUrl: string | null
}

export interface FeedReviewBook {
  bookId: number
  title: string
  author: string
  coverImageUrl: string | null
  category: string | null
}

/**
 * 통합 피드의 감상 카드 한 장.
 *
 * 팔로잉/추천이 하나의 피드로 합쳐지면서 출처와 무관하게 같은 모양이 되었다.
 * 추천 감상에는 대응하는 피드 행이 없으므로 예전의 `feedId` 래퍼는 사라졌고,
 * 리뷰 필드가 최상위에 바로 온다.
 */
export interface FeedItem {
  reviewId: number
  user: FeedReviewUser
  book: FeedReviewBook
  rating: number
  content: string
  quote: string | null
  isSpoiler: boolean
  likeCount: number
  commentCount: number
  isLiked: boolean
  tags: string[]
  // 서버 LocalDateTime ISO 문자열 (offset 없음). 클라이언트는 로컬 KST로 해석.
  createdAt: string
}

/**
 * 다음 페이지를 가리키는 불투명 토큰.
 *
 * 통합 엔드포인트와 구 엔드포인트는 페이징 기준이 서로 다르다(아래 폴백 설명 참고).
 * 호출부가 그 차이를 몰라도 되도록, 커서를 숫자 쌍이 아니라 이 객체로 주고받는다.
 * 호출부는 내용을 들여다보지 말고 받은 그대로 다음 요청에 돌려주기만 하면 된다.
 */
export type FeedCursor =
  /** 통합 엔드포인트 — (작성 시각, 리뷰 ID) 복합 커서. */
  | { source: 'unified'; createdAt: string; id: number }
  /** 폴백 1단계: 팔로잉 피드 — 피드 행 ID 커서. */
  | { source: 'following'; feedCursor: number }
  /** 폴백 2단계: 추천 피드 — (좋아요 수, 리뷰 ID) 커서. 둘 다 null이면 첫 페이지. */
  | { source: 'recommend'; cursorLike: number | null; cursorId: number | null }

export interface FeedListResponse {
  content: FeedItem[]
  /** 다음 페이지 커서. 마지막 페이지면 null. */
  nextCursor: FeedCursor | null
  hasNext: boolean
  size: number
}

export interface GetFeedParams {
  /** 직전 응답의 `nextCursor`. 첫 페이지면 생략하거나 null. */
  cursor?: FeedCursor | null
  limit?: number
  signal?: AbortSignal
}

// ── 통합 엔드포인트 ────────────────────────────────────────────

/** 서버가 통합 엔드포인트를 제공하는지. null이면 아직 확인 전. */
let hasUnifiedFeed: boolean | null = null

/** 통합 엔드포인트 응답 형태(서버가 내려주는 원본). */
interface UnifiedFeedResponse {
  content: FeedItem[]
  nextCursorCreatedAt: string | null
  nextCursorId: number | null
  hasNext: boolean
  size: number
}

/** 통합 엔드포인트가 아직 없으면 null을 반환한다(그 외 오류는 그대로 던진다). */
async function fetchUnified(
  cursor: FeedCursor | null,
  limit: number,
  signal?: AbortSignal
): Promise<FeedListResponse | null> {
  const at = cursor?.source === 'unified' ? cursor : null
  try {
    const { data } = await apiClient.get<ApiResponse<UnifiedFeedResponse>>('/api/v1/feed', {
      params: {
        limit,
        // 커서는 (작성 시각, 리뷰 ID) 한 쌍이라 둘 다 보내거나 둘 다 생략해야 한다.
        ...(at ? { cursorCreatedAt: at.createdAt, cursorId: at.id } : {}),
      },
      signal,
    })
    const parsed = parseApiResponse(data, '피드 응답이 올바르지 않습니다.')
    hasUnifiedFeed = true
    return {
      content: parsed.content,
      nextCursor:
        parsed.nextCursorCreatedAt != null && parsed.nextCursorId != null
          ? { source: 'unified', createdAt: parsed.nextCursorCreatedAt, id: parsed.nextCursorId }
          : null,
      hasNext: parsed.hasNext,
      size: parsed.size,
    }
  } catch (error) {
    // 배포 시점 차이로 서버에 통합 엔드포인트가 아직 없을 수 있다. 이때만 폴백한다.
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      hasUnifiedFeed = false
      return null
    }
    throw normalizeAxiosError(error, '피드를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
  }
}

// ── 폴백: 구 엔드포인트 두 개 ──────────────────────────────────

interface LegacyFollowingReview {
  reviewId: number
  user: FeedReviewUser
  book: Omit<FeedReviewBook, 'category'>
  rating: number
  content: string
  quote: string | null
  isSpoiler: boolean
  likeCount: number
  commentCount: number
  isLiked: boolean
  tags: string[]
  createdAt: string
}

interface LegacyFollowingResponse {
  content: Array<{ feedId: number; review: LegacyFollowingReview }>
  nextCursor: number | null
  hasNext: boolean
  size: number
}

interface LegacyRecommendResponse {
  content: FeedItem[]
  nextCursorId: number | null
  nextCursorLike: number | null
  hasNext: boolean
  size: number
}

/** 구 팔로잉 피드의 `{feedId, review}` 래퍼를 벗겨 통합 형태로 맞춘다. */
function fromFollowing(item: { review: LegacyFollowingReview }): FeedItem {
  // 구 팔로잉 응답에는 분류가 없다. 카드가 쓰지 않는 값이라 null로 채운다.
  return { ...item.review, book: { ...item.review.book, category: null } }
}

async function fetchFollowing(
  cursor: number | null,
  limit: number,
  signal?: AbortSignal
): Promise<LegacyFollowingResponse> {
  try {
    const { data } = await apiClient.get<ApiResponse<LegacyFollowingResponse>>(
      '/api/v1/feed/following',
      { params: { limit, ...(cursor != null ? { cursor } : {}) }, signal }
    )
    return parseApiResponse(data, '피드 응답이 올바르지 않습니다.')
  } catch (error) {
    throw normalizeAxiosError(error, '피드를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
  }
}

async function fetchRecommend(
  cursorLike: number | null,
  cursorId: number | null,
  limit: number,
  signal?: AbortSignal
): Promise<LegacyRecommendResponse> {
  try {
    const { data } = await apiClient.get<ApiResponse<LegacyRecommendResponse>>(
      '/api/v1/feed/recommend',
      {
        params: {
          limit,
          ...(cursorLike != null ? { cursorLike } : {}),
          ...(cursorId != null ? { cursorId } : {}),
        },
        signal,
      }
    )
    return parseApiResponse(data, '추천 피드 응답이 올바르지 않습니다.')
  } catch (error) {
    throw normalizeAxiosError(error, '추천 피드를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
  }
}

function toRecommendCursor(response: LegacyRecommendResponse): FeedCursor | null {
  if (!response.hasNext) return null
  if (response.nextCursorLike == null && response.nextCursorId == null) return null
  return {
    source: 'recommend',
    cursorLike: response.nextCursorLike,
    cursorId: response.nextCursorId,
  }
}

/**
 * 구 엔드포인트 두 개로 한 페이지를 만든다.
 *
 * 팔로잉을 먼저 소진하고 그 뒤에 추천으로 넘어간다. 두 응답을 작성 시각으로 뒤섞지는
 * 않는데, 추천 피드가 시간순이 아니라 **좋아요 순**으로 페이징되기 때문이다
 * (`cursorLike`). 각 소스를 자기 정렬 기준대로 이어 붙이는 편이 페이지 경계에서
 * 감상이 새거나 중복되지 않는다.
 */
async function fetchLegacy(
  cursor: FeedCursor | null,
  limit: number,
  signal?: AbortSignal
): Promise<FeedListResponse> {
  // 이미 추천 구간에 들어섰으면 추천만 이어서 읽는다.
  if (cursor?.source === 'recommend') {
    const recommend = await fetchRecommend(cursor.cursorLike, cursor.cursorId, limit, signal)
    return {
      content: recommend.content,
      nextCursor: toRecommendCursor(recommend),
      hasNext: recommend.hasNext,
      size: recommend.size,
    }
  }

  const following = await fetchFollowing(
    cursor?.source === 'following' ? cursor.feedCursor : null,
    limit,
    signal
  )
  const items = following.content.map(fromFollowing)

  if (following.hasNext && following.nextCursor != null) {
    return {
      content: items,
      nextCursor: { source: 'following', feedCursor: following.nextCursor },
      hasNext: true,
      size: items.length,
    }
  }

  // 팔로잉이 끝났다 — 다음은 추천 차례. 페이지가 이미 찼으면 다음 요청으로 미룬다.
  const remaining = limit - items.length
  if (remaining <= 0) {
    return {
      content: items,
      nextCursor: { source: 'recommend', cursorLike: null, cursorId: null },
      hasNext: true,
      size: items.length,
    }
  }

  // 갓 가입해 팔로잉이 비어 있어도 첫 화면이 비지 않도록, 같은 응답에 추천을 채워 보낸다.
  const recommend = await fetchRecommend(null, null, remaining, signal)
  const seen = new Set(items.map(item => item.reviewId))
  // 팔로우한 사람의 감상이 추천에도 뽑히면 카드가 두 번 나온다.
  const merged = [...items, ...recommend.content.filter(item => !seen.has(item.reviewId))]

  return {
    content: merged,
    nextCursor: toRecommendCursor(recommend),
    hasNext: recommend.hasNext,
    size: merged.length,
  }
}

// ── 공개 API ───────────────────────────────────────────────────

/**
 * 통합 피드를 조회한다. 팔로우한 사람의 감상과 추천 감상이 함께 내려온다.
 *
 * 서버에 통합 엔드포인트(`GET /api/v1/feed`)가 있으면 그것을 쓰고, 아직 배포되지 않아
 * 404가 나면 구 엔드포인트 두 개(`/feed/following` → `/feed/recommend`)로 자동
 * 폴백한다. 프론트가 통합 방식으로 먼저 넘어가면서 홈 화면이 404로 덮이는 것을 막기
 * 위한 다리이며, 서버에 통합 엔드포인트가 올라오면 첫 호출부터 그쪽만 쓰게 된다.
 *
 * 폴백 여부는 세션 단위로 기억한다(첫 404 이후에는 통합 경로를 다시 두드리지 않는다).
 * 새로고침하면 다시 확인하므로, 서버 배포 후 사용자가 별도로 할 일은 없다.
 *
 * @see docs/통합_피드_API_명세.md
 */
export async function getFeed({
  cursor = null,
  limit = 20,
  signal,
}: GetFeedParams): Promise<FeedListResponse> {
  // 이미 폴백 중이거나, 구 엔드포인트 커서를 들고 있으면 통합 경로를 건너뛴다.
  const skipUnified = hasUnifiedFeed === false || (cursor != null && cursor.source !== 'unified')
  if (!skipUnified) {
    const unified = await fetchUnified(cursor, limit, signal)
    if (unified) return unified
  }
  return fetchLegacy(cursor, limit, signal)
}

/** 테스트 전용 — 통합 엔드포인트 지원 여부 캐시를 초기화한다. */
export function __resetFeedEndpointCache() {
  hasUnifiedFeed = null
}
