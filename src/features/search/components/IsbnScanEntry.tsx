import { lazy, Suspense } from 'react'
import { isValidIsbn13 } from '@/features/search/types'
import { withChunkReload } from '@/lib/chunkReload'

// ZXing 의존성을 가진 모달은 사용자가 카메라 버튼을 눌렀을 때만 다운로드
const IsbnScannerModal = lazy(withChunkReload(() => import('@/components/common/IsbnScannerModal')))

interface IsbnScanEntryProps {
  open: boolean
  onClose: () => void
  onDetected: (isbn: string) => void
}

/**
 * 바코드(ISBN) 스캐너 모달 진입점. ZXing 의존성을 lazy import로 분리해 메인 번들
 * 영향을 최소화한다. 스캔 성공 시 `onDetected(isbn)`으로 검색어를 상위에 전달.
 */
export default function IsbnScanEntry({ open, onClose, onDetected }: IsbnScanEntryProps) {
  return (
    <Suspense fallback={null}>
      <IsbnScannerModal
        open={open}
        onClose={onClose}
        validate={isValidIsbn13}
        onDetected={onDetected}
      />
    </Suspense>
  )
}
