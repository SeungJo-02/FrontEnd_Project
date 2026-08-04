import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import AppHeader from '@/components/layout/AppHeader'
import { getGenres, completeOnboarding, updateMyGenres, type Genre } from '@/api/genre'
import { getMyProfile } from '@/api/member'
import { useAuthStore } from '@/store/authStore'
import { EmptyState } from '@/components/common/EmptyState'
import Icon from '@/components/common/Icon'

/**
 * 장르 선택 페이지 — 온보딩(`/onboarding/genre`)과 설정(`/settings/genres`) 두 모드로 재활용.
 *
 * - **온보딩 모드**: 신규 사용자. `POST /api/v1/users/me/onboarding` 호출 → 홈 이동.
 *   `onboardingCompleted === true`이면 홈으로 리디렉트.
 * - **설정 모드**: 기존 사용자. 현재 장르를 미리 선택 상태로 표시.
 *   `PUT /api/v1/users/me/genres` 호출 → 뒤로가기.
 */
export default function GenreSelectionPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore(state => state.user)
  const onboardingCompleted = useAuthStore(state => state.user?.onboardingCompleted)
  const completeOnboardingStore = useAuthStore(state => state.completeOnboarding)

  const isSettingsMode = location.pathname === '/settings/genres'

  const [genres, setGenres] = useState<Genre[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const initialIdsRef = useRef<Set<number>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      try {
        const [genreList, profile] = await Promise.all([
          getGenres(controller.signal),
          isSettingsMode ? getMyProfile(controller.signal) : null,
        ])
        if (controller.signal.aborted) return
        setGenres(genreList)
        if (profile?.genres) {
          const ids = new Set(profile.genres.map(g => g.genreId))
          setSelectedIds(ids)
          initialIdsRef.current = ids
        }
      } catch (error) {
        if (axios.isCancel(error) || controller.signal.aborted) return
        setErrorMessage(error instanceof Error ? error.message : '장르 목록을 불러오지 못했습니다.')
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    })()
    return () => controller.abort()
  }, [isSettingsMode])

  const toggleGenre = (genreId: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(genreId)) {
        next.delete(genreId)
      } else {
        next.add(genreId)
      }
      return next
    })
  }

  const handleSubmit = async () => {
    if (isSubmitting || selectedIds.size === 0 || !user) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const genreIds = Array.from(selectedIds)
      if (isSettingsMode) {
        const unchanged =
          selectedIds.size === initialIdsRef.current.size &&
          [...selectedIds].every(id => initialIdsRef.current.has(id))
        if (unchanged) {
          setIsSubmitting(false)
          navigate('/settings', { replace: true })
          return
        }
        try {
          await updateMyGenres(genreIds)
          navigate('/settings', { replace: true })
        } finally {
          setIsSubmitting(false)
        }
        return
      } else {
        await completeOnboarding({
          nickname: user.nickname,
          genreIds,
        })
        completeOnboardingStore()
        navigate('/', { replace: true })
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '저장에 실패했습니다.')
      setIsSubmitting(false)
    }
  }

  if (!isSettingsMode && onboardingCompleted) return <Navigate to="/" replace />

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        {isSettingsMode && <AppHeader title="관심 장르 변경" showBack />}
        <main className="flex flex-1 items-center justify-center">
          <p role="status" className="text-sm text-muted-foreground">
            불러오는 중...
          </p>
        </main>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        {isSettingsMode && <AppHeader title="관심 장르 변경" showBack />}
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <Icon name="error" className="text-5xl text-muted-foreground/30" />
          <p role="alert" className="text-sm text-muted-foreground">
            {errorMessage}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground"
          >
            다시 시도
          </button>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {isSettingsMode ? (
        <AppHeader title="관심 장르 변경" showBack />
      ) : (
        <header className="px-6 pb-2 pt-12">
          <h1 className="text-3xl font-bold leading-tight">
            관심 장르를
            <br />
            선택해주세요
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            선택한 장르를 바탕으로 감상을 추천해드려요
          </p>
        </header>
      )}

      <main className="flex-1 overflow-y-auto px-6 pb-32 pt-6">
        <div className="flex flex-wrap gap-3">
          {genres.map(genre => {
            const isSelected = selectedIds.has(genre.genreId)
            return (
              <button
                key={genre.genreId}
                type="button"
                onClick={() => toggleGenre(genre.genreId)}
                aria-pressed={isSelected}
                className={`rounded-full px-5 py-3 text-[15px] font-semibold transition-all ${
                  isSelected
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                    : 'border border-primary/15 bg-card text-foreground hover:bg-primary/5'
                }`}
              >
                {genre.name}
              </button>
            )
          })}
        </div>

        {genres.length === 0 && (
          <EmptyState icon="category" message="등록된 장르가 없습니다" className="py-16" />
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-[430px] bg-background px-6 pb-8 pt-4">
        {submitError && (
          <p
            role="alert"
            className="mb-3 rounded-lg bg-destructive/10 px-4 py-2 text-center text-sm text-destructive"
          >
            {submitError}
          </p>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={selectedIds.size === 0 || isSubmitting}
          className="h-14 w-full rounded-full bg-primary text-lg font-bold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSubmitting
            ? '처리 중...'
            : selectedIds.size === 0
              ? '장르를 선택해주세요'
              : isSettingsMode
                ? '저장'
                : `선택 완료 (${selectedIds.size}개)`}
        </button>
      </div>
    </div>
  )
}
