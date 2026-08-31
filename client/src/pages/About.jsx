import React from 'react';
import { Link } from 'react-router-dom';
import { Search, Shield, Users, Heart, ArrowLeft } from 'lucide-react';

const About = () => {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <button onClick={() => window.history.back()} className="flex items-center text-gray-400 hover:text-white mb-6">
        <ArrowLeft className="h-5 w-5 mr-2" /> Back
      </button>

      <div className="mb-12">
        <h1 className="text-4xl font-bold text-white mb-4">About LeftBehind</h1>
        <p className="text-xl text-sky-300">Lost something? Found something? We help connect the right person with the right item.</p>
      </div>

      <div className="space-y-12">
        <section>
          <h2 className="text-2xl font-bold text-white mb-4">The Problem</h2>
          <p className="text-gray-300 leading-relaxed">
            Every day, thousands of items are lost across campuses, offices, events, and public spaces.
            The traditional lost-and-found system is broken: items pile up in lost-and-found offices,
            owners never know their item was found, and finders have no easy way to return items.
            The result? Lost valuables go unclaimed, and people suffer unnecessary losses.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">Our Solution</h2>
          <p className="text-gray-300 leading-relaxed">
            LeftBehind is a universal Lost & Found platform that uses smart matching to automatically
            connect lost items with found items. When someone reports a lost item, our algorithm scans
            all found items and surfaces possible matches — ranked by confidence score. No more waiting,
            no more missed connections.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-6">Core Features</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              { icon: Search, title: 'Smart Matching', desc: 'Automatic weighted matching based on category, keywords, description, location, and time.' },
              { icon: Shield, title: 'Ownership Verification', desc: 'Private verification details that only the genuine owner would know, protecting both parties.' },
              { icon: Heart, title: 'Match Scoring', desc: 'Transparent match scores (0-100%) so users can evaluate confidence before claiming.' },
              { icon: Users, title: 'Multi-Organization', desc: 'Works for colleges, offices, events, and public spaces with event-based reporting.' }
            ].map((f, i) => (
              <div key={i} className="bg-white/5 p-6 rounded-lg border border-white/10">
                <f.icon className="h-8 w-8 text-sky-400 mb-3" />
                <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-gray-400 text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-4">Our Mission</h2>
          <p className="text-gray-300 leading-relaxed">
            To make lost item recovery effortless, secure, and universal. We believe no valuable should
            stay lost when technology can bridge the gap between the person who lost it and the person
            who found it.
          </p>
        </section>

        <section className="text-center py-8 bg-white/5 rounded-lg border border-white/10">
          <h2 className="text-2xl font-bold text-white mb-4">Ready to Try LeftBehind?</h2>
          <p className="text-gray-400 mb-6">Join our community and never lose anything again.</p>
          <div className="flex gap-4 justify-center">
            <Link to="/register" className="px-6 py-3 bg-sky-500/20 text-sky-300 rounded-lg font-semibold hover:bg-sky-500/30 border border-sky-400/30">
              Get Started Free
            </Link>
            <Link to="/search" className="px-6 py-3 bg-white/10 text-white rounded-lg font-semibold hover:bg-white/15 border border-white/15">
              Browse Items
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
};

export default About;
