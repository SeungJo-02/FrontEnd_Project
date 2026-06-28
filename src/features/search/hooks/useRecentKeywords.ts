import { useCallback, useState } from 'react'

export const RECENT_KEYWORDS_KEY = 'shelfeed-recent-keywords'
const MAX_RECENT_KEYWORDS = 10

function loadRecentKeywords(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEYWORDS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((k): k is string => typeof k === 'string').slice(0, MAX_RECENT_KEYWORDS)
      : []
  } catch {
    return []
  }
}

function saveRecentKeywords(keywords: string[]) {
  try {
    localStorage.setItem(RECENT_KEYWORDS_KEY, JSON.stringify(keywords))
  } catch {
    // localStorage 쓰기 실패 시 무시 (private 모드, 용량 초과 등)
  }
}

/**
 * 최근 검색어를 localStorage에서 제거한다. 로그아웃/회원 탈퇴 시 검색 캐시 정리에 사용.
 */
export function clearRecentKeywords() {
  try {
    localStorage.removeItem(RECENT_KEYWORDS_KEY)
  } catch {
    // private 모드 등 localStorage 접근 불가 시 무시
  }
}

/**
 * 최근 검색어 목록(localStorage 영속, 최대 `MAX_RECENT_KEYWORDS`건)을 관리한다.
 */
export function useRecentKeywords() {
  const [recentKeywords, setRecentKeywords] = useState<string[]>(() => loadRecentKeywords())

  const commitKeyword = useCallback((keyword: string) => {
    const value = keyword.trim()
    if (!value) return
    setRecentKeywords(prev => {
      if (prev[0] === value) return prev
      const next = [value, ...prev.filter(k => k !== value)].slice(0, MAX_RECENT_KEYWORDS)
      saveRecentKeywords(next)
      return next
    })
  }, [])

  const removeKeyword = useCallback((keyword: string) => {
    setRecentKeywords(prev => {
      const next = prev.filter(k => k !== keyword)
      saveRecentKeywords(next)
      return next
    })
  }, [])

  const clearAll = useCallback(() => {
    setRecentKeywords([])
    saveRecentKeywords([])
  }, [])

  return { recentKeywords, commitKeyword, removeKeyword, clearAll }
}
