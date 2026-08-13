import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import AppHeader from '@/components/layout/AppHeader'
import BottomNav from '@/components/layout/BottomNav'
import { EmptyState } from '@/components/common/EmptyState'
import { deleteReview, getMyReviews, REVIEW_PAGE_SIZE, type ReviewListItem } from '@/api/review'
import { formatRelativeTime } from '@/lib/utils'
import { Screen } from '@/components/layout/Screen'
import Icon from '@/components/common/Icon'

/**
 * 임시저장(DRAFT) 감상 보관함.
 *
 * `getMyReviews({ status: 'DRAFT' })`로 본인 임시저장 감상만 커서 기반으로 조회한다.
 * 각 항목은 작성 페이지의 수정 모드(`/review/:reviewId/edit`)로 진입해 이어쓰거나 발행할 수 있고,
 * 보관함에서 바로 삭제할 수도 있다. 임시저장은 본인만 볼 수 있으므로 스포일러 블러 처리는 하지 않는다.
 */
export default function DraftsListPage() {
  const navigate = useNavigate()
  const [drafts, setDrafts] = useState<ReviewListItem[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const loadMoreControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setErrorMessage(null)
    ;(async () => {
      try {
        const response = await getMyReviews({
          cursor: null,
          status: 'DRAFT',
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setDrafts(response)
        setNextCursor(response.length > 0 ? response[response.length - 1].reviewId : null)
        setHasMore(response.length === REVIEW_PAGE_SIZE)
      } catch (error) {
        if (axios.isCancel(error) || controller.signal.aborted) return
        setErrorMessage(
          error instanceof Error ? error.message : '임시저장 목록을 불러오지 못했습니다.'
        )
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    })()

    return () => {
      controller.abort()
      loadMoreControllerRef.current?.abort()
    }
  }, [])

  const handleLoadMore = async () => {
    if (isLoadingMore || !hasMore) return

    loadMoreControllerRef.current?.abort()
    const controller = new AbortController()
    loadMoreControllerRef.current = controller

    setIsLoadingMore(true)
    setErrorMessage(null)
    try {
      const response = await getMyReviews({
        cursor: nextCursor,
        status: 'DRAFT',
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      if (response.length === 0) {
        setHasMore(false)
        return
      }
      setDrafts(prev => [...prev, ...response])
      setNextCursor(response[response.length - 1].reviewId)
      setHasMore(response.length === REVIEW_PAGE_SIZE)
    } catch (error) {
      if (axios.isCancel(error) || controller.signal.aborted) return
      setErrorMessage(
        error instanceof Error ? error.message : '임시저장 목록을 더 불러오지 못했습니다.'
      )
    } finally {
      if (!controller.signal.aborted) setIsLoadingMore(false)
    }
  }

  const handleDelete = async (reviewId: number) => {
    if (deletingId != null) return
    if (!window.confirm('이 임시저장을 삭제할까요?')) return

    setDeletingId(reviewId)
    setErrorMessage(null)
    try {
      await deleteReview(reviewId)
      setDrafts(prev => prev.filter(d => d.reviewId !== reviewId))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '임시저장을 삭제하지 못했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Screen>
      <AppHeader title="임시저장" showBack />

      <main className="flex-1 overflow-y-auto px-6 pb-24 pt-6">
        {isLoading ? (
          <p role="status" className="py-12 text-center text-sm text-muted-foreground">
            불러오는 중...
          </p>
        ) : drafts.length === 0 && !errorMessage ? (
          <EmptyState
            icon="draft"
            message="임시저장한 감상이 없습니다"
            className="rounded-tile bg-card py-16 shadow-sm"
          >
            <p className="text-xs text-muted-foreground/60">
              감상 작성 중 임시저장하면 여기에 보관돼요
            </p>
          </EmptyState>
        ) : (
          <div className="space-y-4">
            {drafts.map(draft => (
              <div key={draft.reviewId} className="flex gap-4 rounded-tile bg-card p-4 shadow-sm">
                <button
                  type="button"
                  onClick={() => navigate(`/review/${draft.reviewId}/edit`)}
                  className="flex min-w-0 flex-1 gap-4 text-left transition-opacity hover:opacity-80"
                  aria-label={`${draft.book.title} 임시저장 이어쓰기`}
                >
                  <div className="flex h-[96px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-control bg-primary/5">
                    {draft.book.coverImageUrl ? (
                      <img
                        src={draft.book.coverImageUrl}
                        alt={`${draft.book.title} 표지`}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <Icon name="menu_book" className="text-3xl text-muted-foreground/30" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 pt-1">
                    <h3 className="line-clamp-1 text-xl font-bold text-foreground">
                      {draft.book.title}
                    </h3>
                    <p className="mt-1 text-sm font-medium text-primary/40">
                      {formatRelativeTime(draft.createdAt)}
                    </p>
                    <p className="mt-3 line-clamp-2 text-base leading-6 text-foreground/65">
                      {draft.content || '작성 중인 감상...'}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleDelete(draft.reviewId)}
                  disabled={deletingId === draft.reviewId}
                  aria-label="임시저장 삭제"
                  className="flex size-9 shrink-0 items-center justify-center self-start rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                >
                  <Icon
                    name={deletingId === draft.reviewId ? 'progress_activity' : 'delete'}
                    className="text-[20px]"
                  />
                </button>
              </div>
            ))}
          </div>
        )}

        {errorMessage && (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-center text-sm text-destructive"
          >
            {errorMessage}
          </p>
        )}

        {hasMore && !isLoading && (
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            className="mt-5 w-full rounded-xl bg-primary/10 py-3 text-sm font-bold text-primary transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoadingMore ? '불러오는 중...' : '더 보기'}
          </button>
        )}
      </main>

      <BottomNav />
    </Screen>
  )
}
