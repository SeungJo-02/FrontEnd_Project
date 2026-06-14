import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import axios from 'axios'
import AppHeader from '@/components/layout/AppHeader'
import StarRating from '@/components/common/StarRating'
import {
  getLibraryBookDetail,
  removeLibraryBook,
  updateLibraryBookStatus,
  backendToFrontStatus,
  frontToBackendStatus,
  type LibraryBookDetail,
  type ReadingStatus,
} from '@/api/library'
import AddToLibrarySheet from '@/components/common/AddToLibrarySheet'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const statusLabel: Record<ReadingStatus, { text: string; emoji: string; bg: string }> = {
  want_to_read: { text: '읽고 싶은', emoji: '📖', bg: 'bg-primary/10' },
  reading: { text: '읽는 중', emoji: '📚', bg: 'bg-amber-100' },
  finished: { text: '다 읽음', emoji: '✅', bg: 'bg-primary/20' },
  stopped: { text: '중단', emoji: '⏸️', bg: 'bg-slate-100' },
}

function formatDate(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '-'
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}.${mm}.${dd}`
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const start = new Date(iso)
  if (isNaN(start.getTime())) return null
  // 자정 기준 정규화: "오늘 14시 시작 → 내일 13시"가 같은 1일로 보이는 24h 단위 계산을 피한다.
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()
  const today = new Date()
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const days = Math.floor((todayDay - startDay) / (1000 * 60 * 60 * 24)) + 1
  return days > 0 ? days : null
}

export default function LibraryBookDetailPage() {
  const { libraryBookId } = useParams<{ libraryBookId: string }>()
  const navigate = useNavigate()

  const [detail, setDetail] = useState<LibraryBookDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isStatusSheetOpen, setIsStatusSheetOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const isMountedRef = useRef(true)

  // StrictMode dev 모드에서 effect가 mount → unmount → mount로 더블 인보크되므로
  // setup에서 명시적으로 true로 리셋해 ref가 false로 stuck되지 않도록 한다.
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    // 파생값을 effect 내부에서 다시 산출해 deps를 libraryBookId 하나로 단순화
    const isValid = /^\d+$/.test(libraryBookId ?? '')
    if (!isValid) {
      setErrorMessage('잘못된 서재 도서 ID입니다.')
      setIsLoading(false)
      return
    }
    const numericId = parseInt(libraryBookId!, 10)

    const controller = new AbortController()
    setIsLoading(true)
    setErrorMessage(null)
    ;(async () => {
      try {
        const result = await getLibraryBookDetail(numericId, controller.signal)
        if (controller.signal.aborted) return
        setDetail(result)
      } catch (error) {
        // normalizeAxiosError가 cancel은 rethrow하므로 여기서 분기 필수
        if (axios.isCancel(error) || controller.signal.aborted) return
        setErrorMessage(
          error instanceof Error ? error.message : '서재 도서 정보를 불러오지 못했습니다.'
        )
        setDetail(null)
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    })()

    return () => controller.abort()
  }, [libraryBookId])

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <AppHeader title="서재 도서" showBack />
        <main aria-busy="true" className="flex flex-1 items-center justify-center">
          <p role="status" className="text-sm text-muted-foreground">
            불러오는 중...
          </p>
        </main>
      </div>
    )
  }

  if (errorMessage || !detail) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <AppHeader title="서재 도서" showBack />
        <main className="flex flex-1 flex-col items-center justify-center gap-4">
          <span className="material-symbols-outlined text-6xl text-muted-foreground/30">error</span>
          <p role="alert" className="text-lg font-bold text-muted-foreground">
            {errorMessage ?? '서재 도서를 불러올 수 없습니다.'}
          </p>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground"
          >
            돌아가기
          </button>
        </main>
      </div>
    )
  }

  const handleConfirmRemove = async () => {
    if (isProcessing) return
    setIsProcessing(true)
    setRemoveError(null)
    try {
      await removeLibraryBook(detail.libraryBookId)
      if (!isMountedRef.current) return
      setIsConfirmOpen(false)
      setIsProcessing(false)
      navigate('/library', { replace: true })
    } catch (error) {
      // unmount 이후 setState 방지 (브라우저 뒤로가기 등)
      if (!isMountedRef.current) return
      setRemoveError(error instanceof Error ? error.message : '서재에서 제거하지 못했습니다.')
      setIsProcessing(false)
    }
  }

  const handleStatusChange = async (status: ReadingStatus) => {
    const result = await updateLibraryBookStatus(detail.libraryBookId, status)
    if (!isMountedRef.current) return
    // unknown enum 응답 시 사용자가 방금 선택한 status로 fallback (BookDetailPage와 동일 정책)
    const nextStatus =
      backendToFrontStatus[result.status] != null ? result.status : frontToBackendStatus[status]
    // [code-review MED fix] #120 — 백엔드가 finished에서 다른 상태로 전환 시 finishedAt을
    // 비우지 않는 정합성 이슈를 클라이언트 state에서도 정규화. 표시단(showFinished) 분기와
    // 짝을 맞춰 client state 자체를 깨끗이 유지한다.
    const normalizedFinishedAt = nextStatus === 'FINISHED' ? result.finishedAt : null
    setDetail(prev =>
      prev
        ? {
            ...prev,
            status: nextStatus,
            startedAt: result.startedAt,
            finishedAt: normalizedFinishedAt,
          }
        : prev
    )
  }

  const openRemoveConfirm = () => {
    setRemoveError(null)
    setIsMenuOpen(false)
    // Radix는 programmatic close 시 onOpenChange를 발화하지 않으므로,
    // 액션시트 unmount/포커스 복귀를 기다린 다음 프레임에 confirm을 직접 띄운다.
    // (HIGH 1: 두 Dialog 동시 활성 회피)
    requestAnimationFrame(() => {
      if (isMountedRef.current) setIsConfirmOpen(true)
    })
  }

  // 백엔드 enum이 미지원 값이어도 페이지가 크래시하지 않도록 방어
  const frontStatus: ReadingStatus | undefined = backendToFrontStatus[detail.status]
  const status = frontStatus ? statusLabel[frontStatus] : null
  // 시작 날짜는 데이터 존재 여부만으로 표시 (frontStatus 매핑 실패해도 데이터가 있으면 보여준다).
  // 완료 날짜는 의미상 status가 finished일 때만 보여준다 — 백엔드가 finished에서 다른 상태로
  // 전환 시 finishedAt을 비우지 않는 데이터 정합성 이슈가 있어 (#120 임시 회피), 표시단에서
  // 분기. 근본 정리는 LibraryBookService.updateStatus() 백엔드 후속 이슈로 처리.
  const showStarted = detail.startedAt != null
  const showFinished = frontStatus === 'finished' && detail.finishedAt != null
  const showPeriod = showStarted || showFinished
  const reading = frontStatus === 'reading'
  // "N일째 읽는 중" 라벨은 의미상 READING 상태에서만 보여야 하므로 status 분기 유지
  const readingDays = reading ? daysSince(detail.startedAt) : null

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader
        title={detail.book.title}
        showBack
        rightAction={
          <button
            type="button"
            onClick={() => setIsMenuOpen(true)}
            aria-label="더보기"
            className="flex size-10 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
          >
            <span className="material-symbols-outlined">more_vert</span>
          </button>
        }
      />

      <main className="flex-1 overflow-y-auto pb-12">
        {/* 책 메타 */}
        <section className="flex gap-4 px-6 pt-6">
          <div className="h-[140px] w-[100px] shrink-0 overflow-hidden rounded-lg bg-primary/5 shadow-md">
            {detail.book.coverImageUrl ? (
              <img
                src={detail.book.coverImageUrl}
                alt={`${detail.book.title} 표지`}
                loading="lazy"
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center">
                <span className="material-symbols-outlined text-3xl text-muted-foreground/30">
                  menu_book
                </span>
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
            <h1 className="text-xl font-bold leading-snug">{detail.book.title}</h1>
            <p className="text-sm text-primary">{detail.book.author}</p>
            <p className="text-xs text-muted-foreground">
              {detail.book.publisher}
              {detail.book.totalPages != null && detail.book.totalPages > 0
                ? ` · ${detail.book.totalPages}쪽`
                : ''}
            </p>
          </div>
        </section>

        {/* 독서 상태 카드 */}
        {status && (
          <section className="mt-6 px-6">
            <div className={`flex items-center justify-between rounded-2xl ${status.bg} px-5 py-4`}>
              <div className="flex items-center gap-3">
                <span className="text-2xl" aria-hidden="true">
                  {status.emoji}
                </span>
                <span className="text-lg font-bold">{status.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsStatusSheetOpen(true)}
                className="rounded-full border border-primary px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/5"
              >
                상태 변경
              </button>
            </div>
          </section>
        )}

        {/* 독서 기간 */}
        {showPeriod && (
          <section className="mt-5 flex items-start justify-between px-6 text-sm">
            <div className="flex flex-col gap-1">
              {showStarted && (
                <p>
                  <span className="text-muted-foreground">시작:</span>{' '}
                  <span className="font-medium">{formatDate(detail.startedAt)}</span>
                </p>
              )}
              {showFinished && (
                <p>
                  <span className="text-muted-foreground">완료:</span>{' '}
                  <span className="font-medium">{formatDate(detail.finishedAt)}</span>
                </p>
              )}
            </div>
            {reading && readingDays != null && (
              <p className="text-xs text-muted-foreground">({readingDays}일째 읽는 중)</p>
            )}
          </section>
        )}

        {/* 구분선 */}
        <div className="mx-6 mt-8 border-t border-border/60" />

        {/* 내 감상 */}
        <section className="mt-6 px-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-bold">내 감상</h2>
            {detail.review && <StarRating rating={detail.review.rating} size="md" />}
          </div>

          {detail.review ? (
            <Link
              to={`/review/${detail.review.reviewId}`}
              className="block rounded-2xl bg-card p-5 shadow-sm transition-colors hover:bg-card/80"
            >
              <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed">
                {detail.review.content}
              </p>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{formatDate(detail.review.createdAt)}</span>
                <span className="font-semibold text-primary">전체 보기</span>
              </div>
            </Link>
          ) : (
            <div className="flex flex-col items-center gap-4 rounded-2xl bg-card p-6 shadow-sm">
              <p className="text-sm text-muted-foreground">아직 감상이 없어요</p>
              <button
                type="button"
                onClick={() =>
                  navigate(`/review/write/${detail.book.bookId}`, {
                    // 서재 책 컨텍스트에서 감상을 쓰므로 libraryBookId를 함께 전달 →
                    // 백엔드가 감상을 이 서재책과 연결(소유자 검증 포함).
                    state: { libraryBookId: detail.libraryBookId },
                  })
                }
                className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-sm transition-transform active:scale-[0.98]"
              >
                감상 쓰기
              </button>
            </div>
          )}
        </section>

        {/* 도서 상세 보기 */}
        <section className="mt-8 flex justify-center pb-6">
          <Link
            to={`/book/${detail.book.bookId}`}
            className="text-sm font-semibold text-primary underline decoration-primary/30 underline-offset-4"
          >
            도서 상세 보기 →
          </Link>
        </section>
      </main>

      {/* 독서 상태 변경 시트 */}
      <AddToLibrarySheet
        isOpen={isStatusSheetOpen}
        onClose={() => setIsStatusSheetOpen(false)}
        onSave={handleStatusChange}
        bookId={String(detail.book.bookId)}
        defaultStatus={frontStatus}
      />

      {/* 더보기 액션시트 (TODO: 감상 쓰기 항목 추가 예정) */}
      <Dialog open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        {/* pt-12: Dialog 내장 X 닫기 버튼(우상단)이 첫 메뉴 항목과 겹치지 않도록 여백 확보 */}
        <DialogContent className="max-w-sm gap-0 p-0 pt-12">
          <DialogHeader className="sr-only">
            <DialogTitle>서재 도서 액션</DialogTitle>
            <DialogDescription>이 서재 도서에 대해 수행할 동작을 선택하세요.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col">
            <button
              type="button"
              onClick={openRemoveConfirm}
              className="flex items-center gap-3 px-6 py-4 text-left text-base font-semibold text-destructive transition-colors hover:bg-destructive/5"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
                delete
              </span>
              서재에서 제거
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 제거 확인 다이얼로그 */}
      <Dialog
        open={isConfirmOpen}
        onOpenChange={open => {
          if (isProcessing && !open) return
          setIsConfirmOpen(open)
        }}
      >
        <DialogContent
          aria-busy={isProcessing}
          onInteractOutside={e => {
            if (isProcessing) e.preventDefault()
          }}
          onEscapeKeyDown={e => {
            if (isProcessing) e.preventDefault()
          }}
        >
          <DialogHeader>
            <DialogTitle>서재에서 제거하시겠습니까?</DialogTitle>
            <DialogDescription>
              제거하면 이 도서의 독서 기록과 감상이 모두 삭제될 수 있으며, 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          {removeError && (
            <p
              role="alert"
              aria-atomic="true"
              className="rounded-lg bg-destructive/10 px-4 py-3 text-center text-sm text-destructive"
            >
              {removeError}
            </p>
          )}
          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setIsConfirmOpen(false)}
              disabled={isProcessing}
              className="rounded-lg border border-primary/20 bg-card px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-primary/5 disabled:opacity-60"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleConfirmRemove}
              disabled={isProcessing}
              className="rounded-lg bg-destructive px-5 py-3 text-sm font-semibold text-destructive-foreground transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isProcessing ? '처리 중...' : '제거하기'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
