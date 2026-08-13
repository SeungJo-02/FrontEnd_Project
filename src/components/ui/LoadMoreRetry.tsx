interface LoadMoreRetryProps {
  message: string
  onRetry: () => void
}

/**
 * 목록 하단의 "추가 로딩 실패 + 다시 불러오기" 블록.
 *
 * 무한 스크롤이 있는 화면 9곳에서 같은 마크업이 반복되고 있었다. 자동 재시도 대신
 * 사용자가 명시적으로 누르게 하는 정책(에러 → observer → 에러 무한루프 방지)도
 * 여기 한 곳에 담긴다.
 */
export default function LoadMoreRetry({ message, onRetry }: LoadMoreRetryProps) {
  return <LoadMoreRetry message={message} onRetry={onRetry} />
}
