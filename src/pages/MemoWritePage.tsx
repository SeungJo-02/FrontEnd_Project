import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { extractTextFromImage, type OcrTextField } from '@/api/ocr'
import OcrInputMethodSheet from '@/components/ocr/OcrInputMethodSheet'
import OcrTextSelector from '@/components/ocr/OcrTextSelector'
import { fileToSquareDataUrl, ImageProcessingError } from '@/lib/image'
import { getMemo, saveMemo, MemoStorageError } from '@/lib/memoStore'
import { Screen } from '@/components/layout/Screen'
import IconButton from '@/components/ui/IconButton'
import ErrorBox from '@/components/ui/ErrorBox'
import Icon from '@/components/common/Icon'

/** OCR 원본 업로드 상한. WriteReviewPage와 동일 기준. */
const MAX_OCR_IMAGE_SIZE = 5 * 1024 * 1024

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'))
    reader.readAsDataURL(file)
  })
}

/**
 * 메모 작성/수정 화면.
 *
 * - `이미지 추가`: 사진을 골라 메모에 첨부한다(리사이즈 후 data URL로 보관).
 * - `텍스트 추출`: 기존 OCR 파이프라인으로 사진 속 문장을 골라 본문에 붙여넣는다.
 *
 * 저장은 localStorage(`@/lib/memoStore`)에만 반영된다 — 서버 메모 API가 아직 없다.
 */
export default function MemoWritePage() {
  const { bookId, memoId } = useParams()
  const navigate = useNavigate()
  const parsedBookId = Number(bookId)

  const [content, setContent] = useState('')
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isOcrSheetOpen, setIsOcrSheetOpen] = useState(false)
  const [isOcrLoading, setIsOcrLoading] = useState(false)
  const [ocrResult, setOcrResult] = useState<{ imageSrc: string; fields: OcrTextField[] } | null>(
    null
  )

  const imageInputRef = useRef<HTMLInputElement>(null)
  const ocrAbortRef = useRef<AbortController | null>(null)

  useEffect(() => () => ocrAbortRef.current?.abort(), [])

  // 수정 진입이면 기존 메모를 채운다.
  useEffect(() => {
    if (!memoId || !Number.isFinite(parsedBookId)) return
    const existing = getMemo(parsedBookId, memoId)
    if (!existing) {
      setErrorMessage('메모를 찾을 수 없습니다.')
      return
    }
    setContent(existing.content)
    setImageDataUrl(existing.imageDataUrl)
  }, [memoId, parsedBookId])

  const handleAddImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setErrorMessage(null)
    try {
      // localStorage 쿼터가 작아 첨부 이미지는 공격적으로 줄인다.
      setImageDataUrl(await fileToSquareDataUrl(file, 720, 0.7))
    } catch (error) {
      setErrorMessage(
        error instanceof ImageProcessingError ? error.message : '이미지를 처리하지 못했습니다.'
      )
    }
  }

  const handleOcrCapture = async (file: File) => {
    setIsOcrSheetOpen(false)
    if (file.size > MAX_OCR_IMAGE_SIZE) {
      setErrorMessage('이미지 크기가 너무 큽니다. 5MB 이하의 이미지를 선택해주세요.')
      return
    }

    ocrAbortRef.current?.abort()
    const controller = new AbortController()
    ocrAbortRef.current = controller
    setIsOcrLoading(true)
    setErrorMessage(null)
    try {
      const dataUrl = await readFileAsDataUrl(file)
      const base64 = dataUrl.split(',')[1]
      if (!base64) {
        setErrorMessage('이미지를 읽지 못했습니다. 다시 시도해주세요.')
        return
      }
      const rawFormat = file.type.split('/')[1] || 'jpg'
      const format = rawFormat === 'jpeg' ? 'jpg' : rawFormat
      const result = await extractTextFromImage(base64, format, controller.signal)
      if (controller.signal.aborted) return
      setOcrResult({ imageSrc: dataUrl, fields: result.fields })
    } catch {
      if (!controller.signal.aborted) {
        setErrorMessage('텍스트 추출에 실패했습니다. 다시 시도해주세요.')
      }
    } finally {
      if (!controller.signal.aborted) setIsOcrLoading(false)
    }
  }

  // 추출한 문장은 기존 본문을 덮어쓰지 않고 이어붙인다 — 여러 장을 연속으로 담을 수 있게.
  const handleOcrConfirm = (selectedText: string) => {
    setContent(prev => (prev ? `${prev}\n${selectedText}` : selectedText))
    setOcrResult(null)
  }

  const handleSave = () => {
    if (!Number.isFinite(parsedBookId)) return
    const trimmed = content.trim()
    if (!trimmed) {
      setErrorMessage('메모 내용을 입력해주세요.')
      return
    }
    try {
      saveMemo(parsedBookId, { id: memoId, content: trimmed, imageDataUrl })
      navigate(`/book/${parsedBookId}?tab=memo`, { replace: true })
    } catch (error) {
      setErrorMessage(
        error instanceof MemoStorageError ? error.message : '메모를 저장하지 못했습니다.'
      )
    }
  }

  return (
    <Screen>
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/80 px-2 py-3 backdrop-blur-md">
        <IconButton onClick={() => navigate(-1)} aria-label="이전 페이지로 돌아가기">
          <Icon name="arrow_back_ios_new" />
        </IconButton>

        <h1 className="text-lg font-bold tracking-tight">메모</h1>

        <IconButton onClick={handleSave} aria-label="메모 저장">
          <Icon name="check" />
        </IconButton>
      </header>

      <main className="flex flex-1 flex-col px-4 pb-10 pt-4">
        {/* 이미지 추가 / 텍스트 추출 */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleAddImage}
            className="sr-only"
            aria-label="메모 이미지 파일 선택"
          />
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="flex items-center justify-center gap-2 rounded-2xl bg-card py-4 text-sm font-bold shadow-sm transition-colors hover:bg-primary/5"
          >
            <Icon name="photo_camera" className="text-[20px]" />
            이미지 추가
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
        </div>

        {imageDataUrl && (
          <div className="relative mb-5">
            <img src={imageDataUrl} alt="첨부 이미지" className="w-full rounded-2xl object-cover" />
            <button
              type="button"
              onClick={() => setImageDataUrl(null)}
              aria-label="첨부 이미지 삭제"
              className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm"
            >
              <Icon name="close" className="text-[20px]" />
            </button>
          </div>
        )}

        <label htmlFor="memo-content" className="mb-2 text-base font-bold">
          메모
        </label>
        <textarea
          id="memo-content"
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="기억하고 싶은 문장이나 생각을 남겨보세요"
          className="min-h-[45vh] flex-1 resize-none rounded-2xl border-none bg-card px-5 py-4 text-md leading-7 shadow-sm outline-none transition-all placeholder:text-muted-foreground/40 focus:ring-2 focus:ring-primary/20"
        />

        {errorMessage && <ErrorBox message={errorMessage} className="mt-4" />}
      </main>

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
    </Screen>
  )
}
