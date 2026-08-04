import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import AppHeader from '@/components/layout/AppHeader'
import { changePassword } from '@/api/member'
import { PASSWORD_HINT, PASSWORD_REGEX } from '@/constants/validation'
import { FORM_INPUT_CLASS } from '@/constants/form'
import Icon from '@/components/common/Icon'

const PASSWORD_MAX_LENGTH = 64

const schema = z
  .object({
    currentPassword: z.string().min(1, '현재 비밀번호를 입력해주세요').max(PASSWORD_MAX_LENGTH),
    newPassword: z
      .string()
      .min(8, '비밀번호는 8자 이상이어야 합니다')
      .max(PASSWORD_MAX_LENGTH, `비밀번호는 ${PASSWORD_MAX_LENGTH}자 이하여야 합니다`)
      .regex(PASSWORD_REGEX, '영문, 숫자, 특수문자를 모두 포함해야 합니다'),
    confirmPassword: z.string().max(PASSWORD_MAX_LENGTH),
  })
  .superRefine((data, ctx) => {
    if (data.newPassword !== data.confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: '새 비밀번호가 일치하지 않습니다',
      })
    }
    if (data.currentPassword && data.currentPassword === data.newPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['newPassword'],
        message: '현재 비밀번호와 다른 비밀번호를 입력해주세요',
      })
    }
  })

type FormData = z.infer<typeof schema>

export default function PasswordChangePage() {
  const navigate = useNavigate()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    if (isSubmitting) return
    setErrorMessage(null)
    try {
      await changePassword(data.currentPassword, data.newPassword)
      reset()
      setIsSuccess(true)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '비밀번호 변경에 실패했습니다.')
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader title="비밀번호 변경" showBack />

      <main className="flex flex-1 flex-col px-6 pt-12">
        {isSuccess ? (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-col items-center gap-4 pt-16 text-center"
          >
            <Icon name="check_circle" className="text-5xl text-primary" />
            <h2 className="text-2xl font-bold text-foreground">비밀번호가 변경되었습니다</h2>
            <p className="text-base text-muted-foreground">
              변경된 비밀번호로 계속 이용하실 수 있습니다.
            </p>
            <button
              type="button"
              onClick={() => navigate('/settings', { replace: true })}
              className="mt-4 rounded-xl bg-primary px-8 py-3 text-base font-bold text-primary-foreground transition-all hover:opacity-95"
            >
              설정으로 돌아가기
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-foreground">비밀번호 변경</h2>
            <p className="mt-3 text-base text-muted-foreground">
              현재 비밀번호를 확인한 뒤 새 비밀번호를 설정합니다.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-10 flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label htmlFor="current-password" className="ml-1 text-sm font-semibold">
                  현재 비밀번호
                </label>
                <input
                  id="current-password"
                  {...register('currentPassword')}
                  type="password"
                  autoComplete="current-password"
                  maxLength={PASSWORD_MAX_LENGTH}
                  placeholder="현재 비밀번호를 입력해주세요"
                  className={FORM_INPUT_CLASS}
                />
                {errors.currentPassword && (
                  <p role="alert" className="ml-1 text-xs text-destructive">
                    {errors.currentPassword.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="new-password" className="ml-1 text-sm font-semibold">
                  새 비밀번호
                </label>
                <input
                  id="new-password"
                  {...register('newPassword')}
                  type="password"
                  autoComplete="new-password"
                  maxLength={PASSWORD_MAX_LENGTH}
                  placeholder="8자 이상 입력해주세요"
                  aria-describedby="password-hint"
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
                  maxLength={PASSWORD_MAX_LENGTH}
                  placeholder="비밀번호를 다시 입력해주세요"
                  className={FORM_INPUT_CLASS}
                />
                {errors.confirmPassword && (
                  <p role="alert" className="ml-1 text-xs text-destructive">
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <p id="password-hint" className="ml-1 text-xs text-muted-foreground">
                {PASSWORD_HINT}
              </p>

              {errorMessage && (
                <p
                  role="alert"
                  aria-atomic="true"
                  className="rounded-lg bg-destructive/10 px-4 py-3 text-center text-sm text-destructive"
                >
                  {errorMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-4 w-full rounded-xl bg-primary py-4 text-lg font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? '변경 중...' : '비밀번호 변경'}
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  )
}
