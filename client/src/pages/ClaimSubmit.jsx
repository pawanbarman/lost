import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { FileText, CheckCircle } from 'lucide-react';

const ClaimSubmit = () => {
  const { isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const matchId = searchParams.get('matchId');
  const [match, setMatch] = useState(null);
  const [verificationDetails, setVerificationDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    if (matchId) {
      fetchMatch();
    }
  }, [isAuthenticated, matchId, navigate]);

  const fetchMatch = async () => {
    try {
      const response = await api.get(`/matches/${matchId}`);
      setMatch(response.data);
    } catch (error) {
      console.error('Failed to fetch match');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post('/claims', {
        matchId,
        verificationDetails
      });
      navigate('/claims');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit claim. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  if (!match) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4 text-center">
        <p className="text-gray-400">Loading match details...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center">
          <CheckCircle className="h-8 w-8 text-green-400 mr-3" />
          Submit Ownership Claim
        </h1>
        <p className="mt-2 text-gray-400">
          Provide verification details to claim this item
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="bg-red-500/10 p-4 rounded-lg border border-red-500/20">
          <h4 className="font-semibold text-red-400 mb-2">Lost Item</h4>
          <p className="font-medium text-white">{match.lostReport.item.title}</p>
          <p className="text-sm text-gray-400">{match.lostReport.item.category}</p>
          {match.lostReport.item.imageUrl && (
            <img
              src={match.lostReport.item.imageUrl}
              alt={match.lostReport.item.title}
              className="w-full h-32 object-cover rounded mt-2"
            />
          )}
        </div>
        <div className="bg-green-500/10 p-4 rounded-lg border border-green-500/20">
          <h4 className="font-semibold text-green-400 mb-2">Found Item</h4>
          <p className="font-medium text-white">{match.foundReport.item.title}</p>
          <p className="text-sm text-gray-400">{match.foundReport.item.category}</p>
          {match.foundReport.item.imageUrl && (
            <img
              src={match.foundReport.item.imageUrl}
              alt={match.foundReport.item.title}
              className="w-full h-32 object-cover rounded mt-2"
            />
          )}
        </div>
      </div>

      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-white">Match Score</h3>
          <span className="text-3xl font-bold text-sky-400">{match.score}%</span>
        </div>
        <p className="text-gray-400">
          {match.score >= 90 ? 'Very Strong Match' :
           match.score >= 75 ? 'Strong Match' :
           match.score >= 60 ? 'Possible Match' : 'Low Match'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Verification Details *
          </label>
          <p className="text-sm text-gray-400 mb-3">
            Provide private details that prove you own this item. This information will only be visible to admins for verification.
          </p>
          <textarea
            value={verificationDetails}
            onChange={(e) => setVerificationDetails(e.target.value)}
            required
            rows={5}
            className="w-full px-3 py-2 border rounded-md focus:ring-sky-500 focus:border-sky-500"
            placeholder="e.g., The wallet has a scratch on the back, contains a driver's license with my name, has a blue sticker inside, etc."
          />
        </div>

        <div className="bg-yellow-500/10 p-4 rounded-lg border border-yellow-500/20 mb-6">
          <h4 className="font-semibold text-yellow-400 mb-2 flex items-center">
            <FileText className="h-4 w-4 mr-2" />
            Examples of verification details:
          </h4>
          <ul className="text-sm text-gray-300 space-y-1">
            <li>• Unique marks, scratches, or stickers</li>
            <li>• Specific contents of the item</li>
            <li>• Serial numbers or identifying codes</li>
            <li>• Custom modifications or features</li>
            <li>• Specific colors or patterns</li>
          </ul>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-sky-500/20 text-sky-300 rounded-md font-medium hover:bg-sky-500/30 border border-sky-400/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Submitting...' : 'Submit Claim'}
        </button>
      </form>
    </div>
  );
};

export default ClaimSubmit;
