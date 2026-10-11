import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Role } from '../types';
import { authService } from '../services/erpService';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('erp_token'));
  const [isLoading, setIsLoading] = useState(true);

  const fetchCurrentUser = async () => {
    if (!token) return;
    try {
      const userData = await authService.me();
      setUser(userData);
    } catch (error) {
      console.warn('Session inactive or expired. Clearing token.');
      logout();
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        await fetchCurrentUser();
      }
      setIsLoading(false);
    };
    initAuth();
  }, [token]);

  const login = (newToken: string, userData: User) => {
    localStorage.setItem('erp_token', newToken);
    setToken(newToken);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('erp_token');
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    await fetchCurrentUser();
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, refreshUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
