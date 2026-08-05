import { memo, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { likeReview, unlikeReview } from '@/api/review'
import { cn, formatRelativeTime } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import type { ReadingStatus } from '@/api/library'
import StarRating from './StarRating'
import ReportDialog from './ReportDialog'
import { Avatar } from './Avatar'
import Icon from '@/components/common/Icon'

export interface ReviewCardData {
  id: number
  content: string
  isLiked: boolean
  likeCount: number
  createdAt: string
  rating?: number
  readingStatus?: ReadingStatus
  hasSpoiler?: boolean
  commentCount?: number
  author: {
    id: number
    nickname: string
    profileImageUrl?: string
  }
  book: {
    title: string
    author: string
    coverImageUrl: string
    /** 분류(장르). 응답에 따라 없을 수 있어 있을 때만 배지로 보여준다. */
    category?: string | null
  }
}

interface ReviewCardProps {
  review: ReviewCardData
  className?: string
}

const statusLabel: Record<string, { text: string; variant: 'solid' | 'outline' }> = {
  finished: { text: '다 읽음', variant: 'solid' },
  reading: { text: '읽는 중', variant: 'outline' },
  want_to_read: { text: '읽고 싶어요', variant: 'outline' },
  stopped: { text: '중단', variant: 'outline' },
}

function ReviewCard({ review, className }: ReviewCardProps) {
  const currentUserId = useAuthStore(state => state.user?.id)
  const isMyReview = currentUserId != null && review.author.id === currentUserId

  const [isReportOpen, setIsReportOpen] = useState(false)
  const [spoilerRevealed, setSpoilerRevealed] = useState(false)
  const [liked, setLiked] = useState(review.isLiked)
  const [likeCount, setLikeCount] = useState(review.likeCount)
  const [isLiking, setIsLiking] = useState(false)
  const status = review.readingStatus ? statusLabel[review.readingStatus] : null

  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    setLiked(review.isLiked)
    setLikeCount(review.likeCount)
  }, [review.id, review.isLiked, review.likeCount])

  /**
   * 낙관적 토글 + 롤백. 즉시 UI 반영 후 API 호출, 실패 시 원래 값으로 복원.
   * `isLiking` 가드로 연타 방지, `isMountedRef`로 언마운트 후 setState 방지.
   */
  const toggleLike = async () => {
    if (isLiking) return
    const wasLiked = liked
    const prevCount = likeCount
    setLiked(!wasLiked)
    setLikeCount(prevCount + (wasLiked ? -1 : 1))
    setIsLiking(true)
    try {
      const result = wasLiked ? await unlikeReview(review.id) : await likeReview(review.id)
      if (!isMountedRef.current) return
      setLikeCount(result.likeCount)
    } catch (error) {
      // 서버가 거절하면 낙관적 반영이 되돌아가 "안 눌린다"처럼 보인다. 원인을 남겨둔다.
      if (import.meta.env.DEV) console.error('좋아요 처리 실패:', error)
      if (!isMountedRef.current) return
      setLiked(wasLiked)
      setLikeCount(prevCount)
    } finally {
      if (isMountedRef.current) setIsLiking(false)
    }
  }

  const cardClassName = cn(
    'block overflow-hidden rounded-xl border border-primary/5 bg-card shadow-sm',
    className
  )

  return (
    <>
      {/*
        접근성(M-6): 카드 루트를 인터랙티브(role="link")로 두면 내부 Link/button이 중첩되어
        nested-interactive 위반이 된다. 루트는 비인터랙티브 컨테이너로 두고, "본문(책 정보 +
        공개된 감상 내용)"만 단일 <Link>로 감싸 이동 영역으로 삼는다. 작성자 링크·신고·좋아요·
        댓글·스포일러 공개는 Link 밖 형제로 분리해 중첩을 제거한다.
      */}
      <article className={cardClassName}>
        <div className="p-4">
          {/* User Header (이동 영역 아님) */}
          <div className="mb-4 flex items-center justify-between">
            <Link to={`/user/${review.author.id}`} className="flex items-center gap-3">
              <Avatar
                src={review.author.profileImageUrl}
                alt={review.author.nickname}
                fallback={false}
                className="size-10 border border-primary/10"
              />
              <div>
                <p className="text-sm font-bold">{review.author.nickname}</p>
                <p className="text-xs text-muted-foreground">
                  {formatRelativeTime(review.createdAt)}
                </p>
              </div>
            </Link>
            <div className="flex items-center gap-2">
              {status && (
                <span
                  className={cn(
                    'rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider',
                    status.variant === 'solid'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-primary/10 text-primary'
                  )}
                >
                  {status.text}
                </span>
              )}
              {!isMyReview && (
                <button
                  type="button"
                  onClick={() => setIsReportOpen(true)}
                  aria-label="신고"
                  className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  <Icon name="more_vert" className="text-[18px]" />
                </button>
              )}
            </div>
          </div>

          {/* 이동 영역: 책 정보 + 공개된 감상 내용. 링크 내부 텍스트가 길어 SR 접근명은 aria-label로 간결화 */}
          <Link
            to={`/review/${review.id}`}
            aria-label={`${review.book.title} 감상 상세 보기`}
            className="block"
          >
            <div className="mb-4 flex gap-4">
              <div className="h-28 w-20 shrink-0 overflow-hidden rounded-md bg-primary/5 shadow-md">
                {review.book.coverImageUrl ? (
                  <img
                    src={review.book.coverImageUrl}
                    alt={review.book.title}
                    className="size-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  // 빈 src는 브라우저가 현재 페이지를 재요청하므로 placeholder로 분기
                  <div
                    aria-hidden="true"
                    className="flex size-full items-center justify-center text-xs text-muted-foreground/60"
                  >
                    <Icon name="menu_book" className="text-2xl" />
                  </div>
                )}
              </div>
              <div className="flex flex-col justify-center">
                <h3 className="text-lg font-bold leading-tight text-primary">
                  {review.book.title}
                </h3>
                <p className="text-sm">{review.book.author}</p>
                {review.book.category && (
                  <span className="mt-1.5 w-fit rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {review.book.category}
                  </span>
                )}
                {review.rating && (
                  <div className="mt-2">
                    <StarRating rating={review.rating} size="md" />
                  </div>
                )}
              </div>
            </div>

            {/* 감상 내용 (스포일러 비공개 시에는 아래 별도 버튼으로 분리) */}
            {(!review.hasSpoiler || spoilerRevealed) && (
              <div className="mb-4">
                {/* 본문은 4줄로 clamp해 카드 높이를 균일화. '더보기'는 clamp에 잘리지 않도록 형제로 분리 */}
                <p className="text-sm leading-relaxed line-clamp-4">{review.content}</p>
                {!review.hasSpoiler && (
                  <span className="mt-1 inline-block text-sm font-medium text-primary">더보기</span>
                )}
              </div>
            )}
          </Link>

          {/* 스포일러 가림막 — 이동이 아니라 '공개' 동작이므로 Link 밖 버튼으로 분리 */}
          {review.hasSpoiler && !spoilerRevealed && (
            <button
              type="button"
              onClick={() => setSpoilerRevealed(true)}
              aria-label="스포일러 감상 보기"
              className="group relative mb-4 w-full cursor-pointer overflow-hidden rounded-lg border border-primary/10 bg-primary/5 transition-colors hover:bg-primary/10"
            >
              {/*
                흐린 본문은 배경 장식이라 절대 배치로 뒤에 깔고, 높이는 앞의 안내 문구가 정한다.
                예전엔 반대여서 본문이 한 줄뿐인 감상은 상자가 한 줄 높이로 찌그러지고
                아이콘·문구가 상자 밖으로 삐져나왔다.
              */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 select-none px-3 py-2 opacity-40 blur-md"
              >
                <p className="line-clamp-3 text-sm leading-relaxed">{review.content}</p>
              </div>

              <div className="relative flex flex-col items-center justify-center gap-1 px-4 py-6">
                <Icon name="visibility_off" className="text-primary" />
                <p className="text-[13px] font-bold text-primary">스포일러 포함 — 탭하여 보기</p>
              </div>
            </button>
          )}

          {/* Actions (이동 영역 아님) */}
          <div className="flex items-center gap-6 border-t border-primary/5 pt-2">
            {/* 본인 감상에도 좋아요를 허용한다. 예전엔 내 감상이면 숫자만 보여줘
                "좋아요가 안 눌린다"는 오해를 샀다. (ReviewDetailPage와 동일 규칙) */}
            <button
              type="button"
              onClick={() => toggleLike()}
              disabled={isLiking}
              aria-label={liked ? '좋아요 취소' : '좋아요'}
              aria-pressed={liked}
              className={cn(
                'flex items-center gap-1.5 transition-colors disabled:opacity-60',
                liked ? 'text-primary' : 'hover:text-primary'
              )}
            >
              <Icon name="favorite" className="text-xl" filled={liked} />
              <span className="text-xs font-bold">{likeCount}</span>
            </button>
            <Link
              to={`/review/${review.id}#comments`}
              aria-label="댓글 보기"
              className="flex items-center gap-1.5 transition-colors hover:text-primary"
            >
              <Icon name="chat_bubble" className="text-xl" />
              <span className="text-xs font-bold">{review.commentCount ?? 0}</span>
            </Link>
          </div>
        </div>
      </article>
      <ReportDialog
        open={isReportOpen}
        onOpenChange={setIsReportOpen}
        targetType="REVIEW"
        targetId={review.id}
      />
    </>
  )
}

// 피드 리스트에서 반복 렌더 시 불필요한 리렌더를 줄이기 위해 memo로 감쌈
export default memo(ReviewCard)
