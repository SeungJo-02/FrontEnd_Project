import apiClient from './client'
import { type ApiResponse, normalizeAxiosError, parseApiResponse } from './_helpers'

export interface CommentUser {
  userId: number
  nickname: string
  profileImageUrl: string | null
}

/**
 * 대댓글(2단계) 항목. 부모 댓글 아래에 렌더된다.
 *
 * 소프트 삭제된 대댓글은 `isDeleted: true`, `user: null`,
 * `content: "삭제된 댓글입니다"`로 내려온다. UI에서 그대로 표시.
 */
export interface ReplyItem {
  commentId: number
  user: CommentUser | null
  content: string
  parentCommentId: number
  likeCount: number
  isLiked: boolean
  isDeleted: boolean
  isMine: boolean
  isEdited: boolean
  createdAt: string
}

/**
 * 부모 댓글 항목. `replies` 배열로 대댓글을 포함한다.
 *
 * 백엔드는 2단계 트리만 지원 — 대댓글의 대댓글은 `NESTED_REPLY_NOT_ALLOWED`(400).
 * 소프트 삭제된 부모 댓글도 대댓글이 있으면 목록에 남는다.
 */
export interface CommentItem {
  commentId: number
  user: CommentUser | null
  content: string
  parentCommentId: null
  likeCount: number
  isLiked: boolean
  isDeleted: boolean
  isMine: boolean
  isEdited: boolean
  createdAt: string
  replies: ReplyItem[]
}

export interface CommentListResponse {
  content: CommentItem[]
  nextCursor: number | null
  hasNext: boolean
  size: number
}

/**
 * 댓글 목록 정렬 기준.
 *
 * - `latest`: 최신순. 커서로 이어 볼 수 있어 시트의 전체 목록에 쓴다.
 * - `top`: 인기순(좋아요 → 대댓글 수 → 최신). 감상 상세에 미리 펼쳐 보이는 몇 개를 고를 때 쓴다.
 *   정렬 키가 commentId가 아니라 커서를 쓸 수 없고, 서버도 `nextCursor`를 내려주지 않는다.
 */
export type CommentSort = 'latest' | 'top'

export interface CommentCreateResponse {
  commentId: number
  reviewId: number
  user: CommentUser
  content: string
  parentCommentId: number | null
  likeCount: number
  createdAt: string
}

export interface CommentUpdateResponse {
  commentId: number
  content: string
  updatedAt: string
}

export interface CommentLikeResponse {
  commentId: number
  likeCount: number
}

/**
 * 감상의 댓글 목록을 조회한다.
 *
 * 부모 댓글만 페이징 대상이고 각 부모의 대댓글은 `replies` 배열에 전부 포함.
 * 삭제된 댓글도 `isDeleted: true`로 내려와 "삭제된 댓글입니다"로 렌더.
 *
 * `sort='top'`이면 인기순 상위 `limit`개를 돌려주며 커서가 동작하지 않는다.
 * 이 정렬에서는 삭제된 부모 댓글이 목록에서 아예 빠진다 —
 * "삭제된 댓글입니다"가 좋아요 수만으로 미리보기 맨 위를 차지하지 않도록.
 */
export async function getComments(
  reviewId: number,
  cursor?: number | null,
  limit = 20,
  signal?: AbortSignal,
  sort: CommentSort = 'latest'
): Promise<CommentListResponse> {
  try {
    const { data } = await apiClient.get<ApiResponse<CommentListResponse>>(
      `/api/v1/reviews/${reviewId}/comments`,
      {
        params: {
          limit,
          sort,
          // 인기순은 커서로 이어 볼 수 없어 서버가 무시한다. 보내지 않아 의도를 분명히 한다.
          ...(cursor != null && sort === 'latest' ? { cursor } : {}),
        },
        signal,
      }
    )
    return parseApiResponse(data, '댓글 목록 응답이 올바르지 않습니다.')
  } catch (error) {
    throw normalizeAxiosError(error, '댓글을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
  }
}

/**
 * 댓글 또는 대댓글을 작성한다.
 *
 * `parentCommentId`가 null이면 부모 댓글, 값이 있으면 해당 댓글의 대댓글.
 * 대댓글의 대댓글 시도 시 백엔드가 400 `NESTED_REPLY_NOT_ALLOWED` 반환.
 */
export async function createComment(
  reviewId: number,
  content: string,
  parentCommentId?: number | null
): Promise<CommentCreateResponse> {
  try {
    const { data } = await apiClient.post<ApiResponse<CommentCreateResponse>>(
      `/api/v1/reviews/${reviewId}/comments`,
      {
        content,
        ...(parentCommentId != null ? { parentCommentId } : {}),
      }
    )
    return parseApiResponse(data, '댓글 작성 응답이 올바르지 않습니다.')
  } catch (error) {
    throw normalizeAxiosError(error, '댓글 작성에 실패했습니다. 잠시 후 다시 시도해주세요.')
  }
}

/**
 * 본인 댓글의 내용을 수정한다.
 *
 * 타인의 댓글이면 백엔드가 403 `NOT_COMMENT_OWNER` 반환.
 */
export async function updateComment(
  reviewId: number,
  commentId: number,
  content: string
): Promise<CommentUpdateResponse> {
  try {
    const { data } = await apiClient.put<ApiResponse<CommentUpdateResponse>>(
      `/api/v1/reviews/${reviewId}/comments/${commentId}`,
      { content }
    )
    return parseApiResponse(data, '댓글 수정 응답이 올바르지 않습니다.')
  } catch (error) {
    throw normalizeAxiosError(error, '댓글 수정에 실패했습니다. 잠시 후 다시 시도해주세요.')
  }
}

/**
 * 본인 댓글을 소프트 삭제한다.
 *
 * 백엔드에서 `isDeleted=true` + `deletedAt` 세팅. 목록에서는 "삭제된 댓글입니다"로 표시.
 */
export async function deleteComment(reviewId: number, commentId: number): Promise<void> {
  try {
    await apiClient.delete<ApiResponse<void>>(`/api/v1/reviews/${reviewId}/comments/${commentId}`)
  } catch (error) {
    throw normalizeAxiosError(error, '댓글 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.')
  }
}

/**
 * 댓글에 좋아요를 누른다.
 *
 * 본인 댓글이면 400 `SELF_LIKE_NOT_ALLOWED`, 이미 좋아요 상태면 409 `ALREADY_COMMENT_LIKED`.
 */
export async function likeComment(
  reviewId: number,
  commentId: number
): Promise<CommentLikeResponse> {
  try {
    const { data } = await apiClient.post<ApiResponse<CommentLikeResponse>>(
      `/api/v1/reviews/${reviewId}/comments/${commentId}/likes`
    )
    return parseApiResponse(data, '댓글 좋아요 응답이 올바르지 않습니다.')
  } catch (error) {
    throw normalizeAxiosError(error, '댓글 좋아요에 실패했습니다.')
  }
}

/**
 * 댓글 좋아요를 취소한다.
 *
 * 좋아요 기록이 없으면 404 `COMMENT_LIKE_NOT_FOUND`.
 */
export async function unlikeComment(
  reviewId: number,
  commentId: number
): Promise<CommentLikeResponse> {
  try {
    const { data } = await apiClient.delete<ApiResponse<CommentLikeResponse>>(
      `/api/v1/reviews/${reviewId}/comments/${commentId}/likes`
    )
    return parseApiResponse(data, '댓글 좋아요 취소 응답이 올바르지 않습니다.')
  } catch (error) {
    throw normalizeAxiosError(error, '좋아요 취소에 실패했습니다.')
  }
}
