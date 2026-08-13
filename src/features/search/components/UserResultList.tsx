import { useEffect, useRef } from 'react'
import UserSearchCard from '@/components/common/UserSearchCard'
import type { UserSearchItem } from '@/api/search'
import StatusMessage from '@/components/ui/StatusMessage'
import LoadMoreRetry from '@/components/ui/LoadMoreRetry'
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
    return <StatusMessage tone="loading">검색 중...</StatusMessage>
  }

  if (!isLoading && errorMessage) {
    return <StatusMessage tone="error">{errorMessage}</StatusMessage>
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
        <StatusMessage tone="hint" compact>
          더 불러오는 중...
        </StatusMessage>
      )}

      {loadMoreError && !isLoadingMore && (
        <LoadMoreRetry message={loadMoreError} onRetry={onRetryLoadMore} />
      )}

      {!hasNext && !isLoadingMore && !loadMoreError && (
        <StatusMessage tone="hint" compact className="text-muted-foreground/50">
          모든 결과를 확인했습니다
        </StatusMessage>
      )}
    </div>
  )
}
