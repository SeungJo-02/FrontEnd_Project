import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import axios from 'axios'
import { cn } from '@/lib/utils'
import { shareLink } from '@/lib/share'
import {
  deleteReview,
  getReviewDetail,
  likeReview,
  unlikeReview,
  type ReviewDetail,
} from '@/api/review'
import { addLibraryBook, backendToFrontStatus, type ReadingStatus } from '@/api/library'
import AppHeader from '@/components/layout/AppHeader'
import AddToLibrarySheet from '@/components/common/AddToLibrarySheet'
import BottomNav from '@/components/layout/BottomNav'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import CommentSection from '@/components/comment/CommentSection'
import ReportDialog from '@/components/common/ReportDialog'
import { useAuthStore } from '@/store/authStore'

const readingStatusLabel: Record<ReadingStatus, string> = {
  finished: '다 읽음',
  reading: '읽는 중',
  stopped: '중단',
  want_to_read: '읽고 싶어요',
}

export default function ReviewDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const currentUserId = useAuthStore(state => state.user?.id)
  const commentSectionRef = useRef<HTMLDivElement>(null)
  const reviewId = Number(id)
  const [review, setReview] = useState<ReviewDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [displayCommentCount, setDisplayCommentCount] = useState<number | null>(null)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [isLiking, setIsLiking] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null)
  const [isReportOpen, setIsReportOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [savedStatus, setSavedStatus] = useState<ReadingStatus | null>(null)

  useEffect(() => {
    if (!Number.isFinite(reviewId)) {
      setErrorMessage('감상 정보가 올바르지 않습니다.')
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    setIsLoading(true)
    setErrorMessage(null)
    setSheetOpen(false)
    setSavedStatus(null)
    ;(async () => {
      try {
        const result = await getReviewDetail(reviewId, controller.signal)
        // 응답이 abort 직전에 이미 resolve된 경우 axios가 throw하지 않으므로, reviewId를 빠르게
        // 전환할 때 stale 데이터로 화면을 덮어쓰지 않도록 setter 직전에 가드한다(다른 fetch effect와 패턴 통일).
        if (controller.signal.aborted) return
        setReview(result)
        setLiked(result.isLiked)
        setLikeCount(result.likeCount)
      } catch (error) {
        // 요청 취소(reviewId 전환/언마운트)는 정상 흐름이므로 무시. normalizeAxiosError가 cancel을 rethrow.
        if (axios.isCancel(error)) return
        setErrorMessage(error instanceof Error ? error.message : '감상을 불러오지 못했습니다.')
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    })()

    return () => controller.abort()
  }, [reviewId])

  // 알림에서 #comments 해시로 진입 시 댓글 섹션으로 스크롤.
  // CommentSection의 첫 렌더가 완료된 뒤 스크롤해야 하므로 짧은 지연 사용.
  useEffect(() => {
    if (review && location.hash === '#comments' && commentSectionRef.current) {
      const timer = setTimeout(() => {
        commentSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 350)
      return () => clearTimeout(timer)
    }
  }, [location.hash, review])

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <AppHeader title="감상 상세" showBack />

        <main aria-busy="true" className="flex flex-1 items-center justify-center pb-24">
          <p role="status" className="text-sm text-muted-foreground">
            불러오는 중...
          </p>
        </main>

        <BottomNav />
      </div>
    )
  }

  if (errorMessage || !review) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <AppHeader title="감상 상세" showBack />

        <main className="flex flex-1 flex-col items-center justify-center gap-4 pb-24">
          <span className="material-symbols-outlined text-6xl text-muted-foreground/30">
            search_off
          </span>
          <p className="text-lg font-bold text-muted-foreground">감상을 찾을 수 없습니다</p>
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

  const frontReadingStatus = review.readingStatus
    ? backendToFrontStatus[review.readingStatus]
    : undefined
  const reviewStatus = frontReadingStatus ? readingStatusLabel[frontReadingStatus] : '기록'
  const tags: string[] =
    review.tags && review.tags.length > 0
      ? review.tags
      : [review.book.author, review.book.publisher, reviewStatus].filter((tag): tag is string =>
          Boolean(tag)
        )
  const hasQuote = Boolean(review.quote)
  const coverImageUrl = review.book.coverImageUrl
  const isMyReview = currentUserId != null && review.user.userId === currentUserId
  const reviewHeading = isMyReview ? '나의 감상' : `${review.user.nickname}의 감상`

  const handleToggleLike = async () => {
    if (isLiking) return
    const wasLiked = liked
    const prevCount = likeCount
    setLiked(!wasLiked)
    setLikeCount(prevCount + (wasLiked ? -1 : 1))
    setIsLiking(true)
    try {
      const result = wasLiked
        ? await unlikeReview(review.reviewId)
        : await likeReview(review.reviewId)
      setLikeCount(result.likeCount)
    } catch {
      setLiked(wasLiked)
      setLikeCount(prevCount)
    } finally {
      setIsLiking(false)
    }
  }

  const handleSaveToLibrary = async (status: ReadingStatus) => {
    await addLibraryBook(review.book.bookId, status)
    setSavedStatus(status)
  }

  const handleDeleteReview = async () => {
    setIsDeleting(true)
    setDeleteErrorMessage(null)
    try {
      await deleteReview(review.reviewId)
      navigate(`/book/${review.book.bookId}`, { replace: true })
    } catch (error) {
      setDeleteErrorMessage(error instanceof Error ? error.message : '감상을 삭제하지 못했습니다.')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleShare = async () => {
    if (!review) return
    const result = await shareLink({
      title: `${review.book.title} 감상`,
      text: `${review.user.nickname}님의 ${review.book.title} 감상`,
      path: `/review/${review.reviewId}`,
    })
    if (result === 'copied') alert('링크가 복사되었습니다.')
    else if (result === 'failed') alert('공유에 실패했습니다.')
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader
        title={review.book.title}
        showBack
        rightAction={
          !isMyReview ? (
            <button
              type="button"
              onClick={() => setIsReportOpen(true)}
              aria-label="신고"
              className="flex size-10 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
            >
              <span className="material-symbols-outlined">more_vert</span>
            </button>
          ) : undefined
        }
      />

      <main className="flex-1 overflow-y-auto pb-24">
        {/* Book Card */}
        <section className="px-5 py-5">
          <div className="overflow-hidden rounded-[28px] bg-card shadow-sm">
            <div className="bg-muted/30 px-6 py-8">
              <div className="mx-auto aspect-[2/3] w-[62%] max-w-[260px] overflow-hidden rounded-md shadow-xl">
                {coverImageUrl ? (
                  <img
                    src={coverImageUrl}
                    alt={review.book.title}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center bg-primary/10 text-primary/35">
                    <span className="material-symbols-outlined text-5xl">menu_book</span>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                  {reviewStatus}
                </span>

                <div className="flex items-center gap-1 rounded-full bg-primary/5 px-3 py-1.5 text-sm font-bold text-primary">
                  <span
                    className="material-symbols-outlined text-[18px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    star
                  </span>
                  <span>{review.rating.toFixed(1)}</span>
                </div>
              </div>

              <h1 className="text-3xl font-bold tracking-tight">{review.book.title}</h1>
              <p className="mt-2 text-lg font-medium text-muted-foreground">{review.book.author}</p>
            </div>
          </div>
        </section>

        {!isMyReview && (
          <section className="px-5 pb-3">
            {savedStatus ? (
              <div className="flex items-center justify-center gap-2 rounded-xl bg-primary/5 py-3 text-sm font-semibold text-primary/70">
                <span className="material-symbols-outlined text-[20px]">check_circle</span>
                서재에 저장됨
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/20 bg-card py-3 text-sm font-bold text-primary transition-colors hover:bg-primary/5"
              >
                <span className="material-symbols-outlined text-[20px]">library_add</span>내 서재에
                추가
              </button>
            )}
          </section>
        )}

        {isMyReview && (
          <section className="flex gap-2 px-5 pb-3">
            <button
              type="button"
              onClick={() => navigate(`/review/${review.reviewId}/edit`)}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-primary/20 bg-card text-sm font-bold text-primary transition-colors hover:bg-primary/5"
            >
              <span className="material-symbols-outlined text-[18px]">edit</span>
              수정
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteErrorMessage(null)
                setIsDeleteDialogOpen(true)
              }}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 text-sm font-bold text-destructive transition-colors hover:bg-destructive/10"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
              삭제
            </button>
          </section>
        )}

        {/* Review Content */}
        <section className="px-5 py-3">
          <h2 className="mb-4 text-2xl font-bold">{reviewHeading}</h2>
          <div className="space-y-5 text-lg leading-8 text-foreground/90">
            {review.content.split('\n\n').map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </section>

        {/* Quote Card — 인용구가 있을 때만 노출 */}
        {hasQuote && (
          <section className="px-5 py-5">
            <div className="rounded-[24px] bg-primary/5 p-5">
              <div className="mb-2 text-primary/20">
                <span className="material-symbols-outlined text-[38px]">format_quote</span>
              </div>

              <div className="border-l-4 border-primary pl-4">
                <p className="text-xl italic leading-9 text-foreground/85">{review.quote}</p>
                <p className="mt-4 text-base text-muted-foreground">감상 중에서</p>
              </div>
            </div>
          </section>
        )}

        {/* Tags */}
        <section className="px-5 py-2">
          <div className="flex flex-wrap gap-2">
            {tags.map(tag => (
              <span
                key={tag}
                className="rounded-xl bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary/80"
              >
                #{tag}
              </span>
            ))}
          </div>
        </section>

        {/* Reactions
            [HIGH-2 fix] 이전엔 좋아요 버튼이 로컬 state(liked)만 토글되어 새로고침 시 액션이
            사라지고, likeCount 계산식도 초기값 대비 한 번의 토글에만 정확했다. POST/DELETE
            좋아요 API가 본 PR 범위 밖이므로 일단 disabled로 처리해 서버에서 받은 isLiked /
            likeCount를 표시만 한다. 좋아요 API 연동은 후속 이슈에서 처리.
            [MED-3 fix] 이전엔 review.commentCount ?? 0 형태로 가드했지만 타입은 number(non-null)
            이라 가드 불필요. CLAUDE.md "방어 코드 최소화" + 타입 신뢰성을 위해 ?? 0 제거. */}
        <section className="mt-4 border-t border-border px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-5 text-sm font-semibold text-muted-foreground">
              {!isMyReview && (
                <button
                  type="button"
                  onClick={handleToggleLike}
                  disabled={isLiking}
                  aria-label={liked ? '좋아요 취소' : '좋아요'}
                  className={cn(
                    'flex items-center gap-1.5 transition-colors disabled:opacity-60',
                    liked ? 'text-primary' : 'hover:text-primary'
                  )}
                >
                  <span
                    className="material-symbols-outlined text-[20px]"
                    style={{ fontVariationSettings: `'FILL' ${liked ? 1 : 0}` }}
                  >
                    favorite
                  </span>
                  <span>{likeCount}</span>
                </button>
              )}
              {isMyReview && likeCount > 0 && (
                <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                  <span className="material-symbols-outlined text-[20px]">favorite</span>
                  <span>{likeCount}</span>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[20px]">chat_bubble</span>
                <span>{displayCommentCount ?? review.commentCount}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleShare}
              aria-label="공유"
              className="text-muted-foreground transition-colors hover:text-primary"
            >
              <span className="material-symbols-outlined text-[22px]">share</span>
            </button>
          </div>
        </section>

        <div ref={commentSectionRef}>
          <CommentSection
            reviewId={review.reviewId}
            initialCommentCount={review.commentCount}
            onCommentCountChange={setDisplayCommentCount}
          />
        </div>
      </main>

      <Dialog
        open={isDeleteDialogOpen}
        onOpenChange={open => {
          if (isDeleting && !open) return
          setIsDeleteDialogOpen(open)
        }}
      >
        <DialogContent
          onInteractOutside={e => {
            if (isDeleting) e.preventDefault()
          }}
          onEscapeKeyDown={e => {
            if (isDeleting) e.preventDefault()
          }}
        >
          <DialogHeader>
            <DialogTitle>감상을 삭제하시겠습니까?</DialogTitle>
            <DialogDescription>
              삭제한 감상은 되돌릴 수 없습니다. 이 책에 대한 감상 기록이 사라집니다.
            </DialogDescription>
          </DialogHeader>
          {deleteErrorMessage && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-4 py-3 text-center text-sm text-destructive"
            >
              {deleteErrorMessage}
            </p>
          )}
          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
              className="rounded-lg border border-primary/20 bg-card px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-primary/5 disabled:opacity-60"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleDeleteReview}
              disabled={isDeleting}
              className="rounded-lg bg-destructive px-5 py-3 text-sm font-semibold text-destructive-foreground transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDeleting ? '삭제 중...' : '삭제하기'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReportDialog
        open={isReportOpen}
        onOpenChange={setIsReportOpen}
        targetType="REVIEW"
        targetId={review.reviewId}
      />

      {!isMyReview && review && (
        <AddToLibrarySheet
          isOpen={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onSave={handleSaveToLibrary}
          bookId={String(review.book.bookId)}
        />
      )}

      <BottomNav />
    </div>
  )
}
