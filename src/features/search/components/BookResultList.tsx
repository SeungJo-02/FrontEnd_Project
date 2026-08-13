import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import type { BookSummary } from '@/api/book'
import StatusMessage from '@/components/ui/StatusMessage'
import LoadMoreRetry from '@/components/ui/LoadMoreRetry'
import Icon from '@/components/common/Icon'

interface BookResultListProps {
  query: string
  books: BookSummary[]
  isLoading: boolean
  isLoadingMore: boolean
  errorMessage: string | null
  loadMoreError: string | null
  hasNext: boolean
  /** ISBN 단일 조회 모드 — "모든 결과를 확인했습니다" 안내를 숨긴다. */
  isIsbnMode: boolean
  onLoadMore: () => void
  onRetryLoadMore: () => void
  /** 결과 카드 클릭 시 현재 검색어를 최근 검색어로 저장. */
  onCommit: () => void
}

/**
 * 도서 탭 검색 결과 목록. IntersectionObserver로 무한 스크롤을 트리거한다
 * (관찰자는 `fetchNextPage` 호출 용도로만 사용하고 페이징 상태는 React Query가 보유).
 */
export default function BookResultList({
  query,
  books,
  isLoading,
  isLoadingMore,
  errorMessage,
  loadMoreError,
  hasNext,
  isIsbnMode,
  onLoadMore,
  onRetryLoadMore,
  onCommit,
}: BookResultListProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // observer 콜백에서 최신 값을 읽기 위한 ref (재구독 폭주 방지)
  const stateRef = useRef({ hasNext, isLoadingMore, loadMoreError, onLoadMore })
  stateRef.current = { hasNext, isLoadingMore, loadMoreError, onLoadMore }

  const hasResults = books.length > 0
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      entries => {
        if (!entries[0]?.isIntersecting) return
        const s = stateRef.current
        // 추가 로딩 에러가 떠 있으면 자동 재시도하지 않고 수동 재시도를 기다린다.
        if (s.loadMoreError || s.isLoadingMore || !s.hasNext) return
        s.onLoadMore()
      },
      { rootMargin: '200px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasResults])

  if (isLoading && books.length === 0) {
    return <StatusMessage tone="loading">검색 중...</StatusMessage>
  }

  if (!isLoading && errorMessage) {
    return <StatusMessage tone="error">{errorMessage}</StatusMessage>
  }

  if (!isLoading && !errorMessage && books.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Icon name="search_off" className="text-5xl text-muted-foreground/30" />
        <p className="max-w-full truncate text-sm text-muted-foreground">
          &lsquo;{query}&rsquo;에 대한 도서 검색 결과가 없습니다.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {books.map(book => (
        <Link
          key={book.bookId}
          to={`/book/${book.bookId}`}
          onClick={onCommit}
          className="flex items-start gap-4 border-b border-primary/5 py-5"
        >
          <div className="h-36 w-24 shrink-0 overflow-hidden rounded-lg bg-primary/5 shadow-sm">
            {book.coverImageUrl ? (
              <img
                src={book.coverImageUrl}
                alt={book.title}
                loading="lazy"
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center">
                <Icon name="menu_book" className="text-2xl text-muted-foreground/40" />
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h3 className="line-clamp-2 text-lg font-bold leading-tight text-primary">
              {book.title}
            </h3>
            <p className="truncate text-sm text-muted-foreground">{book.author} 저</p>
            <p className="truncate text-xs text-muted-foreground/70">{book.publisher}</p>
            {book.inMyLibrary && (
              <span className="mt-1 w-fit rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                내 서재에 있음
              </span>
            )}
          </div>
        </Link>
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

      {!hasNext && !isLoadingMore && !loadMoreError && !isIsbnMode && (
        <StatusMessage tone="hint" compact className="text-muted-foreground/50">
          모든 결과를 확인했습니다
        </StatusMessage>
      )}
    </div>
  )
}
