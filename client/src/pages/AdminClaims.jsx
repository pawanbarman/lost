import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { FileText, CheckCircle, XCircle, Clock } from 'lucide-react';

const AdminClaims = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      navigate('/');
      return;
    }
    fetchClaims();
  }, [isAuthenticated, isAdmin, navigate]);

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

  const updateClaimStatus = async (claimId, status) => {
    try {
      await api.put(`/claims/${claimId}/status`, { status, adminNotes });
      setClaims(claims.map(c => 
        c.id === claimId ? { ...c, status, adminNotes } : c
      ));
      setSelectedClaim(null);
      setAdminNotes('');
    } catch (error) {
      console.error('Failed to update claim');
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

  if (!isAuthenticated || !isAdmin) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center">
          <FileText className="h-8 w-8 text-sky-400 mr-3" />
          Claims Management
        </h1>
        <p className="mt-2 text-gray-400">
          Review and verify ownership claims
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400 mx-auto"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {claims.map((claim) => (
            <div key={claim.id} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-4">
                    <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(claim.status)}`}>
                      {claim.status.replace('_', ' ')}
                    </span>
                    <span className="text-sm text-gray-400">
                      Claimed by {claim.claimant.name} ({claim.claimant.email})
                    </span>
                    <span className="text-sm text-gray-400">
                      on {new Date(claim.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4 mb-4">
                    <div className="bg-red-500/10 p-4 rounded-lg border border-red-500/20">
                      <h4 className="font-semibold text-red-400 mb-2">Lost Item</h4>
                      <p className="font-medium text-white">{claim.match.lostReport.item.title}</p>
                      <p className="text-sm text-gray-400">{claim.match.lostReport.item.category}</p>
                      <p className="text-sm text-gray-400 mt-1">
                        Reported by: {claim.match.lostReport.user.name}
                      </p>
                    </div>
                    <div className="bg-green-500/10 p-4 rounded-lg border border-green-500/20">
                      <h4 className="font-semibold text-green-400 mb-2">Found Item</h4>
                      <p className="font-medium text-white">{claim.match.foundReport.item.title}</p>
                      <p className="text-sm text-gray-400">{claim.match.foundReport.item.category}</p>
                      <p className="text-sm text-gray-400 mt-1">
                        Found by: {claim.match.foundReport.user.name}
                      </p>
                    </div>
                  </div>

                  <div className="bg-yellow-500/10 p-4 rounded-lg border border-yellow-500/20 mb-4">
                    <h4 className="font-semibold text-yellow-400 mb-2">Verification Details</h4>
                    <p className="text-sm text-gray-300">{claim.verificationDetails}</p>
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-sm font-medium text-gray-300">Match Score:</span>
                    <span className="text-lg font-bold text-sky-400">{claim.match.score}%</span>
                  </div>

                  {claim.adminNotes && (
                    <div className="bg-sky-500/10 p-3 rounded-lg border border-sky-500/20">
                      <p className="text-sm text-gray-300">
                        <span className="font-medium">Admin Notes:</span> {claim.adminNotes}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 min-w-[200px]">
                  {claim.status === 'PENDING' && (
                    <>
                      <button
                        onClick={() => setSelectedClaim(claim.id)}
                        className="px-4 py-2 bg-green-500/20 text-green-300 rounded-md hover:bg-green-500/30 border border-green-400/30 flex items-center justify-center"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Approve
                      </button>
                      <button
                        onClick={() => updateClaimStatus(claim.id, 'REJECTED')}
                        className="px-4 py-2 bg-red-500/20 text-red-300 rounded-md hover:bg-red-500/30 border border-red-400/30 flex items-center justify-center"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Reject
                      </button>
                    </>
                  )}
                  {claim.status === 'APPROVED' && (
                    <button
                      onClick={() => updateClaimStatus(claim.id, 'UNDER_HANDOVER')}
                      className="px-4 py-2 bg-sky-500/20 text-sky-300 rounded-md hover:bg-sky-500/30 border border-sky-400/30"
                    >
                      Mark as Handover
                    </button>
                  )}
                </div>
              </div>

              {selectedClaim === claim.id && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Admin Notes (Optional)
                  </label>
                  <textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border rounded-md focus:ring-sky-500 focus:border-sky-500"
                    placeholder="Add notes for this approval..."
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => updateClaimStatus(claim.id, 'APPROVED')}
                      className="px-4 py-2 bg-green-500/20 text-green-300 rounded-md hover:bg-green-500/30 border border-green-400/30"
                    >
                      Confirm Approve
                    </button>
                    <button
                      onClick={() => {
                        setSelectedClaim(null);
                        setAdminNotes('');
                      }}
                      className="px-4 py-2 bg-white/10 text-gray-300 rounded-md hover:bg-white/20 border border-white/10"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminClaims;
