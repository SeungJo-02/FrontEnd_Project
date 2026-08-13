import { useEffect, useRef, useState } from 'react'
import { FORM_INPUT_CLASS } from '@/constants/form'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import AppHeader from '@/components/layout/AppHeader'
import { withdrawAccount } from '@/api/member'
import { useAuthStore } from '@/store/authStore'
import { clearRecentKeywords } from '@/features/search/hooks/useRecentKeywords'
import { clearFeedCache } from '@/store/feedStore'
import { Screen } from '@/components/layout/Screen'
import FieldError from '@/components/ui/FieldError'
import ErrorBox from '@/components/ui/ErrorBox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import Icon from '@/components/common/Icon'

const REASON_MAX_LENGTH = 500

const schema = z.object({
  password: z.string().min(1, '현재 비밀번호를 입력해주세요'),
  reason: z
    .string()
    .max(REASON_MAX_LENGTH, `사유는 ${REASON_MAX_LENGTH}자 이하로 입력해주세요`)
    .optional(),
})

type FormData = z.infer<typeof schema>

export default function WithdrawPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const clearAuth = useAuthStore(state => state.clearAuth)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [pendingData, setPendingData] = useState<FormData | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const errorRef = useRef<HTMLParagraphElement | null>(null)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', reason: '' },
  })

  const reason = useWatch({ control, name: 'reason' })
  const reasonLength = reason?.length ?? 0

  // 에러 발생 시 에러 메시지로 스크롤 이동 (LOW 8)
  useEffect(() => {
    if (errorMessage && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [errorMessage])

  const onSubmit = (data: FormData) => {
    setErrorMessage(null)
    setPendingData(data)
    setIsConfirmOpen(true)
  }

  const handleConfirmWithdraw = async () => {
    if (!pendingData || isProcessing) return
    setIsProcessing(true)
    setErrorMessage(null)
    try {
      await withdrawAccount(pendingData.password, pendingData.reason?.trim() || undefined)
      setPendingData(null)
      setIsConfirmOpen(false)
      clearAuth()
      // 검색 결과 캐시(React Query) + 최근 검색어 정리
      queryClient.removeQueries({ queryKey: ['search'] })
      clearRecentKeywords()
      clearFeedCache()
      navigate('/login', { replace: true })
    } catch (error) {
      setIsConfirmOpen(false)
      setPendingData(null)
      setErrorMessage(error instanceof Error ? error.message : '회원 탈퇴에 실패했습니다.')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Screen>
      <AppHeader title="회원 탈퇴" showBack />

      <main className="flex flex-1 flex-col px-6 pb-24 pt-8">
        {/* Warning Notice */}
        <section className="flex flex-col gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 p-5">
          <div className="flex items-center gap-2">
            <Icon name="warning" className="text-[24px] text-destructive" />
            <h2 className="text-base font-bold text-destructive">계정 삭제 시 주의사항</h2>
          </div>
          <ul className="ml-6 list-disc space-y-1 text-sm text-foreground/80">
            <li>작성하신 감상, 댓글, 서재 도서가 영구 삭제됩니다.</li>
            <li>팔로우·팔로워 관계가 모두 해제됩니다.</li>
            <li>탈퇴 후에는 계정 복구가 불가능합니다.</li>
          </ul>
        </section>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="withdraw-password" className="ml-1 text-sm font-semibold">
              현재 비밀번호
            </label>
            <input
              id="withdraw-password"
              {...register('password')}
              type="password"
              autoComplete="current-password"
              placeholder="본인 확인을 위해 현재 비밀번호를 입력해주세요"
              className={FORM_INPUT_CLASS}
            />
            {errors.password && <FieldError message={errors.password.message} />}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="withdraw-reason" className="ml-1 text-sm font-semibold">
              탈퇴 사유 (선택)
            </label>
            <textarea
              id="withdraw-reason"
              {...register('reason')}
              maxLength={REASON_MAX_LENGTH}
              placeholder="서비스 개선에 참고할 수 있도록 탈퇴하시는 이유를 알려주시면 감사하겠습니다."
              aria-describedby="withdraw-reason-counter"
              className="min-h-[120px] w-full resize-none rounded-xl border-none bg-card px-5 py-4 text-sm shadow-sm transition-all placeholder:text-muted-foreground/40 focus:ring-2 focus:ring-primary/20"
            />
            <div className="flex items-center justify-between px-1">
              {errors.reason ? (
                <p role="alert" className="text-xs text-destructive">
                  {errors.reason.message}
                </p>
              ) : (
                <span />
              )}
              <p
                id="withdraw-reason-counter"
                aria-live="polite"
                className={`text-xs ${
                  reasonLength > REASON_MAX_LENGTH ? 'text-destructive' : 'text-muted-foreground'
                }`}
              >
                {reasonLength}/{REASON_MAX_LENGTH}
              </p>
            </div>
          </div>

          {errorMessage && <ErrorBox message={errorMessage} />}

          <button
            type="submit"
            disabled={isProcessing}
            className="mt-4 w-full rounded-xl bg-destructive py-4 text-lg font-bold text-destructive-foreground shadow-lg shadow-destructive/20 transition-all hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isProcessing ? '처리 중...' : '탈퇴하기'}
          </button>
        </form>
      </main>

      <Dialog
        open={isConfirmOpen}
        onOpenChange={open => {
          if (isProcessing && !open) return
          if (!open) setPendingData(null)
          setIsConfirmOpen(open)
        }}
      >
        <DialogContent
          onInteractOutside={e => {
            if (isProcessing) e.preventDefault()
          }}
          onEscapeKeyDown={e => {
            if (isProcessing) e.preventDefault()
          }}
        >
          <DialogHeader>
            <DialogTitle>정말로 탈퇴하시겠습니까?</DialogTitle>
            <DialogDescription>
              이 동작은 되돌릴 수 없습니다. 계정과 모든 관련 데이터가 영구적으로 삭제됩니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => {
                setPendingData(null)
                setIsConfirmOpen(false)
              }}
              disabled={isProcessing}
              className="rounded-lg border border-primary/20 bg-card px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-primary/5 disabled:opacity-60"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleConfirmWithdraw}
              disabled={isProcessing}
              className="rounded-lg bg-destructive px-5 py-3 text-sm font-semibold text-destructive-foreground transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isProcessing ? '처리 중...' : '탈퇴하기'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Screen>
  )
}
