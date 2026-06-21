import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import BottomNav from '@/components/layout/BottomNav'
import { getMyProfile, type MyProfile } from '@/api/member'
import { getMyReviews, REVIEW_PAGE_SIZE, type ReviewListItem } from '@/api/review'
import { getWisdomTower, type WisdomTowerResponse } from '@/api/library'
import { formatRelativeTime } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'

const TOWER_PALETTE = [
  { bg: '#2B2626', text: 'text-white' },
  { bg: '#314244', text: 'text-white' },
  { bg: '#4B2E26', text: 'text-white' },
  { bg: '#C2A065', text: 'text-white' },
  { bg: '#6C4B3F', text: 'text-white' },
  { bg: '#9B8378', text: 'text-white' },
  { bg: '#CBBDB8', text: 'text-foreground' },
  { bg: '#E2DBD8', text: 'text-primary' },
]

const TOWER_WIDTHS = [92, 88, 90, 86, 91, 84, 89, 82, 87, 93, 85, 90, 88, 86, 91]

/**
 * 본인 프로필 페이지.
 *
 * 세 개의 독립 데이터 소스:
 * 1. `getMyProfile` — 프로필 정보 + authStore 동기화
 * 2. `getWisdomTower` — 완독 도서 스택(지혜의 탑) + 통계 카드 + 월별 독서량 파생
 * 3. `getMyReviews` — 공개 감상 타임라인
 */
