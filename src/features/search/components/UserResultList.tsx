import { useEffect, useRef } from 'react'
import UserSearchCard from '@/components/common/UserSearchCard'
import type { UserSearchItem } from '@/api/search'
import Icon from '@/components/common/Icon'

interface UserResultListProps {
  query: string
  users: UserSearchItem[]
  isLoading: boolean
  isLoadingMore: boolean
  errorMessage: string | null
  loadMoreError: string | null
  hasNext: boolean
  onLoadMore: () => void
  onRetryLoadMore: () => void
}

/**
 * 유저 탭 검색 결과 목록. IntersectionObserver로 무한 스크롤을 트리거한다
 * (페이징 상태는 React Query가 보유).
 */
export default function UserResultList({
  query,
  users,
  isLoading,
  isLoadingMore,
  errorMessage,
  loadMoreError,
  hasNext,
  onLoadMore,
  onRetryLoadMore,
}: UserResultListProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const stateRef = useRef({ hasNext, isLoadingMore, loadMoreError, onLoadMore })
  stateRef.current = { hasNext, isLoadingMore, loadMoreError, onLoadMore }

  const hasResults = users.length > 0
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      entries => {
        if (!entries[0]?.isIntersecting) return
        const s = stateRef.current
        if (s.loadMoreError || s.isLoadingMore || !s.hasNext) return
        s.onLoadMore()
      },
      { rootMargin: '200px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasResults])

  if (isLoading && users.length === 0) {
    return (
      <p role="status" aria-busy="true" className="py-10 text-center text-sm text-muted-foreground">
        검색 중...
      </p>
    )
  }

  if (!isLoading && errorMessage) {
    return (
      <p role="alert" className="py-10 text-center text-sm text-destructive">
        {errorMessage}
      </p>
    )
  }

  if (!isLoading && !errorMessage && users.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Icon name="person_search" className="text-5xl text-muted-foreground/30" />
        <p className="max-w-full truncate text-sm text-muted-foreground">
          &lsquo;{query}&rsquo;에 대한 유저 검색 결과가 없습니다.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {users.map(user => (
        <UserSearchCard key={user.userId} user={user} />
      ))}

      <div ref={sentinelRef} className="h-10" aria-hidden="true" />

      {isLoadingMore && (
        <p className="py-4 text-center text-xs text-muted-foreground">더 불러오는 중...</p>
      )}

      {loadMoreError && !isLoadingMore && (
        <div className="flex flex-col items-center gap-2 py-4">
          <p role="alert" className="text-sm text-destructive">
            {loadMoreError}
          </p>
          <button
            type="button"
            onClick={onRetryLoadMore}
            className="rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20"
          >
            다시 불러오기
          </button>
        </div>
      )}

      {!hasNext && !isLoadingMore && !loadMoreError && (
        <p className="py-4 text-center text-xs text-muted-foreground/50">
          모든 결과를 확인했습니다
        </p>
      )}
    </div>
  )
}
