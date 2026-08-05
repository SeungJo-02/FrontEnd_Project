import { lazy } from 'react'
import { withChunkReload } from '@/lib/chunkReload'
import { createBrowserRouter } from 'react-router-dom'
import LoginPage from '@/pages/LoginPage'
const HomeFeedPage = lazy(withChunkReload(() => import('@/pages/HomeFeedPage')))
const SignupPage = lazy(withChunkReload(() => import('@/pages/SignupPage')))
const BookSearchPage = lazy(withChunkReload(() => import('@/features/search/pages/BookSearchPage')))
const BookDetailPage = lazy(withChunkReload(() => import('@/pages/BookDetailPage')))
const WriteReviewPage = lazy(withChunkReload(() => import('@/pages/WriteReviewPage')))
const ReviewDetailPage = lazy(withChunkReload(() => import('@/pages/ReviewDetailPage')))
const DraftsListPage = lazy(withChunkReload(() => import('@/pages/DraftsListPage')))
const MyProfilePage = lazy(withChunkReload(() => import('@/pages/MyProfilePage')))
const SettingsPage = lazy(withChunkReload(() => import('@/pages/SettingsPage')))
const NotificationsPage = lazy(withChunkReload(() => import('@/pages/NotificationsPage')))
const MyLibraryPage = lazy(withChunkReload(() => import('@/pages/MyLibraryPage')))
const BookReviewsListPage = lazy(withChunkReload(() => import('@/pages/BookReviewsListPage')))
const MemoWritePage = lazy(withChunkReload(() => import('@/pages/MemoWritePage')))
const ReadingDayPage = lazy(withChunkReload(() => import('@/pages/ReadingDayPage')))
const OnboardingPage = lazy(withChunkReload(() => import('@/pages/OnboardingPage')))
const AuthCallbackPage = lazy(withChunkReload(() => import('@/pages/AuthCallbackPage')))
const PasswordResetRequestPage = lazy(
  withChunkReload(() => import('@/pages/PasswordResetRequestPage'))
)
const PasswordResetPage = lazy(withChunkReload(() => import('@/pages/PasswordResetPage')))
const EmailVerificationPage = lazy(withChunkReload(() => import('@/pages/EmailVerificationPage')))
const PasswordChangePage = lazy(withChunkReload(() => import('@/pages/PasswordChangePage')))
const BlockedUsersPage = lazy(withChunkReload(() => import('@/pages/BlockedUsersPage')))
const WithdrawPage = lazy(withChunkReload(() => import('@/pages/WithdrawPage')))
const GenreSelectionPage = lazy(withChunkReload(() => import('@/pages/GenreSelectionPage')))
const EditProfilePage = lazy(withChunkReload(() => import('@/pages/EditProfilePage')))
const UserProfilePage = lazy(withChunkReload(() => import('@/pages/UserProfilePage')))
const UserLibraryPage = lazy(withChunkReload(() => import('@/pages/UserLibraryPage')))
const FollowListPage = lazy(withChunkReload(() => import('@/pages/FollowListPage')))
import ProtectedRoute from '@/components/layout/ProtectedRoute'
import RouteError from '@/components/common/RouteError'
import RootLayout from '@/components/layout/RootLayout'

const appRoutes = [
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <HomeFeedPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/onboarding',
    element: (
      <ProtectedRoute>
        <OnboardingPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/signup',
    element: <SignupPage />,
  },
  {
    path: '/auth/callback/google',
    element: <AuthCallbackPage />,
  },
  {
    path: '/password-reset-request',
    element: <PasswordResetRequestPage />,
  },
  {
    path: '/password-reset',
    element: <PasswordResetPage />,
  },
  {
    path: '/verify-email',
    element: <EmailVerificationPage />,
  },
  {
    path: '/onboarding/genre',
    element: (
      <ProtectedRoute>
        <GenreSelectionPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/search',
    element: (
      <ProtectedRoute>
        <BookSearchPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/book/:bookId',
    element: (
      <ProtectedRoute>
        <BookDetailPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/book/:bookId/reviews',
    element: (
      <ProtectedRoute>
        <BookReviewsListPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/book/:bookId/memo',
    element: (
      <ProtectedRoute>
        <MemoWritePage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/book/:bookId/memo/:memoId',
    element: (
      <ProtectedRoute>
        <MemoWritePage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/review/write',
    element: (
      <ProtectedRoute>
        <WriteReviewPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/review/write/:bookId',
    element: (
      <ProtectedRoute>
        <WriteReviewPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/review/:id',
    element: (
      <ProtectedRoute>
        <ReviewDetailPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/review/:reviewId/edit',
    element: (
      <ProtectedRoute>
        <WriteReviewPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/drafts',
    element: (
      <ProtectedRoute>
        <DraftsListPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/profile',
    element: (
      <ProtectedRoute>
        <MyProfilePage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/user/:userId',
    element: (
      <ProtectedRoute>
        <UserProfilePage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/user/:userId/library',
    element: (
      <ProtectedRoute>
        <UserLibraryPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/user/:userId/follows',
    element: (
      <ProtectedRoute>
        <FollowListPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/library',
    element: (
      <ProtectedRoute>
        <MyLibraryPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/library/day/:date',
    element: (
      <ProtectedRoute>
        <ReadingDayPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/notifications',
    element: (
      <ProtectedRoute>
        <NotificationsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/settings',
    element: (
      <ProtectedRoute>
        <SettingsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/settings/profile',
    element: (
      <ProtectedRoute>
        <EditProfilePage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/settings/genres',
    element: (
      <ProtectedRoute>
        <GenreSelectionPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/settings/blocked',
    element: (
      <ProtectedRoute>
        <BlockedUsersPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/settings/password',
    element: (
      <ProtectedRoute>
        <PasswordChangePage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/settings/withdraw',
    element: (
      <ProtectedRoute>
        <WithdrawPage />
      </ProtectedRoute>
    ),
  },
  // 미매칭 경로 catch-all: RouteError의 is404 분기가 404를 처리함
  { path: '*', element: <RouteError /> },
]

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: appRoutes,
  },
])
