import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { OcrTextField } from '@/api/ocr'

interface OcrTextSelectorProps {
  imageSrc: string
  fields: OcrTextField[]
  onConfirm: (selectedText: string) => void
  onClose: () => void
}

/**
 * OCR 결과를 이미지 위에 줄 단위로 오버레이하고, 탭으로 선택하는 전체 화면 모달.
 * 선택 완료 시 선택된 줄들의 텍스트를 줄바꿈으로 연결하여 onConfirm에 전달한다.
 */
export default function OcrTextSelector({
  imageSrc,
  fields,
  onConfirm,
  onClose,
}: OcrTextSelectorProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null)
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(null)
  const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set())

  const lines = useMemo(() => groupFieldsIntoLines(fields), [fields])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const handleImageLoad = useCallback(() => {
    const img = imgRef.current
    if (!img) return
    setImgSize({ w: img.naturalWidth, h: img.naturalHeight })
  }, [])

  useEffect(() => {
    const img = imgRef.current
    if (!img) return
    const observer = new ResizeObserver(([entry]) => {
      setDisplaySize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    observer.observe(img)
    return () => observer.disconnect()
  }, [])

  const toggleLine = useCallback((lineIndex: number) => {
    setSelectedLines(prev => {
      const next = new Set(prev)
      if (next.has(lineIndex)) {
        next.delete(lineIndex)
      } else {
        next.add(lineIndex)
      }
      return next
    })
  }, [])

  const handleConfirm = useCallback(() => {
    const sortedIndices = Array.from(selectedLines).sort((a, b) => a - b)
    const text = sortedIndices.map(i => lines[i].map(f => f.text).join(' ')).join('\n')
    onConfirm(text)
  }, [selectedLines, lines, onConfirm])

  const scaleX = displaySize && imgSize ? displaySize.w / imgSize.w : 1
  const scaleY = displaySize && imgSize ? displaySize.h / imgSize.h : 1

  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-[430px] flex-col bg-black/90">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 text-sm font-semibold text-white/80"
        >
          <span className="material-symbols-outlined text-[22px]">close</span>
          닫기
        </button>
        <span className="text-sm font-semibold text-white/70">
          {selectedLines.size > 0 ? `${selectedLines.size}줄 선택됨` : '텍스트를 탭하여 선택'}
        </span>
      </div>

      {/* Image + Overlay */}
      <div className="flex-1 overflow-auto px-2">
        <div className="relative mx-auto" style={{ width: 'fit-content' }}>
          <img
            ref={imgRef}
            src={imageSrc}
            alt="OCR 대상 이미지"
            onLoad={handleImageLoad}
            loading="lazy"
            className="max-h-[70vh] max-w-full rounded-lg"
          />

          {imgSize &&
            lines.map((line, lineIndex) => {
              const bounds = getLineBounds(line)
              if (!bounds) return null

              const isSelected = selectedLines.has(lineIndex)

              return (
                <button
                  key={lineIndex}
                  type="button"
                  onClick={() => toggleLine(lineIndex)}
                  aria-pressed={isSelected}
                  className={`absolute cursor-pointer rounded-sm transition-colors ${
                    isSelected
                      ? 'border-2 border-primary bg-primary/30'
                      : 'border border-white/40 bg-white/25 hover:bg-white/35'
                  }`}
                  style={{
                    left: bounds.x * scaleX,
                    top: bounds.y * scaleY,
                    width: bounds.w * scaleX,
                    height: bounds.h * scaleY,
                  }}
                  aria-label={line.map(f => f.text).join(' ')}
                />
              )
            })}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 pb-6 pt-3">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={selectedLines.size === 0}
          className="w-full rounded-xl bg-primary py-4 text-lg font-bold text-primary-foreground shadow-lg transition-transform active:scale-[0.98] disabled:opacity-40"
        >
          선택 완료
        </button>
      </div>
    </div>
  )
}

function groupFieldsIntoLines(fields: OcrTextField[]): OcrTextField[][] {
  const lines: OcrTextField[][] = []
  let currentLine: OcrTextField[] = []
  for (const field of fields) {
    currentLine.push(field)
    if (field.lineBreak) {
      lines.push(currentLine)
      currentLine = []
    }
  }
  if (currentLine.length > 0) lines.push(currentLine)
  return lines
}

function getLineBounds(
  line: OcrTextField[]
): { x: number; y: number; w: number; h: number } | null {
  if (line.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const field of line) {
    for (const v of field.vertices) {
      if (v.x < minX) minX = v.x
      if (v.y < minY) minY = v.y
      if (v.x > maxX) maxX = v.x
      if (v.y > maxY) maxY = v.y
    }
  }

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}
