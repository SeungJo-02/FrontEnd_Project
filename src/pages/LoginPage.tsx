import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { login, getGoogleLoginUrl } from '@/api/auth'
import { isCarouselSeen } from '@/lib/onboarding'
import { FORM_INPUT_CLASS } from '@/constants/form'

const loginSchema = z.object({
  email: z.string().email('올바른 이메일을 입력하세요'),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore(state => state.setAuth)

  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [googleErrorMessage, setGoogleErrorMessage] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true)
    setGoogleErrorMessage(null)
    try {
      const { loginUrl } = await getGoogleLoginUrl()
      // 오픈 리다이렉트 방어: https 스킴만 검사하면 https://evil.example 같은 임의 origin도
      // 통과하므로, 신뢰 origin allowlist에 든 URL만 이동한다.
      let parsed: URL
      try {
        parsed = new URL(loginUrl)
      } catch {
        setGoogleErrorMessage('잘못된 로그인 URL을 받았습니다. 잠시 후 다시 시도해주세요.')
        setIsGoogleLoading(false)
        return
      }
      // 구글 OAuth 시작 도메인 + (백엔드가 자체 시작 엔드포인트를 줄 수 있으므로) API origin만 허용
      const allowedOrigins = new Set<string>(['https://accounts.google.com'])
      try {
        const apiBase = import.meta.env.VITE_API_BASE_URL
        if (apiBase) allowedOrigins.add(new URL(apiBase).origin)
      } catch {
        /* VITE_API_BASE_URL 미설정/형식 오류 — accounts.google.com만 허용 */
      }
      if (!allowedOrigins.has(parsed.origin)) {
        setGoogleErrorMessage('안전하지 않은 로그인 URL입니다.')
        setIsGoogleLoading(false)
        return
      }
      window.location.href = parsed.toString()
    } catch (error) {
      setGoogleErrorMessage(
        error instanceof Error ? error.message : 'Google 로그인 URL을 받아오지 못했습니다.'
      )
      setIsGoogleLoading(false)
    }
  }

  const onSubmit = async (formData: LoginForm) => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const result = await login({
        email: formData.email,
        password: formData.password,
      })
      setAuth(
        {
          id: result.user.userId,
          nickname: result.user.nickname,
          profileImageUrl: result.user.profileImageUrl ?? undefined,
          email: result.user.email,
          bio: result.user.bio,
          emailVerified: result.user.emailVerified,
          onboardingCompleted: result.user.onboardingCompleted,
          authProvider: 'EMAIL',
        },
        result.accessToken
      )
      navigate(result.user.onboardingCompleted && isCarouselSeen() ? '/' : '/onboarding', {
        replace: true,
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '로그인에 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-between bg-background selection:bg-primary/20">
      {/* Background Blurs */}
      <div className="pointer-events-none fixed left-[-5%] top-[-10%] -z-10 h-[40%] w-[40%] rounded-full bg-primary/5 blur-[120px]" />
      <div className="pointer-events-none fixed bottom-[-5%] right-[-5%] -z-10 h-[30%] w-[30%] rounded-full bg-primary/5 blur-[100px]" />

      {/* Header */}
      <header className="flex w-full items-center justify-center py-16">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-4xl font-bold tracking-tight text-primary">Shelfeed</h1>
          <div className="h-px w-8 bg-primary/30" />
        </div>
      </header>

      {/* Main Form */}
      <main className="flex w-full max-w-md flex-col gap-10 px-6">
        {/* Google Login */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isGoogleLoading}
          className="group flex w-full items-center justify-center gap-3 rounded-xl border border-primary/10 bg-card px-6 py-4 shadow-sm transition-all duration-300 hover:bg-card/80 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          <span className="text-base font-medium">
            {isGoogleLoading ? 'Google 로그인 페이지로 이동 중...' : 'Google 로그인'}
          </span>
        </button>
        {googleErrorMessage && (
          <p
            role="alert"
            className="-mt-6 rounded-lg bg-destructive/10 px-4 py-3 text-center text-sm text-destructive"
          >
            {googleErrorMessage}
          </p>
        )}

        {/* Divider */}
        <div className="relative flex items-center py-4">
          <div className="flex-grow border-t border-primary/10" />
          <span className="mx-4 shrink-0 text-sm text-muted-foreground">또는</span>
          <div className="flex-grow border-t border-primary/10" />
        </div>

        {/* Email Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="ml-1 text-sm font-semibold">이메일</label>
            <input
              {...register('email')}
              type="email"
              placeholder="email@example.com"
              className={FORM_INPUT_CLASS}
            />
            {errors.email && (
              <p className="ml-1 text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <label className="text-sm font-semibold">비밀번호</label>
              <Link
                to="/password-reset-request"
                className="text-[13px] text-primary hover:underline"
              >
                비밀번호를 잊으셨나요?
              </Link>
            </div>
            <input
              {...register('password')}
              type="password"
              placeholder="비밀번호를 입력하세요"
              className={FORM_INPUT_CLASS}
            />
            {errors.password && (
              <p className="ml-1 text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          {errorMessage && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-4 py-3 text-center text-sm text-destructive"
            >
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="mt-4 w-full rounded-xl bg-primary py-4 text-lg font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </main>

      {/* Footer */}
      <footer className="flex w-full items-center justify-center py-12">
        <p className="text-sm tracking-tight text-muted-foreground">
          계정이 없으신가요?
          <Link
            to="/signup"
            className="ml-2 font-bold text-foreground underline decoration-primary/30 underline-offset-4 transition-colors hover:text-primary"
          >
            회원가입
          </Link>
        </p>
      </footer>
    </div>
  )
}
