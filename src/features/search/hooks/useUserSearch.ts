import { useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { searchAll, type UserSearchItem } from '@/api/search'
import { SEARCH_DEBOUNCE_MS, toSearchErrorMessage } from '@/features/search/types'
import { useDebouncedValue } from './useDebouncedValue'

export interface UserSearchView {
  users: UserSearchItem[]
  isLoading: boolean
  isLoadingMore: boolean
  errorMessage: string | null
  loadMoreError: string | null
  hasNext: boolean
  fetchMore: () => void
  retryLoadMore: () => void
}

/**
 * 유저 탭 검색 훅. 통합 검색 API(`searchAll` type='user', cursor 페이징)를
 * React Query `useInfiniteQuery`로 래핑한다.
 *
 * @param query 사용자 입력 검색어(trim 권장). 내부에서 debounce 적용.
 * @param isActive 유저 탭 활성 여부. 비활성이면 조회하지 않는다.
 */
export function useUserSearch(query: string, isActive: boolean): UserSearchView {
  const debounced = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)
  const isDebouncing = query !== debounced
  const enabled = isActive && debounced.length > 0

  const queryResult = useInfiniteQuery({
    queryKey: ['search', 'user', debounced],
    queryFn: async ({ pageParam, signal }) => {
      const response = await searchAll({
        query: debounced,
        type: 'user',
        cursor: pageParam,
        signal,
      })
      return response.users
    },
    initialPageParam: null as number | null,
    getNextPageParam: lastPage => (lastPage.hasNext ? lastPage.nextCursor : undefined),
    enabled,
  })

  const users = useMemo(() => {
    if (isDebouncing) return []
    return (queryResult.data?.pages ?? []).flatMap(page => page.content)
  }, [queryResult.data, isDebouncing])

  const hasData = (queryResult.data?.pages.length ?? 0) > 0

  return {
    users,
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
