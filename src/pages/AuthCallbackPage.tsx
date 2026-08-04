import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { googleLogin } from '@/api/auth'
import { isCarouselSeen } from '@/lib/onboarding'
import Icon from '@/components/common/Icon'

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const setAuth = useAuthStore(state => state.setAuth)

  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  // useEffect가 StrictMode에서 두 번 실행되어 같은 code로 두 번 호출되는 것 방지.
  // OAuth code는 일회성이라 두 번째 호출은 invalid_grant 에러가 남.
  const handledRef = useRef(false)

  useEffect(() => {
    if (handledRef.current) return
    handledRef.current = true

    const error = searchParams.get('error')
    if (error) {
      setErrorMessage(
        error === 'access_denied'
          ? 'Google 로그인이 취소되었습니다.'
          : `Google 로그인 중 오류가 발생했습니다: ${error}`
      )
      return
    }

    const code = searchParams.get('code')
    if (!code) {
      setErrorMessage('잘못된 접근입니다. 인증 코드가 없습니다.')
      return
    }

    const state = searchParams.get('state')
    if (!state) {
      setErrorMessage('잘못된 접근입니다. state 값이 없습니다.')
      return
    }

    const redirectUri = `${window.location.origin}/auth/callback/google`

    googleLogin(code, redirectUri, state)
      .then(result => {
        setAuth(
          {
            id: result.user.userId,
            nickname: result.user.nickname,
            profileImageUrl: result.user.profileImageUrl ?? undefined,
            email: result.user.email,
            emailVerified: result.user.emailVerified,
            onboardingCompleted: result.user.onboardingCompleted,
            authProvider: 'GOOGLE',
          },
          result.accessToken
        )
        navigate(result.user.onboardingCompleted && isCarouselSeen() ? '/' : '/onboarding', {
          replace: true,
        })
      })
      .catch(err => {
        setErrorMessage(err instanceof Error ? err.message : 'Google 로그인에 실패했습니다.')
      })
  }, [searchParams, setAuth, navigate])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      {errorMessage ? (
        <div className="flex max-w-md flex-col items-center gap-6 text-center">
          <Icon name="error" className="text-6xl text-destructive" />
          <h1 className="text-2xl font-bold tracking-tight">Google 로그인 실패</h1>
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-6 py-4 text-sm text-destructive"
          >
            {errorMessage}
          </p>
          <Link
            to="/login"
            className="rounded-xl bg-primary px-6 py-3 text-base font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:opacity-95"
          >
            로그인 페이지로 돌아가기
          </Link>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="size-12 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          <p className="text-base text-muted-foreground">Google 로그인 처리 중...</p>
        </div>
      )}
    </div>
  )
}
