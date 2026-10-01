import React from 'react';
import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

const NotFound = () => {
  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 text-center">
        <div className="bg-sky-500/20 border border-sky-400/30 p-3 rounded-full inline-block">
          <Compass className="h-8 w-8 text-white" />
        </div>

        <div className="space-y-3">
          <p className="text-sky-400 font-semibold tracking-widest uppercase text-sm">404</p>
          <h1 className="text-3xl font-bold text-white">Page not found</h1>
          <p className="text-slate-300">
            We couldn't find that page. It may have moved, or the link may be
            incorrect.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400 transition-colors"
          >
            Back to home
          </Link>
          <Link
            to="/search"
            className="inline-flex items-center justify-center rounded-md border border-sky-400/30 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500/10 transition-colors"
          >
            Search items
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;