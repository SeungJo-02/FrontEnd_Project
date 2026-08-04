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

export interface FeedListResponse {
  content: FeedItem[]
  /** 다음 페이지 커서 — 마지막 항목의 작성 시각. 마지막 페이지면 null. */
  nextCursorCreatedAt: string | null
  /** 다음 페이지 커서 — 마지막 항목의 리뷰 ID. 작성 시각이 같을 때 순서를 가른다. */
  nextCursorId: number | null
  hasNext: boolean
  size: number
}

export interface GetFeedParams {
  cursorCreatedAt?: string | null
  cursorId?: number | null
  limit?: number
  signal?: AbortSignal
}

/**
 * 통합 피드를 조회한다. 팔로우한 사람의 감상과 추천 감상이 작성 시각 최신순으로 함께 내려온다.
 *
 * 커서는 (작성 시각, 리뷰 ID) 한 쌍이라 둘 다 넘기거나 둘 다 생략해야 한다.
 * 한쪽만 보내면 서버가 400으로 거절한다.
 */
export async function getFeed({
  cursorCreatedAt,
  cursorId,
  limit = 20,
  signal,
}: GetFeedParams): Promise<FeedListResponse> {
  const hasCursor = cursorCreatedAt != null && cursorId != null
  try {
    const { data } = await apiClient.get<ApiResponse<FeedListResponse>>('/api/v1/feed', {
      params: {
        limit,
        ...(hasCursor ? { cursorCreatedAt, cursorId } : {}),
      },
      signal,
    })
    return parseApiResponse(data, '피드 응답이 올바르지 않습니다.')
  } catch (error) {
    throw normalizeAxiosError(error, '피드를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
  }
}
