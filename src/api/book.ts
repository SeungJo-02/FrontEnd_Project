import apiClient from './client'
import { ApiResponse, normalizeAxiosError, parseApiResponse } from './_helpers'

export interface BookSummary {
  bookId: number
  isbn13: string
  title: string
  author: string
  publisher: string
  coverImageUrl: string | null
  publishedDate: string | null
  inMyLibrary: boolean
}

export interface BookSearchListResponse {
  content: BookSummary[]
  nextCursor: number | null
  hasNext: boolean
  size: number
}

export interface BookGenreListResponse {
  content: BookSummary[]
  /** 1부터 시작하는 현재 페이지. */
  page: number
  totalPages: number
  totalElements: number
  hasNext: boolean
  size: number
}

/**
 * 장르에 속한 도서를 페이지로 조회한다.
 *
 * 검색과 달리 알라딘을 부르지 않고, 저장된 도서를 장르의 알라딘 카테고리 패턴으로 추린다.
 * 장르명을 검색어로 쓰던 방식은 제목에 그 낱말이 든 책만 걸려 '만화/라이트노벨'이 2권뿐이었다.
 */
export async function getBooksByGenre(
  genreId: number,
  limit = 20,
  page = 1,
  signal?: AbortSignal
): Promise<BookGenreListResponse> {
  try {
    const { data } = await apiClient.get<ApiResponse<BookGenreListResponse>>(
      '/api/v1/books/by-genre',
      { params: { genreId, limit, page }, signal }
    )
    return parseApiResponse(data, '장르별 도서 응답이 올바르지 않습니다.')
  } catch (error) {
    throw normalizeAxiosError(error, '추천 도서를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
  }
}

export type BackendReadingStatus = 'WANT_TO_READ' | 'READING' | 'FINISHED' | 'STOPPED'

export interface BookDetail {
  bookId: number
  isbn13: string
  title: string
  author: string
  publisher: string
  coverImageUrl: string | null
  description: string | null
  totalPages: number | null
  publishedDate: string | null
  aladinItemId: string | null
  averageRating: number | null
  reviewCount: number | null
  myLibraryStatus: BackendReadingStatus | null
  myLibraryBookId: number | null
  myReviewId: number | null
  // ISBN 조회(GET /books/isbn/{isbn13})에서만 채워짐. 도서 상세(GET /books/{bookId})에선 null
  inMyLibrary: boolean | null
}

export async function getBook(bookId: number, signal?: AbortSignal): Promise<BookDetail> {
  try {
    const { data } = await apiClient.get<ApiResponse<BookDetail>>(`/api/v1/books/${bookId}`, {
      signal,
    })
    if (!data.data) {
      throw new Error(data.message ?? '도서 조회 응답이 올바르지 않습니다.')
    }
    return data.data
  } catch (error) {
    throw normalizeAxiosError(error, '도서 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
  }
}

export async function getBookByIsbn(isbn13: string, signal?: AbortSignal): Promise<BookDetail> {
  try {
    const { data } = await apiClient.get<ApiResponse<BookDetail>>(
      `/api/v1/books/isbn/${encodeURIComponent(isbn13)}`,
      { signal }
    )
    if (!data.data) {
      throw new Error(data.message ?? 'ISBN 조회 응답이 올바르지 않습니다.')
    }
    return data.data
  } catch (error) {
    // ISBN 조회는 백엔드 `findOrCreateBook`(알라딘 호출 + DB save)을 거치므로
    // 검색과 동일하게 ISBN 중복 결함으로 409가 발생할 수 있어 도메인 무관
    // 일반 메시지로 치환 (docs/통합_검색_백엔드_결함_보고.md 참고).
    throw normalizeAxiosError(
      error,
      'ISBN으로 도서를 찾지 못했습니다. 잠시 후 다시 시도해주세요.',
      {
        suppress409Message: true,
      }
    )
  }
}

/**
 * 도서 검색. 백엔드가 알라딘 API를 page 번호 기반으로 호출하므로
 * 프론트도 cursor 대신 page를 전달한다. 응답의 `nextCursor`(bookId)는
 * DB 커서용으로 남아있지만 검색 페이지네이션에는 page 증가만 사용.
 */
export async function searchBooks(
  query: string,
  limit = 20,
  page = 1,
  signal?: AbortSignal
): Promise<BookSearchListResponse> {
  try {
    const { data } = await apiClient.get<ApiResponse<BookSearchListResponse>>(
      '/api/v1/books/search',
      {
        params: {
          query,
          limit,
          page,
        },
        signal,
      }
    )
    return parseApiResponse(data, '도서 검색 응답이 올바르지 않습니다.')
  } catch (error) {
    // 도서 검색은 백엔드 알라딘 ISBN 중복 결함으로 409가 발생할 수 있어
    // 도메인 무관 일반 메시지로 치환 (docs/통합_검색_백엔드_결함_보고.md 참고).
    throw normalizeAxiosError(error, '도서 검색에 실패했습니다. 잠시 후 다시 시도해주세요.', {
      suppress409Message: true,
    })
  }
}

export interface BookReviewUser {
  userId: number
  nickname: string
  profileImageUrl: string | null
}

export interface BookReviewItem {
  reviewId: number
  user: BookReviewUser
  rating: number
  content: string
  quote: string | null
  isSpoiler: boolean
  likeCount: number
  commentCount: number
  isLiked: boolean
  createdAt: string
}

export interface BookReviewListResponse {
  content: BookReviewItem[]
  nextCursor: number | null
  nextCursorRating: number | null
  nextCursorLike: number | null
  hasNext: boolean
  size: number
}

export type BookReviewSort = 'latest' | 'popular' | 'rating_high' | 'rating_low'

/**
 * 도서별 감상 목록을 조회한다.
 *
 * 정렬별 복합 커서 정책:
 * - `latest`: 단일 `cursor`(reviewId)
 * - `popular`: `cursorLike`(likeCount) + `cursor`(reviewId)
 * - `rating_high`/`rating_low`: `cursorRating`(rating) + `cursor`(reviewId)
 */
export async function getBookReviews(
  bookId: number,
  options?: {
    sort?: BookReviewSort
    cursor?: number | null
    cursorRating?: number | null
    cursorLike?: number | null
    limit?: number
    signal?: AbortSignal
  }
): Promise<BookReviewListResponse> {
  const { sort = 'latest', cursor, cursorRating, cursorLike, limit = 20, signal } = options ?? {}
  try {
    const { data } = await apiClient.get<ApiResponse<BookReviewListResponse>>(
      `/api/v1/books/${bookId}/reviews`,
      {
        params: {
          sort,
          limit,
          ...(cursor != null ? { cursor } : {}),
          ...(cursorRating != null ? { cursorRating } : {}),
          ...(cursorLike != null ? { cursorLike } : {}),
        },
        signal,
      }
    )
    return parseApiResponse(data, '감상 목록 응답이 올바르지 않습니다.')
  } catch (error) {
    throw normalizeAxiosError(error, '감상 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
  }
}
