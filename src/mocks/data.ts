import type { BookListItemData } from '@/components/common/BookListItem'
import type { ReviewCardData } from '@/components/common/ReviewCard'
import {
  AVATAR_BOOKLOVER,
  AVATAR_BOOKTRACKER,
  AVATAR_BOOKWORM,
  AVATAR_DAWN,
  AVATAR_LITERARYBOY,
  AVATAR_WISEFOREST,
  initialAvatar,
} from '@/mocks/avatars'

// 유저 Mock 데이터
export const mockUsers = [
  {
    id: 1,
    nickname: '독서광',
    profileImageUrl: AVATAR_BOOKLOVER,
    followerCount: 120,
    followingCount: 85,
  },
  {
    id: 2,
    nickname: '책벌레지니',
    profileImageUrl: AVATAR_BOOKWORM,
    followerCount: 340,
    followingCount: 210,
  },
  {
    id: 3,
    nickname: '문학소년',
    profileImageUrl: AVATAR_LITERARYBOY,
    followerCount: 95,
    followingCount: 60,
  },
]

// 도서 Mock 데이터
export const mockBooks: BookListItemData[] = [
  {
    isbn: '9788937460449',
    title: '데미안',
    author: '헤르만 헤세',
    publisher: '민음사',
    coverImageUrl: 'https://picsum.photos/seed/demian/200/300',
    pageCount: 248,
    rating: 4.8,
    reviewCount: 1200,
  },
  {
    isbn: '9788937460456',
    title: '위대한 개츠비',
    author: 'F. 스콧 피츠제럴드',
    publisher: '문학동네',
    coverImageUrl: 'https://picsum.photos/seed/gatsby/200/300',
    pageCount: 272,
    rating: 4.5,
    reviewCount: 850,
  },
  {
    isbn: '9788937460463',
    title: '호밀밭의 파수꾼',
    author: 'J.D. 샐린저',
    publisher: '문학동네',
    coverImageUrl: 'https://picsum.photos/seed/catcher/200/300',
    pageCount: 320,
    rating: 4.6,
    reviewCount: 920,
  },
  {
    isbn: '9788937460470',
    title: 'The Midnight Library',
    author: 'Matt Haig',
    publisher: 'Canongate Books',
    coverImageUrl: 'https://picsum.photos/seed/midnight/200/300',
    pageCount: 288,
    rating: 4.8,
    reviewCount: 1240,
  },
  {
    isbn: '9788937460487',
    title: '싯다르타',
    author: '헤르만 헤세',
    publisher: '문학동네',
    coverImageUrl: 'https://picsum.photos/seed/siddhartha/200/300',
    pageCount: 200,
    rating: 4.5,
    reviewCount: 850,
  },
  {
    isbn: '9788937460494',
    title: '수레바퀴 아래서',
    author: '헤르만 헤세',
    publisher: '더클래식',
    coverImageUrl: 'https://picsum.photos/seed/wheel/200/300',
    pageCount: 280,
    rating: 4.2,
    reviewCount: 420,
  },
  {
    isbn: '9788937460500',
    title: '유리알 유희',
    author: '헤르만 헤세',
    publisher: '민음사',
    coverImageUrl: 'https://picsum.photos/seed/glass/200/300',
    pageCount: 640,
    rating: 4.0,
    reviewCount: 128,
  },
]

