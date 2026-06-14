import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import axios from 'axios'
import AppHeader from '@/components/layout/AppHeader'
import BottomNav from '@/components/layout/BottomNav'
import StarRating from '@/components/common/StarRating'
import AddToLibrarySheet from '@/components/common/AddToLibrarySheet'
import {
  getBook,
  getBookReviews,
  type BookDetail,
  type BookReviewItem,
  type BackendReadingStatus,
} from '@/api/book'
import {
  addLibraryBook,
  updateLibraryBookStatus,
  backendToFrontStatus,
  type ReadingStatus,
} from '@/api/library'
import { formatRelativeTime } from '@/lib/utils'

const statusEmoji: Record<ReadingStatus, string> = {
  want_to_read: '📖 읽고 싶은',
  reading: '📚 읽는 중',
  finished: '✅ 다 읽음',
  stopped: '⏸️ 중단',
}

// toFrontStatus 유지 이유: getBook 응답의 myLibraryStatus는 string | null 타입(백엔드 Nullable)으로 내려오므로
// 방어적 null 변환이 필요하다. 매핑 자체는 @/api/library의 backendToFrontStatus(단일 출처, Partial)를 재사용한다.
// Partial이라 미지의 enum 값은 undefined가 되므로 ?? null로 흡수한다.
function toFrontStatus(s: string | null): ReadingStatus | null {
  if (!s) return null
  return backendToFrontStatus[s as BackendReadingStatus] ?? null
}

