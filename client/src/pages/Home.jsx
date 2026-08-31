import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, MapPin, Shield, Clock, CheckCircle, Users, ArrowRight, Zap } from 'lucide-react';
import api from '../utils/api';

const Home = () => {
  const [stats, setStats] = useState({ users: 0, reports: 0, matches: 0, returned: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [reportsRes, categoriesRes] = await Promise.all([
          api.get('/reports'),
          api.get('/categories')
        ]);
        const reports = reportsRes.data;
        const matched = reports.filter(r => r.status === 'POSSIBLE_MATCH').length;
        const returned = reports.filter(r => r.status === 'RETURNED').length;
        setStats({ reports: reports.length, matches: matched, returned });
      } catch (e) {
        // Use defaults
      }
    };
    fetchStats();
  }, []);
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6 text-white tracking-tight">
              Lost Something? Found Something?
            </h1>
            <p className="text-xl md:text-2xl mb-4 text-sky-300">
              Let's Return It.
            </p>
            <p className="text-lg mb-12 text-gray-400 max-w-2xl mx-auto">
              One simple platform to report, find, match and safely return lost belongings.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/report/lost"
                className="px-8 py-4 bg-sky-500/20 text-sky-300 rounded-lg font-semibold hover:bg-sky-500/30 border border-sky-400/30 transition-all flex items-center justify-center backdrop-blur-sm"
              >
                I Lost Something
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
              <Link
                to="/report/found"
                className="px-8 py-4 bg-white/10 text-white rounded-lg font-semibold hover:bg-white/15 border border-white/15 transition-all flex items-center justify-center backdrop-blur-sm"
              >
                I Found Something
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </div>

            <div className="mt-8">
              <Link
                to="/search"
                className="inline-flex items-center text-gray-400 hover:text-sky-300 transition-colors"
              >
                <Search className="h-5 w-5 mr-2" />
                Search Items
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12 text-white">
            How It Works
          </h2>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              { icon: Search, title: 'Report', description: 'Report lost or found items with details and photos' },
              { icon: MapPin, title: 'Match', description: 'Our smart system finds possible matches automatically' },
              { icon: Shield, title: 'Verify', description: 'Secure verification process to confirm ownership' },
              { icon: CheckCircle, title: 'Return', description: 'Safe handover and item recovery' }
            ].map((step, index) => (
              <div key={index} className="text-center">
                <div className="bg-sky-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-sky-400/20">
                  <step.icon className="h-8 w-8 text-sky-400" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-white">{step.title}</h3>
                <p className="text-gray-400">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center mb-12 text-white">
            Features
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Search, title: 'Smart Matching', description: 'Automatic matching based on category, location, and description' },
              { icon: Shield, title: 'Secure Verification', description: 'Private verification details to protect ownership' },
              { icon: Clock, title: 'Real-time Updates', description: 'Get notified instantly about matches and claims' },
              { icon: Users, title: 'Multi-Organization', description: 'Works for colleges, offices, events, and public places' },
              { icon: MapPin, title: 'Location-based', description: 'Filter and search by specific locations' },
              { icon: CheckCircle, title: 'Easy Claims', description: 'Simple claim process with admin verification' }
            ].map((feature, index) => (
              <div key={index} className="bg-white/5 backdrop-blur-sm p-6 rounded-lg border border-white/10 hover:bg-white/8 transition-colors">
                <feature.icon className="h-8 w-8 text-sky-400 mb-4" />
                <h3 className="text-xl font-semibold mb-2 text-white">{feature.title}</h3>
                <p className="text-gray-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { label: 'Items Reported', value: stats.reports, icon: Search },
              { label: 'Smart Matches', value: stats.matches, icon: Zap },
              { label: 'Items Returned', value: stats.returned, icon: CheckCircle },
              { label: 'Categories', value: 9, icon: Shield }
            ].map((stat, i) => (
              <div key={i} className="bg-white/5 backdrop-blur-sm p-6 rounded-lg border border-white/10 text-center">
                <stat.icon className="h-8 w-8 text-sky-400 mx-auto mb-3" />
                <p className="text-3xl font-bold text-white">{stat.value}+</p>
                <p className="text-sm text-gray-400 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-12">
            <h2 className="text-3xl font-bold mb-6 text-white">
              Ready to Get Started?
            </h2>
            <p className="text-xl mb-8 text-gray-400">
              Join thousands of users who have successfully recovered their lost items.
            </p>
            <Link
              to="/register"
              className="inline-block px-8 py-4 bg-sky-500/20 text-sky-300 rounded-lg font-semibold hover:bg-sky-500/30 border border-sky-400/30 transition-all"
            >
              Create Free Account
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-xl font-bold mb-4 text-white">LeftBehind</h3>
              <p className="text-gray-400">
                Universal Lost & Found platform for everyone.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-white">Quick Links</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link to="/" className="hover:text-sky-300 transition-colors">Home</Link></li>
                <li><Link to="/search" className="hover:text-sky-300 transition-colors">Search</Link></li>
                <li><Link to="/report/lost" className="hover:text-sky-300 transition-colors">Report Lost</Link></li>
                <li><Link to="/report/found" className="hover:text-sky-300 transition-colors">Report Found</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-white">Support</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link to="/about" className="hover:text-sky-300 transition-colors">About</Link></li>
                <li><Link to="/contact" className="hover:text-sky-300 transition-colors">Contact</Link></li>
                <li><Link to="/privacy" className="hover:text-sky-300 transition-colors">Privacy</Link></li>
                <li><Link to="/terms" className="hover:text-sky-300 transition-colors">Terms</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-white">For Organizations</h4>
              <p className="text-gray-400 mb-2">
                Colleges, offices, events, and public places can use LeftBehind.
              </p>
              <Link to="/contact" className="text-sky-400 hover:text-sky-300 transition-colors">
                Contact us for setup
              </Link>
            </div>
          </div>
          <div className="border-t border-white/5 mt-8 pt-8 text-center text-gray-500">
            <p>&copy; 2026 LeftBehind. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
