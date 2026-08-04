import { useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { signup, checkEmail, checkNickname } from '@/api/auth'
import { PASSWORD_REGEX } from '@/constants/validation'
import type { EmailVerifyLocationState } from '@/pages/EmailVerificationPage'
import Icon from '@/components/common/Icon'

const step1Schema = z
  .object({
    email: z.string().email('올바른 이메일을 입력하세요'),
    password: z
      .string()
      .regex(PASSWORD_REGEX, '비밀번호는 8자 이상, 영문+숫자+특수문자(@$!%*#?&)를 포함해야 합니다'),
    passwordConfirm: z.string(),
  })
  .refine(data => data.password === data.passwordConfirm, {
    message: '비밀번호가 일치하지 않습니다',
    path: ['passwordConfirm'],
  })

const step2Schema = z.object({
  nickname: z.string().min(2, '닉네임은 2자 이상이어야 합니다'),
  bio: z.string().max(300, '소개글은 300자 이하로 입력해주세요').optional(),
})

type Step1Form = z.infer<typeof step1Schema>
type Step2Form = z.infer<typeof step2Schema>

export default function SignupPage() {
  const [step, setStep] = useState(1)
  const [showPassword, setShowPassword] = useState(false)
  const [isStep1Loading, setIsStep1Loading] = useState(false)
  const [isStep2Loading, setIsStep2Loading] = useState(false)
  const [step2ErrorMessage, setStep2ErrorMessage] = useState<string | null>(null)
  const [nicknameStatus, setNicknameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>(
    'idle'
  )
  const nicknameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navigate = useNavigate()
  const setAuth = useAuthStore(state => state.setAuth)

  const step1Form = useForm<Step1Form>({
    resolver: zodResolver(step1Schema),
  })

  const step2Form = useForm<Step2Form>({
    resolver: zodResolver(step2Schema),
  })

  const debouncedCheckNickname = useCallback(
    (nickname: string) => {
      if (nicknameTimerRef.current) clearTimeout(nicknameTimerRef.current)
      if (nickname.length < 2) {
        setNicknameStatus('idle')
        return
      }
      setNicknameStatus('checking')
      nicknameTimerRef.current = setTimeout(async () => {
        try {
          const result = await checkNickname(nickname)
          const current = step2Form.getValues('nickname')
          if (current === nickname) {
            setNicknameStatus(result.available ? 'available' : 'taken')
          }
        } catch {
          const current = step2Form.getValues('nickname')
          if (current === nickname) {
            setNicknameStatus('idle')
          }
        }
      }, 400)
    },
    [step2Form]
  )

  const watchedNickname = step2Form.watch('nickname')
  useEffect(() => {
    setStep2ErrorMessage(null)
    debouncedCheckNickname(watchedNickname ?? '')
    return () => {
      if (nicknameTimerRef.current) clearTimeout(nicknameTimerRef.current)
    }
  }, [watchedNickname, debouncedCheckNickname])

  const onStep1Submit = async () => {
    setIsStep1Loading(true)
    try {
      const email = step1Form.getValues('email')
      const result = await checkEmail(email)
      if (!result.available) {
        step1Form.setError('email', { message: '이미 사용 중인 이메일입니다' })
        return
      }
      setStep(2)
    } catch (error) {
      step1Form.setError('email', {
        message: error instanceof Error ? error.message : '이메일 확인에 실패했습니다.',
      })
    } finally {
      setIsStep1Loading(false)
    }
  }

  const onStep2Submit = async (data: Step2Form) => {
    if (nicknameStatus === 'taken') {
      setStep2ErrorMessage('이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.')
      return
    }
    if (nicknameStatus === 'checking') {
      setStep2ErrorMessage('닉네임 중복 확인 중입니다. 잠시 후 다시 시도해주세요.')
      return
    }
    setIsStep2Loading(true)
    setStep2ErrorMessage(null)
    try {
      const { email, password } = step1Form.getValues()
      const trimmedBio = data.bio?.trim()
      const result = await signup({
        email,
        password,
        nickname: data.nickname,
        ...(trimmedBio ? { bio: trimmedBio } : {}),
      })
      setAuth(
        {
          id: result.user.userId,
          nickname: result.user.nickname,
          email: result.user.email,
          bio: result.user.bio,
          emailVerified: result.user.emailVerified,
          onboardingCompleted: false,
          authProvider: 'EMAIL',
        },
        result.accessToken
      )
      const verifyState: EmailVerifyLocationState = { email, from: 'signup' }
      navigate('/verify-email', { replace: true, state: verifyState })
    } catch (error) {
      setStep2ErrorMessage(error instanceof Error ? error.message : '회원가입에 실패했습니다.')
    } finally {
      setIsStep2Loading(false)
    }
  }

  const handleBackToStep1 = () => {
    setStep2ErrorMessage(null)
    setStep(1)
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 pb-2">
        <button
          type="button"
          onClick={() => (step === 1 ? navigate(-1) : handleBackToStep1())}
          aria-label="뒤로 가기"
          className="flex size-12 shrink-0 items-center text-primary"
        >
          <Icon name="arrow_back" className="text-[24px]" />
        </button>
        <h2 className="flex-1 pr-12 text-center text-lg font-bold leading-tight tracking-tight">
          {step === 1 ? '회원가입' : 'Shelfeed'}
        </h2>
      </div>

      {/* Progress */}
      <div className="flex flex-col gap-3 p-4">
        <p className="text-base font-medium">{step === 1 ? '계정 정보 입력' : '프로필 설정'}</p>
        <div className="rounded-full bg-primary/10">
          <div
            className="h-2 rounded-full bg-primary transition-all"
            style={{ width: step === 1 ? '50%' : '100%' }}
          />
        </div>
        <p className="text-sm text-muted-foreground">{step} / 2단계</p>
      </div>

      {step === 1 ? (
        <>
          {/* Step 1: 계정 정보 */}
          <div className="px-4 pb-3 pt-6">
            <h1 className="text-[32px] font-bold leading-tight tracking-tight">
              Shelfeed에 오신 것을 환영합니다
            </h1>
            <p className="pt-2 text-base text-muted-foreground">
              먼저 로그인에 사용할 계정 정보를 입력해주세요.
            </p>
          </div>

          <form
            key="step1"
            onSubmit={step1Form.handleSubmit(onStep1Submit)}
            className="flex flex-1 flex-col"
          >
            <div className="mt-4 flex flex-col gap-4 px-4 py-3">
              <div className="flex flex-col gap-2">
                <label className="text-base font-medium">이메일</label>
                <input
                  {...step1Form.register('email')}
                  type="email"
                  placeholder="example@email.com"
                  className="h-14 w-full rounded-xl border border-primary/20 bg-card p-4 text-base outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                {step1Form.formState.errors.email && (
                  <p className="ml-1 text-xs text-destructive">
                    {step1Form.formState.errors.email.message}
                  </p>
                )}
              </div>

              <div className="mt-2 flex flex-col gap-2">
                <label className="text-base font-medium">비밀번호</label>
                <div className="relative">
                  <input
                    {...step1Form.register('password')}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="8자 이상 입력해주세요"
                    className="h-14 w-full rounded-xl border border-primary/20 bg-card p-4 pr-12 text-base outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                    aria-pressed={showPassword}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    <Icon name={showPassword ? 'visibility_off' : 'visibility'} />
                  </button>
                </div>
                {step1Form.formState.errors.password && (
                  <p className="ml-1 text-xs text-destructive">
                    {step1Form.formState.errors.password.message}
                  </p>
                )}
              </div>

              <div className="mt-2 flex flex-col gap-2">
                <label className="text-base font-medium">비밀번호 확인</label>
                <input
                  {...step1Form.register('passwordConfirm')}
                  type="password"
                  placeholder="비밀번호를 한 번 더 입력해주세요"
                  className="h-14 w-full rounded-xl border border-primary/20 bg-card p-4 text-base outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                {step1Form.formState.errors.passwordConfirm && (
                  <p className="ml-1 text-xs text-destructive">
                    {step1Form.formState.errors.passwordConfirm.message}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-auto mb-8 p-4">
              <button
                type="submit"
                disabled={isStep1Loading}
                className="h-14 w-full rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-lg shadow-primary/10 transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isStep1Loading ? '확인 중...' : '다음'}
              </button>
              <div className="mt-6 flex justify-center">
                <p className="text-sm">
                  이미 계정이 있으신가요?{' '}
                  <Link to="/login" className="font-bold underline underline-offset-4">
                    로그인
                  </Link>
                </p>
              </div>
            </div>
          </form>
        </>
      ) : (
        <>
          {/* Step 2: 프로필 설정 */}
          <div className="flex flex-col items-center gap-6 p-6">
            <div className="group relative">
              <div className="flex size-32 items-center justify-center overflow-hidden rounded-full border-2 border-primary/20 bg-primary/10 shadow-sm">
                <Icon name="person" className="text-4xl text-primary/40" />
              </div>
              <div className="absolute bottom-0 right-0 rounded-full border-2 border-background bg-primary p-2 text-primary-foreground shadow-lg">
                <Icon name="photo_camera" className="text-sm" />
              </div>
            </div>
            <div className="space-y-2 text-center">
              <p className="text-2xl font-bold tracking-tight">나만의 서재 완성하기</p>
              <p className="px-4 text-base text-muted-foreground">
                다른 독서가들이 당신을 알아볼 수 있도록 프로필을 완성해주세요.
              </p>
            </div>
          </div>

          <form
            key="step2"
            onSubmit={step2Form.handleSubmit(onStep2Submit)}
            className="flex flex-1 flex-col"
          >
            <div className="space-y-6 px-6">
              <div className="flex flex-col gap-2">
                <label htmlFor="signup-nickname" className="ml-1 text-base font-semibold">
                  닉네임
                </label>
                <input
                  id="signup-nickname"
                  {...step2Form.register('nickname')}
                  type="text"
                  autoComplete="one-time-code" // Chrome이 autoComplete="off"를 무시하므로 인식 불가한 값 사용
                  placeholder="사용할 닉네임을 입력하세요"
                  aria-describedby="nickname-status"
                  className="h-14 w-full rounded-xl border border-primary/20 bg-card px-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                {step2Form.formState.errors.nickname && (
                  <p className="ml-1 text-xs text-destructive">
                    {step2Form.formState.errors.nickname.message}
                  </p>
                )}
                <div id="nickname-status" aria-live="polite">
                  {!step2Form.formState.errors.nickname && nicknameStatus === 'checking' && (
                    <p className="ml-1 text-xs text-muted-foreground">확인 중...</p>
                  )}
                  {!step2Form.formState.errors.nickname && nicknameStatus === 'available' && (
                    <p className="ml-1 text-xs text-green-600">사용 가능한 닉네임입니다</p>
                  )}
                  {!step2Form.formState.errors.nickname && nicknameStatus === 'taken' && (
                    <p className="ml-1 text-xs text-destructive">이미 사용 중인 닉네임입니다</p>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="ml-1 text-base font-semibold" htmlFor="signup-bio">
                  소개글 (선택)
                </label>
                <textarea
                  id="signup-bio"
                  {...step2Form.register('bio')}
                  aria-describedby="signup-bio-counter"
                  placeholder="당신의 독서 취향이나 간단한 소개를 남겨보세요."
                  className="min-h-[100px] w-full resize-none rounded-xl border border-primary/20 bg-card p-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <div className="flex items-center justify-between px-1">
                  {step2Form.formState.errors.bio ? (
                    <p className="text-xs text-destructive">
                      {step2Form.formState.errors.bio.message}
                    </p>
                  ) : (
                    <span />
                  )}
                  <p
                    id="signup-bio-counter"
                    aria-live="polite"
                    className={`text-xs ${
                      (step2Form.watch('bio')?.length ?? 0) > 300
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {step2Form.watch('bio')?.length ?? 0}/300
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-auto p-6 pb-10">
              {step2ErrorMessage && (
                <p
                  role="alert"
                  className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-center text-sm text-destructive"
                >
                  {step2ErrorMessage}
                </p>
              )}
              <button
                type="submit"
                disabled={isStep2Loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-bold text-primary-foreground shadow-md transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>{isStep2Loading ? '가입 중...' : '시작하기'}</span>
                {!isStep2Loading && <Icon name="arrow_forward" />}
              </button>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                나중에 언제든지 수정할 수 있습니다.
              </p>
            </div>
          </form>
        </>
      )}
    </div>
  )
}