export default function BookDetailPage() {
  const { bookId } = useParams()
  const navigate = useNavigate()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [book, setBook] = useState<BookDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [savedStatus, setSavedStatus] = useState<ReadingStatus | null>(null)
  const [previewReviews, setPreviewReviews] = useState<BookReviewItem[]>([])
  const isMountedRef = useRef(true)

  // StrictMode dev 모드에서 effect가 mount → unmount → mount로 더블 인보크되므로
  // setup에서 명시적으로 true로 리셋해 ref가 false로 stuck되지 않도록 한다.
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const parsedBookId = bookId ? Number(bookId) : NaN
  const isValidBookId = Number.isInteger(parsedBookId) && parsedBookId > 0

  useEffect(() => {
    if (!isValidBookId) {
      setIsLoading(false)
      setErrorMessage('유효하지 않은 도서 ID입니다.')
      return
    }

    const controller = new AbortController()
    setIsLoading(true)
    setErrorMessage(null)
    setPreviewReviews([])
    ;(async () => {
      try {
        const [result, reviewResult] = await Promise.all([
          getBook(parsedBookId, controller.signal),
          getBookReviews(parsedBookId, { limit: 3, signal: controller.signal }).catch(() => null),
        ])
        if (controller.signal.aborted) return
        setBook(result)
        setSavedStatus(toFrontStatus(result.myLibraryStatus))
        if (reviewResult) setPreviewReviews(reviewResult.content)
      } catch (error) {
        if (axios.isCancel(error) || controller.signal.aborted) return
        setErrorMessage(error instanceof Error ? error.message : '도서 정보를 불러오지 못했습니다.')
        setBook(null)
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    })()

    return () => controller.abort()
  }, [parsedBookId, isValidBookId])

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <AppHeader title="Shelfeed" showBack />
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
        <AppHeader title="Shelfeed" showBack />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 pb-24">
          <span className="material-symbols-outlined text-6xl text-muted-foreground/30">
            search_off
          </span>
          <p role="alert" className="text-lg font-bold text-muted-foreground">
            {errorMessage ?? '도서를 찾을 수 없습니다'}
          </p>
          <button
            type="button"
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

  const handleReviewClick = () => {
    if (book.myReviewId != null) {
      navigate(`/review/${book.myReviewId}`)
    } else {
      navigate(`/review/write/${book.bookId}`)
    }
  }

  const handleSaveLibraryStatus = async (status: ReadingStatus) => {
    if (book.myLibraryBookId != null) {
      // 이미 서재에 있는 도서 → PATCH로 상태만 변경
      const result = await updateLibraryBookStatus(book.myLibraryBookId, status)
      if (!isMountedRef.current) return
      // unknown enum 응답이면 사용자가 방금 선택한 status를 fallback으로 유지 (CTA가 "내 서재에 추가"로 회귀하는 오해 방지)
      setSavedStatus(toFrontStatus(result.status) ?? status)
      return
    }
    // 신규 추가 → POST. 응답의 libraryBookId를 로컬 book 상태에 반영해 다음 수정이 PATCH로 가도록 한다.
    const result = await addLibraryBook(book.bookId, status)
    if (!isMountedRef.current) return
    if ('alreadyExists' in result) {
      setSavedStatus(status)
      return
    }
    setSavedStatus(toFrontStatus(result.status) ?? status)
    setBook(prev => (prev ? { ...prev, myLibraryBookId: result.libraryBookId } : prev))
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader
        title="Shelfeed"
        showBack
        rightAction={
          <button
            type="button"
            disabled
            aria-label="공유 (준비 중)"
            className="flex size-10 items-center justify-center rounded-full text-primary/40"
          >
            <span className="material-symbols-outlined">share</span>
          </button>
        }
      />

      <main className="flex-1 overflow-y-auto pb-24">
        {/* Hero: Book Cover */}
        <div className="flex justify-center px-6 py-8">
          <div className="relative aspect-[2/3] w-2/3 overflow-hidden rounded-lg border border-primary/5 shadow-2xl">
            {book.coverImageUrl ? (
              <img
                loading="lazy"
                src={book.coverImageUrl}
                alt={book.title}
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-primary/5">
                <span className="material-symbols-outlined text-5xl text-muted-foreground/30">
                  menu_book
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Book Info */}
        <section className="px-6 text-center">
          <h1 className="mb-2 text-3xl font-bold leading-tight">{book.title}</h1>
          <p className="mb-1 text-lg font-medium text-primary">{book.author}</p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <span>{book.publisher}</span>
            {book.totalPages != null && book.totalPages > 0 && (
              <>
                <span className="size-1 rounded-full bg-muted-foreground/30" />
                <span>{book.totalPages}쪽</span>
              </>
            )}
          </div>
        </section>

        {/* Rating */}
        <section className="mt-8 px-6">
          <div className="flex flex-col items-center rounded-xl bg-primary/5 p-6">
            <div className="mb-2 flex items-center gap-1">
              <span className="text-3xl font-bold">
                {book.averageRating != null ? book.averageRating.toFixed(1) : '-'}
              </span>
              <span className="text-muted-foreground">/ 5.0</span>
            </div>
            <StarRating rating={book.averageRating ?? 0} size="md" />
            <p className="mt-2 text-xs font-medium text-muted-foreground">
              {book.reviewCount != null
                ? `${book.reviewCount.toLocaleString()}개의 감상`
                : '아직 감상이 없습니다'}
            </p>
          </div>
        </section>

        {/* Description */}
        {book.description && (
          <section className="mt-8 px-6">
            <h3 className="mb-3 text-lg font-bold">책 소개</h3>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {book.description}
            </p>
          </section>
        )}

        {/* CTA */}
        <section className="mt-8 flex flex-col gap-3 px-6">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label={savedStatus ? '내 서재 상태 수정' : '내 서재에 추가'}
            className="w-full rounded-xl bg-primary py-4 text-lg font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-transform active:scale-[0.98]"
          >
            {savedStatus ? `${statusEmoji[savedStatus]} ✏️` : '내 서재에 추가'}
          </button>
          <button
            type="button"
            onClick={handleReviewClick}
            className="w-full rounded-xl border border-primary/20 bg-card py-4 text-base font-semibold text-primary transition-colors hover:bg-primary/5"
          >
            {book.myReviewId != null ? '내 감상 보기' : '감상 쓰기'}
          </button>
        </section>

        {/* Reviews — 전체보기 링크 */}
        <section className="mt-12">
          <div className="mb-4 flex items-center justify-between px-6">
            <h3 className="text-xl font-bold">독자들의 감상</h3>
            <Link
              to={`/book/${book.bookId}/reviews`}
              className="text-sm font-semibold text-primary"
            >
              전체보기
            </Link>
          </div>
          <div className="px-6">
            {previewReviews.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-primary/10 py-8 text-center">
                <span className="material-symbols-outlined text-3xl text-muted-foreground/40">
                  rate_review
                </span>
                <p className="text-sm text-muted-foreground">아직 감상이 없습니다</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {previewReviews.map(review => (
                  <Link
                    key={review.reviewId}
                    to={`/review/${review.reviewId}`}
                    className="rounded-xl bg-card p-4 shadow-sm transition-colors hover:bg-primary/5"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="size-7 overflow-hidden rounded-full bg-primary/10">
                          {review.user.profileImageUrl ? (
                            <img
                              src={review.user.profileImageUrl}
                              alt={review.user.nickname}
                              loading="lazy"
                              className="size-full object-cover"
                            />
                          ) : (
                            <div className="flex size-full items-center justify-center">
                              <span className="material-symbols-outlined text-[14px] text-primary/40">
                                person
                              </span>
                            </div>
                          )}
                        </div>
                        <span className="text-sm font-bold">{review.user.nickname}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(review.createdAt)}
                        </span>
                      </div>
                      <StarRating rating={review.rating} size="sm" />
                    </div>
                    {review.isSpoiler ? (
                      <p className="line-clamp-2 text-sm italic text-muted-foreground">
                        스포일러 포함 — 전체보기에서 확인하세요
                      </p>
                    ) : (
                      <p className="line-clamp-2 text-sm leading-relaxed text-foreground/80">
                        {review.content}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                      {review.likeCount > 0 && (
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">favorite</span>
                          {review.likeCount}
                        </span>
                      )}
                      {review.commentCount > 0 && (
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">chat_bubble</span>
                          {review.commentCount}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <AddToLibrarySheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSave={handleSaveLibraryStatus}
        bookId={String(book.bookId)}
        defaultStatus={savedStatus ?? undefined}
      />

      <BottomNav />
    </div>
  )
}
