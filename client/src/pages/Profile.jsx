import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, Mail, Phone, MapPin, Calendar } from 'lucide-react';

const Profile = () => {
  const { user, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);

  if (!isAuthenticated) {
    return (
      <div className="max-w-7xl mx-auto py-12 px-4 text-center">
        <p className="text-gray-400">Please login to view your profile</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center">
          <User className="h-8 w-8 text-sky-400 mr-3" />
          My Profile
        </h1>
        <p className="mt-2 text-gray-400">
          View your account information
        </p>
      </div>

      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg p-6">
        <div className="flex items-center gap-6 mb-6">
          <div className="w-24 h-24 bg-sky-500/20 rounded-full flex items-center justify-center">
            <User className="h-12 w-12 text-sky-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">{user?.name}</h2>
            <span className={`inline-block px-3 py-1 text-sm font-medium rounded-full ${
              user?.role === 'ADMIN' ? 'bg-sky-500/20 text-sky-300' : 'bg-gray-500/20 text-gray-400'
            }`}>
              {user?.role}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4 p-4 bg-white/5 rounded-lg">
            <Mail className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-sm text-gray-400">Email</p>
              <p className="font-medium text-white">{user?.email}</p>
            </div>
          </div>

          {user?.phone && (
            <div className="flex items-center gap-4 p-4 bg-white/5 rounded-lg">
              <Phone className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-400">Phone</p>
                <p className="font-medium text-white">{user.phone}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 p-4 bg-white/5 rounded-lg">
            <Calendar className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-sm text-gray-400">Member Since</p>
              <p className="font-medium text-white">
                {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-white/10">
          <p className="text-sm text-gray-400">
            Account ID: {user?.id}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Profile;
