import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

interface UseGridDragReorderOptions<T> {
  items: T[]
  getId: (item: T) => number
  /** 드래그 중 순서가 바뀔 때마다 호출 — 화면을 즉시 갱신하라는 뜻. */
  onReorder: (next: T[]) => void
  /** 손을 뗀 뒤 최종 순서. 저장은 여기서 한 번만 한다. */
  onCommit: (next: T[]) => void
  disabled?: boolean
}

/** 이 시간만큼 누르고 있어야 드래그가 시작된다. 탭(이동)과 구분하기 위한 값. */
const LONG_PRESS_MS = 350
/** 롱프레스 전에 이만큼 움직이면 스크롤로 보고 드래그를 포기한다. */
const MOVE_TOLERANCE_PX = 10
/** 자리를 비켜주는 카드가 새 위치로 미끄러지는 시간. */
const FLIP_MS = 200
/** 손을 뗀 카드가 제 슬롯으로 내려앉는 시간. */
const DROP_MS = 180
/** 끌고 있는 카드를 살짝 키워 "들어올린" 느낌을 준다. */
const DRAG_SCALE = 'scale(1.06)'
const EASING = 'cubic-bezier(0.2, 0, 0, 1)'

interface Point {
  x: number
  y: number
}

/** offsetParent 기준 좌표. transform의 영향을 받지 않는 "진짜 자리". */
interface SlotPosition {
  left: number
  top: number
}

function slotOf(node: HTMLElement): SlotPosition {
  return { left: node.offsetLeft, top: node.offsetTop }
}

/**
 * 그리드 항목을 눌러서 끌어 순서를 바꾸는 훅.
 *
 * HTML5 drag&drop은 모바일에서 동작하지 않아 포인터 이벤트로 직접 구현했다.
 * 카드가 링크라서 짧은 탭은 그대로 이동해야 하고, 길게 누를 때만 드래그로 전환한다.
 * 드래그 직후의 click은 삼켜서 원치 않는 페이지 이동을 막는다.
 *
 * **좌표는 전부 `offsetLeft/Top`(레이아웃 기준)으로 다룬다.** `getBoundingClientRect`는
 * 진행 중인 transform이 반영된 값이라, 애니메이션 도중 판정에 쓰면 "교체 → 되돌림"이
 * 반복되며 카드가 덜덜 떨린다.
 */
