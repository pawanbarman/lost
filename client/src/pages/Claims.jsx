import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { FileText, CheckCircle, XCircle, Clock } from 'lucide-react';

const Claims = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchClaims();
  }, [isAuthenticated]);

  const fetchClaims = async () => {
    try {
      const response = await api.get('/claims');
      setClaims(response.data);
    } catch (error) {
      console.error('Failed to fetch claims');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      PENDING: 'bg-yellow-500/20 text-yellow-400',
      APPROVED: 'bg-green-500/20 text-green-400',
      REJECTED: 'bg-red-500/20 text-red-400',
      UNDER_HANDOVER: 'bg-sky-500/20 text-sky-400'
    };
    return colors[status] || 'bg-gray-500/20 text-gray-400';
  };

  const getStatusIcon = (status) => {
    const icons = {
      PENDING: Clock,
      APPROVED: CheckCircle,
      REJECTED: XCircle,
      UNDER_HANDOVER: FileText
    };
    return icons[status] || FileText;
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-7xl mx-auto py-12 px-4 text-center">
        <p className="text-gray-400">Please login to view claims</p>
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
          <FileText className="h-8 w-8 text-sky-400 mr-3" />
          My Claims
        </h1>
        <p className="mt-2 text-gray-400">
          Track your ownership claims
        </p>
      </div>

      {claims.length === 0 ? (
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-12 text-center">
          <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No claims yet</h3>
          <p className="text-gray-400">
            When you find a match, you can submit a claim to verify ownership.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {claims.map((claim) => {
            const StatusIcon = getStatusIcon(claim.status);
            return (
              <div key={claim.id} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(claim.status)}`}>
                        <StatusIcon className="h-4 w-4 inline mr-1" />
                        {claim.status.replace('_', ' ')}
                      </span>
                      <span className="text-sm text-gray-400">
                        Claimed on {new Date(claim.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4 mb-4">
                      <div className="bg-red-500/10 p-4 rounded-lg border border-red-500/20">
                        <h4 className="font-semibold text-red-400 mb-2">Lost Item</h4>
                        <p className="font-medium text-white">{claim.match.lostReport.item.title}</p>
                        <p className="text-sm text-gray-400">{claim.match.lostReport.item.category}</p>
                      </div>
                      <div className="bg-green-500/10 p-4 rounded-lg border border-green-500/20">
                        <h4 className="font-semibold text-green-400 mb-2">Found Item</h4>
                        <p className="font-medium text-white">{claim.match.foundReport.item.title}</p>
                        <p className="text-sm text-gray-400">{claim.match.foundReport.item.category}</p>
                      </div>
                    </div>

                    <div className="bg-yellow-500/10 p-4 rounded-lg border border-yellow-500/20">
                      <h4 className="font-semibold text-yellow-400 mb-2">Verification Details Provided</h4>
                      <p className="text-sm text-gray-300">{claim.verificationDetails}</p>
                    </div>

                    {claim.adminNotes && (
                      <div className="mt-4 bg-sky-500/10 p-4 rounded-lg border border-sky-500/20">
                        <h4 className="font-semibold text-sky-400 mb-2">Admin Notes</h4>
                        <p className="text-sm text-gray-300">{claim.adminNotes}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => navigate(`/matches`)}
                      className="px-4 py-2 bg-sky-500/20 text-sky-300 rounded-md hover:bg-sky-500/30 border border-sky-400/30 text-sm"
                    >
                      View Match
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Claims;
