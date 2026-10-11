import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/erpService';
import { Lock, User as UserIcon, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const data = await authService.login({ username, password });
      login(data.access_token, {
        id: data.id || 0,
        username,
        full_name: data.full_name,
        role: data.role,
        department: data.department,
        is_active: true,
        created_at: new Date().toISOString()
      });
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="bg-bg2 border border-bg4 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-po rounded-2xl mx-auto mb-6 flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-po/20">
              E
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2 text-text">Welcome Back</h1>
            <p className="text-text2 font-bold text-xs uppercase tracking-wide">Production ERP v2.0</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-reject/10 border border-reject/20 text-reject text-sm p-4 rounded-lg">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-text2 uppercase tracking-wide ml-1">Username</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text2" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-bg3 border border-bg4 rounded-xl py-3 pl-11 pr-4 text-text focus:outline-none focus:border-po transition-colors"
                  placeholder="Enter your username"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-text2 uppercase tracking-wide ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text2" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-bg3 border border-bg4 rounded-xl py-3 pl-11 pr-4 text-text focus:outline-none focus:border-po transition-colors"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-po hover:bg-orange-600 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-po/30 flex items-center justify-center gap-2 disabled:opacity-50 uppercase tracking-wide text-sm"
            >
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In to System'}
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-bg4 text-center">
            <p className="text-text2 text-xs font-bold uppercase tracking-wide">
              SECURE ACCESS ONLY • AUTHORIZED PERSONNEL
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
