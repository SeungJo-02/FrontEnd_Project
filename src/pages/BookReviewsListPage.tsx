import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import axios from 'axios'
import {
  getBook,
  getBookReviews,
  type BookDetail,
  type BookReviewItem,
  type BookReviewSort,
} from '@/api/book'
import { likeReview, unlikeReview } from '@/api/review'
import { cn, formatRelativeTime } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import AppHeader from '@/components/layout/AppHeader'
import BottomNav from '@/components/layout/BottomNav'
import StarRating from '@/components/common/StarRating'
import { Avatar } from '@/components/common/Avatar'
import { EmptyState } from '@/components/common/EmptyState'

const sortOptions: { label: string; value: BookReviewSort }[] = [
  { label: '최신순', value: 'latest' },
  { label: '인기순', value: 'popular' },
  { label: '별점 높은순', value: 'rating_high' },
  { label: '별점 낮은순', value: 'rating_low' },
]

/**
 * 도서별 감상 전체보기 페이지.
 *
 * BookDetailPage의 "전체보기" 링크에서 진입. 정렬 변경 시 목록을 초기화하고
 * 첫 페이지를 다시 로드. 무한 스크롤로 다음 페이지 추가.
 */
export default function BookReviewsListPage() {
  const { bookId: bookIdParam } = useParams()
  const navigate = useNavigate()
  const currentUserId = useAuthStore(state => state.user?.id)
  const bookId = Number(bookIdParam)

  const [book, setBook] = useState<BookDetail | null>(null)
  const [reviews, setReviews] = useState<BookReviewItem[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [nextCursorRating, setNextCursorRating] = useState<number | null>(null)
  const [nextCursorLike, setNextCursorLike] = useState<number | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const [activeSort, setActiveSort] = useState<BookReviewSort>('latest')
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<number>>(new Set())

  const likingIdsRef = useRef(new Set<number>())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const moreControllerRef = useRef<AbortController | null>(null)
  const stateRef = useRef({
    hasNext,
    isLoading,
    isLoadingMore,
    nextCursor,
    nextCursorRating,
    nextCursorLike,
    loadMoreError,
    activeSort,
  })
  stateRef.current = {
    hasNext,
    isLoading,
    isLoadingMore,
    nextCursor,
    nextCursorRating,
    nextCursorLike,
    loadMoreError,
    activeSort,
  }

  // 도서 정보 로드 — bookId에만 의존
  useEffect(() => {
    if (!Number.isFinite(bookId)) {
      setErrorMessage('도서 정보가 올바르지 않습니다.')
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    ;(async () => {
      try {
        const result = await getBook(bookId, controller.signal)
        if (controller.signal.aborted) return
        setBook(result)
      } catch (error) {
        if (axios.isCancel(error) || controller.signal.aborted) return
        setErrorMessage(error instanceof Error ? error.message : '도서 정보를 불러오지 못했습니다.')
      }
    })()

    return () => controller.abort()
  }, [bookId])

  // 감상 목록 로드 — bookId + activeSort 변경 시 초기화 + 재로드
  useEffect(() => {
    if (!Number.isFinite(bookId)) return

    moreControllerRef.current?.abort()
    const controller = new AbortController()
    setIsLoading(true)
    setErrorMessage(null)
    setReviews([])
    setNextCursor(null)
    setNextCursorRating(null)
    setNextCursorLike(null)
    setHasNext(false)
    setIsLoadingMore(false)
    setLoadMoreError(null)
    setRevealedSpoilers(new Set())
    ;(async () => {
      try {
        const reviewResult = await getBookReviews(bookId, {
          sort: activeSort,
          limit: 20,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setReviews(reviewResult.content)
        setNextCursor(reviewResult.nextCursor)
        setNextCursorRating(reviewResult.nextCursorRating)
        setNextCursorLike(reviewResult.nextCursorLike)
        setHasNext(reviewResult.hasNext)
      } catch (error) {
        if (axios.isCancel(error) || controller.signal.aborted) return
        setErrorMessage(error instanceof Error ? error.message : '감상을 불러오지 못했습니다.')
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    })()

    return () => {
      controller.abort()
      moreControllerRef.current?.abort()
    }
  }, [bookId, activeSort])

  const fetchMore = useCallback(async () => {
    const s = stateRef.current
    if (s.isLoadingMore || s.isLoading || !s.hasNext) return

    moreControllerRef.current?.abort()
    const controller = new AbortController()
    moreControllerRef.current = controller

    setIsLoadingMore(true)
    setLoadMoreError(null)
    try {
      const response = await getBookReviews(bookId, {
        sort: s.activeSort,
        cursor: s.nextCursor,
        cursorRating: s.nextCursorRating,
        cursorLike: s.nextCursorLike,
        limit: 20,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      setReviews(prev => {
        const existingIds = new Set(prev.map(r => r.reviewId))
        const deduped = response.content.filter(r => !existingIds.has(r.reviewId))
        return deduped.length > 0 ? [...prev, ...deduped] : prev
      })
      const hasNewItems = response.content.length > 0
      if (hasNewItems) {
        setNextCursor(response.nextCursor)
        setNextCursorRating(response.nextCursorRating)
        setNextCursorLike(response.nextCursorLike)
      }
      setHasNext(hasNewItems && response.hasNext)
    } catch (error) {
      if (axios.isCancel(error) || controller.signal.aborted) return
      setLoadMoreError(error instanceof Error ? error.message : '추가 로딩에 실패했습니다.')
    } finally {
      if (!controller.signal.aborted) setIsLoadingMore(false)
    }
  }, [bookId])

  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect()
      if (!node) {
        observerRef.current = null
        return
      }
      observerRef.current = new IntersectionObserver(
        entries => {
          if (!entries[0]?.isIntersecting) return
          if (stateRef.current.loadMoreError) return
          fetchMore()
        },
        { rootMargin: '200px' }
      )
      observerRef.current.observe(node)
    },
    [fetchMore]
  )

  useEffect(() => () => observerRef.current?.disconnect(), [])

  const handleToggleLike = async (
    reviewId: number,
    currentlyLiked: boolean,
    currentCount: number
  ) => {
    if (likingIdsRef.current.has(reviewId)) return
    likingIdsRef.current.add(reviewId)
    setReviews(prev =>
      prev.map(r =>
        r.reviewId === reviewId
          ? { ...r, isLiked: !currentlyLiked, likeCount: currentCount + (currentlyLiked ? -1 : 1) }
          : r
      )
    )
    try {
      const result = currentlyLiked ? await unlikeReview(reviewId) : await likeReview(reviewId)
      setReviews(prev =>
        prev.map(r => (r.reviewId === reviewId ? { ...r, likeCount: result.likeCount } : r))
      )
    } catch {
      setReviews(prev =>
        prev.map(r =>
          r.reviewId === reviewId ? { ...r, isLiked: currentlyLiked, likeCount: currentCount } : r
        )
      )
    } finally {
      likingIdsRef.current.delete(reviewId)
    }
  }

  const toggleSpoiler = (reviewId: number) => {
    setRevealedSpoilers(prev => {
      const next = new Set(prev)
      next.add(reviewId)
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <AppHeader title="독자 감상" showBack />
        <main aria-busy="true" className="flex flex-1 items-center justify-center pb-24">
          <p role="status" className="text-sm text-muted-foreground">
            불러오는 중...
          </p>
        </main>
        <BottomNav />
      </div>
    )
  }

  if (errorMessage || !book) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <AppHeader title="독자 감상" showBack />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 pb-24">
          <span className="material-symbols-outlined text-6xl text-muted-foreground/30">
            search_off
          </span>
          <p className="text-lg font-bold text-muted-foreground">도서를 찾을 수 없습니다</p>
          {errorMessage && (
            <p role="alert" className="max-w-[280px] text-center text-sm text-muted-foreground">
              {errorMessage}
            </p>
          )}
          <button
            onClick={() => navigate(-1)}
            className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground"
          >
            돌아가기
          </button>
        </main>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader title="독자 감상" showBack />

      <main className="flex-1 overflow-y-auto pb-24">
        {/* Book Context */}
        <section className="px-6 pb-4 pt-6">
          <div className="flex items-center gap-3 rounded-xl bg-primary/10 p-3 shadow-sm">
            {book.coverImageUrl ? (
              <img
                src={book.coverImageUrl}
                alt={book.title}
                loading="lazy"
                className="h-14 w-10 rounded-md object-cover shadow-sm"
              />
            ) : (
              <div className="flex h-14 w-10 items-center justify-center rounded-md bg-primary/5">
                <span className="material-symbols-outlined text-primary/40">menu_book</span>
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-lg font-bold">{book.title}</span>
              <span className="text-sm text-muted-foreground">{book.author}</span>
            </div>
          </div>
        </section>

        {/* Sort */}
        <section className="mb-4 px-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              감상 {reviews.length}개{hasNext && '+'}
            </span>
          </div>
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-2 pr-6">
            {sortOptions.map(option => (
              <button
                type="button"
                key={option.value}
                onClick={() => setActiveSort(option.value)}
                className={cn(
                  'whitespace-nowrap rounded-full px-5 py-2 text-sm font-semibold transition-colors',
                  activeSort === option.value
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                    : 'border border-primary/10 bg-primary/5 text-primary'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        {/* Review List */}
        {reviews.length === 0 && <EmptyState icon="rate_review" message="아직 감상이 없습니다" />}

        <div className="flex flex-col gap-6 px-6">
          {reviews.map(review => {
            const isMyReview = currentUserId != null && review.user.userId === currentUserId
            return (
              <article
                key={review.reviewId}
                className="rounded-lg border-l-4 border-primary bg-card p-6 shadow-sm transition-colors hover:bg-primary/5"
              >
                {/*
                  접근성(M-7): 카드 전체 onClick 대신 "이동 영역(작성자/평점 + 공개된 감상 내용)"만
                  <Link>로 감싼다. 스포일러 공개·좋아요는 Link 밖 형제 버튼으로 분리해 인터랙티브
                  중첩과 키보드 접근 불가 문제를 해소한다.
                */}
                <Link
                  to={`/review/${review.reviewId}`}
                  aria-label={`${review.user.nickname}님의 감상 상세 보기`}
                  className="block"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar
                        src={review.user.profileImageUrl}
                        alt={review.user.nickname}
                        className="size-10"
                      />
                      <div>
                        <p className="text-sm font-bold">{review.user.nickname}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatRelativeTime(review.createdAt)}
                        </p>
                      </div>
                    </div>
                    <StarRating rating={review.rating} size="sm" />
                  </div>

                  {(!review.isSpoiler || revealedSpoilers.has(review.reviewId)) && (
                    <p className="mb-4 line-clamp-4 leading-relaxed">{review.content}</p>
                  )}
                </Link>

                {review.isSpoiler && !revealedSpoilers.has(review.reviewId) && (
                  <button
                    type="button"
                    onClick={() => toggleSpoiler(review.reviewId)}
                    aria-label="스포일러 감상 보기"
                    className="group relative w-full cursor-pointer text-left"
                  >
                    <div className="pointer-events-none select-none blur-md">
                      <p className="leading-relaxed">{review.content}</p>
                    </div>
                    <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-primary/5 transition-colors group-hover:bg-primary/10">
                      <span className="material-symbols-outlined mb-1 text-primary">
                        visibility_off
                      </span>
                      <p className="text-sm font-semibold text-primary">
                        스포일러 포함 — 탭하여 보기
                      </p>
                    </div>
                  </button>
                )}

                <div className="mt-4 flex items-center gap-6 text-muted-foreground">
                  {!isMyReview ? (
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleLike(review.reviewId, review.isLiked, review.likeCount)
                      }
                      aria-label={review.isLiked ? '좋아요 취소' : '좋아요'}
                      className={cn(
                        'flex items-center gap-1 transition-colors',
                        review.isLiked ? 'text-primary' : 'hover:text-primary'
                      )}
                    >
                      <span
                        className="material-symbols-outlined text-lg"
                        style={{ fontVariationSettings: `'FILL' ${review.isLiked ? 1 : 0}` }}
                      >
                        favorite
                      </span>
                      <span className="text-xs">{review.likeCount}</span>
                    </button>
                  ) : review.likeCount > 0 ? (
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-lg">favorite</span>
                      <span className="text-xs">{review.likeCount}</span>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-lg">chat_bubble</span>
                    <span className="text-xs">{review.commentCount}</span>
                  </div>
                </div>
              </article>
            )
          })}
        </div>

        {hasNext && <div ref={sentinelRef} className="h-10" aria-hidden="true" />}

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
              onClick={() => {
                setLoadMoreError(null)
                fetchMore()
              }}
              className="rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20"
            >
              다시 불러오기
            </button>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