export function useGridDragReorder<T>({
  items,
  getId,
  onReorder,
  onCommit,
  disabled = false,
}: UseGridDragReorderOptions<T>) {
  const [draggingId, setDraggingId] = useState<number | null>(null)

  const nodesRef = useRef(new Map<number, HTMLElement>())
  const itemsRef = useRef(items)
  itemsRef.current = items

  /** 직전 렌더에서의 카드 자리. FLIP 애니메이션의 "First". */
  const prevSlotsRef = useRef(new Map<number, SlotPosition>())

  const longPressTimerRef = useRef<number | null>(null)
  const pressPointRef = useRef<Point | null>(null)
  const draggingIdRef = useRef<number | null>(null)
  const didDragRef = useRef(false)
  /** 드래그 시작 시점의 포인터 위치와 카드 자리 — 손가락을 따라갈 기준점. */
  const dragOriginRef = useRef<{ pointer: Point; slot: SlotPosition } | null>(null)
  /** 최신 포인터 위치. 리렌더 후 위치를 다시 계산할 때 쓴다. */
  const pointerRef = useRef<Point>({ x: 0, y: 0 })
  /** 손을 뗀 뒤 제자리로 내려앉는 중인 카드 — 레이아웃 이펙트가 건드리지 않게 표시. */
  const settlingIdRef = useRef<number | null>(null)

  const clearTimer = () => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const registerNode = useCallback((id: number, node: HTMLElement | null) => {
    if (node) nodesRef.current.set(id, node)
    else nodesRef.current.delete(id)
  }, [])

  /** 끌고 있는 카드가 손가락 아래에 오도록 transform을 다시 계산해 붙인다. */
  const followPointer = useCallback((node: HTMLElement) => {
    const origin = dragOriginRef.current
    if (!origin) return
    const slot = slotOf(node)
    // 보여야 할 곳(시작 자리 + 포인터 이동량)과 실제 자리의 차이만큼 밀어준다.
    const dx = origin.slot.left - slot.left + (pointerRef.current.x - origin.pointer.x)
    const dy = origin.slot.top - slot.top + (pointerRef.current.y - origin.pointer.y)
    node.style.transition = 'none'
    node.style.transform = `translate(${dx}px, ${dy}px) ${DRAG_SCALE}`
  }, [])

  useEffect(() => {
    if (disabled) return

    /**
     * 포인터가 올라가 있는 카드의 인덱스. 판정도 레이아웃 좌표계에서 한다.
     * 모든 카드가 같은 offsetParent(그리드)를 공유하므로 포인터만 그 좌표계로 옮기면 된다.
     */
    const findIndexAtPoint = (clientX: number, clientY: number): number => {
      const first = nodesRef.current.values().next().value
      const parent = first?.offsetParent as HTMLElement | null | undefined
      if (!parent) return -1

      const parentRect = parent.getBoundingClientRect()
      const x = clientX - parentRect.left + parent.scrollLeft
      const y = clientY - parentRect.top + parent.scrollTop

      for (const [id, node] of nodesRef.current) {
        const { offsetLeft, offsetTop, offsetWidth, offsetHeight } = node
        if (
          x >= offsetLeft &&
          x <= offsetLeft + offsetWidth &&
          y >= offsetTop &&
          y <= offsetTop + offsetHeight
        ) {
          return itemsRef.current.findIndex(item => getId(item) === id)
        }
      }
      return -1
    }

    const onPointerMove = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY }

      const pressPoint = pressPointRef.current
      if (draggingIdRef.current == null) {
        if (!pressPoint) return
        // 아직 드래그 전 — 크게 움직였으면 스크롤 의도로 보고 롱프레스를 취소한다.
        if (Math.hypot(e.clientX - pressPoint.x, e.clientY - pressPoint.y) > MOVE_TOLERANCE_PX) {
          clearTimer()
          pressPointRef.current = null
        }
        return
      }

      // 드래그 중 — 스크롤이 따라 움직이지 않도록 기본 동작을 막는다.
      if (e.cancelable) e.preventDefault()

      const draggingNode = nodesRef.current.get(draggingIdRef.current)
      if (draggingNode) followPointer(draggingNode)

      const overIndex = findIndexAtPoint(e.clientX, e.clientY)
      if (overIndex < 0) return

      const current = itemsRef.current
      const fromIndex = current.findIndex(item => getId(item) === draggingIdRef.current)
      if (fromIndex < 0 || fromIndex === overIndex) return

      const next = [...current]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(overIndex, 0, moved)
      onReorder(next)
    }

    const onPointerUp = () => {
      clearTimer()
      pressPointRef.current = null

      const id = draggingIdRef.current
      if (id == null) return
      draggingIdRef.current = null
      dragOriginRef.current = null

      // 손을 뗀 카드는 순간이동하지 않고 제 슬롯으로 스르륵 내려앉는다.
      const node = nodesRef.current.get(id)
      if (node) {
        settlingIdRef.current = id
        node.style.transition = `transform ${DROP_MS}ms ${EASING}`
        node.style.transform = ''
        window.setTimeout(() => {
          if (settlingIdRef.current !== id) return
          settlingIdRef.current = null
          node.style.transition = ''
        }, DROP_MS)
      }

      setDraggingId(null)
      onCommit(itemsRef.current)
      // 드래그로 끝난 제스처의 click은 다음 tick에 오므로 그때까지만 막는다.
      window.setTimeout(() => {
        didDragRef.current = false
      }, 0)
    }

    document.addEventListener('pointermove', onPointerMove, { passive: false })
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointercancel', onPointerUp)
    return () => {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('pointercancel', onPointerUp)
      clearTimer()
    }
  }, [disabled, getId, onReorder, onCommit, followPointer])

  const onPointerDown = useCallback(
    (e: React.PointerEvent, id: number) => {
      if (disabled || e.button !== 0) return
      pressPointRef.current = { x: e.clientX, y: e.clientY }
      pointerRef.current = { x: e.clientX, y: e.clientY }
      clearTimer()
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null
        const node = nodesRef.current.get(id)
        if (!node) return
        draggingIdRef.current = id
        didDragRef.current = true
        dragOriginRef.current = { pointer: { ...pointerRef.current }, slot: slotOf(node) }
        settlingIdRef.current = null
        setDraggingId(id)
        navigator.vibrate?.(30)
      }, LONG_PRESS_MS)
    },
    [disabled]
  )

  /** 드래그로 끝난 제스처면 링크 이동을 삼킨다. */
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!didDragRef.current) return
    e.preventDefault()
    e.stopPropagation()
  }, [])

  /**
   * FLIP — 자리를 비켜준 카드들을 옛 위치에서 새 위치로 미끄러지게 만든다.
   *
   * 끌고 있는 카드는 손가락을 그대로 따라가야 하므로 이 연출에서 제외하고,
   * `followPointer`로 위치를 다시 잡아준다.
   */
  useLayoutEffect(() => {
    const prev = prevSlotsRef.current
    const next = new Map<number, SlotPosition>()
    const dragging = draggingIdRef.current
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    nodesRef.current.forEach((node, id) => {
      const slot = slotOf(node)
      next.set(id, slot)

      if (id === dragging) {
        followPointer(node)
        return
      }
      // 내려앉는 중인 카드는 자기 애니메이션을 끝내도록 둔다.
      if (id === settlingIdRef.current) return

      const before = prev.get(id)
      const dx = before ? before.left - slot.left : 0
      const dy = before ? before.top - slot.top : 0

      // 처음 보는 카드이거나 제자리면 애니메이션 없이 기본 상태만 맞춘다.
      if (prefersReducedMotion || !before || (Math.abs(dx) < 1 && Math.abs(dy) < 1)) {
        node.style.transition = ''
        node.style.transform = ''
        return
      }

      node.style.transition = 'none'
      node.style.transform = `translate(${dx}px, ${dy}px)`
      requestAnimationFrame(() => {
        node.style.transition = `transform ${FLIP_MS}ms ${EASING}`
        node.style.transform = ''
      })
    })

    prevSlotsRef.current = next
  })

  return { draggingId, registerNode, onPointerDown, onClickCapture }
}
