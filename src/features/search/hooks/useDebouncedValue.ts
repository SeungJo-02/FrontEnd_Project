import { useEffect, useState } from 'react'

/**
 * 값 변경을 `delay`(ms)만큼 지연시켜 반환한다.
 *
 * 초기값은 즉시 반영(첫 렌더에서 지연 없음)하고, 이후 변경부터 debounce를 적용한다.
 * 따라서 마운트 시 복원된 검색어는 지연 없이 바로 조회에 사용되고, 사용자의 연속
 * 타이핑만 지연된다.
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(handle)
  }, [value, delay])

  return debounced
}
