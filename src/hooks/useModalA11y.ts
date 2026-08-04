import { useEffect, useRef, type RefObject } from 'react'

interface UseModalA11yOptions {
  isOpen: boolean
  onClose: () => void
  isBlocked?: boolean
  initialFocusRef?: RefObject<HTMLElement | null>
}

/**
 * 모달/바텀시트 공통 접근성 동작.
 *
 * - 열렸을 때 body 스크롤 잠금(배경 스크롤 누출 방지), 닫힐 때 원복
 * - Escape 키로 onClose 호출 (isBlocked면 무시 — 저장/로딩 중 닫힘 방지)
 * - 열릴 때 initialFocusRef로 초기 포커스 이동, 닫힐 때 직전 포커스 요소로 복귀
 *
 * @remarks 전체 포커스 트랩은 범위 외(Radix 기반 ui/dialog가 담당). PopupBanner의
 *          기존 로직을 추출해 다른 커스텀 시트가 재사용하도록 한다.
 */
export function useModalA11y({
  isOpen,
  onClose,
  isBlocked = false,
  initialFocusRef,
}: UseModalA11yOptions) {
  // onClose/isBlocked를 ref로 고정한다. 호출부가 매 렌더 새 함수를 넘기거나 isBlocked가
  // 토글돼도 effect가 teardown/재등록되지 않아, 스크롤 잠금이 깜빡이거나 초기 포커스가
  // 반복 호출(포커스 탈취)되지 않는다.
  const onCloseRef = useRef(onClose)
  const isBlockedRef = useRef(isBlocked)
  useEffect(() => {
    onCloseRef.current = onClose
    isBlockedRef.current = isBlocked
  }, [onClose, isBlocked])

  useEffect(() => {
    if (!isOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isBlockedRef.current) return
      // 위에 Radix Dialog(신고/삭제 확인 등)가 열려 있으면 Escape는 그쪽 몫이다.
      // Radix는 capture 단계에서 처리하면서 전파를 막지 않아, 가드가 없으면 한 번의
      // Escape로 다이얼로그와 그 아래 시트가 함께 닫힌다.
      if (document.querySelector('[role="dialog"][data-state="open"]')) return
      onCloseRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [isOpen])

  // 초기 포커스 이동과 복귀. isBlocked를 의존성에서 뺐기 때문에 저장/전송 중 토글로
  // 포커스가 닫기 핸들로 튀지 않는다.
  useEffect(() => {
    if (!isOpen) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    initialFocusRef?.current?.focus()
    return () => {
      // 시트가 사라지면 포커스가 body로 떨어져 다음 Tab이 문서 처음부터 시작한다.
      // 열기 직전 요소로 되돌려 키보드 흐름을 유지한다.
      previouslyFocused?.focus?.()
    }
  }, [isOpen, initialFocusRef])
}
