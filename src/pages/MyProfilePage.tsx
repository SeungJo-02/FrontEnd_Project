import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import BottomNav from '@/components/layout/BottomNav'
import ReadingCalendar from '@/components/library/ReadingCalendar'
import { getMyProfile, type MyProfile } from '@/api/member'
import { getMyLibrary, type LibraryBookSummary } from '@/api/library'
import { useAuthStore } from '@/store/authStore'
import Icon from '@/components/common/Icon'

/** 캘린더/통계는 서재 전체가 필요하다. 무한정 돌지 않도록 페이지 수를 제한한다. */
const LIBRARY_PAGE_SIZE = 100
const LIBRARY_MAX_PAGES = 10

/**
 * 본인 프로필 페이지.
 *
 * 두 개의 독립 데이터 소스:
 * 1. `getMyProfile` — 프로필 정보 + authStore 동기화
 * 2. `getMyLibrary` — 독서 캘린더 + 통계 카드 + 월별 독서량 파생
 *
 * 전용 캘린더 API가 없어 서재 응답의 startedAt/finishedAt에서 파생한다.
 */
export default function MyProfilePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [profile, setProfile] = useState<MyProfile | null>(null)
  const [libraryBooks, setLibraryBooks] = useState<LibraryBookSummary[]>([])
  const [isLibraryLoading, setIsLibraryLoading] = useState(true)
  const [libraryErrorMessage, setLibraryErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const now = useMemo(() => new Date(), [])
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()

  const finishedBooks = useMemo(() => libraryBooks.filter(book => book.finishedAt), [libraryBooks])

  const thisYearBooks = useMemo(
    () =>
      finishedBooks.filter(
        book => new Date(book.finishedAt as string).getFullYear() === currentYear
      ).length,
    [finishedBooks, currentYear]
  )

  /**
   * 완독일을 올해 월별로 그룹핑. 1월~현재 월까지만 표시해 미래 월의 빈 바를 없앤다.
   * `now`에서 파생된 `currentYear`/`currentMonth`를 써 단일 시점 기준을 보장한다.
   */
  const monthlyStats = useMemo(() => {
    const counts = new Array(currentMonth + 1).fill(0) as number[]
    for (const book of finishedBooks) {
      const date = new Date(book.finishedAt as string)
      if (date.getFullYear() !== currentYear) continue
      const month = date.getMonth()
      if (month <= currentMonth) counts[month]++
    }
    return counts.map((value, i) => ({ month: `${i + 1}월`, value }))
  }, [finishedBooks, currentYear, currentMonth])

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
        const result = await getMyProfile(controller.signal)
        if (controller.signal.aborted) return
        setProfile(result)

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

  // 서재 전체를 커서로 훑어 캘린더/통계 데이터를 만든다. 프로필 로딩과 독립적으로 두어
  // 서재 조회가 느리거나 실패해도 프로필 화면 자체는 뜨게 한다.
  useEffect(() => {
    const controller = new AbortController()
    setIsLibraryLoading(true)
    setLibraryErrorMessage(null)
    ;(async () => {
      try {
        const collected: LibraryBookSummary[] = []
        let cursor: number | null = null

        for (let page = 0; page < LIBRARY_MAX_PAGES; page++) {
          const response = await getMyLibrary({
            cursor,
            limit: LIBRARY_PAGE_SIZE,
            signal: controller.signal,
          })
          if (controller.signal.aborted) return
          collected.push(...response.content)
          if (!response.hasNext || response.nextCursor == null) break
          cursor = response.nextCursor
        }

        if (controller.signal.aborted) return
        setLibraryBooks(collected)
      } catch (error) {
        if (axios.isCancel(error) || controller.signal.aborted) return
        setLibraryErrorMessage(
          error instanceof Error ? error.message : '독서 기록을 불러오지 못했습니다.'
        )
      } finally {
        if (!controller.signal.aborted) setIsLibraryLoading(false)
      }
    })()

    return () => controller.abort()
  }, [location.key])

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
          <Icon name="error" className="text-6xl text-muted-foreground/30" />
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
              <Icon name="settings" />
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

          {/* 로고가 가운데 오도록 왼쪽 설정 버튼과 짝을 맞추는 빈 칸. */}
          <div />
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
              <Icon name="person" className="text-6xl text-muted-foreground/40" />
            )}

            <button
              type="button"
              onClick={() => navigate('/settings/profile')}
              aria-label="프로필 편집"
              className="absolute bottom-1 right-1 flex h-10 w-10 items-center justify-center rounded-full border-4 border-background bg-primary text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-95"
            >
              <Icon name="edit" className="text-[18px]" />
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
              <p className="mt-2 text-3xl font-bold text-primary">{finishedBooks.length}권</p>
            </div>

            <div className="rounded-[24px] bg-card px-3 py-5 text-center shadow-sm">
              <p className="text-xs font-semibold text-primary/60">감상</p>
              <p className="mt-2 text-3xl font-bold text-primary">{profile.reviewCount}개</p>
            </div>
          </div>
        </section>

        {/* Reading Calendar */}
        <section className="px-6 pt-10">
          <h2 className="mb-5 text-[28px] font-bold tracking-tight text-foreground">독서 캘린더</h2>
          <ReadingCalendar
            books={libraryBooks}
            isLoading={isLibraryLoading}
            errorMessage={libraryErrorMessage}
          />
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
        <section className="px-6 pb-10 pt-10">
          <button
            type="button"
            onClick={() => navigate('/drafts')}
            className="flex w-full items-center gap-3 rounded-[20px] bg-card px-5 py-4 shadow-sm transition-colors hover:bg-primary/5"
          >
            <Icon name="draft" className="text-2xl text-primary" />
            <span className="flex-1 text-left text-base font-bold text-foreground">
              임시저장한 감상
            </span>
            <Icon name="chevron_right" className="text-xl text-muted-foreground/50" />
          </button>
        </section>
      </main>

      <BottomNav />
    </div>
  )
}
