import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import axios from 'axios'
import AppHeader from '@/components/layout/AppHeader'
import { getUserProfile, type UserProfile } from '@/api/member'
import { followUser, unfollowUser } from '@/api/follow'
import { blockUser } from '@/api/block'
import { getUserReviews, REVIEW_PAGE_SIZE, type ReviewListItem } from '@/api/review'
import { formatRelativeTime } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'

/**
 * 타 유저 프로필 페이지.
 *
 * - URL `userId`가 본인이면 `/profile`로 자동 redirect (myUserId 비교).
 * - 프로필/감상 fetch 두 effect는 `numericUserId` 기반으로 독립 동작.
 * - 백엔드 `findUserReviews`는 `reviewVisibility='PUBLIC' AND reviewStatus='PUBLISHED'`
 *   필터를 적용하므로 응답엔 공개·발행분만 들어옴 → 클라이언트 추가 필터 불필요.
 * - 페이징은 옵션 A — 응답이 배열이라 `items.length === REVIEW_PAGE_SIZE`로 hasNext 추론.
 *
 * **Follow 토글 race 가드** (3중 보호):
 * - `isMountedRef`: 컴포넌트 unmount 후 setState 방지
 * - `profileIdRef`: 토글 도중 사용자가 다른 프로필로 이동하면 응답 폐기
 * - `targetId`(클로저 캡처): await 시점의 대상 userId를 닫아둬 응답 도착 시 비교
 */
