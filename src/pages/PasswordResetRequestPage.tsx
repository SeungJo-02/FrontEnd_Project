import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import AppHeader from '@/components/layout/AppHeader'
import { requestPasswordReset } from '@/api/auth'
import { FORM_INPUT_CLASS } from '@/constants/form'
import { Screen } from '@/components/layout/Screen'
import FieldError from '@/components/ui/FieldError'
import Icon from '@/components/common/Icon'

const schema = z.object({
  email: z.string().email('올바른 이메일 형식을 입력해주세요'),
})

type FormData = z.infer<typeof schema>

export default function PasswordResetRequestPage() {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)
  const [isSent, setIsSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    if (isLoading) return
    setIsLoading(true)
    try {
      await requestPasswordReset(data.email)
    } catch {
      // 이메일 존재 여부 노출 방지: 성공/실패 무관하게 동일한 안내 화면 표시
    } finally {
      setIsSent(true)
      setIsLoading(false)
    }
  }

  return (
    <Screen>
      <AppHeader title="비밀번호 재설정" showBack />

      <main className="flex flex-1 flex-col px-6 pt-12">
        {isSent ? (
          <div className="flex flex-col items-center gap-4 pt-16 text-center">
            <Icon name="mark_email_read" className="text-5xl text-primary" />
            <h2 className="text-2xl font-bold text-foreground">메일을 보냈습니다</h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              입력하신 이메일로 비밀번호 재설정 링크를
              <br />
              보내드렸습니다. 메일함을 확인해주세요.
            </p>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="mt-4 rounded-xl bg-primary px-8 py-3 text-base font-bold text-primary-foreground transition-all hover:opacity-95"
            >
              로그인으로 돌아가기
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-foreground">비밀번호 재설정</h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              가입 시 사용한 이메일을 입력하시면
              <br />
              비밀번호 재설정 링크를 보내드립니다.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-10 flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label htmlFor="reset-email" className="ml-1 text-sm font-semibold">
                  이메일
                </label>
                <input
                  id="reset-email"
                  {...register('email')}
                  type="email"
                  autoComplete="email"
                  placeholder="email@example.com"
                  className={FORM_INPUT_CLASS}
                />
                {errors.email && <FieldError message={errors.email.message} />}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="mt-4 w-full rounded-xl bg-primary py-4 text-lg font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? '전송 중...' : '재설정 링크 보내기'}
              </button>
            </form>
          </>
        )}
      </main>
    </Screen>
  )
}
