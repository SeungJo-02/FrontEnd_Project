import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { cn, formatRelativeTime } from '@/lib/utils'
import {
  getComments,
  createComment,
  updateComment,
  deleteComment,
  likeComment,
  unlikeComment,
  type CommentItem,
  type ReplyItem,
} from '@/api/comment'
import ReportDialog from '@/components/common/ReportDialog'
import { Avatar } from '@/components/common/Avatar'
import StatusMessage from '@/components/ui/StatusMessage'
import Button from '@/components/ui/Button'
import Icon from '@/components/common/Icon'

interface CommentSectionProps {
  reviewId: number
  /** 상단에 표시할 초기 댓글 수 (ReviewDetail.commentCount). 작성/삭제 시 내부에서 ±1. */
  initialCommentCount: number
  /** 댓글 수 변경 시 부모에 알림 (리액션 섹션의 카운트 동기화용). */
  onCommentCountChange?: (count: number) => void
  /**
   * `page`는 문서 흐름에 그대로 쌓이는 기존 레이아웃,
   * `sheet`는 바텀시트 안에서 목록만 스크롤되고 입력창이 하단에 고정되는 레이아웃.
   */
  variant?: 'page' | 'sheet'
}

/**
 * 감상의 댓글 영역. 목록 조회 + 무한 스크롤 + 작성 + 수정 + 삭제 + 좋아요를 한 곳에서 처리.
 *
 * 호출부에서 `reviewId`와 `initialCommentCount`만 받아 독립적으로 동작한다.
 * 댓글 상태(목록/커서/로딩)를 부모에 노출하지 않아 ReviewDetailPage의 복잡도를 올리지 않는다.
 */