export default function MyProfilePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [profile, setProfile] = useState<MyProfile | null>(null)
  const [wisdomTower, setWisdomTower] = useState<WisdomTowerResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [reviews, setReviews] = useState<ReviewListItem[]>([])
  const [reviewNextCursor, setReviewNextCursor] = useState<number | null>(null)
  const [hasMoreReviews, setHasMoreReviews] = useState(false)
  const [isReviewsLoading, setIsReviewsLoading] = useState(true)
  const [isReviewsLoadingMore, setIsReviewsLoadingMore] = useState(false)
  const [reviewsErrorMessage, setReviewsErrorMessage] = useState<string | null>(null)

  const loadMoreControllerRef = useRef<AbortController | null>(null)

  const visibleReviews = useMemo(
    () => reviews.filter(r => r.reviewVisibility === 'PUBLIC'),
    [reviews]
  )

  const now = useMemo(() => new Date(), [])
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()

  const thisYearBooks = useMemo(
    () =>
      wisdomTower?.books.filter(
        b => b.finishedAt && new Date(b.finishedAt).getFullYear() === currentYear
      ).length ?? 0,
    [wisdomTower, currentYear]
  )

  /**
   * wisdom tower books의 finishedAt을 올해 월별로 그룹핑.
   * 1월~현재 월까지만 표시하여 미래 월의 빈 바를 방지.
   * `now`에서 파생된 `currentYear`/`currentMonth`를 사용하여 단일 시점 기준 보장.
   */
  const monthlyStats = useMemo(() => {
    const counts = new Array(currentMonth + 1).fill(0) as number[]
    if (wisdomTower?.books) {
      for (const book of wisdomTower.books) {
        if (!book.finishedAt) continue
        const date = new Date(book.finishedAt)
        if (date.getFullYear() !== currentYear) continue
        const month = date.getMonth()
        if (month <= currentMonth) counts[month]++
      }
    }
    return counts.map((value, i) => ({ month: `${i + 1}월`, value }))
  }, [wisdomTower, currentYear, currentMonth])

  const maxStatValue = useMemo(
    () => Math.max(...monthlyStats.map(item => item.value), 1),
    [monthlyStats]
  )

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setErrorMessage(null)
    ;(async () => {
      try {
        const [result, tower] = await Promise.all([
          getMyProfile(controller.signal),
          getWisdomTower(controller.signal).catch(err => {
            if (!axios.isCancel(err) && import.meta.env.DEV)
              console.error('Failed to load wisdom tower:', err)
            return null
          }),
        ])
        if (controller.signal.aborted) return
        setProfile(result)
        if (tower) setWisdomTower(tower)

        const state = useAuthStore.getState()
        // user가 비어 있어도(부팅 직후 충전 전) accessToken만 있으면 동기화한다.
        // 메모리 보관 전환 후 user=null 상태로 진입할 수 있어 조건을 accessToken 기준으로 완화.
        if (state.accessToken) {
          state.setAuth(
            {
              ...(state.user ?? {}),
              id: result.userId,
              nickname: result.nickname,
              email: result.email,
              profileImageUrl: result.profileImageUrl ?? undefined,
              bio: result.bio ?? undefined,
              emailVerified: result.emailVerified,
              onboardingCompleted: result.onboardingCompleted,
            },
            state.accessToken
          )
        }
      } catch (error) {
        if (axios.isCancel(error) || controller.signal.aborted) return
        setErrorMessage(error instanceof Error ? error.message : '프로필을 불러오지 못했습니다.')
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    })()

    return () => controller.abort()
  }, [location.key])

  useEffect(() => {
    const controller = new AbortController()
    setIsReviewsLoading(true)
    setReviewsErrorMessage(null)
    ;(async () => {
      try {
        const response = await getMyReviews({
          cursor: null,
          status: 'PUBLISHED',
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setReviews(response)
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
      loadMoreControllerRef.current?.abort()
    }
  }, [location.key])

  const handleLoadMoreReviews = async () => {
    if (isReviewsLoadingMore || !hasMoreReviews) return

    loadMoreControllerRef.current?.abort()
    const controller = new AbortController()
    loadMoreControllerRef.current = controller

    setIsReviewsLoadingMore(true)
    setReviewsErrorMessage(null)
    try {
      const response = await getMyReviews({
        cursor: reviewNextCursor,
        status: 'PUBLISHED',
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

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md">
          <div className="grid grid-cols-3 items-center px-4 py-3">
            <div />
            <div className="flex justify-center">
              <Link
                to="/"
                className="cursor-pointer text-2xl font-bold tracking-tight text-primary transition-opacity hover:opacity-70"
              >
                Shelfeed
              </Link>
            </div>
            <div />
          </div>
        </header>
        <main aria-busy="true" className="flex flex-1 items-center justify-center pb-24">
          <p role="status" className="text-sm text-muted-foreground">
            불러오는 중...
          </p>
        </main>
        <BottomNav />
      </div>
    )
  }

  if (errorMessage || !profile) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md">
          <div className="grid grid-cols-3 items-center px-4 py-3">
            <div />
            <div className="flex justify-center">
              <Link
                to="/"
                className="cursor-pointer text-2xl font-bold tracking-tight text-primary transition-opacity hover:opacity-70"
              >
                Shelfeed
              </Link>
            </div>
            <div />
          </div>
        </header>
        <main className="flex flex-1 flex-col items-center justify-center gap-4 pb-24">
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
        <BottomNav />
      </div>
    )
  }

  const towerBooks = wisdomTower?.books ?? []

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="grid grid-cols-3 items-center px-4 py-3">
          <div className="flex justify-start">
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="flex size-10 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
              aria-label="설정 페이지로 이동"
            >
              <span className="material-symbols-outlined">settings</span>
            </button>
          </div>

          <div className="flex justify-center">
            <Link
              to="/"
              className="cursor-pointer text-2xl font-bold tracking-tight text-primary transition-opacity hover:opacity-70"
            >
              Shelfeed
            </Link>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled
              aria-label="공유 (준비 중)"
              className="flex size-10 items-center justify-center rounded-full text-primary/40"
            >
              <span className="material-symbols-outlined">share</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        {/* Profile Intro */}
        <section className="px-6 pt-8 text-center">
          <div className="relative mx-auto mb-5 flex h-36 w-36 items-center justify-center rounded-full bg-primary/10">
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

            <button
              type="button"
              onClick={() => navigate('/settings/profile')}
              aria-label="프로필 편집"
              className="absolute bottom-1 right-1 flex h-10 w-10 items-center justify-center rounded-full border-4 border-background bg-primary text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">edit</span>
            </button>
          </div>

          <h1 className="text-3xl font-bold tracking-tight">{profile.nickname}</h1>
          {profile.bio ? (
            <p className="mx-auto mt-3 max-w-[320px] whitespace-pre-wrap text-base leading-7 text-primary/80">
              {profile.bio}
            </p>
          ) : (
            <p className="mx-auto mt-3 max-w-[320px] text-base leading-7 text-primary/40">
              소개글을 작성해보세요.
            </p>
          )}

          <div className="mt-6 flex items-center justify-center gap-4 text-base font-medium text-primary/80">
            <button
              type="button"
              onClick={() => navigate(`/user/${profile.userId}/follows?tab=followers`)}
              className="transition-colors hover:text-primary"
            >
              팔로워 {profile.followerCount}
            </button>
            <span className="text-primary/30">|</span>
            <button
              type="button"
              onClick={() => navigate(`/user/${profile.userId}/follows?tab=following`)}
              className="transition-colors hover:text-primary"
            >
              팔로잉 {profile.followingCount}
            </button>
          </div>
        </section>

        {/* Stats */}
        <section className="px-6 pt-8">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-[24px] bg-card px-3 py-5 text-center shadow-sm">
              <p className="text-xs font-semibold text-primary/60">올해 읽은 책</p>
              <p className="mt-2 text-3xl font-bold text-primary">{thisYearBooks}권</p>
            </div>

            <div className="rounded-[24px] bg-card px-3 py-5 text-center shadow-sm">
              <p className="text-xs font-semibold text-primary/60">총 완독</p>
              <p className="mt-2 text-3xl font-bold text-primary">
                {wisdomTower?.totalCount ?? 0}권
              </p>
            </div>

            <div className="rounded-[24px] bg-card px-3 py-5 text-center shadow-sm">
              <p className="text-xs font-semibold text-primary/60">감상</p>
              <p className="mt-2 text-3xl font-bold text-primary">{profile.reviewCount}개</p>
            </div>
          </div>
        </section>

        {/* Wisdom Tower */}
        <section className="px-6 pt-10">
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-bold text-primary/90">Your Wisdom Tower</h2>
          </div>

          {towerBooks.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-[24px] bg-card py-10 shadow-sm">
              <span className="material-symbols-outlined text-5xl text-muted-foreground/30">
                auto_stories
              </span>
              <p className="text-sm text-muted-foreground">아직 완독한 책이 없습니다</p>
              <p className="text-xs text-muted-foreground/60">책을 다 읽으면 여기에 쌓여요</p>
            </div>
          ) : (
            <div className="flex flex-col-reverse items-center">
              {towerBooks.map((book, index) => {
                const palette = TOWER_PALETTE[index % TOWER_PALETTE.length]
                const width = TOWER_WIDTHS[index % TOWER_WIDTHS.length]
                return (
                  <Link
                    key={book.libraryBookId}
                    to={`/library/${book.libraryBookId}`}
                    className="relative block h-[58px] transition-opacity hover:opacity-80"
                    style={{
                      width: `${width}%`,
                      marginTop: index === 0 ? 0 : '-2px',
                    }}
                  >
                    <div
                      className={`flex h-full w-full items-center justify-center rounded-[16px] text-lg font-bold shadow-md ${palette.text}`}
                      style={{ backgroundColor: palette.bg }}
                    >
                      <span className="truncate px-4">{book.title}</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

        {/* Reading Statistics */}
        <section className="px-6 pt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[28px] font-bold tracking-tight text-foreground">나의 독서 통계</h2>
          </div>

          <div className="rounded-[28px] bg-card px-5 pb-5 pt-5 shadow-sm">
            {monthlyStats.length > 0 ? (
              <div className="h-[176px] pt-6">
                <div className="flex h-[128px] items-end justify-between gap-3 border-b border-border/70 px-2 pb-3">
                  {monthlyStats.map(item => {
                    const barHeight = `${(item.value / maxStatValue) * 100}%`
                    return (
                      <div
                        key={item.month}
                        className="flex flex-1 flex-col items-center justify-end gap-3"
                      >
                        <div className="flex h-[96px] items-end">
                          <div
                            className="relative flex w-7 items-start justify-center rounded-full bg-primary/70"
                            style={{ height: barHeight, minHeight: '18px' }}
                          >
                            <span className="absolute bottom-full mb-2 text-sm font-semibold text-primary/55">
                              {item.value}
                            </span>
                          </div>
                        </div>
                        <span className="text-xs font-medium text-primary/45">{item.month}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-10">
                <p className="text-sm text-muted-foreground">올해 독서 기록이 없습니다</p>
              </div>
            )}
          </div>
        </section>

        {/* Drafts Entry */}
        <section className="px-6 pt-10">
          <button
            type="button"
            onClick={() => navigate('/drafts')}
            className="flex w-full items-center gap-3 rounded-[20px] bg-card px-5 py-4 shadow-sm transition-colors hover:bg-primary/5"
          >
            <span className="material-symbols-outlined text-2xl text-primary">draft</span>
            <span className="flex-1 text-left text-base font-bold text-foreground">
              임시저장한 감상
            </span>
            <span className="material-symbols-outlined text-xl text-muted-foreground/50">
              chevron_right
            </span>
          </button>
        </section>

        {/* Public Review Timeline */}
        <section className="px-6 pb-10 pt-10">
          <h2 className="mb-5 text-[28px] font-bold tracking-tight text-foreground">
            공개 감상 타임라인
          </h2>

          {isReviewsLoading ? (
            <p role="status" className="py-8 text-center text-sm text-muted-foreground">
              감상을 불러오는 중...
            </p>
          ) : visibleReviews.length === 0 && !reviewsErrorMessage ? (
            <div className="rounded-[24px] bg-card px-5 py-8 text-center text-sm text-muted-foreground">
              아직 공개 감상이 없습니다.
            </div>
          ) : (
            <div className="space-y-4">
              {visibleReviews.map(review => (
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

      <BottomNav />
    </div>
  )
}
