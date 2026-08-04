import { describe, expect, it } from 'vitest'
import { isBoxSetTitle } from './isBoxSet'

describe('isBoxSetTitle', () => {
  it('권수 범위가 들어간 세트 상품을 걸러낸다', () => {
    expect(isBoxSetTitle('나의 히어로 아카데미아 세트 C - 29~42권 + 29~42권 초판 부록')).toBe(true)
    expect(isBoxSetTitle('원피스 1 ~ 20 권')).toBe(true)
  })

  it('전 N권 표기를 걸러낸다', () => {
    expect(isBoxSetTitle('토지 전 20권')).toBe(true)
    expect(isBoxSetTitle('삼국지 전10권')).toBe(true)
  })

  it('세트·전집·합본·박스·패키지 표기를 걸러낸다', () => {
    expect(isBoxSetTitle('해리포터 박스세트')).toBe(true)
    expect(isBoxSetTitle('셰익스피어 전집')).toBe(true)
    expect(isBoxSetTitle('아가사 크리스티 합본')).toBe(true)
    expect(isBoxSetTitle('스페셜 패키지')).toBe(true)
    expect(isBoxSetTitle('HARRY POTTER BOX SET')).toBe(true)
  })

  it('단권 도서는 통과시킨다', () => {
    expect(isBoxSetTitle('나의 히어로 아카데미아 35')).toBe(false)
    expect(isBoxSetTitle('체인소 맨 20')).toBe(false)
    expect(isBoxSetTitle('마당 깊은 집')).toBe(false)
    expect(isBoxSetTitle('나의 히어로 아카데미아 캐릭터 팬북 컴플리트 에디션')).toBe(false)
  })

  it('빈 제목은 세트로 보지 않는다', () => {
    expect(isBoxSetTitle('')).toBe(false)
  })
})