export default function CommentSection({
  reviewId,
  initialCommentCount,
  onCommentCountChange,
  variant = 'page',
}: CommentSectionProps) {
  const [comments, setComments] = useState<CommentItem[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const [commentCount, setCommentCount] = useState(initialCommentCount)

  const [newComment, setNewComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [replyTarget, setReplyTarget] = useState<{ commentId: number; nickname: string } | null>(
    null
  )
  const [editTarget, setEditTarget] = useState<{
    commentId: number
    parentCommentId: number | null
    content: string
  } | null>(null)
  const [editContent, setEditContent] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [reportTargetId, setReportTargetId] = useState<number | null>(null)

  const isSheet = variant === 'sheet'

  const inputRef = useRef<HTMLInputElement>(null)
  // 시트 모드에서 실제로 스크롤되는 컨테이너. IntersectionObserver의 root로 넘긴다.
  const scrollRootRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const moreControllerRef = useRef<AbortController | null>(null)
  // 댓글 좋아요 연타(in-flight) 가드 — BookReviewsListPage 패턴과 동일
  const likingIdsRef = useRef(new Set<number>())

  const stateRef = useRef({ hasNext, isLoading, isLoadingMore, nextCursor, loadMoreError })
  stateRef.current = { hasNext, isLoading, isLoadingMore, nextCursor, loadMoreError }

  useEffect(() => {
    onCommentCountChange?.(commentCount)
  }, [commentCount, onCommentCountChange])

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setErrorMessage(null)
    setComments([])
    setNextCursor(null)
    setHasNext(false)
    setCommentCount(initialCommentCount)
    ;(async () => {
      try {
        const response = await getComments(reviewId, null, 20, controller.signal)
        if (controller.signal.aborted) return
        setComments(response.content)
        setNextCursor(response.nextCursor)
        setHasNext(response.hasNext)
      } catch (error) {
        if (axios.isCancel(error) || controller.signal.aborted) return
        setErrorMessage(error instanceof Error ? error.message : '댓글을 불러오지 못했습니다.')
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    })()
    return () => {
      controller.abort()
      moreControllerRef.current?.abort()
    }
  }, [reviewId, initialCommentCount])

  const fetchMore = useCallback(async () => {
    const s = stateRef.current
    if (s.isLoadingMore || s.isLoading || !s.hasNext || !s.nextCursor) return

    moreControllerRef.current?.abort()
    const controller = new AbortController()
    moreControllerRef.current = controller

    setIsLoadingMore(true)
    setLoadMoreError(null)
    try {
      const response = await getComments(reviewId, s.nextCursor, 20, controller.signal)
      if (controller.signal.aborted) return
      setComments(prev => [...prev, ...response.content])
      setNextCursor(response.nextCursor)
      setHasNext(response.hasNext)
    } catch (error) {
      if (axios.isCancel(error) || controller.signal.aborted) return
      setLoadMoreError(error instanceof Error ? error.message : '추가 로딩에 실패했습니다.')
    } finally {
      if (!controller.signal.aborted) setIsLoadingMore(false)
    }
  }, [reviewId])

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
        // 시트 모드에서는 뷰포트가 아니라 시트 내부 컨테이너가 스크롤러다. root를 넘기지
        // 않으면 rootMargin 200px 선반영이 무시돼 목록 끝에서 눈에 띄게 멈칫한다.
        { root: isSheet ? scrollRootRef.current : null, rootMargin: '200px' }
      )
      observerRef.current.observe(node)
    },
    [fetchMore, isSheet]
  )

  useEffect(() => () => observerRef.current?.disconnect(), [])

  const handleSubmit = async () => {
    const trimmed = newComment.trim()
    if (!trimmed || isSubmitting) return

    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const result = await createComment(reviewId, trimmed, replyTarget?.commentId ?? null)
      const newReply: ReplyItem = {
        commentId: result.commentId,
        user: result.user,
        content: result.content,
        parentCommentId: replyTarget?.commentId ?? 0,
        likeCount: 0,
        isLiked: false,
        isDeleted: false,
        isMine: true,
        isEdited: false,
        createdAt: result.createdAt,
      }

      if (replyTarget) {
        setComments(prev =>
          prev.map(c =>
            c.commentId === replyTarget.commentId ? { ...c, replies: [...c.replies, newReply] } : c
          )
        )
      } else {
        const newParent: CommentItem = {
          commentId: result.commentId,
          user: result.user,
          content: result.content,
          parentCommentId: null,
          likeCount: 0,
          isLiked: false,
          isDeleted: false,
          isMine: true,
          isEdited: false,
          createdAt: result.createdAt,
          replies: [],
        }
        setComments(prev => [newParent, ...prev])
      }
      setCommentCount(prev => prev + 1)
      setNewComment('')
      setReplyTarget(null)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '댓글 작성에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEdit = async () => {
    if (!editTarget || isEditing) return
    const trimmed = editContent.trim()
    if (!trimmed) return

    setIsEditing(true)
    try {
      const result = await updateComment(reviewId, editTarget.commentId, trimmed)
      setComments(prev =>
        prev.map(c => {
          if (c.commentId === editTarget.commentId) {
            return { ...c, content: result.content, isEdited: true }
          }
          return {
            ...c,
            replies: c.replies.map(r =>
              r.commentId === editTarget.commentId
                ? { ...r, content: result.content, isEdited: true }
                : r
            ),
          }
        })
      )
      setEditTarget(null)
      setEditContent('')
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '댓글 수정에 실패했습니다.')
    } finally {
      setIsEditing(false)
    }
  }

  const handleDelete = async (commentId: number, parentCommentId: number | null) => {
    if (deletingId != null) return
    if (!window.confirm('댓글을 삭제하시겠습니까?')) return
    setDeletingId(commentId)
    try {
      await deleteComment(reviewId, commentId)
      if (parentCommentId != null) {
        setComments(prev =>
          prev.map(c =>
            c.commentId === parentCommentId
              ? {
                  ...c,
                  replies: c.replies.map(r =>
                    r.commentId === commentId
                      ? { ...r, isDeleted: true, content: '삭제된 댓글입니다.', user: null }
                      : r
                  ),
                }
              : c
          )
        )
      } else {
        setComments(prev =>
          prev.map(c =>
            c.commentId === commentId
              ? { ...c, isDeleted: true, content: '삭제된 댓글입니다.', user: null }
              : c
          )
        )
      }
      setCommentCount(prev => Math.max(0, prev - 1))
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '댓글 삭제에 실패했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggleLike = async (
    commentId: number,
    _parentCommentId: number | null,
    currentlyLiked: boolean,
    currentLikeCount: number
  ) => {
    // 연타 가드 — 이미 요청이 진행 중인 댓글은 무시
    if (likingIdsRef.current.has(commentId)) return
    likingIdsRef.current.add(commentId)

    const updateLike = (liked: boolean, count: number) => {
      setComments(prev =>
        prev.map(c => {
          if (c.commentId === commentId) {
            return { ...c, isLiked: liked, likeCount: count }
          }
          return {
            ...c,
            replies: c.replies.map(r =>
              r.commentId === commentId ? { ...r, isLiked: liked, likeCount: count } : r
            ),
          }
        })
      )
    }

    // 낙관적 업데이트
    updateLike(!currentlyLiked, currentLikeCount + (currentlyLiked ? -1 : 1))

    try {
      const result = currentlyLiked
        ? await unlikeComment(reviewId, commentId)
        : await likeComment(reviewId, commentId)
      updateLike(!currentlyLiked, result.likeCount)
    } catch {
      // 롤백
      updateLike(currentlyLiked, currentLikeCount)
    } finally {
      likingIdsRef.current.delete(commentId)
    }
  }

  const startReply = (commentId: number, nickname: string) => {
    setReplyTarget({ commentId, nickname })
    setEditTarget(null)
    setNewComment('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const startEdit = (commentId: number, parentCommentId: number | null, content: string) => {
    setEditTarget({ commentId, parentCommentId, content })
    setEditContent(content)
    setReplyTarget(null)
    setNewComment('')
  }

  const cancelReply = () => {
    setReplyTarget(null)
    setNewComment('')
  }

  const cancelEdit = () => {
    setEditTarget(null)
    setEditContent('')
  }

  const commentList = (
    <section className={cn('px-5 pt-2', isSheet ? 'pb-4' : 'pb-6')}>
      {/* 시트 모드에선 시트 헤더가 이미 "댓글 N개"를 보여주므로 제목을 중복 렌더하지 않는다 */}
      {!isSheet && <h3 className="mb-4 text-lg font-bold">댓글 {commentCount}개</h3>}

      {isLoading && (
        <p
          role="status"
          aria-busy="true"
          className="py-6 text-center text-sm text-muted-foreground"
        >
          불러오는 중...
        </p>
      )}

      {!isLoading && errorMessage && (
        <p role="alert" className="py-6 text-center text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {!isLoading && !errorMessage && comments.length === 0 && (
        <div className="rounded-xl bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          아직 댓글이 없습니다. 첫 댓글을 남겨보세요!
        </div>
      )}

      {comments.length > 0 && (
        <div className="space-y-1">
          {comments.map(comment => (
            <div key={comment.commentId}>
              <CommentRow
                comment={comment}
                parentCommentId={null}
                deletingId={deletingId}
                onReply={startReply}
                onEdit={startEdit}
                onDelete={handleDelete}
                onToggleLike={handleToggleLike}
                onReport={id => setReportTargetId(id)}
              />
              {comment.replies.length > 0 && (
                <div className="ml-10 border-l-2 border-primary/10 pl-3">
                  {comment.replies.map(reply => (
                    <CommentRow
                      key={reply.commentId}
                      comment={reply}
                      parentCommentId={comment.commentId}
                      deletingId={deletingId}
                      onEdit={startEdit}
                      onDelete={handleDelete}
                      onToggleLike={handleToggleLike}
                      onReport={id => setReportTargetId(id)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {hasNext && <div ref={sentinelRef} className="h-10" aria-hidden="true" />}

      {isLoadingMore && (
        <StatusMessage tone="hint" compact>
          더 불러오는 중...
        </StatusMessage>
      )}

      {loadMoreError && !isLoadingMore && (
        <div className="flex flex-col items-center gap-2 py-4">
          <p role="alert" className="text-sm text-destructive">
            {loadMoreError}
          </p>
          <Button
            variant="soft"
            size="sm"
            onClick={() => {
              setLoadMoreError(null)
              fetchMore()
            }}
          >
            다시 불러오기
          </Button>
        </div>
      )}
    </section>
  )

  const composer = (
    <>
      {/* 수정 모드 인라인 에디터 */}
      {editTarget && (
        <section className="border-t border-border px-5 py-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">댓글 수정 중</span>
            <button
              type="button"
              onClick={cancelEdit}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              취소
            </button>
          </div>
          <div className="flex items-center gap-3 rounded-full border border-primary/20 bg-card px-4 py-3">
            <input
              type="text"
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleEdit()
              }}
              disabled={isEditing}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50 disabled:opacity-60"
              placeholder="댓글을 수정하세요"
            />
            <button
              type="button"
              onClick={handleEdit}
              disabled={isEditing || !editContent.trim()}
              className="text-sm font-bold text-primary disabled:opacity-40"
            >
              {isEditing ? '수정 중...' : '수정'}
            </button>
          </div>
        </section>
      )}

      {/* 댓글 입력 */}
      {!editTarget && (
        <section className="border-t border-border px-5 py-3">
          {replyTarget && (
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                <span className="font-bold">{replyTarget.nickname}</span>님에게 답글
              </span>
              <button
                type="button"
                onClick={cancelReply}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                취소
              </button>
            </div>
          )}
          <div className="flex items-center gap-3 rounded-full border border-primary/10 bg-card px-4 py-3">
            <input
              ref={inputRef}
              type="text"
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSubmit()
              }}
              disabled={isSubmitting}
              placeholder={replyTarget ? '답글을 입력하세요' : '댓글을 입력하세요'}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !newComment.trim()}
              className="text-sm font-bold text-primary disabled:opacity-40"
            >
              {isSubmitting ? '게시 중...' : '게시'}
            </button>
          </div>
          {submitError && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {submitError}
            </p>
          )}
        </section>
      )}
    </>
  )

  return (
    <>
      {isSheet ? (
        <>
          <div ref={scrollRootRef} className="min-h-0 flex-1 overflow-y-auto">
            {commentList}
          </div>
          <div className="shrink-0 pb-[env(safe-area-inset-bottom)]">{composer}</div>
        </>
      ) : (
        <>
          {commentList}
          {composer}
        </>
      )}

      {reportTargetId != null && (
        <ReportDialog
          open
          onOpenChange={open => {
            if (!open) setReportTargetId(null)
          }}
          targetType="COMMENT"
          targetId={reportTargetId}
        />
      )}
    </>
  )
}

/**
 * 댓글 한 줄. 부모/대댓글 공용. 삭제된 댓글은 user=null로 표시.
 */
function CommentRow({
  comment,
  parentCommentId,
  deletingId,
  onReply,
  onEdit,
  onDelete,
  onToggleLike,
  onReport,
}: {
  comment: CommentItem | ReplyItem
  parentCommentId: number | null
  deletingId: number | null
  onReply?: (commentId: number, nickname: string) => void
  onEdit: (commentId: number, parentCommentId: number | null, content: string) => void
  onDelete: (commentId: number, parentCommentId: number | null) => void
  onToggleLike: (
    commentId: number,
    parentCommentId: number | null,
    isLiked: boolean,
    likeCount: number
  ) => void
  onReport: (commentId: number) => void
}) {
  const navigate = useNavigate()

  if (comment.isDeleted) {
    return <div className="py-3 text-sm text-muted-foreground/50 italic">삭제된 댓글입니다.</div>
  }

  const isBeingDeleted = deletingId === comment.commentId
  const user = comment.user
  const goToProfile = user ? () => navigate(`/user/${user.userId}`) : undefined

  return (
    <div className={cn('py-3', isBeingDeleted && 'opacity-50')}>
      <div className="flex items-start gap-3">
        {/* 아바타 — 클릭 시 작성자 프로필로 이동 */}
        {user ? (
          <button
            type="button"
            onClick={goToProfile}
            aria-label={`${user.nickname}님의 프로필 보기`}
            className="size-8 shrink-0 rounded-full transition-opacity hover:opacity-80"
          >
            {/* 사진 유무 분기는 Avatar가 담당한다 — 댓글에서도 자동 아바타를 그대로 쓰기 위해 위임 */}
            <Avatar
              src={user.profileImageUrl}
              alt={user.nickname}
              className="size-8"
              iconClassName="text-[16px]"
            />
          </button>
        ) : (
          <Avatar className="size-8 shrink-0" iconClassName="text-[16px]" />
        )}

        <div className="min-w-0 flex-1">
          {/* 닉네임 + 시간 */}
          <div className="flex items-center gap-2">
            {user ? (
              <button
                type="button"
                onClick={goToProfile}
                className="text-sm font-bold hover:underline"
              >
                {user.nickname}
              </button>
            ) : (
              <span className="text-sm font-bold">알 수 없음</span>
            )}
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(comment.createdAt)}
              {comment.isEdited && ' (수정됨)'}
            </span>
          </div>

          {/* 본문 */}
          <p className="mt-1 text-sm leading-relaxed text-foreground/90">{comment.content}</p>

          {/* 액션 버튼 */}
          <div className="mt-1.5 flex items-center gap-4 text-xs text-muted-foreground">
            {/* 좋아요 */}
            {!comment.isMine && (
              <button
                type="button"
                onClick={() =>
                  onToggleLike(
                    comment.commentId,
                    parentCommentId,
                    comment.isLiked,
                    comment.likeCount
                  )
                }
                className={cn(
                  'flex items-center gap-1 transition-colors',
                  comment.isLiked ? 'text-red-500' : 'hover:text-foreground'
                )}
              >
                <Icon name="favorite" filled={comment.isLiked} className="text-[14px]" />
                {comment.likeCount > 0 && <span>{comment.likeCount}</span>}
              </button>
            )}
            {comment.isMine && comment.likeCount > 0 && (
              <span className="flex items-center gap-1">
                <Icon name="favorite" className="text-[14px]" />
                {comment.likeCount}
              </span>
            )}

            {/* 답글 — 부모 댓글에만 (대댓글에는 미노출) */}
            {onReply && comment.user && (
              <button
                type="button"
                onClick={() => onReply(comment.commentId, comment.user?.nickname ?? '')}
                className="hover:text-foreground"
              >
                답글
              </button>
            )}

            {/* 수정/삭제 — 본인 댓글만 */}
            {comment.isMine && (
              <>
                <button
                  type="button"
                  onClick={() => onEdit(comment.commentId, parentCommentId, comment.content)}
                  className="hover:text-foreground"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(comment.commentId, parentCommentId)}
                  disabled={isBeingDeleted}
                  className="hover:text-destructive disabled:opacity-50"
                >
                  삭제
                </button>
              </>
            )}

            {/* 신고 — 타인 댓글만 */}
            {!comment.isMine && comment.user && (
              <button
                type="button"
                onClick={() => onReport(comment.commentId)}
                className="hover:text-destructive"
              >
                신고
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