// 리뷰 Mock 데이터
export const mockReviews: ReviewCardData[] = [
  {
    id: 1,
    content:
      '내 안의 알을 깨고 나오는 과정이 얼마나 고통스럽고도 숭고한지 다시금 느꼈습니다. 싱클레어의 성장은 우리 모두의 초상화 같네요...',
    book: mockBooks[0],
    author: mockUsers[0],
    likeCount: 24,
    isLiked: false,
    createdAt: '2시간 전',
    rating: 5,
    readingStatus: 'finished',
    hasSpoiler: false,
    commentCount: 5,
  },
  {
    id: 2,
    content:
      '이 책의 결말은 정말 충격적이었어요. 개츠비가 결국 그렇게 떠나게 될 줄은 몰랐는데, 데이지의 선택이 너무나도 현실적이면서도 잔인하게 느껴졌습니다. 상류 사회의 위선이...',
    book: mockBooks[1],
    author: mockUsers[1],
    likeCount: 12,
    isLiked: false,
    createdAt: '4시간 전',
    rating: 4,
    readingStatus: 'reading',
    hasSpoiler: true,
    commentCount: 2,
  },
  {
    id: 3,
    content:
      '홀든의 냉소 속에 감춰진 순수함이 가슴 아팠습니다. 누구나 한번쯤은 길을 잃고 누군가 자신을 잡아주길 바라는 법이니까요...',
    book: mockBooks[2],
    author: mockUsers[2],
    likeCount: 45,
    isLiked: false,
    createdAt: '6시간 전',
    rating: 5,
    readingStatus: 'finished',
    hasSpoiler: false,
    commentCount: 8,
  },
]

// 검색 결과 Mock 데이터
export const mockSearchResults: BookListItemData[] = [
  mockBooks[0],
  mockBooks[4],
  mockBooks[5],
  mockBooks[6],
]

// BookDetail용 리뷰 Mock 데이터
export const mockBookDetailReviews: ReviewCardData[] = [
  {
    id: 4,
    content:
      '인생의 수많은 선택지들에 대해 다시 생각해보게 된 책이었어요. 문장 하나하나가 위로가 되네요...',
    book: mockBooks[3],
    // 닉네임만 바꾸면 앞 사람의 아바타를 그대로 물려받는다 — 사진도 함께 갈아준다.
    author: { ...mockUsers[0], nickname: '지혜로운숲', profileImageUrl: AVATAR_WISEFOREST },
    likeCount: 32,
    isLiked: false,
    createdAt: '1일 전',
    rating: 5,
    readingStatus: 'finished',
    hasSpoiler: false,
    commentCount: 3,
  },
  {
    id: 5,
    content:
      '결말 부분에서 주인공이 결국 자신의 원래 삶을 선택하는 장면이 정말 감동적이었어요. 도서관 사서와의 대화가 신의 한 수...',
    book: mockBooks[3],
    author: { ...mockUsers[1], nickname: '북트래커', profileImageUrl: AVATAR_BOOKTRACKER },
    likeCount: 18,
    isLiked: false,
    createdAt: '2일 전',
    rating: 4,
    readingStatus: 'finished',
    hasSpoiler: true,
    commentCount: 1,
  },
  {
    id: 6,
    content:
      '우울할 때 읽으면 정말 좋은 책입니다. 판타지적인 설정도 흥미롭고 철학적인 질문들도 좋았습니다.',
    book: mockBooks[3],
    author: { ...mockUsers[2], nickname: '새벽감성', profileImageUrl: AVATAR_DAWN },
    likeCount: 27,
    isLiked: false,
    createdAt: '3일 전',
    rating: 4,
    readingStatus: 'finished',
    hasSpoiler: false,
    commentCount: 5,
  },
]

