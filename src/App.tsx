import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SystemProvider, useSystem } from './context/SystemContext';
import { ThemeProvider } from './context/ThemeContext';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { Dashboard } from './pages/Dashboard';
import { POPage } from './pages/POPage';
import { CuttingPage } from './pages/CuttingPage';
import { FeedingPage } from './pages/FeedingPage';
import { StitchingPage } from './pages/StitchingPage';
import { FinishingPage } from './pages/FinishingPage';
import { PackingPage } from './pages/PackingPage';
import { StorePage } from './pages/StorePage';
import { DeptStoresPage } from './pages/DeptStoresPage';
import { ShippingPage } from './pages/ShippingPage';
import { FabricPage } from './pages/FabricPage';
import { UsersPage } from './pages/UsersPage';
import { StatusPage } from './pages/StatusPage';
import { ReturnsPage } from './pages/ReturnsPage';
import { DiscardsPage } from './pages/DiscardsPage';
import { MasterOverview } from './pages/MasterOverview';
import { WIPReport } from './pages/WIPReport';
import { CustomDeptsPage } from './pages/CustomDeptsPage';
import { SQADiagnosticsPage } from './pages/SQADiagnosticsPage';
import { OldStockPage } from './pages/OldStockPage';
import { PressPage } from './pages/PressPage';

const AppContent: React.FC = () => {
  const { token, isLoading, user } = useAuth();
  const [activePage, setActivePage] = useState('dashboard');

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-bg flex items-center justify-center">
        <div className="text-text3 font-mono text-sm animate-pulse tracking-[0.2em]">
          INITIALIZING ERP CORE...
        </div>
      </div>
    );
  }

  if (!token) {
    return <LoginPage />;
  }

  const renderPage = () => {
    // Check if user has explicit allowed_pages restriction configured
    if (user && user.role !== 'admin' && user.allowed_pages && Array.isArray(user.allowed_pages) && user.allowed_pages.length > 0) {
      if (!user.allowed_pages.includes(activePage)) {
        const fallbackPage = user.allowed_pages[0] || 'dashboard';
        return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 bg-bg2 rounded-2xl border border-bg4 shadow-sm m-4">
            <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m0 0v2m0-2h2m-2 0H10m3-9a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-text mb-2 uppercase tracking-wide">Access Restricted</h2>
            <p className="text-sm text-text3 max-w-md mb-6">
              You do not have permission to access the requested module (<strong>{activePage}</strong>). Please contact your administrator to grant access.
            </p>
            <button
              onClick={() => setActivePage(fallbackPage)}
              className="px-5 py-2.5 bg-po hover:bg-po/90 text-white rounded-xl font-bold text-sm tracking-wide uppercase shadow-lg shadow-po/10 transition-all cursor-pointer"
            >
              Go To {fallbackPage.toUpperCase()}
            </button>
          </div>
        );
      }
    } else {
      // Restricted pages for viewer fallback
      const restrictedForViewer = ['press', 'old_stock', 'sqa_diagnostics', 'discards'];
      if (user?.role === 'viewer' && restrictedForViewer.includes(activePage)) {
        return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 bg-bg2 rounded-2xl border border-bg4 shadow-sm m-4">
            <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m0 0v2m0-2h2m-2 0H10m3-9a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-text mb-2 uppercase tracking-wide">Access Denied</h2>
            <p className="text-sm text-text3 max-w-sm mb-6">
              Your current account role (Viewer) does not have permission to view this log or store page.
            </p>
            <button
              onClick={() => setActivePage('dashboard')}
              className="px-5 py-2.5 bg-po hover:bg-po/90 text-white rounded-xl font-bold text-sm tracking-wide uppercase shadow-lg shadow-po/10 transition-all cursor-pointer"
            >
              Go To Dashboard
            </button>
          </div>
        );
      }
    }

    switch (activePage) {
      case 'dashboard': return <Dashboard onNavigate={setActivePage} />;
      case 'po': return <POPage />;
      case 'cutting': return <CuttingPage />;
      case 'sending': return <FeedingPage />;
      case 'stitching': return <StitchingPage />;
      case 'finishing': return <FinishingPage />;
      case 'packing': return <PackingPage />;
      case 'store': return <StorePage onNavigate={setActivePage} />;
      case 'dept_stores': return <DeptStoresPage />;
      case 'old_stock': return <OldStockPage />;
      case 'shipping': return <ShippingPage />;
      case 'fabric': return <FabricPage />;
      case 'status': return <StatusPage />;
      case 'master_report': return <MasterOverview />;
      case 'wip_report': return <WIPReport />;
      case 'returns': return <ReturnsPage />;
      case 'discards': return <DiscardsPage />;
      case 'press': return <PressPage />;
      case 'users': return <UsersPage />;
      case 'custom_depts': return <CustomDeptsPage />;
      case 'sqa_diagnostics': return <SQADiagnosticsPage />;
      default: return <Dashboard />;
    }
  };

  return (
    <Layout activePage={activePage} onNavigate={setActivePage}>
      {renderPage()}
    </Layout>
  );
};

import { Toaster } from 'sonner';

export default function App() {
  return (
    <ThemeProvider>
      <Toaster position="top-right" expand={true} richColors closeButton />
      <AuthProvider>
        <SystemProvider>
          <AppContent />
        </SystemProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
