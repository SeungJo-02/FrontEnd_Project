import { useCallback, useRef, useState } from 'react'

import { isMobile } from '@/lib/device'

import WebcamCapture from './WebcamCapture'
import BottomSheet from '@/components/common/BottomSheet'
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
 *
 * 껍데기는 공용 {@link BottomSheet}에 맡긴다. 예전엔 오버레이·핸들·Escape 처리를 여기서
 * 직접 짰는데, 그러다 보니 이 시트만 등장·퇴장 모션이 없어 툭 나타났다 툭 사라졌다.
 * 댓글 시트와 같은 컴포넌트를 쓰므로 이제 모션이 "비슷한" 게 아니라 동일하고,
 * 배경 스크롤 잠금과 포커스 복귀도 따라온다.
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

  // 웹캠은 화면 전체를 쓰므로 시트를 대신한다. isOpen을 함께 보는 이유는 시트가 닫힌 뒤
  // showWebcam이 남아 있는 상태로 프리뷰가 되살아나지 않게 하기 위해서다.
  if (isOpen && showWebcam) {
    return <WebcamCapture onCapture={handleWebcamCapture} onClose={handleWebcamClose} />
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="사진 입력 방식 선택"
      // 인식 중에는 오버레이·핸들·Escape로 닫히지 않는다(기존 handleOverlayClose의 가드와 같다).
      isBlocked={isLoading}
    >
      <div className="flex flex-col gap-2 px-6 pb-2 pt-4">
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
          // 다른 닫기 경로가 모두 막히는 인식 중에 이 버튼만 열려 있으면 앞뒤가 안 맞는다.
          disabled={isLoading}
          className="w-full rounded-xl border border-primary/10 py-3 text-base font-semibold text-muted-foreground transition-colors hover:bg-primary/5 disabled:opacity-50"
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
    </BottomSheet>
  )
}
