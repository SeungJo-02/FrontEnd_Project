# 통합 피드 API 명세 (`GET /api/v1/feed`)

프론트엔드가 호출하는 통합 피드 엔드포인트의 명세. 배포 전까지는 프론트가 구 엔드포인트로 자동 폴백한다.

- **증상**: 로그인 직후 홈에서 "요청한 리소스를 찾을 수 없습니다." (백엔드 404 핸들러 메시지)
- **콘솔**: `api.shelfeed.co.kr/api/v1/feed?limit=20 → 404`
- **원인**: 팔로잉 피드 + 추천 피드를 하나로 합치면서 프론트가 `/api/v1/feed`를 호출하도록 바뀌었는데, 백엔드에는 아직 기존 두 엔드포인트만 존재
- **기준 코드**: `src/api/feed.ts`, `src/pages/HomeFeedPage.tsx`

## 프론트 폴백 (현재 적용됨)

`getFeed()`가 통합 엔드포인트를 먼저 호출하고, **404가 돌아올 때만** 구 엔드포인트
(`/feed/following` → 소진되면 `/feed/recommend`)로 넘어간다. 덕분에 백엔드 배포를 기다리지
않아도 홈이 정상 동작하며, **통합 엔드포인트가 배포되면 첫 호출부터 자동으로 그쪽만 사용**한다.
프론트를 다시 배포할 필요는 없다.

폴백 여부는 세션 단위로만 기억하므로(새로고침하면 재확인), 배포 후 사용자가 할 일은 없다.
통합 엔드포인트가 안정화되면 `src/api/feed.ts`의 폴백 경로와 구 엔드포인트를 함께 제거하면 된다.

---

## 대체 대상

| 역할        | 기존 (운영 중)               | 신규 (프론트가 기대)           |
| ----------- | ---------------------------- | ------------------------------ |
| 팔로잉 피드 | `GET /api/v1/feed/following` | `GET /api/v1/feed` 하나로 통합 |
| 추천 피드   | `GET /api/v1/feed/recommend` | 〃                             |

기존 두 엔드포인트는 즉시 제거하지 말고, 프론트 배포가 안정화된 뒤 정리하는 편이 안전하다.

---

## 요청

```
GET /api/v1/feed?limit=20
GET /api/v1/feed?limit=20&cursorCreatedAt=2026-08-05T04:12:33&cursorId=1482
```

**인증**: `Authorization: Bearer {accessToken}` — 요청 인터셉터가 자동 부착한다 (`src/api/client.ts:128`). 쿠키도 함께 전송된다 (`withCredentials: true`).

### 쿼리 파라미터

| 이름              | 타입              | 필수   | 설명                                                                                 |
| ----------------- | ----------------- | ------ | ------------------------------------------------------------------------------------ |
| `limit`           | int               | 아니오 | 페이지 크기. 프론트는 항상 `20`을 보낸다.                                            |
| `cursorCreatedAt` | ISO LocalDateTime | 조건부 | 직전 페이지 마지막 항목의 `createdAt`. **offset 없는 형식** (`2026-08-05T04:12:33`). |
| `cursorId`        | long              | 조건부 | 직전 페이지 마지막 항목의 `reviewId`.                                                |

**커서 규약**: `cursorCreatedAt`과 `cursorId`는 **둘 다 보내거나 둘 다 생략**한다. 첫 페이지에서는 두 파라미터가 아예 붙지 않는다 (`src/api/feed.ts:70`). 한쪽만 오는 경우는 프론트가 만들지 않으므로 400으로 거절해도 무방하다.

---

## 응답

`ApiResponse<T>` 봉투로 감싼다. 프론트는 `data`가 없으면 에러로 처리한다 (`parseApiResponse`).

```jsonc
{
  "status": "SUCCESS",
  "code": 200,
  "data": {
    "content": [
      {
        "reviewId": 1482,
        "user": {
          "userId": 37,
          "nickname": "책읽는곰",
          "profileImageUrl": "https://...", // null 허용
        },
        "book": {
          "bookId": 904,
          "title": "달러구트 꿈 백화점",
          "author": "이미예",
          "coverImageUrl": "https://...", // null 허용
          "category": "소설", // null 허용
        },
        "rating": 4,
        "content": "감상 본문...",
        "quote": "인상 깊은 문장", // null 허용
        "isSpoiler": false,
        "likeCount": 12,
        "commentCount": 3,
        "isLiked": false,
        "tags": ["힐링", "판타지"],
        "createdAt": "2026-08-05T04:12:33",
      },
    ],
    "nextCursorCreatedAt": "2026-08-05T04:12:33", // 마지막 페이지면 null
    "nextCursorId": 1482, // 마지막 페이지면 null
    "hasNext": true,
    "size": 20,
  },
}
```

### 필드 규칙

