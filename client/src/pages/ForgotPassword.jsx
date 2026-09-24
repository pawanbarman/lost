import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { KeyRound } from 'lucide-react';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetData, setResetData] = useState(null);
  const { forgotPassword } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await forgotPassword(email);
      // The reset token is returned in the response — there is no email transport in
      // this stack yet, so the token is the deliverable. In production this response is
      // replaced by a real emailed link (see the phase-5 email seam in the README).
      setResetData(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (resetData) {
    return (
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          <div className="text-center">
            <div className="bg-sky-500/20 border border-sky-400/30 p-3 rounded-full inline-block mb-4">
              <KeyRound className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-white">Check your inbox</h2>
            <p className="mt-2 text-gray-400">
              If that email is registered, a one-time reset token has been issued.
            </p>
          </div>

          <div className="mt-8">
            <Link
              to={`/reset-password?token=${encodeURIComponent(resetData.resetToken ?? '')}`}
              className="inline-flex justify-center w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-sky-950 bg-sky-400 hover:bg-sky-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500"
            >
              Continue to reset
            </Link>
          </div>

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              In production this token would be emailed to you. Without email transport in
              this stack, the deliverable is surfaced as a raw token for development and
              integration testing. Forgot it?{' '}
              <Link to="/forgot-password" className="text-sky-400 hover:text-sky-300">
                Start over
              </Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="bg-sky-500/20 border border-sky-400/30 p-3 rounded-full inline-block mb-4">
            <KeyRound className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white">Forgot your password?</h2>
          <p className="mt-2 text-gray-400">
            Enter the email you used to register and we'll issue a one-time reset token.
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300">
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500"
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-3 px-4 border border-sky-400/30 rounded-md shadow-sm text-sm font-medium text-sky-300 bg-sky-500/20 hover:bg-sky-500/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Sending...' : 'Send reset link'}
          </button>

          <div className="text-center">
            <p className="text-sm text-gray-400">
              Remembered it?{' '}
              <Link to="/login" className="font-medium text-sky-400 hover:text-sky-300">
                Back to sign in
              </Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ForgotPassword;
