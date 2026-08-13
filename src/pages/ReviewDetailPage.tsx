import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import axios from 'axios'
import { cn, formatRelativeTime } from '@/lib/utils'
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
import BottomSheet from '@/components/common/BottomSheet'
import ShareSheet from '@/components/common/ShareSheet'
import { Avatar } from '@/components/common/Avatar'
import StarRating from '@/components/common/StarRating'
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
import { Screen, ScreenBody } from '@/components/layout/Screen'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import ErrorBox from '@/components/ui/ErrorBox'
import Icon, { type IconName } from '@/components/common/Icon'

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
  const [librarySheetOpen, setLibrarySheetOpen] = useState(false)
  const [savedStatus, setSavedStatus] = useState<ReadingStatus | null>(null)
  const [isCommentSheetOpen, setIsCommentSheetOpen] = useState(false)
  const [isShareSheetOpen, setIsShareSheetOpen] = useState(false)
  const [isMoreSheetOpen, setIsMoreSheetOpen] = useState(false)

  useEffect(() => {
    if (!Number.isFinite(reviewId)) {
      setErrorMessage('감상 정보가 올바르지 않습니다.')
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    setIsLoading(true)
    setErrorMessage(null)
    setLibrarySheetOpen(false)
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

  // 알림/피드에서 #comments 해시로 진입하면 댓글 시트를 자동으로 연다.
  // (이전엔 인라인 댓글 섹션으로 스크롤했지만, 댓글이 시트로 옮겨져 여는 동작으로 대체)
  const hasAutoOpenedCommentsRef = useRef(false)
  useEffect(() => {
    if (!review || location.hash !== '#comments' || hasAutoOpenedCommentsRef.current) return
    hasAutoOpenedCommentsRef.current = true
    setIsCommentSheetOpen(true)
    // 해시를 남겨두면 시트를 닫은 뒤 새로고침·뒤로가기로 돌아올 때마다 다시 열린다.
    navigate(`${location.pathname}${location.search}`, { replace: true })
  }, [location.hash, location.pathname, location.search, navigate, review])

  if (isLoading) {
    return (
      <Screen>
        <AppHeader title="감상" showBack />

        <ScreenBody centered aria-busy="true">
          <p role="status" className="text-sm text-muted-foreground">
            불러오는 중...
          </p>
        </ScreenBody>

        <BottomNav />
      </Screen>
    )
  }

  if (errorMessage || !review) {
    return (
      <Screen>
        <AppHeader title="감상" showBack />

        <main className="flex flex-1 flex-col items-center justify-center gap-4 pb-24">
          <Icon name="search_off" className="text-6xl text-muted-foreground/30" />
          <p className="text-lg font-bold text-muted-foreground">감상을 찾을 수 없습니다</p>
          {errorMessage && (
            <p role="alert" className="max-w-[280px] text-center text-sm text-muted-foreground">
              {errorMessage}
            </p>
          )}
          <Button onClick={() => navigate(-1)}>돌아가기</Button>
        </main>

        <BottomNav />
      </Screen>
    )
  }

  const frontReadingStatus = review.readingStatus
    ? backendToFrontStatus[review.readingStatus]
    : undefined
  const reviewStatus = frontReadingStatus ? readingStatusLabel[frontReadingStatus] : '기록'
  // 태그는 작성자가 직접 붙인 것만 보여준다. 예전엔 태그가 없으면 저자·출판사·독서상태를
  // 태그처럼 지어내 붙였는데, 작성자가 쓰지 않은 말이 본인 태그로 보여서 오해를 샀다.
  const tags: string[] = review.tags ?? []
  const isMyReview = currentUserId != null && review.user.userId === currentUserId
  const commentCount = displayCommentCount ?? review.commentCount

  const goToProfile = () => navigate(`/user/${review.user.userId}`)
  const goToBook = () => navigate(`/book/${review.book.bookId}`)

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
    } catch (error) {
      // 서버가 거절하면 낙관적 반영이 되돌아가 "안 눌린다"처럼 보인다. 원인을 남겨둔다.
      if (import.meta.env.DEV) console.error('좋아요 처리 실패:', error)
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

  return (
    <Screen>
      <AppHeader
        title="감상"
        showBack
        rightAction={
          <IconButton onClick={() => setIsMoreSheetOpen(true)} aria-label="더보기">
            <Icon name="more_horiz" />
          </IconButton>
        }
      />

      <main className="flex-1 pb-24">
        <article>
          {/* 포스트 헤더 — 아바타 + 닉네임 + 책(인스타의 위치 라인 대응) */}
          <header className="flex items-center gap-3 px-4 py-3">
            <button
              type="button"
              onClick={goToProfile}
              aria-label={`${review.user.nickname}님의 프로필 보기`}
              className="shrink-0 rounded-full p-[2px] ring-2 ring-primary/25 transition-opacity hover:opacity-80"
            >
              <Avatar
                src={review.user.profileImageUrl}
                alt={review.user.nickname}
                className="size-9"
                iconClassName="text-[18px]"
              />
            </button>

            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={goToProfile}
                className="block max-w-full truncate text-sm font-bold hover:underline"
              >
                {review.user.nickname}
              </button>
              {/* 책 정보는 아래 표지 카드가 맡는다 — 여기선 작성 시각만 */}
              <p className="text-xs text-muted-foreground">
                {formatRelativeTime(review.createdAt)}
              </p>
            </div>

            <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-2xs font-bold text-primary">
              {reviewStatus}
            </span>
          </header>

          {/*
            어떤 책의 감상인지 한눈에 보이도록 표지를 담은 책 카드를 둔다.
            예전의 화면 절반을 차지하던 표지 히어로가 아니라, 감상 글이 주인공인 건
            유지하면서 맥락만 주는 작은 카드다.
          */}
          <button
            type="button"
            onClick={goToBook}
            aria-label={`${review.book.title} 도서 정보 보기`}
            className="mx-4 mb-4 flex w-[calc(100%-2rem)] items-center gap-3 rounded-2xl bg-card p-3 text-left shadow-sm transition-colors hover:bg-primary/5"
          >
            <div className="h-[74px] w-[52px] shrink-0 overflow-hidden rounded-md bg-primary/5 shadow-md">
              {review.book.coverImageUrl ? (
                <img
                  src={review.book.coverImageUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center">
                  <Icon name="menu_book" className="text-xl text-primary/30" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 break-keep text-sm font-bold leading-5">
                {review.book.title}
              </p>
              <p className="mt-1 line-clamp-1 break-keep text-xs text-muted-foreground">
                {review.book.author}
              </p>
              <StarRating rating={review.rating} size="sm" className="mt-1.5" />
            </div>

            <Icon name="chevron_right" className="shrink-0 text-xl text-muted-foreground/50" />
          </button>

          {/* 포스트 본문 — 감상 글이 주인공 */}
          <div className="px-4 pb-1">
            <div className="space-y-4 text-md leading-7 text-foreground/90">
              {review.content.split('\n\n').map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>

            {review.quote && (
              <blockquote className="mt-4 rounded-2xl bg-primary/5 px-4 py-4">
                <Icon name="format_quote" className="text-[26px] leading-none text-primary/25" />
                <p className="mt-1 border-l-[3px] border-primary/60 pl-3 text-md italic leading-7 text-foreground/85">
                  {review.quote}
                </p>
              </blockquote>
            )}

            {tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1">
                {tags.map(tag => (
                  <span key={tag} className="text-sm font-medium text-primary/80">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 액션 바 — 인스타 아이콘 행 (좋아요·댓글·공유 좌측, 서재 저장 우측) */}
          <div className="flex items-center gap-1 px-2 pt-3">
            {/* 본인 감상에도 좋아요를 허용한다. 예전엔 표시만 하고 눌리지 않아
                "좋아요가 안 눌린다"는 오해를 샀다. */}
            <button
              type="button"
              onClick={handleToggleLike}
              disabled={isLiking}
              aria-label={liked ? '좋아요 취소' : '좋아요'}
              aria-pressed={liked}
              className={cn(
                'flex size-11 items-center justify-center transition-all active:scale-90 disabled:opacity-60',
                liked ? 'text-red-500' : 'text-foreground hover:text-red-500'
              )}
            >
              <Icon name="favorite" filled={liked} className="text-[26px]" />
            </button>

            <button
              type="button"
              onClick={() => setIsCommentSheetOpen(true)}
              aria-label="댓글 보기"
              className="flex size-11 items-center justify-center text-foreground transition-all active:scale-90 hover:text-primary"
            >
              <Icon name="chat_bubble_outline" className="text-[26px]" />
            </button>

            <button
              type="button"
              onClick={() => setIsShareSheetOpen(true)}
              aria-label="공유"
              className="flex size-11 items-center justify-center text-foreground transition-all active:scale-90 hover:text-primary"
            >
              <Icon name="send" className="text-[26px]" />
            </button>

            {!isMyReview && (
              <button
                type="button"
                onClick={() => {
                  if (savedStatus != null) return
                  setLibrarySheetOpen(true)
                }}
                // disabled로 두면 탭 순서에서 빠져 스크린리더가 '저장됨' 라벨을 읽을 길이
                // 없어진다. aria-disabled로 포커스는 남기고 동작만 막는다.
                aria-disabled={savedStatus != null}
                aria-label={savedStatus ? '서재에 저장됨' : '내 서재에 추가'}
                className={cn(
                  'ml-auto flex size-11 items-center justify-center transition-all active:scale-90',
                  savedStatus ? 'text-primary' : 'text-foreground hover:text-primary'
                )}
              >
                <Icon name="bookmark" filled={Boolean(savedStatus)} className="text-[26px]" />
              </button>
            )}
          </div>

          {/* 좋아요 수 · 댓글 모두 보기 (작성 시각은 헤더로 옮겨 중복을 없앴다) */}
          <div className="space-y-1 px-4 pb-2">
            <p className="text-sm font-bold">좋아요 {likeCount}개</p>

            {savedStatus && (
              <p role="status" className="sr-only">
                내 서재에 저장했습니다.
              </p>
            )}

            <button
              type="button"
              onClick={() => setIsCommentSheetOpen(true)}
              className="block text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {commentCount > 0 ? `댓글 ${commentCount}개 모두 보기` : '첫 댓글을 남겨보세요'}
            </button>
          </div>
        </article>
      </main>

      {/* 댓글 시트 */}
      <BottomSheet
        isOpen={isCommentSheetOpen}
        onClose={() => setIsCommentSheetOpen(false)}
        title={`댓글 ${commentCount}개`}
        size="tall"
        // 시트를 닫아도 CommentSection을 살려둔다. 언마운트되면 작성 중이던 댓글 초안이
        // 사라지고, 다시 열 때 카운트가 서버 초기값으로 되돌아가며 목록도 매번 재요청된다.
        keepMounted
      >
        <CommentSection
          reviewId={review.reviewId}
          initialCommentCount={review.commentCount}
          onCommentCountChange={setDisplayCommentCount}
          variant="sheet"
        />
      </BottomSheet>

      {/* 공유 시트 */}
      <ShareSheet
        isOpen={isShareSheetOpen}
        onClose={() => setIsShareSheetOpen(false)}
        title={`${review.book.title} 감상`}
        text={`${review.user.nickname}님의 ${review.book.title} 감상`}
        path={`/review/${review.reviewId}`}
      />

      {/* 더보기 시트 — 내 감상이면 수정/삭제, 타인 감상이면 신고 */}
      <BottomSheet
        isOpen={isMoreSheetOpen}
        onClose={() => setIsMoreSheetOpen(false)}
        title="더보기"
      >
        <div className="flex flex-col px-3 py-2 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
          {isMyReview ? (
            <>
              <MoreRow
                icon="edit"
                label="감상 수정"
                onClick={() => {
                  setIsMoreSheetOpen(false)
                  navigate(`/review/${review.reviewId}/edit`)
                }}
              />
              <MoreRow
                icon="delete"
                label="감상 삭제"
                destructive
                onClick={() => {
                  setIsMoreSheetOpen(false)
                  setDeleteErrorMessage(null)
                  setIsDeleteDialogOpen(true)
                }}
              />
            </>
          ) : (
            <MoreRow
              icon="flag"
              label="신고"
              destructive
              onClick={() => {
                setIsMoreSheetOpen(false)
                setIsReportOpen(true)
              }}
            />
          )}
        </div>
      </BottomSheet>

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
          {deleteErrorMessage && <ErrorBox message={deleteErrorMessage} />}
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

      {!isMyReview && (
        <AddToLibrarySheet
          isOpen={librarySheetOpen}
          onClose={() => setLibrarySheetOpen(false)}
          onSave={handleSaveToLibrary}
          bookId={String(review.book.bookId)}
        />
      )}

      <BottomNav />
    </Screen>
  )
}

/** 더보기 시트의 액션 한 줄. */
function MoreRow({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: IconName
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-4 rounded-xl px-4 py-3.5 text-left transition-colors',
        destructive ? 'text-destructive hover:bg-destructive/5' : 'hover:bg-primary/5'
      )}
    >
      <Icon name={icon} className="text-[22px]" />
      <span className="text-md font-medium">{label}</span>
    </button>
  )
}
