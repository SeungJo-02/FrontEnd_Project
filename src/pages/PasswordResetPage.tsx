import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AppHeader from '@/components/layout/AppHeader'
import { resetPassword } from '@/api/auth'
import { PASSWORD_REGEX } from '@/constants/validation'
import { FORM_INPUT_CLASS } from '@/constants/form'
import Icon from '@/components/common/Icon'

const schema = z
  .object({
    newPassword: z
      .string()
      .min(8, '비밀번호는 8자 이상이어야 합니다')
      .regex(PASSWORD_REGEX, '영문, 숫자, 특수문자를 모두 포함해야 합니다'),
    confirmPassword: z.string(),
  })
  .refine(data => data.newPassword === data.confirmPassword, {
    message: '비밀번호가 일치하지 않습니다',
    path: ['confirmPassword'],
  })

type FormData = z.infer<typeof schema>

export default function PasswordResetPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // 토큰을 1회만 캡처해 안정화하고, 마운트 직후 URL에서 제거한다.
  // (성공 여부와 무관하게 즉시 정리해 새로고침/주소 공유 시 ?token= 노출을 막는다)
  const [token] = useState(() => searchParams.get('token'))

  useEffect(() => {
    if (token) window.history.replaceState({}, '', '/password-reset')
  }, [token])

  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  if (!token) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <AppHeader title="새 비밀번호 설정" showBack />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <Icon name="error" className="text-5xl text-destructive" />
          <p className="text-center text-lg font-medium text-foreground">
            유효하지 않은 링크입니다.
          </p>
          <p className="text-center text-sm text-muted-foreground">
            비밀번호 재설정을 다시 요청해주세요.
          </p>
          <button
            type="button"
            onClick={() => navigate('/password-reset-request')}
            className="mt-4 rounded-xl bg-primary px-8 py-3 text-base font-bold text-primary-foreground transition-all hover:opacity-95"
          >
            재설정 요청하기
          </button>
        </main>
      </div>
    )
  }

  const onSubmit = async (data: FormData) => {
    if (isLoading) return
    setIsLoading(true)
    setErrorMessage(null)
    try {
      await resetPassword(token, data.newPassword)
      setIsSuccess(true)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '비밀번호 변경에 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader title="새 비밀번호 설정" showBack />

      <main className="flex flex-1 flex-col px-6 pt-12">
        {isSuccess ? (
          <div className="flex flex-col items-center gap-4 pt-16 text-center">
            <Icon name="check_circle" className="text-5xl text-primary" />
            <h2 className="text-2xl font-bold text-foreground">비밀번호가 변경되었습니다</h2>
            <p className="text-base text-muted-foreground">새 비밀번호로 로그인해주세요.</p>
            <button
              type="button"
              onClick={() => navigate('/login', { replace: true })}
              className="mt-4 rounded-xl bg-primary px-8 py-3 text-base font-bold text-primary-foreground transition-all hover:opacity-95"
            >
              로그인하기
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-foreground">비밀번호 재설정</h2>
            <p className="mt-3 text-base text-muted-foreground">새로운 비밀번호를 입력해주세요.</p>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-10 flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label htmlFor="new-password" className="ml-1 text-sm font-semibold">
                  새 비밀번호
                </label>
                <input
                  id="new-password"
                  {...register('newPassword')}
                  type="password"
                  autoComplete="new-password"
                  placeholder="8자 이상 입력해주세요"
                  className={FORM_INPUT_CLASS}
                />
                {errors.newPassword && (
                  <p role="alert" className="ml-1 text-xs text-destructive">
                    {errors.newPassword.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="confirm-password" className="ml-1 text-sm font-semibold">
                  새 비밀번호 확인
                </label>
                <input
                  id="confirm-password"
                  {...register('confirmPassword')}
                  type="password"
                  autoComplete="new-password"
                  placeholder="비밀번호를 다시 입력해주세요"
                  className={FORM_INPUT_CLASS}
                />
                {errors.confirmPassword && (
                  <p role="alert" className="ml-1 text-xs text-destructive">
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <p className="ml-1 text-xs text-muted-foreground">
                영문, 숫자, 특수문자 포함 8자 이상
              </p>

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
                {isLoading ? '변경 중...' : '비밀번호 변경'}
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  )
}
