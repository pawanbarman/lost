import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Block rendering of a private route until we know who, if anyone, is signed in.
 *
 * `AuthContext.loading` is the important part. On a hard refresh the provider
 * starts with `loading = true` and only finishes after `/auth/me` resolves, so a
 * guard that ignores it would treat a genuinely signed-in user as logged out and
 * redirect them to /login before the token check completed. That is the flash this
 * component exists to prevent.
 *
 * The original location is stashed in router state so the login page can send the
 * user back where they were headed instead of dumping them on the home page.
 */
export const RequireAuth = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return <RouteLoading />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
};

/**
 * Admin-only guard. Layered *inside* RequireAuth so a logged-out visitor hitting
 * /admin is bounced to /login rather than being told "admin only" before we even
 * know who they are.
 *
 * This is UX, not security: a non-admin can always hit the admin API routes by
 * hand. Enforcing role belongs in the edge function, which does check it.
 */
export const RequireAdmin = ({ children }) => {
  const { isAdmin, loading } = useAuth();

  if (loading) return <RouteLoading />;

  if (!isAdmin) return <Navigate to="/" replace />;

  return children;
};

/** Keeps the layout from collapsing while auth state is still resolving. */
const RouteLoading = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div
      className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-400"
      role="status"
      aria-label="Loading"
    />
  </div>
);

export default RequireAuth;