// 알림 Mock 데이터
export const mockNotifications = [
  {
    id: 1,
    type: 'like' as const,
    senderNickname: '김지우',
    senderProfileImageUrl: initialAvatar('김지우', 'hsl(34, 37%, 54%)'),
    message: '님이 회원님의 감상에 좋아요를 눌렀습니다.',
    isRead: false,
    createdAt: '2시간 전',
  },
  {
    id: 2,
    type: 'comment' as const,
    senderNickname: '이민호',
    senderProfileImageUrl: initialAvatar('이민호', 'hsl(150, 26%, 42%)'),
    message: '님이 회원님의 감상에 댓글을 남겼습니다.',
    isRead: false,
    createdAt: '5시간 전',
  },
  {
    id: 3,
    type: 'follow' as const,
    senderNickname: '박서연',
    senderProfileImageUrl: initialAvatar('박서연', 'hsl(212, 30%, 50%)'),
    message: '님이 회원님을 팔로우하기 시작했습니다.',
    isRead: true,
    createdAt: '어제',
  },
  {
    id: 4,
    type: 'new_review' as const,
    senderNickname: '최준혁',
    senderProfileImageUrl: initialAvatar('최준혁', 'hsl(18, 45%, 52%)'),
    message: '님이 새로운 감상을 올렸습니다.',
    isRead: true,
    createdAt: '어제',
    bookTitle: '데미안',
  },
  {
    id: 5,
    type: 'like' as const,
    senderNickname: '윤아름',
    senderProfileImageUrl: initialAvatar('윤아름', 'hsl(272, 26%, 52%)'),
    message: '님이 회원님의 감상에 좋아요를 눌렀습니다.',
    isRead: true,
    createdAt: '2일 전',
  },
]

// 내 서재 Mock 데이터
export const mockLibraryBooks = [
  { book: mockBooks[0], readingStatus: 'finished' as const, addedAt: '2024-06-01' },
  { book: mockBooks[2], readingStatus: 'reading' as const, addedAt: '2024-06-10' },
  {
    book: {
      isbn: '9788937460510',
      title: '인간 실격',
      author: '다자이 오사무',
      publisher: '민음사',
      coverImageUrl: 'https://picsum.photos/seed/ningen/200/300',
      pageCount: 224,
      rating: 4.3,
      reviewCount: 680,
    },
    readingStatus: 'finished' as const,
    addedAt: '2024-05-20',
  },
  {
    book: {
      isbn: '9788937460527',
      title: '이방인',
      author: '알베르 카뮈',
      publisher: '민음사',
      coverImageUrl: 'https://picsum.photos/seed/stranger/200/300',
      pageCount: 176,
      rating: 4.4,
      reviewCount: 750,
    },
    readingStatus: 'want_to_read' as const,
    addedAt: '2024-06-15',
  },
  {
    book: {
      isbn: '9788937460534',
      title: '달과 6펜스',
      author: '서머셋 몸',
      publisher: '문학동네',
      coverImageUrl: 'https://picsum.photos/seed/moon6/200/300',
      pageCount: 340,
      rating: 4.1,
      reviewCount: 320,
    },
    readingStatus: 'reading' as const,
    addedAt: '2024-06-12',
  },
  { book: mockBooks[1], readingStatus: 'finished' as const, addedAt: '2024-04-10' },
  {
    book: {
      isbn: '9788937460541',
      title: '모비 딕',
      author: '허먼 멜빌',
      publisher: '펭귄클래식',
      coverImageUrl: 'https://picsum.photos/seed/mobydick/200/300',
      pageCount: 720,
      rating: 3.9,
      reviewCount: 210,
    },
    readingStatus: 'stopped' as const,
    addedAt: '2024-03-01',
  },
  {
    book: {
      isbn: '9788937460558',
      title: '어린 왕자',
      author: '생텍쥐페리',
      publisher: '문학동네',
      coverImageUrl: 'https://picsum.photos/seed/prince/200/300',
      pageCount: 136,
      rating: 4.9,
      reviewCount: 2100,
    },
    readingStatus: 'want_to_read' as const,
    addedAt: '2024-06-18',
  },
  {
    book: {
      isbn: '9788937460565',
      title: '정의란 무엇인가',
      author: '마이클 샌델',
      publisher: '와이즈베리',
      coverImageUrl: 'https://picsum.photos/seed/justice/200/300',
      pageCount: 408,
      rating: 4.2,
      reviewCount: 980,
    },
    readingStatus: 'finished' as const,
    addedAt: '2024-02-15',
  },
]