export default function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const myUserId = useAuthStore(state => state.user?.id)

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isFollowProcessing, setIsFollowProcessing] = useState(false)
  const [followError, setFollowError] = useState<string | null>(null)
  const [isBlockProcessing, setIsBlockProcessing] = useState(false)
  const [blockError, setBlockError] = useState<string | null>(null)
  const [reviews, setReviews] = useState<ReviewListItem[]>([])
  const [reviewNextCursor, setReviewNextCursor] = useState<number | null>(null)
  const [hasMoreReviews, setHasMoreReviews] = useState(false)
  const [isReviewsLoading, setIsReviewsLoading] = useState(true)
  const [isReviewsLoadingMore, setIsReviewsLoadingMore] = useState(false)
  const [reviewsErrorMessage, setReviewsErrorMessage] = useState<string | null>(null)
  const isMountedRef = useRef(true)
  // 토글 진행 중 사용자가 다른 프로필로 이동하면, 늦게 도착한 응답이 새 프로필에 잘못 반영되는 것을 방지하기 위한 추적 ref
  const profileIdRef = useRef<number | null>(null)
  /**
   * "더 보기" 클릭 시 만들어지는 abort controller. 페이지 이탈/재클릭 시 진행 중 요청을
   * 취소하여 unmount 후 setState 경고 + stale 응답 덮어쓰기 방지.
   */
  const loadMoreReviewsControllerRef = useRef<AbortController | null>(null)

  // StrictMode dev 모드에서 effect가 mount → unmount → mount로 더블 인보크되므로
  // setup에서 명시적으로 true로 리셋해 ref가 false로 stuck되지 않도록 한다.
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // profile.userId가 바뀔 때마다 ref 동기화 — 토글 핸들러가 stale 응답을 가드하기 위함
  useEffect(() => {
    profileIdRef.current = profile?.userId ?? null
  }, [profile?.userId])

  const isValidId = /^\d+$/.test(userId ?? '')
  const numericUserId = isValidId ? parseInt(userId!, 10) : 0

  useEffect(() => {
    if (!userId || !isValidId) {
      setErrorMessage('잘못된 사용자 ID입니다.')
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    setIsLoading(true)
    setErrorMessage(null)
    ;(async () => {
      try {
        const result = await getUserProfile(numericUserId, controller.signal)
        if (controller.signal.aborted) return
        setProfile(result)
      } catch (error) {
        if (axios.isCancel(error) || controller.signal.aborted) return
        setErrorMessage(error instanceof Error ? error.message : '프로필을 불러오지 못했습니다.')
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    })()

    return () => controller.abort()
  }, [userId, isValidId, numericUserId])

  useEffect(() => {
    if (!userId || !isValidId) {
      setIsReviewsLoading(false)
      setReviews([])
      setReviewNextCursor(null)
      setHasMoreReviews(false)
      return
    }

    const controller = new AbortController()
    setIsReviewsLoading(true)
    setReviewsErrorMessage(null)
    ;(async () => {
      try {
        const response = await getUserReviews({
          userId: numericUserId,
          cursor: null,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setReviews(response)
        // 옵션 A: 마지막 아이템의 reviewId를 다음 cursor로, items.length === PAGE_SIZE이면 hasNext.
        setReviewNextCursor(response.length > 0 ? response[response.length - 1].reviewId : null)
        setHasMoreReviews(response.length === REVIEW_PAGE_SIZE)
      } catch (error) {
        if (axios.isCancel(error) || controller.signal.aborted) return
        setReviewsErrorMessage(
          error instanceof Error ? error.message : '감상 목록을 불러오지 못했습니다.'
        )
      } finally {
        if (!controller.signal.aborted) setIsReviewsLoading(false)
      }
    })()

    return () => {
      controller.abort()
      loadMoreReviewsControllerRef.current?.abort()
    }
  }, [userId, isValidId, numericUserId])

  if (myUserId && numericUserId === myUserId) {
    return <Navigate to="/profile" replace />
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <AppHeader title="프로필" showBack />
        <main aria-busy="true" className="flex flex-1 items-center justify-center">
          <p role="status" className="text-sm text-muted-foreground">
            불러오는 중...
          </p>
        </main>
      </div>
    )
  }

  if (errorMessage || !profile) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <AppHeader title="프로필" showBack />
        <main className="flex flex-1 flex-col items-center justify-center gap-4">
          <span className="material-symbols-outlined text-6xl text-muted-foreground/30">error</span>
          <p role="alert" className="text-lg font-bold text-muted-foreground">
            {errorMessage ?? '프로필을 불러올 수 없습니다.'}
          </p>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground"
          >
            돌아가기
          </button>
        </main>
      </div>
    )
  }

  /**
   * 사용자 차단. confirm 후 API 호출 → 성공 시 이전 페이지로 이동.
   * 백엔드에서 양방향 팔로우 해제 + 피드 삭제가 함께 처리됨.
   * 이미 차단된 사용자에게 다시 호출하면 백엔드가 409를 반환하므로 에러 메시지로 안내.
   */
  const handleBlock = async () => {
    if (isBlockProcessing) return
    if (
      !window.confirm(
        `${profile.nickname}님을 차단하시겠습니까?\n차단하면 서로의 팔로우가 해제되고, 피드에서 감상이 숨겨집니다.`
      )
    )
      return
    // 차단 대상 캡처 + stale guard. handleToggleFollow와 동일하게, 응답 도착 시점에
    // 사용자가 다른 프로필로 이동했으면(targetId 불일치) 상태를 갱신하지 않는다.
    const targetId = profile.userId
    const isStale = () => !isMountedRef.current || profileIdRef.current !== targetId
    setIsBlockProcessing(true)
    setBlockError(null)
    try {
      await blockUser(targetId)
      // navigate(-1) 대신 명시적 목적지로 이동 — 직접 URL 진입(history 없음) 시
      // navigate(-1)이 무동작이 되어 버튼이 영구 disabled 상태로 남는 것을 방지
      navigate('/', { replace: true })
    } catch (error) {
      if (!isStale()) {
        setBlockError(error instanceof Error ? error.message : '차단에 실패했습니다.')
      }
    } finally {
      if (!isStale()) setIsBlockProcessing(false)
    }
  }

  /**
   * 팔로우/언팔로우 토글. 진행 도중 사용자가 다른 프로필로 이동하면 늦게 도착한 응답이
   * 새 프로필에 잘못 반영되지 않도록 3중 stale guard 적용:
   * - `wasFollowing` 결정 시점 스냅샷
   * - `targetId` 클로저 캡처
   * - `isStale()` = `!isMountedRef || profileIdRef !== targetId`
   * `setIsFollowProcessing(false)`는 stale 여부와 무관하게 항상 reset(영구 disabled 방지).
   */
  const handleToggleFollow = async () => {
    if (isFollowProcessing) return
    // 결정 시점 스냅샷: 호출 직후 외부에서 profile.isFollowing이 바뀌어도 분기를 일관되게 유지
    // (미래 옵티미스틱 업데이트/외부 갱신 도입 시 회귀 방지)
    const wasFollowing = profile.isFollowing
    // 토글 대상 userId 캡처: await 도중 사용자가 다른 프로필로 이동하면 응답을 무시하기 위함
    const targetId = profile.userId
    setIsFollowProcessing(true)
    setFollowError(null)
    // 응답 도착 시 현재 프로필이 여전히 동일 사용자인지 확인하는 stale guard
    const isStale = () => !isMountedRef.current || profileIdRef.current !== targetId
    try {
      if (wasFollowing) {
        const result = await unfollowUser(targetId)
        if (isStale()) return
        setProfile(prev =>
          prev && prev.userId === targetId
            ? {
                ...prev,
                isFollowing: false,
                followerCount: Number.isFinite(result.followerCount)
                  ? result.followerCount
                  : prev.followerCount,
              }
            : prev
        )
      } else {
        const result = await followUser(targetId)
        if (isStale()) return
        setProfile(prev =>
          prev && prev.userId === targetId
            ? {
                ...prev,
                isFollowing: true,
                followerCount: Number.isFinite(result.followerCount)
                  ? result.followerCount
                  : prev.followerCount,
              }
            : prev
        )
      }
    } catch (error) {
      if (isStale()) return
      setFollowError(error instanceof Error ? error.message : '요청에 실패했습니다.')
    } finally {
      // stale 여부와 무관하게 항상 reset — 그렇지 않으면 사용자가 다른 프로필로 이동한 새 페이지에서 버튼이 영구 disabled
      if (isMountedRef.current) setIsFollowProcessing(false)
    }
  }

  /**
   * "더 보기" 핸들러. 이전 in-flight 요청은 abort 후 새 요청으로 교체하고, 응답에는
   * cancel 가드를 적용해 stale 응답이 새 응답을 덮어쓰지 않도록 한다. 빈 응답이 도착하면
   * `hasMoreReviews=false`로 종료(옵션 A의 false-positive 자연 종료 정책).
   */
  const handleLoadMoreReviews = async () => {
    if (isReviewsLoadingMore || !hasMoreReviews) return

    loadMoreReviewsControllerRef.current?.abort()
    const controller = new AbortController()
    loadMoreReviewsControllerRef.current = controller

    setIsReviewsLoadingMore(true)
    setReviewsErrorMessage(null)
    try {
      const response = await getUserReviews({
        userId: numericUserId,
        cursor: reviewNextCursor,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      if (response.length === 0) {
        setHasMoreReviews(false)
        return
      }
      setReviews(prev => [...prev, ...response])
      setReviewNextCursor(response[response.length - 1].reviewId)
      setHasMoreReviews(response.length === REVIEW_PAGE_SIZE)
    } catch (error) {
      if (axios.isCancel(error) || controller.signal.aborted) return
      setReviewsErrorMessage(
        error instanceof Error ? error.message : '감상 목록을 더 불러오지 못했습니다.'
      )
    } finally {
      if (!controller.signal.aborted) setIsReviewsLoadingMore(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader title="프로필" showBack />

      <main className="flex-1 overflow-y-auto pb-12">
        {/* Profile Intro */}
        <section className="px-6 pt-8 text-center">
          <div className="mx-auto mb-5 flex h-36 w-36 items-center justify-center rounded-full bg-primary/10">
            {profile.profileImageUrl ? (
              <img
                src={profile.profileImageUrl}
                alt={`${profile.nickname} 프로필 이미지`}
                loading="lazy"
                className="h-32 w-32 rounded-full object-cover"
              />
            ) : (
              <span className="material-symbols-outlined text-6xl text-muted-foreground/40">
                person
              </span>
            )}
          </div>

          <h1 className="text-3xl font-bold tracking-tight">{profile.nickname}</h1>
          {profile.bio && (
            <p className="mx-auto mt-3 max-w-[320px] whitespace-pre-wrap text-base leading-7 text-primary/80">
              {profile.bio}
            </p>
          )}

          <div className="mt-6 flex items-center justify-center gap-4 text-base font-medium text-primary/80">
            <button
              type="button"
              onClick={() => navigate(`/user/${numericUserId}/follows?tab=followers`)}
              className="transition-colors hover:text-primary"
            >
              팔로워 {profile.followerCount}
            </button>
            <span className="text-primary/30">|</span>
            <button
              type="button"
              onClick={() => navigate(`/user/${numericUserId}/follows?tab=following`)}
              className="transition-colors hover:text-primary"
            >
              팔로잉 {profile.followingCount}
            </button>
          </div>
        </section>

        {/* Follow Button */}
        <section className="flex flex-col gap-2 px-6 pt-6">
          <button
            type="button"
            onClick={handleToggleFollow}
            disabled={isFollowProcessing}
            aria-pressed={profile.isFollowing}
            className={
              profile.isFollowing
                ? 'w-full rounded-xl border border-primary/30 bg-card py-4 text-lg font-bold text-primary shadow-sm transition-colors hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60'
                : 'w-full rounded-xl bg-primary py-4 text-lg font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60'
            }
          >
            {isFollowProcessing ? '처리 중...' : profile.isFollowing ? '팔로우 취소' : '팔로우'}
          </button>
          {followError && (
            <p
              role="alert"
              aria-atomic="true"
              className="rounded-lg bg-destructive/10 px-4 py-2 text-center text-sm text-destructive"
            >
              {followError}
            </p>
          )}
          <button
            type="button"
            onClick={handleBlock}
            disabled={isBlockProcessing}
            className="w-full rounded-xl border border-destructive/20 bg-card py-3 text-base font-semibold text-destructive transition-colors hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isBlockProcessing ? '처리 중...' : '차단'}
          </button>
          {blockError && (
            <p
              role="alert"
              aria-atomic="true"
              className="rounded-lg bg-destructive/10 px-4 py-2 text-center text-sm text-destructive"
            >
              {blockError}
            </p>
          )}
        </section>

        {/* 서재 보기 진입점 */}
        <section className="px-6 pt-4">
          <button
            type="button"
            onClick={() => navigate(`/user/${numericUserId}/library`)}
            className="flex w-full items-center justify-between rounded-xl bg-card p-5 shadow-sm transition-colors hover:bg-card/80"
          >
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="material-symbols-outlined text-primary">
                menu_book
              </span>
              <span className="text-base font-semibold">서재 보기</span>
            </div>
            <span aria-hidden="true" className="material-symbols-outlined text-primary/40">
              chevron_right
            </span>
          </button>
        </section>

        {/* Stats */}
        <section className="px-6 pt-8">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-[24px] bg-card px-3 py-5 text-center shadow-sm">
              <p className="text-xs font-semibold text-primary/60">팔로워</p>
              <p className="mt-2 text-3xl font-bold text-primary">{profile.followerCount}</p>
            </div>
            <div className="rounded-[24px] bg-card px-3 py-5 text-center shadow-sm">
              <p className="text-xs font-semibold text-primary/60">팔로잉</p>
              <p className="mt-2 text-3xl font-bold text-primary">{profile.followingCount}</p>
            </div>
            <div className="rounded-[24px] bg-card px-3 py-5 text-center shadow-sm">
              <p className="text-xs font-semibold text-primary/60">감상</p>
              <p className="mt-2 text-3xl font-bold text-primary">{profile.reviewCount}개</p>
            </div>
          </div>
        </section>

        <section className="px-6 pb-10 pt-10">
          <h2 className="mb-5 text-[28px] font-bold tracking-tight text-foreground">공개 감상</h2>

          {isReviewsLoading ? (
            <p role="status" className="py-8 text-center text-sm text-muted-foreground">
              감상을 불러오는 중...
            </p>
          ) : reviews.length === 0 && !reviewsErrorMessage ? (
            <div className="rounded-[24px] bg-card px-5 py-8 text-center text-sm text-muted-foreground">
              아직 공개 감상이 없습니다.
            </div>
          ) : (
            <div className="space-y-4">
              {reviews.map(review => (
                <Link
                  key={review.reviewId}
                  to={`/review/${review.reviewId}`}
                  className="flex cursor-pointer gap-4 rounded-[24px] bg-card p-4 shadow-sm transition-colors hover:bg-primary/5"
                >
                  <div className="flex h-[96px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-primary/5">
                    {review.book.coverImageUrl ? (
                      <img
                        src={review.book.coverImageUrl}
                        alt={`${review.book.title} 표지`}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="material-symbols-outlined text-3xl text-muted-foreground/30">
                        menu_book
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 pt-1">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="line-clamp-1 text-xl font-bold text-foreground">
                        {review.book.title}
                      </h3>
                      <span className="shrink-0 text-sm font-bold text-primary">
                        ★ {review.rating.toFixed(1)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-primary/40">
                      {formatRelativeTime(review.createdAt)}
                    </p>
                    <p className="mt-3 line-clamp-2 text-base leading-6 text-foreground/65">
                      {review.isSpoiler ? '스포일러가 포함된 감상입니다.' : review.content}
                    </p>
                    <div className="mt-3 flex items-center gap-4 text-xs font-semibold text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[16px]">favorite</span>
                        {review.likeCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[16px]">chat_bubble</span>
                        {review.commentCount}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {reviewsErrorMessage && (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-center text-sm text-destructive"
            >
              {reviewsErrorMessage}
            </p>
          )}

          {hasMoreReviews && !isReviewsLoading && (
            <button
              type="button"
              onClick={handleLoadMoreReviews}
              disabled={isReviewsLoadingMore}
              className="mt-5 w-full rounded-xl bg-primary/10 py-3 text-sm font-bold text-primary transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isReviewsLoadingMore ? '불러오는 중...' : '더 보기'}
            </button>
          )}
        </section>
      </main>
    </div>
  )
}
