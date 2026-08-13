import { describe, expect, it } from 'vitest'
import { keywordsFor } from './genreKeywords'

describe('keywordsFor', () => {
  it('슬래시로 묶인 장르명을 낱말로 쪼갠다', () => {
    // 통째로 검색하면 운영에서 2건뿐이라 "다른 책"을 눌러도 같은 책만 나왔다.
    expect(keywordsFor('만화/라이트노벨')).toEqual(['만화', '라이트노벨'])
    expect(keywordsFor('예술/대중문화')).toEqual(['예술', '대중문화'])
  })

  it('슬래시가 없으면 이름 그대로 하나만 준다', () => {
    expect(keywordsFor('과학')).toEqual(['과학'])
  })

  it('낱말 주변 공백을 털어낸다', () => {
    expect(keywordsFor('건강 / 취미')).toEqual(['건강', '취미'])
  })

  it('빈 조각은 후보에서 뺀다', () => {
    expect(keywordsFor('소설//시')).toEqual(['소설', '시'])
  })

  it('쪼갤 것이 없으면 원래 이름으로 되돌아간다', () => {
    // 후보가 하나도 없으면 검색어가 사라져 책을 못 찾는다.
    expect(keywordsFor('/')).toEqual(['/'])
    expect(keywordsFor('   ')).toEqual(['   '])
  })
})
