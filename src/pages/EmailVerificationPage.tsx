import { useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { verifyEmail, resendEmailCode } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { isCarouselSeen } from '@/lib/onboarding'
import { Screen } from '@/components/layout/Screen'
import IconButton from '@/components/ui/IconButton'
import Icon from '@/components/common/Icon'

// 진입 경로별로 EmailVerificationPage가 다른 탈출 UI를 노출하기 위한 식별자.
// sender(SignupPage/SettingsPage)와 receiver(이 파일)가 동일한 union을 공유해 오타 시 컴파일 단계에서 차단.
export type EmailVerifyEntryFrom = 'signup' | 'settings'
export interface EmailVerifyLocationState {
  email?: string
  from?: EmailVerifyEntryFrom
}

export default function EmailVerificationPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const userEmail = useAuthStore(state => state.user?.email)
  const navState = location.state as EmailVerifyLocationState | null
  const email = navState?.email ?? userEmail
  // 회원가입 직후 진입한 경우만 "건너뛰기" 패턴, 그 외(설정에서 진입 등)는 뒤로가기 아이콘
  const fromSignup = navState?.from === 'signup'

  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [resendMessage, setResendMessage] = useState<string | null>(null)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  if (!email) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
        <Icon name="error" className="text-5xl text-destructive" />
        <p className="mt-4 text-center text-lg font-medium text-foreground">
          이메일 정보를 찾을 수 없습니다.
        </p>
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="mt-6 rounded-xl bg-primary px-8 py-3 text-base font-bold text-primary-foreground transition-all hover:opacity-95"
        >
          로그인으로 돌아가기
        </button>
      </div>
    )
  }

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const digit = value.slice(-1)
    const newCode = [...code]
    newCode[index] = digit
    setCode(newCode)
    setErrorMessage(null)

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (startIndex: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, 6 - startIndex)
    if (!pasted) return
    setErrorMessage(null)
    const newCode = [...code]
    for (let i = 0; i < pasted.length && startIndex + i < 6; i++) {
      newCode[startIndex + i] = pasted[i]
    }
    setCode(newCode)
    const focusIndex = Math.min(startIndex + pasted.length, 5)
    inputRefs.current[focusIndex]?.focus()
  }

  const handleVerify = async () => {
    const fullCode = code.join('')
    if (fullCode.length !== 6) {
      setErrorMessage('6자리 코드를 모두 입력해주세요.')
      return
    }
    if (isVerifying || isResending) return
    setIsVerifying(true)
    setErrorMessage(null)
    try {
      const result = await verifyEmail(email, fullCode)
      if (result.emailVerified) {
        const currentUser = useAuthStore.getState().user
        if (currentUser) {
          const token = useAuthStore.getState().accessToken
          if (token) {
            useAuthStore.getState().setAuth({ ...currentUser, emailVerified: true }, token)
          }
        }
        setCode(['', '', '', '', '', ''])
        const onboardingDone = useAuthStore.getState().user?.onboardingCompleted
        navigate(onboardingDone && isCarouselSeen() ? '/' : '/onboarding', { replace: true })
      } else {
        setErrorMessage('인증 코드가 올바르지 않습니다. 다시 확인해주세요.')
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '인증에 실패했습니다.')
    } finally {
      setIsVerifying(false)
    }
  }

  const handleResend = async () => {
    if (isResending || isVerifying) return
    setIsResending(true)
    setResendMessage(null)
    setErrorMessage(null)
    try {
      await resendEmailCode(email)
      setResendMessage('인증 코드가 재발송되었습니다.')
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '재발송에 실패했습니다. 잠시 후 다시 시도해주세요.'
      )
    } finally {
      setIsResending(false)
    }
  }

  return (
    <Screen>
      {/* AppHeader 대신 자체 헤더: AppHeader의 우측 rightAction 슬롯이 w-10으로 고정되어 "건너뛰기" 텍스트가 잘리므로 grid 3분할 직접 구성 */}
      <header className="grid grid-cols-3 items-center border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md">
        <div className="flex justify-start">
          {!fromSignup && (
            <IconButton onClick={() => navigate(-1)} aria-label="이전 페이지로 돌아가기">
              <Icon name="arrow_back" />
            </IconButton>
          )}
        </div>
        <h1 className="text-center text-xl font-bold tracking-tight text-primary">Shelfeed</h1>
        <div className="flex justify-end">
          {fromSignup && (
            <button
              type="button"
              onClick={() => navigate('/', { replace: true })}
              aria-label="이메일 인증 건너뛰고 홈으로 이동"
              // SignupPage가 verify-email로 replace 이동 + 여기서 home으로 replace 이동 → 회원가입/인증 페이지가 history에 남지 않아 뒤로가기로 재진입 불가 (의도)
              className="rounded-full px-3 py-1.5 text-sm font-medium text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary"
            >
              건너뛰기
            </button>
          )}
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center px-6 pt-16">
        <Icon name="mail" className="text-6xl text-primary" />

        <h2 className="mt-6 text-2xl font-bold text-foreground">인증 메일을 보냈어요</h2>

        <p className="mt-3 text-center text-base leading-relaxed text-muted-foreground">
          <span className="font-medium text-primary">{email}</span>으로 인증 코드를 보냈습니다.
        </p>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          아래에 6자리 코드를 입력해주세요.
        </p>

        <div className="mt-8 flex gap-3">
          {code.map((digit, index) => (
            <input
              key={index}
              ref={el => {
                inputRefs.current[index] = el
              }}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={1}
              value={digit}
              onChange={e => handleChange(index, e.target.value)}
              onKeyDown={e => handleKeyDown(index, e)}
              onPaste={e => handlePaste(index, e)}
              className="h-14 w-11 rounded-xl border border-primary/20 bg-card text-center text-xl font-bold shadow-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
              aria-label={`인증 코드 ${index + 1}번째 자리`}
            />
          ))}
        </div>

        {errorMessage && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        {resendMessage && (
          <p role="status" className="mt-4 text-sm text-primary">
            {resendMessage}
          </p>
        )}

        <button
          type="button"
          onClick={handleVerify}
          disabled={isVerifying}
          className="mt-8 w-full max-w-xs rounded-xl bg-primary py-4 text-lg font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isVerifying ? '인증 중...' : '인증하기'}
        </button>

        <p className="mt-6 text-sm text-muted-foreground">
          메일이 오지 않았나요?{' '}
          <button
            type="button"
            onClick={handleResend}
            disabled={isResending}
            className="font-medium text-primary hover:underline disabled:opacity-60"
          >
            {isResending ? '발송 중...' : '재발송'}
          </button>
        </p>
      </main>
    </Screen>
  )
}
