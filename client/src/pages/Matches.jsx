import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Heart, MapPin, Calendar, Percent } from 'lucide-react';

const Matches = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchMatches();
  }, [isAuthenticated]);

  const fetchMatches = async () => {
    try {
      const response = await api.get('/matches');
      setMatches(response.data);
    } catch (error) {
      console.error('Failed to fetch matches');
    } finally {
      setLoading(false);
    }
  };

  const getMatchScoreColor = (score) => {
    if (score >= 90) return 'bg-green-500/20 text-green-400 border border-green-500/30';
    if (score >= 75) return 'bg-sky-500/20 text-sky-400 border border-sky-500/30';
    if (score >= 60) return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30';
    return 'bg-gray-500/20 text-gray-400 border border-gray-500/30';
  };

  const getMatchStrength = (score) => {
    if (score >= 90) return 'Very Strong Match';
    if (score >= 75) return 'Strong Match';
    if (score >= 60) return 'Possible Match';
    return 'Low Match';
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-7xl mx-auto py-12 px-4 text-center">
        <p className="text-gray-400">Please login to view matches</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-12 px-4 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400 mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center">
          <Heart className="h-8 w-8 text-pink-500 mr-3" />
          My Matches
        </h1>
        <p className="mt-2 text-gray-400">
          View possible matches for your reports
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-12 text-center">
          <Heart className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No matches yet</h3>
          <p className="text-gray-400">
            When you submit reports, our system will automatically find possible matches.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {matches.map((match) => (
            <div key={match.id} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`px-4 py-2 rounded-lg ${getMatchScoreColor(match.score)}`}>
                  <div className="flex items-center gap-2">
                    <Percent className="h-5 w-5" />
                    <span className="text-2xl font-bold">{match.score}%</span>
                  </div>
                  <p className="text-sm font-medium mt-1">{getMatchStrength(match.score)}</p>
                </div>
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${
                  match.status === 'PENDING' ? 'bg-yellow-500/20 text-yellow-400' :
                  match.status === 'ACCEPTED' ? 'bg-green-500/20 text-green-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {match.status}
                </span>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Lost Report */}
                <div className="border border-red-500/20 rounded-lg p-4 bg-red-500/10">
                  <h4 className="font-semibold text-red-400 mb-3 flex items-center">
                    <span className="w-3 h-3 bg-red-500 rounded-full mr-2"></span>
                    Lost Report
                  </h4>
                  {match.lostReport.item.imageUrl && (
                    <img
                      src={match.lostReport.item.imageUrl}
                      alt={match.lostReport.item.title}
                      className="w-full h-32 object-cover rounded mb-3"
                    />
                  )}
                  <h5 className="font-medium text-white">{match.lostReport.item.title}</h5>
                  <p className="text-sm text-gray-400 mt-1">{match.lostReport.item.category}</p>
                  <div className="flex items-center mt-2 text-sm text-gray-400">
                    <MapPin className="h-4 w-4 mr-1" />
                    {match.lostReport.location}
                  </div>
                  <div className="flex items-center mt-1 text-sm text-gray-400">
                    <Calendar className="h-4 w-4 mr-1" />
                    {new Date(match.lostReport.dateTime).toLocaleDateString()}
                  </div>
                </div>

                {/* Found Report */}
                <div className="border border-green-500/20 rounded-lg p-4 bg-green-500/10">
                  <h4 className="font-semibold text-green-400 mb-3 flex items-center">
                    <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                    Found Report
                  </h4>
                  {match.foundReport.item.imageUrl && (
                    <img
                      src={match.foundReport.item.imageUrl}
                      alt={match.foundReport.item.title}
                      className="w-full h-32 object-cover rounded mb-3"
                    />
                  )}
                  <h5 className="font-medium text-white">{match.foundReport.item.title}</h5>
                  <p className="text-sm text-gray-400 mt-1">{match.foundReport.item.category}</p>
                  <div className="flex items-center mt-2 text-sm text-gray-400">
                    <MapPin className="h-4 w-4 mr-1" />
                    {match.foundReport.location}
                  </div>
                  <div className="flex items-center mt-1 text-sm text-gray-400">
                    <Calendar className="h-4 w-4 mr-1" />
                    {new Date(match.foundReport.dateTime).toLocaleDateString()}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex gap-4">
                <button
                  onClick={() => navigate(`/claims/new?matchId=${match.id}`)}
                  className="flex-1 py-2 px-4 bg-sky-500/20 text-sky-300 rounded-md hover:bg-sky-500/30 border border-sky-400/30"
                >
                  This is My Item
                </button>
                <button
                  onClick={() => {
                    api.put(`/matches/${match.id}/status`, { status: 'REJECTED' });
                    setMatches(matches.filter(m => m.id !== match.id));
                  }}
                  className="flex-1 py-2 px-4 bg-red-500/10 text-red-400 rounded-md hover:bg-red-500/20 border border-red-500/20"
                >
                  Not My Item
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Matches;
