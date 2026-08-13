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
 * (작성 시각, 리뷰 ID) 복합 커서다. 같은 시각에 쓰인 감상이 여럿이어도 페이지 경계에서
 * 새거나 중복되지 않도록 ID를 함께 쓴다. 호출부는 내용을 들여다보지 말고 받은 그대로
 * 다음 요청에 돌려주기만 하면 된다.
 */
export interface FeedCursor {
  createdAt: string
  id: number
}

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

/** 서버가 내려주는 원본 형태. 커서를 두 필드로 펼쳐서 준다. */
interface FeedApiResponse {
  content: FeedItem[]
  nextCursorCreatedAt: string | null
  nextCursorId: number | null
  hasNext: boolean
  size: number
}

/**
 * 통합 피드를 조회한다. 팔로우한 사람의 감상과 추천 감상이 함께 최신순으로 내려온다.
 *
 * @see docs/통합_피드_API_명세.md
 */
export async function getFeed({
  cursor = null,
  limit = 20,
  signal,
}: GetFeedParams): Promise<FeedListResponse> {
  try {
    const { data } = await apiClient.get<ApiResponse<FeedApiResponse>>('/api/v1/feed', {
      params: {
        limit,
        // 커서는 (작성 시각, 리뷰 ID) 한 쌍이라 둘 다 보내거나 둘 다 생략해야 한다.
        ...(cursor ? { cursorCreatedAt: cursor.createdAt, cursorId: cursor.id } : {}),
      },
      signal,
    })
    const parsed = parseApiResponse(data, '피드 응답이 올바르지 않습니다.')
    return {
      content: parsed.content,
      nextCursor:
        parsed.nextCursorCreatedAt != null && parsed.nextCursorId != null
          ? { createdAt: parsed.nextCursorCreatedAt, id: parsed.nextCursorId }
          : null,
      hasNext: parsed.hasNext,
      size: parsed.size,
    }
  } catch (error) {
    throw normalizeAxiosError(error, '피드를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
  }
}
