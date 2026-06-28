import { useQuery } from '@tanstack/react-query'
import { searchAll, type BookSearchItem, type UserSearchItem } from '@/api/search'
import {
  ALL_TAB_PREVIEW_COUNT,
  SEARCH_DEBOUNCE_MS,
  toSearchErrorMessage,
} from '@/features/search/types'
import { useDebouncedValue } from './useDebouncedValue'

export interface AllSearchView {
  books: BookSearchItem[]
  users: UserSearchItem[]
  booksHasMore: boolean
  usersHasMore: boolean
  isLoading: boolean
  errorMessage: string | null
}

/**
 * 전체 탭 검색 훅. 통합 검색 API(`searchAll` type='all')로 도서/유저를 각각
 * `ALL_TAB_PREVIEW_COUNT`건씩 미리보기로 조회한다(페이지네이션 없음).
 *
 * @param query 사용자 입력 검색어(trim 권장). 내부에서 debounce 적용.
 * @param isActive 전체 탭 활성 여부. 비활성이면 조회하지 않는다.
 */
export function useAllSearch(query: string, isActive: boolean): AllSearchView {
  const debounced = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)
  const isDebouncing = query !== debounced
  const enabled = isActive && debounced.length > 0

  const queryResult = useQuery({
    queryKey: ['search', 'all', debounced],
    queryFn: ({ signal }) =>
      searchAll({
        query: debounced,
        type: 'all',
        cursor: null,
        // 미리보기 정책에 맞춰 백엔드 호출도 미리보기 크기로 제한 — 불필요한 페이로드 절약.
        limit: ALL_TAB_PREVIEW_COUNT,
        signal,
      }),
    enabled,
  })

  const data = isDebouncing ? undefined : queryResult.data

  return {
    books: data?.books.content ?? [],
    users: data?.users.content ?? [],
    booksHasMore: data?.books.hasNext ?? false,
    usersHasMore: data?.users.hasNext ?? false,
    // 입력 직후 debounce 대기 구간(아직 enabled 전)에도 "검색 중..."을 보이도록 live query 기준.
    isLoading: isActive && query.length > 0 && (isDebouncing || queryResult.isLoading),
    errorMessage: queryResult.isError
      ? toSearchErrorMessage(queryResult.error, '검색에 실패했습니다.')
      : null,
  }
}
