import React, { createContext, useContext, useState, useEffect } from 'react';
import { settingsService } from '../services/erpService';

interface SystemContextType {
  workingDate: string | null;
  setWorkingDate: (date: string) => Promise<void>;
  setWorkingTime: (timeOrDateTime: string) => Promise<string>;
  refreshWorkingDate: () => Promise<void>;
  isLoading: boolean;
  isInitialStockMode: boolean;
  setIsInitialStockMode: (val: boolean) => void;
}

const SystemContext = createContext<SystemContextType | undefined>(undefined);

export const SystemProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [workingDate, setWorkingDateState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialStockMode, setIsInitialStockModeState] = useState<boolean>(() => {
    return localStorage.getItem('initial_stock_mode') === 'true';
  });

  const setIsInitialStockMode = (val: boolean) => {
    localStorage.setItem('initial_stock_mode', String(val));
    setIsInitialStockModeState(val);
  };

  const refreshWorkingDate = async () => {
    const token = localStorage.getItem('erp_token');
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const data = await settingsService.getWorkingDate();
      setWorkingDateState(data.working_date);
    } catch (error: any) {
      // Don't alert for 401 as it's handled by API interceptor or just means not logged in
      if (!error.message?.includes('Session expired')) {
        console.error('Failed to fetch working date', error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshWorkingDate();
  }, []);

  const setWorkingDate = async (date: string) => {
    await settingsService.setWorkingDate(date);
    setWorkingDateState(date && date.trim() !== '' ? date : null);
  };

  const setWorkingTime = async (timeOrDateTime: string) => {
    const res = await settingsService.setWorkingTime(timeOrDateTime);
    if (res.working_date) {
      setWorkingDateState(res.working_date);
    } else {
      await refreshWorkingDate();
    }
    return res.message;
  };

  return (
    <SystemContext.Provider value={{ workingDate, setWorkingDate, setWorkingTime, refreshWorkingDate, isLoading, isInitialStockMode, setIsInitialStockMode }}>
      {children}
    </SystemContext.Provider>
  );
};

export const useSystem = () => {
  const context = useContext(SystemContext);
  if (context === undefined) {
    throw new Error('useSystem must be used within a SystemProvider');
  }
  return context;
};
