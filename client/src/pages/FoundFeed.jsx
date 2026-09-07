import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { Search as SearchIcon, Filter, MapPin, Calendar, Package } from 'lucide-react';

const FoundFeed = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({
    q: '',
    category: '',
    color: '',
    brand: '',
    location: '',
    dateFrom: '',
    dateTo: '',
    sort: 'newest'
  });

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchCategories();
    fetchFeed(1);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const timeoutId = setTimeout(() => {
      fetchFeed(1);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [filters, isAuthenticated]);

  const fetchCategories = async () => {
    try {
      const response = await api.get('/categories');
      setCategories(response.data);
    } catch (error) {
      console.error('Failed to fetch categories');
    }
  };

  const fetchFeed = async (page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.q) params.append('q', filters.q);
      if (filters.category) params.append('category', filters.category);
      if (filters.color) params.append('color', filters.color);
      if (filters.brand) params.append('brand', filters.brand);
      if (filters.location) params.append('location', filters.location);
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);
      if (filters.sort) params.append('sort', filters.sort);
      params.append('page', page);
      params.append('limit', pagination.limit);

      const response = await api.get(`/found-feed?${params.toString()}`);
      setReports(response.data.reports);
      setPagination(response.data.pagination);
    } catch (error) {
      console.error('Failed to fetch found items');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    setFilters({
      q: '',
      category: '',
      color: '',
      brand: '',
      location: '',
      dateFrom: '',
      dateTo: '',
      sort: 'newest'
    });
  };

  const getStatusColor = (status) => {
    const colors = {
      FOUND: 'bg-green-500/20 text-green-300',
      POSSIBLE_MATCH: 'bg-yellow-500/20 text-yellow-300',
      UNDER_VERIFICATION: 'bg-orange-500/20 text-orange-300',
      CLAIMED: 'bg-purple-500/20 text-purple-300',
      RETURNED: 'bg-green-500/20 text-green-300',
      CLOSED: 'bg-white/10 text-gray-300'
    };
    return colors[status] || 'bg-white/10 text-gray-300';
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-7xl mx-auto py-12 px-4 text-center">
        <p className="text-gray-400">Please login to browse found items</p>
      </div>
    );
  }

  const hasActiveFilters = Object.entries(filters).some(([key, value]) => key !== 'sort' && value);

  return (
    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white flex items-center">
          <Package className="h-8 w-8 text-green-400 mr-3" />
          Found Feed
        </h1>
        <p className="mt-2 text-gray-400">
          Browse items found in your community
        </p>
      </div>

      {/* Search & Filters */}
      <div className="bg-white/5 backdrop-blur-sm border border-white/10 p-6 rounded-lg mb-6">
        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
          <div className="relative lg:col-span-2">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, brand, color, location..."
              value={filters.q}
              onChange={(e) => handleFilterChange('q', e.target.value)}
              className="w-full pl-10 pr-3 py-2 border rounded-md focus:ring-sky-500 focus:border-sky-500"
            />
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
            <label className="block text-sm font-medium text-gray-300 mb-1">Color</label>
            <input
              type="text"
              placeholder="e.g., Black"
              value={filters.color}
              onChange={(e) => handleFilterChange('color', e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:ring-sky-500 focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Brand</label>
            <input
              type="text"
              placeholder="e.g., Nike"
              value={filters.brand}
              onChange={(e) => handleFilterChange('brand', e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:ring-sky-500 focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Location</label>
            <input
              type="text"
              placeholder="Filter by location"
              value={filters.location}
              onChange={(e) => handleFilterChange('location', e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:ring-sky-500 focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Found From</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:ring-sky-500 focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Found To</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:ring-sky-500 focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Sort By</label>
            <select
              value={filters.sort}
              onChange={(e) => handleFilterChange('sort', e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:ring-sky-500 focus:border-sky-500"
            >
              <option value="newest">Newest Found First</option>
              <option value="oldest">Oldest Found First</option>
            </select>
          </div>

          <div className="flex items-end">
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-4 py-2 border border-white/10 rounded-md text-sm text-gray-300 hover:bg-white/5 hover:text-white"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading...</p>
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12 bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg">
          <SearchIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No found items</h3>
          <p className="text-gray-400">
            Try adjusting your search terms or filters
          </p>
        </div>
      ) : (
        <>
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
                      <span className="px-2 py-1 text-xs font-medium rounded mr-2 bg-green-500/20 text-green-300">
                        FOUND
                      </span>
                      <span className="text-gray-500">{report.item.category}</span>
                    </div>

                    {(report.item.color || report.item.brand) && (
                      <div className="text-gray-400">
                        {[report.item.color, report.item.brand].filter(Boolean).join(' · ')}
                      </div>
                    )}

                    {report.community?.name && (
                      <div className="text-xs text-gray-500">Community: {report.community.name}</div>
                    )}

                    <div className="flex items-center">
                      <MapPin className="h-4 w-4 mr-1" />
                      {report.location}
                    </div>

                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 mr-1" />
                      Found {new Date(report.dateTime).toLocaleDateString()}
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

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-6">
              <button
                onClick={() => fetchFeed(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="px-4 py-2 bg-sky-500/20 text-sky-300 rounded-md hover:bg-sky-500/30 border border-sky-400/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => fetchFeed(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="px-4 py-2 bg-sky-500/20 text-sky-300 rounded-md hover:bg-sky-500/30 border border-sky-400/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
              <span className="text-sm text-gray-400">
                Page {pagination.page} of {pagination.totalPages} · {pagination.total} items
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FoundFeed;