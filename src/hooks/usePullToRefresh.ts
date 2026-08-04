import { useEffect, useRef, useState } from 'react'

interface UsePullToRefreshOptions {
  /** 임계값을 넘겨 손을 뗐을 때 실행. 완료될 때까지 인디케이터가 유지된다. */
  onRefresh: () => void | Promise<unknown>
  /** 새로고침이 발동하는 최소 당김 거리(px). */
  threshold?: number
  /** 고무줄 저항이 수렴하는 최대 당김 거리(px). */
  maxPull?: number
  disabled?: boolean
}

/** 휠 제스처는 끝나는 이벤트가 없어, 이 시간만큼 멈추면 손을 뗀 것으로 본다. */
const WHEEL_IDLE_MS = 140

/**
 * 인스타그램식 "맨 위에서 당겨서 새로고침".
 *
 * 터치(모바일)와 휠/트랙패드(데스크탑)를 모두 인식한다. 브라우저 기본 pull-to-refresh는
 * `usePreventPullToRefresh`(iOS)와 CSS `overscroll-behavior`(안드로이드)로 이미 막혀 있어
 * 앱이 직접 제스처를 해석한다. 문서 최상단에서 시작한 위쪽 방향 제스처만 인식하며,
 * 리스트 중간이나 모달이 떠 있을 때는 개입하지 않는다.
 */
export function usePullToRefresh({
  onRefresh,
  threshold = 70,
  maxPull = 120,
  disabled = false,
}: UsePullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const startYRef = useRef<number | null>(null)
  const wheelAccumRef = useRef(0)
  const wheelIdleTimerRef = useRef<number | null>(null)
  const pullRef = useRef(0)
  const isRefreshingRef = useRef(false)
  // 매 렌더 새 함수가 와도 리스너를 재등록하지 않도록 ref로 고정한다.
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    if (disabled) return

    const setPull = (value: number) => {
      pullRef.current = value
      setPullDistance(value)
    }

    /** 시트·다이얼로그가 떠 있으면 그쪽 스크롤을 방해하지 않는다. */
    const isBlockedByOverlay = () => document.querySelector('[role="dialog"]') != null

    const resist = (raw: number) => maxPull * (1 - Math.exp(-raw / maxPull))

    /** 제스처 종료 — 임계값을 넘었으면 새로고침, 아니면 원위치. */
    const endGesture = () => {
      if (pullRef.current < threshold || isRefreshingRef.current) {
        setPull(0)
        return
      }

      isRefreshingRef.current = true
      setIsRefreshing(true)
      setPull(threshold)
      Promise.resolve(onRefreshRef.current())
        .catch(() => {
          // 새로고침 실패는 호출부가 자체 에러 상태로 표시한다.
        })
        .finally(() => {
          isRefreshingRef.current = false
          setIsRefreshing(false)
          setPull(0)
        })
    }

    const canEngage = () => !isRefreshingRef.current && window.scrollY <= 0 && !isBlockedByOverlay()

    // ── 터치 ────────────────────────────────────────────────
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || !canEngage()) return
      startYRef.current = e.touches[0].clientY
    }

    const onTouchMove = (e: TouchEvent) => {
      const startY = startYRef.current
      if (startY == null || e.touches.length !== 1) return

      const delta = e.touches[0].clientY - startY
      // 위로 스크롤하거나 최상단을 벗어나면 제스처를 포기하고 일반 스크롤로 돌려준다.
      if (delta <= 0 || window.scrollY > 0) {
        startYRef.current = null
        if (pullRef.current !== 0) setPull(0)
        return
      }

      setPull(resist(delta))
      if (e.cancelable) e.preventDefault()
    }

    const onTouchEnd = () => {
      if (startYRef.current == null) return
      startYRef.current = null
      endGesture()
    }

    // ── 휠 / 트랙패드 ────────────────────────────────────────
    const onWheel = (e: WheelEvent) => {
      // 아래로 굴리면 즉시 취소하고 평소 스크롤로 돌려준다.
      if (e.deltaY >= 0 || !canEngage()) {
        if (pullRef.current !== 0 && !isRefreshingRef.current) {
          wheelAccumRef.current = 0
          setPull(0)
        }
        return
      }

      wheelAccumRef.current += -e.deltaY
      setPull(resist(wheelAccumRef.current))

      // 휠에는 touchend가 없다. 잠시 멈추면 손을 뗀 것으로 간주해 판정한다.
      if (wheelIdleTimerRef.current != null) window.clearTimeout(wheelIdleTimerRef.current)
      wheelIdleTimerRef.current = window.setTimeout(() => {
        wheelIdleTimerRef.current = null
        wheelAccumRef.current = 0
        endGesture()
      }, WHEEL_IDLE_MS)
    }

    // preventDefault를 쓰려면 touchmove는 non-passive여야 한다.
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
    document.addEventListener('touchcancel', onTouchEnd)
    document.addEventListener('wheel', onWheel, { passive: true })

    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchEnd)
      document.removeEventListener('wheel', onWheel)
      if (wheelIdleTimerRef.current != null) window.clearTimeout(wheelIdleTimerRef.current)
    }
  }, [disabled, threshold, maxPull])

  return {
    pullDistance,
    isRefreshing,
    /** 임계값을 넘겨 손을 떼면 새로고침되는 상태(인디케이터 문구 전환용). */
    willRefresh: pullDistance >= threshold,
  }
}
