import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import axios from 'axios'
import { getBook, type BookDetail } from '@/api/book'
import { createReview, getReviewDetail, updateReview, type ReviewStatus } from '@/api/review'
import { extractTextFromImage, type OcrTextField } from '@/api/ocr'
import AppHeader from '@/components/layout/AppHeader'
import BottomNav from '@/components/layout/BottomNav'
import OcrInputMethodSheet from '@/components/ocr/OcrInputMethodSheet'
import OcrTextSelector from '@/components/ocr/OcrTextSelector'
import { useAuthStore } from '@/store/authStore'
import Icon from '@/components/common/Icon'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const MAX_QUOTE_LENGTH = 200
const MAX_TAGS = 5
const MAX_TAG_LENGTH = 15

/**
 * 입력값을 태그 한 개로 다듬는다. 앞에 붙인 `#`과 공백을 걷어내고, 태그 안의 연속 공백은
 * 하나로 줄인다. 다듬은 결과가 비면 태그로 인정하지 않는다(빈 문자열 반환).
 */
function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim()
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

type ReviewFormBook = Pick<BookDetail, 'bookId' | 'title' | 'author' | 'coverImageUrl'>

export default function WriteReviewPage() {
  const { bookId, reviewId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const currentUserId = useAuthStore(state => state.user?.id)
  const isEditMode = reviewId != null
  // 서재 상세에서 감상 쓰기로 진입한 경우에만 전달되는 서재책 ID (그 외 경로는 undefined)
  const libraryBookId = (location.state as { libraryBookId?: number } | null)?.libraryBookId

  const [book, setBook] = useState<ReviewFormBook | null>(null)
  const [rating, setRating] = useState(5)
  const [reviewText, setReviewText] = useState('')
  const [quoteText, setQuoteText] = useState('')
  const [isQuoteEditorOpen, setIsQuoteEditorOpen] = useState(false)
  // [HIGH-1 fix] 이전엔 isSpoiler를 항상 false로 전송 → 사용자가 스포일러 글을 써도
  // 피드의 ReviewCard에서 hasSpoiler 블러 처리가 동작하지 않아 다른 사용자에게 결말이 새는
  // 도메인 정책 위반이 발생했다. 사용자가 명시적으로 토글로 표시하도록 state로 받음.
  const [isSpoiler, setIsSpoiler] = useState(false)
  // 감상에 붙일 태그. 예전에는 태그를 아예 입력할 수 없어서 상세 화면이 저자·출판사를
  // 태그처럼 지어내 보여줬다. 이제 작성자가 직접 고른 태그만 저장·노출한다.
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [tagErrorMessage, setTagErrorMessage] = useState<string | null>(null)
  const [isOcrLoading, setIsOcrLoading] = useState(false)
  const [isOcrSheetOpen, setIsOcrSheetOpen] = useState(false)
  const [ocrResult, setOcrResult] = useState<{ imageSrc: string; fields: OcrTextField[] } | null>(
    null
  )
  const [isLoading, setIsLoading] = useState(true)
  // 진행 중인 제출의 상태(임시저장/발행)를 추적해 두 버튼의 로딩 표시를 분리한다.
  // null이면 제출 중 아님.
  const [submittingStatus, setSubmittingStatus] = useState<ReviewStatus | null>(null)
  // [CodeRabbit fix] 단일 errorMessage가 "도서 로드 실패"와 "감상 제출 실패"를 함께 다뤄
  // 제출 실패 시 하단의 풀페이지 분기(errorMessage || !book)에 걸려 "도서를 찾을 수 없습니다"
  // 화면으로 점프하면서 사용자가 작성한 글이 사라진 것처럼 보였다.
  // 두 흐름의 에러를 분리해 로드 실패는 풀페이지로, 제출 실패는 인라인 alert로 노출하고
  // 작성한 글이 보존되도록 수정.
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null)
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (isEditMode) {
      const isValid = /^\d+$/.test(reviewId ?? '')
      if (!isValid) {
        setLoadErrorMessage('감상 정보가 올바르지 않습니다.')
        setBook(null)
        setIsLoading(false)
        return
      }

      const numericReviewId = parseInt(reviewId!, 10)
      const controller = new AbortController()
      setIsLoading(true)
      setLoadErrorMessage(null)
      ;(async () => {
        try {
          const result = await getReviewDetail(numericReviewId, controller.signal)
          if (currentUserId != null && result.user.userId !== currentUserId) {
            setLoadErrorMessage('본인이 작성한 감상만 수정할 수 있습니다.')
            setBook(null)
            return
          }
          setBook({
            bookId: result.book.bookId,
            title: result.book.title,
            author: result.book.author,
            coverImageUrl: result.book.coverImageUrl,
          })
          setRating(result.rating)
          setReviewText(result.content)
          setQuoteText(result.quote ?? '')
          setIsQuoteEditorOpen(Boolean(result.quote))
          setIsSpoiler(result.isSpoiler)
          setTags(result.tags ?? [])
        } catch (error) {
          if (axios.isCancel(error)) return
          setLoadErrorMessage(
            error instanceof Error ? error.message : '감상을 불러오지 못했습니다.'
          )
          setBook(null)
        } finally {
          if (!controller.signal.aborted) setIsLoading(false)
        }
      })()

      return () => controller.abort()
    }

    const isValid = /^\d+$/.test(bookId ?? '')
    if (!isValid) {
      setLoadErrorMessage(
        bookId ? '잘못된 도서 ID입니다.' : '도서를 먼저 선택하면 감상을 작성할 수 있어요.'
      )
      setBook(null)
      setIsLoading(false)
      return
    }

    const numericBookId = parseInt(bookId!, 10)
    const controller = new AbortController()
    setIsLoading(true)
    setLoadErrorMessage(null)
    ;(async () => {
      try {
        const result = await getBook(numericBookId, controller.signal)
        setBook(result)
        setRating(5)
        setReviewText('')
        setQuoteText('')
        setIsQuoteEditorOpen(false)
        setIsSpoiler(false)
      } catch (error) {
        // [MED-1 fix] try 블록 내 controller.signal.aborted 가드는 사실상 도달 불가
        // (요청이 abort되면 axios가 throw로 빠짐) + _helpers.ts의 normalizeAxiosError가
        // 이미 cancel을 rethrow하므로 catch에서 axios.isCancel만 보면 책임이 끝난다.
        // 다른 도메인(book/library 등)과 패턴 통일 + CLAUDE.md "방어 코드 최소화"에 맞춰 단일화.
        if (axios.isCancel(error)) return
        setLoadErrorMessage(error instanceof Error ? error.message : '도서를 불러오지 못했습니다.')
        setBook(null)
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    })()

    return () => controller.abort()
  }, [bookId, currentUserId, isEditMode, reviewId])

  const ocrAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      ocrAbortRef.current?.abort()
    }
  }, [])

  /**
   * OcrInputMethodSheet에서 파일이 선택(촬영 또는 갤러리)되면 호출.
   * Base64 변환 후 OCR API를 호출하고, 결과를 OcrTextSelector로 넘긴다.
   */
  const handleOcrCapture = async (file: File) => {
    setIsOcrSheetOpen(false)
    if (file.size > MAX_IMAGE_SIZE) {
      setSubmitErrorMessage('이미지 크기가 너무 큽니다. 5MB 이하의 이미지를 선택해주세요.')
      return
    }
    ocrAbortRef.current?.abort()
    const controller = new AbortController()
    ocrAbortRef.current = controller
    setIsOcrLoading(true)
    setSubmitErrorMessage(null)
    try {
      const dataUrl = await readFileAsDataUrl(file)
      const base64 = dataUrl.split(',')[1]
      // dataUrl이 'data:...;base64,...' 형식이 아니면 base64가 undefined가 되어 빈 값을 전송함
      if (!base64) {
        setSubmitErrorMessage('이미지를 읽지 못했습니다. 다시 시도해주세요.')
        setIsOcrLoading(false)
        return
      }
      const rawFormat = file.type.split('/')[1] || 'jpg'
      const format = rawFormat === 'jpeg' ? 'jpg' : rawFormat
      const result = await extractTextFromImage(base64, format, controller.signal)
      if (controller.signal.aborted) return
      setOcrResult({ imageSrc: dataUrl, fields: result.fields })
    } catch {
      if (!controller.signal.aborted) {
        setSubmitErrorMessage('텍스트 추출에 실패했습니다. 다시 시도해주세요.')
      }
    } finally {
      if (!controller.signal.aborted) setIsOcrLoading(false)
    }
  }

  /**
   * OcrTextSelector에서 선택 완료 시 호출. 선택된 텍스트로 인용구를 교체한다.
   * "다시 입력" 시에도 기존 텍스트를 덮어쓴다 (추가가 아닌 교체).
   */
  const handleOcrConfirm = (selectedText: string) => {
    setQuoteText(selectedText.slice(0, MAX_QUOTE_LENGTH))
    setIsQuoteEditorOpen(true)
    setOcrResult(null)
  }

  /**
   * 입력창의 내용을 태그로 확정한다. Enter 키와 "추가" 버튼이 공유한다.
   *
   * 개수·길이 초과는 이유를 알려주고 막지만, 이미 붙인 태그를 다시 입력한 경우는
   * 에러가 아니라 입력창만 비운다 — 결과(그 태그가 붙어 있음)가 사용자 의도와 같기 때문.
   */
  const commitTag = () => {
    const normalized = normalizeTag(tagInput)
    if (!normalized) return

    if (tags.includes(normalized)) {
      setTagInput('')
      setTagErrorMessage(null)
      return
    }
    if (tags.length >= MAX_TAGS) {
      setTagErrorMessage(`태그는 최대 ${MAX_TAGS}개까지 추가할 수 있어요.`)
      return
    }
    if (normalized.length > MAX_TAG_LENGTH) {
      setTagErrorMessage(`태그는 ${MAX_TAG_LENGTH}자를 넘을 수 없어요.`)
      return
    }

    setTags(prev => [...prev, normalized])
    setTagInput('')
    setTagErrorMessage(null)
  }

  const removeTag = (target: string) => {
    setTags(prev => prev.filter(tag => tag !== target))
    setTagErrorMessage(null)
  }

  /**
   * 감상을 제출한다. `reviewStatus`에 따라 임시저장('DRAFT')과 발행('PUBLISHED')을 겸한다.
   * - 임시저장: 저장 후 임시저장 목록(`/drafts`)으로 이동
   * - 발행: 작성이면 상세로, 수정이면 해당 감상 상세로 이동
   *
   * 임시저장도 백엔드 검증(@NotBlank content)에 걸리지 않도록 내용 입력은 공통으로 요구한다.
   */
  const handleSubmit = async (reviewStatus: ReviewStatus) => {
    const isValidBookId = /^\d+$/.test(bookId ?? '')
    const isValidReviewId = /^\d+$/.test(reviewId ?? '')
    const trimmedContent = reviewText.trim()
    const trimmedQuote = quoteText.trim()

    if ((!isEditMode && !isValidBookId) || (isEditMode && !isValidReviewId) || !book) {
      setSubmitErrorMessage('도서 정보가 올바르지 않습니다.')
      return
    }

    if (!trimmedContent) {
      setSubmitErrorMessage('감상 내용을 입력해주세요.')
      return
    }

    setSubmittingStatus(reviewStatus)
    setSubmitErrorMessage(null)
    try {
      // 입력창에 쓰다 만 태그도 살려서 보낸다 — Enter를 누르지 않았다고 조용히 버리면
      // 사용자는 태그를 붙였다고 생각한 채 게시하게 된다.
      const pendingTag = normalizeTag(tagInput)
      const submittedTags =
        pendingTag && !tags.includes(pendingTag) && tags.length < MAX_TAGS
          ? [...tags, pendingTag.slice(0, MAX_TAG_LENGTH)]
          : tags

      const basePayload = {
        content: trimmedContent,
        rating,
        // [HIGH-1 fix] 사용자가 토글로 명시적으로 표시한 값을 그대로 전송 (이전엔 false 고정)
        isSpoiler,
        reviewVisibility: 'PUBLIC' as const,
        reviewStatus,
        tags: submittedTags,
      }

      if (isEditMode) {
        await updateReview(parseInt(reviewId!, 10), {
          ...basePayload,
          quote: trimmedQuote,
        })
        navigate(reviewStatus === 'DRAFT' ? '/drafts' : `/review/${reviewId}`, { replace: true })
        return
      }

      const result = await createReview({
        bookId: parseInt(bookId!, 10),
        ...basePayload,
        ...(trimmedQuote ? { quote: trimmedQuote } : {}),
        // 서재 상세에서 진입한 경우에만 서재책과 연결 (그 외엔 미전송)
        ...(libraryBookId != null ? { libraryBookId } : {}),
      })
      navigate(reviewStatus === 'DRAFT' ? '/drafts' : `/review/${result.reviewId}`, {
        replace: true,
      })
    } catch (error) {
      setSubmitErrorMessage(
        error instanceof Error
          ? error.message
          : reviewStatus === 'DRAFT'
            ? '임시저장에 실패했습니다.'
            : isEditMode
              ? '감상을 수정하지 못했습니다.'
              : '감상을 작성하지 못했습니다.'
      )
    } finally {
      setSubmittingStatus(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <AppHeader title={isEditMode ? '감상 수정' : '감상 작성'} showBack />
        <main aria-busy="true" className="flex flex-1 items-center justify-center pb-24">
          <p role="status" className="text-sm text-muted-foreground">
            불러오는 중...
          </p>
        </main>
        <BottomNav />
      </div>
    )
  }

  if (loadErrorMessage || !book) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <AppHeader title={isEditMode ? '감상 수정' : '감상 작성'} showBack />
        <main className="flex flex-1 flex-col items-center justify-center gap-4 px-8 pb-24">
          <Icon name="search_off" className="text-6xl text-muted-foreground/30" />
          <p className="text-lg font-bold text-muted-foreground">도서를 찾을 수 없습니다</p>
          <p role="alert" className="max-w-[280px] text-center text-sm text-muted-foreground">
            {loadErrorMessage ?? '도서 정보를 불러올 수 없습니다.'}
          </p>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground"
          >
            돌아가기
          </button>
        </main>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader
        title={isEditMode ? '감상 수정' : '감상 작성'}
        showBack
        rightAction={
          <button
            type="button"
            onClick={() => handleSubmit('PUBLISHED')}
            disabled={submittingStatus !== null}
            aria-label={isEditMode ? '수정하기' : '게시하기'}
            className="flex size-10 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
          >
            <Icon name="check" />
          </button>
        }
      />

      <main className="flex-1 overflow-y-auto pb-24">
        {/* Book Info */}
        <section className="px-8 py-6">
          <div className="flex items-center gap-4">
            <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded-2xl bg-card shadow-sm">
              <div className="h-20 w-12 overflow-hidden rounded-md border border-primary/10 bg-primary/5">
                {book.coverImageUrl ? (
                  <img
                    src={book.coverImageUrl}
                    alt={book.title}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <Icon name="menu_book" className="text-3xl text-muted-foreground/30" />
                  </div>
                )}
              </div>
            </div>

            <div className="min-w-0">
              <h2 className="text-2xl font-bold leading-tight text-foreground">{book.title}</h2>
              <p className="mt-1 text-lg font-medium text-muted-foreground">{book.author}</p>
            </div>
          </div>
        </section>

        {/* Rating */}
        <section className="py-4">
          <div className="w-full bg-primary/5 px-8 py-6">
            <p className="mb-5 text-center text-sm font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Rate your reading experience
            </p>

            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  className="transition-transform active:scale-90"
                  aria-label={`${value}점`}
                >
                  <Icon
                    name="star"
                    filled={value <= rating}
                    className={cn(
                      'text-[40px]',
                      value <= rating ? 'text-primary' : 'text-primary/25'
                    )}
                  />
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* 입력 보조 — 인용구 직접 입력 / 사진 속 문장 추출 */}
        <section className="grid grid-cols-2 gap-3 px-6 pb-1 pt-4">
          <button
            type="button"
            onClick={() => setIsQuoteEditorOpen(true)}
            className="flex items-center justify-center gap-2 rounded-2xl bg-card py-4 text-sm font-bold shadow-sm transition-colors hover:bg-primary/5"
          >
            <Icon name="format_quote" className="text-[20px]" />
            인용구 추가
          </button>
          <button
            type="button"
            onClick={() => setIsOcrSheetOpen(true)}
            disabled={isOcrLoading}
            className="flex items-center justify-center gap-2 rounded-2xl bg-card py-4 text-sm font-bold shadow-sm transition-colors hover:bg-primary/5 disabled:opacity-60"
          >
            <Icon name="text_fields" className="text-[20px]" />
            {isOcrLoading ? '추출 중...' : '텍스트 추출'}
          </button>
        </section>

        {/* Review Text */}
        <section className="px-6 py-4">
          <label htmlFor="review-content" className="mb-2 block text-base font-bold">
            감상
          </label>
          <textarea
            id="review-content"
            value={reviewText}
            onChange={e => setReviewText(e.target.value)}
            maxLength={500}
            placeholder="이 책에 대한 감상을 자유롭게 적어보세요...."
            className="min-h-[300px] w-full resize-none rounded-2xl border-none bg-card px-5 py-4 text-[15px] leading-7 shadow-sm outline-none transition-all placeholder:text-muted-foreground/40 focus:ring-2 focus:ring-primary/20"
          />
        </section>

        {/* Quote Editor */}
        {isQuoteEditorOpen && (
          <section className="px-8 py-2">
            <div className="relative rounded-2xl bg-primary/5 p-5">
              <button
                type="button"
                onClick={() => {
                  setIsQuoteEditorOpen(false)
                  setQuoteText('')
                }}
                aria-label="인용구 닫기"
                className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
              >
                <Icon name="close" className="text-[18px]" />
              </button>
              <div className="border-l-4 border-primary pl-4">
                <textarea
                  value={quoteText}
                  onChange={e => setQuoteText(e.target.value)}
                  maxLength={200}
                  placeholder="기억하고 싶은 문장을 입력하세요."
                  className="min-h-[96px] w-full resize-none bg-transparent text-lg italic leading-relaxed outline-none placeholder:text-muted-foreground/50"
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsOcrSheetOpen(true)}
                  disabled={isOcrLoading}
                  className="flex items-center gap-1 text-sm font-semibold text-primary transition-colors hover:text-primary/80 disabled:opacity-50"
                >
                  <Icon name="photo_camera" className="text-[18px]" />
                  {isOcrLoading ? '인식 중...' : '사진으로 입력'}
                </button>
                <span className="text-xs text-muted-foreground">{quoteText.length}/200</span>
              </div>
            </div>
          </section>
        )}

        {/* Spoiler Toggle — 인용구/텍스트 추출 진입은 본문 위 버튼 행으로 옮겼다 */}
        <section className="flex items-center justify-end gap-2 px-6 py-3">
          <label className="flex shrink-0 cursor-pointer select-none items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-muted-foreground">
            <input
              type="checkbox"
              checked={isSpoiler}
              onChange={e => setIsSpoiler(e.target.checked)}
              className="size-4 cursor-pointer accent-primary"
            />
            스포일러 포함
          </label>
        </section>

        {/* Tags */}
        <section className="px-8 py-3">
          <div className="mb-2 flex items-baseline justify-between">
            <label htmlFor="tag-input" className="text-sm font-bold text-foreground">
              태그
            </label>
            <span className="text-xs text-muted-foreground">
              {tags.length}/{MAX_TAGS}
            </span>
          </div>

          {tags.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-2">
              {tags.map(tag => (
                <li key={tag}>
                  <span className="flex items-center gap-1 rounded-xl bg-primary/10 py-1.5 pl-3 pr-1.5 text-sm font-semibold text-primary/80">
                    #{tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      aria-label={`${tag} 태그 삭제`}
                      className="flex size-5 items-center justify-center rounded-full transition-colors hover:bg-primary/20"
                    >
                      <Icon name="close" className="text-[16px]" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-2">
            <input
              id="tag-input"
              type="text"
              value={tagInput}
              onChange={e => {
                setTagInput(e.target.value)
                if (tagErrorMessage) setTagErrorMessage(null)
              }}
              onKeyDown={e => {
                // Enter는 태그 확정 전용. 폼 제출로 새지 않도록 기본 동작을 막는다.
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitTag()
                }
              }}
              maxLength={MAX_TAG_LENGTH}
              disabled={tags.length >= MAX_TAGS}
              placeholder={
                tags.length >= MAX_TAGS
                  ? `태그는 최대 ${MAX_TAGS}개까지 추가할 수 있어요`
                  : '예: 인생책, 위로가필요할때'
              }
              className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-transparent px-4 text-base outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
            />
            <button
              type="button"
              onClick={commitTag}
              disabled={tags.length >= MAX_TAGS || normalizeTag(tagInput).length === 0}
              className="h-11 shrink-0 rounded-xl bg-primary/10 px-4 text-sm font-bold text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              추가
            </button>
          </div>

          {tagErrorMessage ? (
            <p role="alert" className="mt-2 text-xs font-semibold text-destructive">
              {tagErrorMessage}
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground/70">
              Enter를 누르거나 추가 버튼을 눌러 태그를 붙일 수 있어요.
            </p>
          )}
        </section>

        {/* Action Buttons */}
        <section className="px-8 pb-6 pt-2">
          {submitErrorMessage && (
            <p role="alert" className="mb-3 text-sm font-semibold text-destructive">
              {submitErrorMessage}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => handleSubmit('DRAFT')}
              disabled={submittingStatus !== null}
              aria-label="임시저장"
              className="h-14 flex-1 whitespace-nowrap rounded-full border-2 border-primary/40 bg-background text-sm font-bold text-primary transition-colors hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submittingStatus === 'DRAFT' ? '저장 중...' : '임시저장'}
            </button>
            <button
              type="button"
              onClick={() => handleSubmit('PUBLISHED')}
              disabled={submittingStatus !== null}
              className="h-14 flex-[1.7] rounded-full bg-primary text-base font-bold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submittingStatus === 'PUBLISHED'
                ? isEditMode
                  ? '수정 중...'
                  : '게시 중...'
                : isEditMode
                  ? '수정하기'
                  : '게시하기'}
            </button>
          </div>
        </section>
      </main>

      <BottomNav />

      {isOcrLoading && (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="fixed inset-0 z-50 mx-auto flex max-w-[430px] items-center justify-center bg-black/80"
        >
          <div className="flex flex-col items-center gap-4">
            <Icon name="progress_activity" className="animate-spin text-5xl text-white" />
            <p className="text-lg font-bold text-white">텍스트 인식 중...</p>
            <button
              type="button"
              onClick={() => {
                // 진행 중인 OCR 요청을 즉시 취소. catch/finally가 aborted면 상태를 안 건드리므로
                // 여기서 직접 로딩 오버레이를 내린다.
                ocrAbortRef.current?.abort()
                setIsOcrLoading(false)
              }}
              className="mt-2 rounded-xl border-2 border-white/60 px-6 py-2 text-sm font-bold text-white transition-colors hover:bg-white/10"
            >
              취소
            </button>
          </div>
        </div>
      )}

      <OcrInputMethodSheet
        isOpen={isOcrSheetOpen}
        onClose={() => setIsOcrSheetOpen(false)}
        onFileSelected={handleOcrCapture}
        isLoading={isOcrLoading}
      />

      {ocrResult && (
        <OcrTextSelector
          imageSrc={ocrResult.imageSrc}
          fields={ocrResult.fields}
          onConfirm={handleOcrConfirm}
          onClose={() => setOcrResult(null)}
        />
      )}
    </div>
  )
}
