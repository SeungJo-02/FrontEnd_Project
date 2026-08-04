/** Date를 로컬 시간대 기준 `YYYY-MM-DD` 키로 변환한다(UTC 변환 시 하루 밀리는 문제 방지). */
export function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** `YYYY-MM-DD` 문자열이 유효한 날짜 키인지 검사한다. */
export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = parseDateKey(value)
  return parsed != null && toDateKey(parsed) === value
}

/** `YYYY-MM-DD`를 로컬 자정 Date로 되돌린다. 형식이 맞지 않으면 null. */
export function parseDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}