| 필드                             | 타입              | null 허용 | 비고                                            |
| -------------------------------- | ----------------- | --------- | ----------------------------------------------- |
| `content[].reviewId`             | long              | ✗         | 프론트 리스트 key. **페이지 간 중복 금지**      |
| `content[].user`                 | object            | ✗         | `userId`, `nickname` 필수                       |
| `content[].user.profileImageUrl` | string            | ✓         | null이면 기본 아바타                            |
| `content[].book`                 | object            | ✗         | `bookId`, `title`, `author` 필수                |
| `content[].book.coverImageUrl`   | string            | ✓         | null이면 빈 문자열로 대체                       |
| `content[].book.category`        | string            | ✓         |                                                 |
| `content[].rating`               | int               | ✗         | 1~5                                             |
| `content[].content`              | string            | ✗         | 감상 본문                                       |
| `content[].quote`                | string            | ✓         |                                                 |
| `content[].isSpoiler`            | boolean           | ✗         | true면 카드가 블러 처리됨                       |
| `content[].likeCount`            | int               | ✗         |                                                 |
| `content[].commentCount`         | int               | ✗         |                                                 |
| `content[].isLiked`              | boolean           | ✗         | **요청한 사용자 기준**                          |
| `content[].tags`                 | string[]          | ✗         | 없으면 빈 배열 (`null` 금지)                    |
| `content[].createdAt`            | ISO LocalDateTime | ✗         | **offset 없는 형식**. 프론트가 로컬(KST)로 해석 |
| `nextCursorCreatedAt`            | string            | ✓         | 마지막 페이지면 null                            |
| `nextCursorId`                   | long              | ✓         | 마지막 페이지면 null                            |
| `hasNext`                        | boolean           | ✗         |                                                 |
| `size`                           | int               | ✗         |                                                 |

> 기존 팔로잉 피드에 있던 `feedId` 래퍼는 사라졌다. 추천 감상에는 대응하는 피드 행이 없기 때문에, 리뷰 필드가 **최상위에 평평하게** 온다.

---

## 동작 요구사항

1. **합집합 + 최신순 통합**  
   팔로우한 사용자의 감상과 추천 감상을 하나의 목록으로 합쳐 `createdAt DESC, reviewId DESC`로 정렬한다. 프론트에는 출처 구분이 없다 (탭이 사라지고 단일 피드가 됐다).

2. **커서 페이징의 tie-break**  
   `createdAt`이 같은 감상이 여러 개일 수 있으므로 `(createdAt, reviewId)` 복합 커서로 자른다.

   ```sql
   WHERE (created_at, review_id) < (:cursorCreatedAt, :cursorId)
   ORDER BY created_at DESC, review_id DESC
   LIMIT :limit
   ```

   이게 지켜지지 않으면 페이지 경계에서 감상이 누락되거나 중복된다.

3. **중복 제거**  
   팔로우한 사람의 감상이 추천에도 뽑히면 한 번만 내려야 한다. 프론트에도 `reviewId` 기준 중복 제거가 있지만(`HomeFeedPage.tsx:265`), 그건 방어 코드일 뿐 페이지 크기가 들쭉날쭉해지는 건 막지 못한다.

4. **팔로우가 없는 신규 사용자를 위한 단계형 채우기** ⭐

   가장 중요한 요구사항이다. 갓 가입한 사용자는 팔로우가 0명이라 팔로잉 감상이 없다.
   이때 빈 피드를 내리지 말고 아래 순서로 채운다.

   | 순서 | 근거                                      | 비고                           |
   | ---- | ----------------------------------------- | ------------------------------ |
   | 1    | 팔로우한 사용자의 감상                    | 없으면 다음 단계로             |
   | 2    | **관심 장르 기반 추천** (`CONTENT_BASED`) | 온보딩에서 받은 관심 장르 사용 |
   | 3    | 인기 감상 (`POPULAR`)                     | 장르 결과가 부족할 때 채움     |

   관심 장르는 온보딩(`POST /api/v1/users/me/onboarding`)에서 이미 서버에 저장되므로
   **프론트가 장르를 따로 넘기지 않는다.** 서버가 요청자의 저장된 관심 장르를 직접 조회해서 쓴다.

   구 추천 엔드포인트가 이미 `recommendType: CONTENT_BASED | SOCIAL | MIXED | POPULAR`를
   내려주고 있으므로, 그 로직을 통합 피드에서 재사용하면 된다.

   2단계만으로 페이지가 안 차면 3단계로 이어 붙인다. 장르로만 좁히면 해당 장르 감상이
   적을 때 오히려 화면이 비므로, 부족분을 인기 감상으로 메우는 편이 낫다.

5. **빈 피드는 에러가 아니다**  
   위 단계를 다 거쳐도 내려줄 감상이 없으면(서비스 초기라 감상 자체가 적은 경우)
   **`content: []` + `hasNext: false`로 200**을 내려야 한다. 404나 에러를 내면 홈이 빨간
   에러 문구로 덮인다. 정상적으로 빈 배열이 오면 프론트가 첫 방문 안내 화면
   (`src/components/feed/EmptyFeedGuide.tsx` — 관심 장르 기반 책 추천 + 감상 쓰기 유도)을
   대신 띄운다.

6. **차단/비공개 필터링**  
   차단한 사용자, 비공개(DRAFT) 감상은 제외한다.

---

## 프론트 확인 포인트

배포 후 아래가 확인되면 정상이다.

- 로그인 직후 홈에 감상 카드가 보인다 (또는 빈 피드 안내 문구)
- 아래로 스크롤하면 다음 페이지가 이어 붙고, 같은 감상이 두 번 나오지 않는다
- 맨 위에서 아래로 당기면 새로고침된다 (pull-to-refresh)
- 스포일러 감상은 블러 처리된 채로 뜬다
