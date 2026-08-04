import { useCallback, useEffect, useRef, useState } from 'react'

import { isMobile } from '@/lib/device'

import WebcamCapture from './WebcamCapture'
import Icon from '@/components/common/Icon'

interface OcrInputMethodSheetProps {
  isOpen: boolean
  onClose: () => void
  onFileSelected: (file: File) => void
  isLoading: boolean
}

/**
 * OCR 사진 입력 방식을 선택하는 바텀시트.
 *
 * 모바일에서는 네이티브 카메라 앱과 갤러리를 각각 열고,
 * PC에서는 WebRTC 웹캠 프리뷰와 파일 탐색기를 제공한다.
 * capture 속성 유무로 모바일 OS의 카메라/갤러리 분기를 제어한다.
 */
export default function OcrInputMethodSheet({
  isOpen,
  onClose,
  onFileSelected,
  isLoading,
}: OcrInputMethodSheetProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const [showWebcam, setShowWebcam] = useState(false)

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (file) onFileSelected(file)
    },
    [onFileSelected]
  )

  const handleCameraClick = useCallback(() => {
    if (isMobile()) {
      cameraInputRef.current?.click()
    } else {
      setShowWebcam(true)
    }
  }, [])

  const handleGalleryClick = useCallback(() => {
    galleryInputRef.current?.click()
  }, [])

  const handleWebcamCapture = useCallback(
    (file: File) => {
      setShowWebcam(false)
      onFileSelected(file)
    },
    [onFileSelected]
  )

  const handleWebcamClose = useCallback(() => {
    setShowWebcam(false)
    onClose()
  }, [onClose])

  const handleOverlayClose = useCallback(() => {
    if (isLoading) return
    onClose()
  }, [isLoading, onClose])

  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleOverlayClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isOpen, handleOverlayClose])

  if (!isOpen) return null

  if (showWebcam) {
    return <WebcamCapture onCapture={handleWebcamCapture} onClose={handleWebcamClose} />
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="사진 입력 방식 선택"
      className="fixed inset-0 z-50 mx-auto flex max-w-[430px] flex-col justify-end"
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={handleOverlayClose} />

      {/* Bottom Sheet */}
      <div className="relative flex flex-col items-stretch overflow-hidden rounded-t-xl bg-card shadow-2xl ring-1 ring-black/5">
        {/* Handle */}
        <button
          className="flex h-6 w-full items-center justify-center pt-2"
          onClick={handleOverlayClose}
          disabled={isLoading}
          aria-label="시트 닫기"
        >
          <div className="h-1.5 w-12 rounded-full bg-primary/20" />
        </button>

        <div className="flex flex-col gap-2 px-6 py-4">
          <h2 className="pb-2 text-center text-lg font-bold">사진 입력 방식 선택</h2>

          <button
            type="button"
            onClick={handleCameraClick}
            disabled={isLoading}
            className="flex items-center gap-4 rounded-xl border border-primary/10 p-4 text-left transition-colors hover:bg-primary/5 disabled:opacity-50"
          >
            <Icon name="photo_camera" className="text-2xl text-primary" />
            <div>
              <p className="text-base font-bold text-foreground">카메라로 촬영</p>
              <p className="text-sm text-muted-foreground">
                {isMobile() ? '카메라 앱으로 촬영합니다' : '웹캠으로 촬영합니다'}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={handleGalleryClick}
            disabled={isLoading}
            className="flex items-center gap-4 rounded-xl border border-primary/10 p-4 text-left transition-colors hover:bg-primary/5 disabled:opacity-50"
          >
            <Icon name="photo_library" className="text-2xl text-primary" />
            <div>
              <p className="text-base font-bold text-foreground">사진에서 선택</p>
              <p className="text-sm text-muted-foreground">
                {isMobile() ? '갤러리에서 선택합니다' : '파일 탐색기에서 선택합니다'}
              </p>
            </div>
          </button>
        </div>

        <div className="px-6 pb-10 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-primary/10 py-3 text-base font-semibold text-muted-foreground transition-colors hover:bg-primary/5"
          >
            취소
          </button>
        </div>

        {/* Hidden file inputs */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="sr-only"
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="sr-only"
        />
      </div>
    </div>
  )
}
