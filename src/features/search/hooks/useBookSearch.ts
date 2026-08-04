import { useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { getBookByIsbn, searchBooks, type BookSummary } from '@/api/book'
import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_PAGE_SIZE,
  isValidIsbn13,
  isbnResultToSummary,
  toSearchErrorMessage,
} from '@/features/search/types'
import { isBoxSetTitle } from '@/features/search/isBoxSet'
import { useDebouncedValue } from './useDebouncedValue'

interface BookSearchPage {
  content: BookSummary[]
  hasNext: boolean
}

export interface BookSearchView {
  books: BookSummary[]
  /** 첫 페이지 로딩(debounce 대기 포함). */
  isLoading: boolean
  /** 다음 페이지 추가 로딩. */
  isLoadingMore: boolean
  /** 첫 페이지 에러 메시지. */
  errorMessage: string | null
  /** 추가 로딩 에러 메시지. */
  loadMoreError: string | null
  hasNext: boolean
  fetchMore: () => void
  retryLoadMore: () => void
}

/**
 * 도서 탭 검색 훅. `searchBooks`(page 기반 페이지네이션)를 React Query
 * `useInfiniteQuery`로 래핑한다. 검색어가 유효한 ISBN13이면 `getBookByIsbn`으로
 * 단일 도서를 정확 조회(페이지네이션 없음)한다.
 *
 * @param query 사용자 입력 검색어(trim 권장). 내부에서 debounce 적용.
 * @param isActive 도서 탭 활성 여부. 비활성이면 조회하지 않는다.
 */
export function useBookSearch(query: string, isActive: boolean): BookSearchView {
  const debounced = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)
  // debounce 대기 구간(입력 직후~지연 발화 전)에는 이전 검색 결과를 숨겨 stale UI를 방지한다.
  const isDebouncing = query !== debounced
  const enabled = isActive && debounced.length > 0

  const queryResult = useInfiniteQuery({
    queryKey: ['search', 'book', debounced],
    queryFn: async ({ pageParam, signal }): Promise<BookSearchPage> => {
      if (isValidIsbn13(debounced)) {
        // ISBN 모드: 단일 도서 정확 조회 — 페이지네이션 없음
        const book = await getBookByIsbn(debounced, signal)
        return { content: [isbnResultToSummary(book)], hasNext: false }
      }
      const response = await searchBooks(debounced, SEARCH_PAGE_SIZE, pageParam, signal)
      return { content: response.content, hasNext: response.hasNext }
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages, lastPageParam) => {
      if (!lastPage.hasNext) return undefined
      // 백엔드가 hasNext=true로 같은 페이지를 반복 응답하는 결함 방어:
      // 마지막 페이지에 신규 bookId가 하나도 없으면 페이지네이션을 중단한다.
      const seen = new Set(
        allPages.slice(0, -1).flatMap(page => page.content.map(book => book.bookId))
      )
      const hasNew = lastPage.content.some(book => !seen.has(book.bookId))
      return hasNew ? lastPageParam + 1 : undefined
    },
    enabled,
  })

  // 페이지 간 bookId 중복 제거(무한스크롤 dedup 정책 보존) + 세트 상품 제외.
  const books = useMemo(() => {
    if (isDebouncing) return []
    const seen = new Set<number>()
    const result: BookSummary[] = []
    for (const page of queryResult.data?.pages ?? []) {
      for (const book of page.content) {
        if (seen.has(book.bookId)) continue
        seen.add(book.bookId)
        // 알라딘은 `1~14권 세트` 같은 묶음 상품도 같이 돌려준다. 한 권 단위로 읽고
        // 기록하는 앱이라 서재에 담을 수 없는 결과여서 목록에서 제외한다.
        if (isBoxSetTitle(book.title)) continue
        result.push(book)
      }
    }
    return result
  }, [queryResult.data, isDebouncing])

  const hasData = (queryResult.data?.pages.length ?? 0) > 0

  return {
    books,
    // 입력 직후 debounce 대기 구간(아직 enabled 전)에도 "검색 중..."을 보이도록 live query 기준.
    isLoading: isActive && query.length > 0 && (isDebouncing || queryResult.isLoading),
    isLoadingMore: queryResult.isFetchingNextPage,
    errorMessage:
      queryResult.isError && !hasData
        ? toSearchErrorMessage(queryResult.error, '검색에 실패했습니다.')
        : null,
    loadMoreError: queryResult.isFetchNextPageError
      ? toSearchErrorMessage(queryResult.error, '추가 로딩에 실패했습니다.')
      : null,
    hasNext: queryResult.hasNextPage,
    fetchMore: () => {
      void queryResult.fetchNextPage()
    },
    retryLoadMore: () => {
      void queryResult.fetchNextPage()
    },
  }
}
