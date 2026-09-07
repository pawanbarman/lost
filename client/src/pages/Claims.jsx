import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { FileText, CheckCircle, XCircle, Clock, PackageCheck, MapPin, RefreshCcw } from 'lucide-react';

const STATUS_MESSAGES = {
  PENDING: 'Your claim is awaiting admin review.',
  APPROVED: 'Your claim was approved. The item is ready for handover - you can start the handover below.',
  REJECTED: 'Your claim was rejected. If you have more proof, please contact support.',
  UNDER_HANDOVER: 'Handover in progress. Confirm once you have received the item.',
  COMPLETED: 'Handover complete. This item has been successfully recovered.'
};

const Claims = () => {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actingClaimId, setActingClaimId] = useState(null);

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

  const handleHandover = async (claimId, action) => {
    setError('');
    setActingClaimId(claimId);
    try {
      await api.put(`/claims/${claimId}/handover`, { action });
      await fetchClaims();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update handover. Please try again.');
    } finally {
      setActingClaimId(null);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      PENDING: 'bg-yellow-500/20 text-yellow-400',
      APPROVED: 'bg-green-500/20 text-green-400',
      REJECTED: 'bg-red-500/20 text-red-400',
      UNDER_HANDOVER: 'bg-sky-500/20 text-sky-400',
      COMPLETED: 'bg-emerald-500/20 text-emerald-400'
    };
    return colors[status] || 'bg-gray-500/20 text-gray-400';
  };

  const getStatusIcon = (status) => {
    const icons = {
      PENDING: Clock,
      APPROVED: CheckCircle,
      REJECTED: XCircle,
      UNDER_HANDOVER: RefreshCcw,
      COMPLETED: PackageCheck
    };
    return icons[status] || FileText;
  };

  const canManageHandover = (claim) => claim.claimantId === user?.id || user?.role === 'ADMIN';

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
          Track your ownership claims and handovers
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

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
            const pickupLocation = claim.match?.foundReport?.item?.currentLocation;
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

                    <p className="text-sm text-gray-300 mb-4">{STATUS_MESSAGES[claim.status]}</p>

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

                    {pickupLocation && (
                      <div className="bg-sky-500/10 p-4 rounded-lg border border-sky-500/20 mb-4">
                        <h4 className="font-semibold text-sky-400 mb-1 flex items-center">
                          <MapPin className="h-4 w-4 mr-1" />
                          Pickup Location
                        </h4>
                        <p className="text-sm text-gray-300">{pickupLocation}</p>
                      </div>
                    )}

                    <div className="bg-yellow-500/10 p-4 rounded-lg border border-yellow-500/20">
                      <h4 className="font-semibold text-yellow-400 mb-2">Verification Details Provided</h4>
                      <p className="text-sm text-gray-300">{claim.verificationDetails}</p>
                    </div>

                    {claim.handoverStartedAt && (
                      <p className="text-xs text-gray-400 mt-3">
                        Handover started: {new Date(claim.handoverStartedAt).toLocaleString()}
                      </p>
                    )}
                    {claim.handoverCompletedAt && (
                      <p className="text-xs text-gray-400">
                        Handover completed: {new Date(claim.handoverCompletedAt).toLocaleString()}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => navigate(`/matches`)}
                      className="px-4 py-2 bg-sky-500/20 text-sky-300 rounded-md hover:bg-sky-500/30 border border-sky-400/30 text-sm"
                    >
                      View Match
                    </button>
                    {claim.status === 'APPROVED' && canManageHandover(claim) && (
                      <button
                        onClick={() => handleHandover(claim.id, 'START')}
                        disabled={actingClaimId === claim.id}
                        className="px-4 py-2 bg-green-500/20 text-green-300 rounded-md hover:bg-green-500/30 border border-green-400/30 text-sm disabled:opacity-50"
                      >
                        Start Handover
                      </button>
                    )}
                    {claim.status === 'UNDER_HANDOVER' && canManageHandover(claim) && (
                      <button
                        onClick={() => handleHandover(claim.id, 'COMPLETE')}
                        disabled={actingClaimId === claim.id}
                        className="px-4 py-2 bg-emerald-500/20 text-emerald-300 rounded-md hover:bg-emerald-500/30 border border-emerald-400/30 text-sm disabled:opacity-50"
                      >
                        Confirm Handover
                      </button>
                    )}
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