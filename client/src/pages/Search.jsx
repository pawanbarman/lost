import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Search as SearchIcon, Filter, MapPin, Calendar } from 'lucide-react';

const Search = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    q: searchParams.get('q') || '',
    type: searchParams.get('type') || '',
    category: searchParams.get('category') || '',
    location: searchParams.get('location') || '',
    status: searchParams.get('status') || '',
    sort: searchParams.get('sort') || ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    fetchCategories();
    fetchReports();
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchReports();
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [filters]);

  const fetchCategories = async () => {
    try {
      const response = await api.get('/categories');
      setCategories(response.data);
    } catch (error) {
      console.error('Failed to fetch categories');
    }
  };

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.q) params.append('q', filters.q);
      if (filters.type) params.append('type', filters.type);
      if (filters.category) params.append('category', filters.category);
      if (filters.location) params.append('location', filters.location);
      if (filters.status) params.append('status', filters.status);
      if (filters.sort) params.append('sort', filters.sort);

      const response = await api.get(`/search?${params.toString()}`);
      setReports(response.data);
    } catch (error) {
      console.error('Failed to fetch reports');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters({ ...filters, [key]: value });
    setSearchParams({ ...filters, [key]: value });
  };

  const getStatusColor = (status) => {
    const colors = {
      LOST: 'bg-red-500/20 text-red-300',
      FOUND: 'bg-green-500/20 text-green-300',
      POSSIBLE_MATCH: 'bg-yellow-500/20 text-yellow-300',
      UNDER_VERIFICATION: 'bg-orange-500/20 text-orange-300',
      CLAIMED: 'bg-purple-500/20 text-purple-300',
      RETURNED: 'bg-green-500/20 text-green-300',
      CLOSED: 'bg-white/10 text-gray-300'
    };
    return colors[status] || 'bg-white/10 text-gray-300';
  };

  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Search Lost & Found Items</h1>
        <p className="mt-2 text-gray-400">
          Search through reported lost and found items
        </p>
      </div>

      {/* Search Bar */}
      <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-6 rounded-lg mb-6">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, description, or location..."
              value={filters.q}
              onChange={(e) => handleFilterChange('q', e.target.value)}
              className="w-full pl-10 pr-3 py-2 border rounded-md focus:ring-sky-500 focus:border-sky-500"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-4 py-2 border border-white/10 rounded-md flex items-center hover:bg-white/5 text-gray-300 hover:text-white"
          >
            <Filter className="h-5 w-5 mr-2" />
            Filters
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 grid md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Type</label>
              <select
                value={filters.type}
                onChange={(e) => handleFilterChange('type', e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:ring-sky-500 focus:border-sky-500"
              >
                <option value="">All Types</option>
                <option value="LOST">Lost</option>
                <option value="FOUND">Found</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Category</label>
              <select
                value={filters.category}
                onChange={(e) => handleFilterChange('category', e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:ring-sky-500 focus:border-sky-500"
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:ring-sky-500 focus:border-sky-500"
              >
                <option value="">All Statuses</option>
                <option value="LOST">Lost</option>
                <option value="FOUND">Found</option>
                <option value="POSSIBLE_MATCH">Possible Match</option>
                <option value="CLAIMED">Claimed</option>
                <option value="RETURNED">Returned</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Location</label>
              <input
                type="text"
                value={filters.location}
                onChange={(e) => handleFilterChange('location', e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:ring-sky-500 focus:border-sky-500"
                placeholder="Filter by location"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Sort By</label>
              <select
                value={filters.sort}
                onChange={(e) => handleFilterChange('sort', e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:ring-sky-500 focus:border-sky-500"
              >
                <option value="">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="date_desc">Most Recent Event</option>
                <option value="date_asc">Least Recent Event</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400 mx-auto"></div>
          <p className="mt-4 text-gray-400">Searching...</p>
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12 bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg">
          <SearchIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No results found</h3>
          <p className="text-gray-400">
            Try adjusting your search terms or filters
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reports.map((report) => (
            <div key={report.id} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden hover:bg-white/10 transition-colors">
              {report.item.imageUrl && (
                <img
                  src={report.item.imageUrl}
                  alt={report.item.title}
                  className="w-full h-48 object-cover"
                />
              )}
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-semibold text-white">
                    {report.item.title}
                  </h3>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(report.status)}`}>
                    {report.status.replace('_', ' ')}
                  </span>
                </div>
                
                <div className="space-y-2 text-sm text-gray-400">
                  <div className="flex items-center">
                    <span className={`px-2 py-1 text-xs font-medium rounded mr-2 ${report.type === 'LOST' ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'}`}>
                      {report.type}
                    </span>
                    <span className="text-gray-500">{report.item.category}</span>
                  </div>
                  
                  <div className="flex items-center">
                    <MapPin className="h-4 w-4 mr-1" />
                    {report.location}
                  </div>
                  
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-1" />
                    {new Date(report.dateTime).toLocaleDateString()}
                  </div>
                </div>

                <button
                  onClick={() => navigate(`/reports/${report.id}`)}
                  className="mt-4 w-full py-2 px-4 bg-sky-500/20 text-sky-300 rounded-md hover:bg-sky-500/30 border border-sky-400/30 transition-colors"
                >
                  View Details
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Search;
