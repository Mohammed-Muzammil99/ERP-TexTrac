import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSystem } from '../context/SystemContext';
import { useTheme } from '../context/ThemeContext';
import { permissionRequestService } from '../services/erpService';
import { RequestAccessModal } from './RequestAccessModal';
import { MyRequestsModal } from './MyRequestsModal';
import { AdminApprovalModal } from './AdminApprovalModal';
import { DirectPermissionGrantModal } from './DirectPermissionGrantModal';
import { DirectTimeModal } from './DirectTimeModal';
import { PermissionRequestType } from '../types';
import { toast } from 'sonner';
import { 
  LayoutDashboard, 
  FileText, 
  Scissors, 
  Send, 
  Activity, 
  CheckCircle2, 
  Package, 
  Warehouse,
  Truck, 
  Droplets,
  Users,
  LogOut,
  ChevronRight,
  Sun,
  Moon,
  Menu,
  X,
  RotateCcw,
  Building2,
  Layers,
  Database,
  Wrench,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  Clock,
  History,
  KeyRound,
  Key
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface LayoutProps {
  children: React.ReactNode;
  activePage: string;
  onNavigate: (page: string) => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activePage, onNavigate }) => {
  const { user, logout, refreshUser } = useAuth();
  const { workingDate, isInitialStockMode, setIsInitialStockMode } = useSystem();
  const { theme, toggleTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [showAlignConfirm, setShowAlignConfirm] = useState(false);

  // Permission Request & Admin Approval Modal states
  const [isRequestAccessModalOpen, setIsRequestAccessModalOpen] = useState(false);
  const [requestModalInitialType, setRequestModalInitialType] = useState<PermissionRequestType>('dept_access');
  const [requestModalInitialItem, setRequestModalInitialItem] = useState<string | undefined>(undefined);
  const [isMyRequestsModalOpen, setIsMyRequestsModalOpen] = useState(false);
  const [isAdminApprovalModalOpen, setIsAdminApprovalModalOpen] = useState(false);
  const [isDirectGrantModalOpen, setIsDirectGrantModalOpen] = useState(false);
  const [isDirectTimeModalOpen, setIsDirectTimeModalOpen] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [myPendingRequestsCount, setMyPendingRequestsCount] = useState(0);

  const fetchPendingCounts = async () => {
    try {
      const res = await permissionRequestService.getPendingCount();
      setPendingRequestsCount(res.count || 0);
      setMyPendingRequestsCount(res.my_pending_count || 0);
    } catch {
      // Ignore background count errors
    }
  };

  useEffect(() => {
    fetchPendingCounts();
    const interval = setInterval(fetchPendingCounts, 15000);
    return () => clearInterval(interval);
  }, []);

  const openRequestModal = (type: PermissionRequestType = 'dept_access', item?: string) => {
    setRequestModalInitialType(type);
    setRequestModalInitialItem(item);
    setIsRequestAccessModalOpen(true);
  };

  const triggerAutoReconcile = async () => {
    setShowAlignConfirm(false);
    setIsReconciling(true);
    try {
      const response = await fetch('/api/settings/auto-reconcile', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('erp_token')}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      if (response.ok) {
        toast.success(`Inventory Aligned!`, {
          description: `Successfully resolved negative backlogs on ${data.adjustedCount || 0} stage-transitions.`
        });
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        toast.error(`Reconciliation Failed`, {
          description: data.error || 'Unknown error occurred.'
        });
      }
    } catch (err: any) {
      toast.error(`Error`, {
        description: err.message
      });
    } finally {
      setIsReconciling(false);
    }
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'supervisor', 'operator', 'viewer'] },
    { id: 'master_report', label: 'Factory 360°', icon: Building2, roles: ['admin', 'supervisor', 'viewer'] },
    { id: 'wip_report', label: 'WIP Report', icon: Layers, roles: ['admin', 'supervisor', 'viewer'] },
    { id: 'status', label: 'Department Status', icon: Activity, roles: ['admin', 'supervisor', 'operator', 'viewer'] },
    { id: 'dept_stores', label: 'Dept Stores', icon: Layers, roles: ['admin', 'supervisor', 'viewer'] },
    { id: 'old_stock', label: 'Old Stock Store', icon: RotateCcw, roles: ['admin', 'supervisor'] },
    { id: 'discards', label: 'Discards Log', icon: Trash2, roles: ['admin', 'supervisor', 'operator'] },
    { id: 'press', label: 'Pressing Log', icon: CheckCircle2, roles: ['admin', 'supervisor', 'operator'] },
    { id: 'returns', label: 'Returns Log', icon: RotateCcw, roles: ['admin', 'supervisor', 'operator'], departments: ['Stitching', 'Finishing', 'Store'] },
    { id: 'po', label: 'Production Orders', icon: FileText, roles: ['admin', 'supervisor'], departments: ['Admin'] },
    { id: 'cutting', label: 'Cutting', icon: Scissors, roles: ['admin', 'supervisor', 'operator'], departments: ['Cutting'] },
    { id: 'sending', label: 'Feeding', icon: Send, roles: ['admin', 'supervisor', 'operator'], departments: ['Cutting'] },
    { id: 'stitching', label: 'Stitching', icon: Activity, roles: ['admin', 'supervisor', 'operator'], departments: ['Stitching'] },
    { id: 'finishing', label: 'Finishing', icon: CheckCircle2, roles: ['admin', 'supervisor', 'operator'], departments: ['Finishing', 'Quality'] },
    { id: 'packing', label: 'Packing', icon: Package, roles: ['admin', 'supervisor', 'operator'], departments: ['Packing'] },
    { id: 'store', label: 'Store (Stock)', icon: Warehouse, roles: ['admin', 'supervisor', 'operator'], departments: ['Store', 'Shipping'] },
    { id: 'shipping', label: 'Shipped', icon: Truck, roles: ['admin', 'supervisor', 'operator'], departments: ['Shipping'] },
    { id: 'fabric', label: 'Fabric Management', icon: Droplets, roles: ['admin', 'supervisor', 'operator'], departments: ['Cutting'] },
    { id: 'users', label: 'User Management', icon: Users, roles: ['admin'] },
    { id: 'custom_depts', label: 'Custom Depts', icon: Building2, roles: ['admin', 'supervisor'] },
    { id: 'sqa_diagnostics', label: 'SQA Diagnostics', icon: Database, roles: ['admin', 'supervisor', 'operator'] },
  ];

  const filteredMenu = menuItems.filter(item => {
    if (!user) return false;
    if (user.role === 'admin') return true;

    // Granular allowed_pages override if assigned by admin
    if (user.allowed_pages && Array.isArray(user.allowed_pages) && user.allowed_pages.length > 0) {
      return user.allowed_pages.includes(item.id);
    }

    // Role-based filtering
    if (!item.roles.includes(user.role)) return false;
    
    // Unique supervisor with 'All' department bypasses department restrictions
    const isUniversalSupervisor = user.role === 'supervisor' && String(user.department).toLowerCase() === 'all';
    if (isUniversalSupervisor) return true;
    
    // Allowed departments multi-assignment check if configured
    if (user.allowed_departments && Array.isArray(user.allowed_departments) && user.allowed_departments.length > 0) {
      if (user.allowed_departments.includes('All')) return true;
      if (item.departments && item.departments.length > 0) {
        return item.departments.some(d => user.allowed_departments?.includes(d));
      }
      return true;
    }

    // Fallback single department check
    if (item.departments && !item.departments.includes(user.department)) return false;
    return true;
  });

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-bg2">
      <div 
        className="p-8 border-b border-bg4 bg-bg/50 cursor-pointer hover:bg-bg4/30 transition-colors group"
        onClick={() => setIsSidebarCollapsed(true)}
        title="Click to hide sidebar"
      >
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-3">
          <div className="w-10 h-10 bg-po rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-po/20 group-hover:scale-105 transition-transform">E</div>
          <div className="flex flex-col">
            <span className="text-lg leading-none font-bold text-text">PRODUCTION</span>
            <span className="text-xs font-bold text-po uppercase tracking-wider mt-1">Enterprise ERP</span>
          </div>
          <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
            <X className="w-4 h-4 text-text3 hover:text-po" />
          </div>
        </h1>
      </div>

      {/* System Working Date / Epoch Indicator */}
      <div 
        onClick={() => {
          if (user?.role === 'admin') {
            onNavigate('users');
            setIsMobileMenuOpen(false);
          } else if (user?.role === 'supervisor' || user?.can_change_time === 1 || user?.can_change_time === true) {
            setIsDirectTimeModalOpen(true);
            setIsMobileMenuOpen(false);
          } else {
            openRequestModal('datetime_change');
            setIsMobileMenuOpen(false);
          }
        }}
        className="mx-4 mt-5 p-3.5 bg-bg3 hover:bg-bg4/60 border border-bg4 rounded-2xl relative overflow-hidden group cursor-pointer transition-all"
        title={
          user?.role === 'admin' 
            ? "Click to manage system date in Users page" 
            : (user?.role === 'supervisor' || user?.can_change_time === 1 || user?.can_change_time === true)
              ? "Click to adjust working time or revert to real-time clock"
              : "Click to request Date/Time change from Admin"
        }
      >
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] font-mono font-bold text-text3 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-po" /> System Epoch Date
          </p>
          <span className="text-[10px] font-bold text-po uppercase group-hover:underline">
            {user?.role === 'admin' 
              ? 'Change ⚙️' 
              : (user?.role === 'supervisor' || user?.can_change_time === 1 || user?.can_change_time === true)
                ? 'Time / Revert ⚡'
                : 'Request ⏱️'}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-po shadow-[0_0_8px_rgba(225,29,72,0.8)] animate-pulse" />
          <span className="text-xs font-bold text-text font-mono truncate">
            {workingDate ? new Date(workingDate).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Live Local Date'}
          </span>
        </div>
      </div>

      {/* Access & Permission Request Quick Panel */}
      <div className="mx-4 mt-2 grid grid-cols-2 gap-1.5">
        {user?.role === 'admin' ? (
          <>
            <button
              type="button"
              onClick={() => {
                setIsAdminApprovalModalOpen(true);
                setIsMobileMenuOpen(false);
              }}
              className="p-2 rounded-xl bg-po/10 hover:bg-po/20 text-po border border-po/30 flex items-center justify-center gap-1.5 text-[11px] font-black uppercase tracking-tight transition-all cursor-pointer relative"
              title="Open Admin Approval Center"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Approvals</span>
              {pendingRequestsCount > 0 && (
                <span className="px-1.5 py-0.2 bg-po text-white text-[9px] rounded-full font-mono font-bold animate-pulse">
                  {pendingRequestsCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsDirectGrantModalOpen(true);
                setIsMobileMenuOpen(false);
              }}
              className="p-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 flex items-center justify-center gap-1.5 text-[11px] font-black uppercase tracking-tight transition-all cursor-pointer"
              title="Directly Grant User Access Permissions by Admin Will"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Grant Access</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                openRequestModal('dept_access');
                setIsMobileMenuOpen(false);
              }}
              className="p-2 rounded-xl bg-bg3/80 hover:bg-bg4 text-text2 hover:text-po border border-bg4 flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-tight transition-all cursor-pointer"
              title="Request Department or Page Access from Admin"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-po" />
              <span>Req Access</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsMyRequestsModalOpen(true);
                setIsMobileMenuOpen(false);
              }}
              className="p-2 rounded-xl bg-bg3/80 hover:bg-bg4 text-text2 hover:text-text border border-bg4 flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-tight transition-all cursor-pointer relative"
              title="View my submitted requests status"
            >
              <History className="w-3.5 h-3.5 text-text3" />
              <span>My Requests</span>
              {myPendingRequestsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-po rounded-full animate-pulse" />
              )}
            </button>
          </>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-1.5 mt-4">
        {filteredMenu.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              onNavigate(item.id);
              setIsMobileMenuOpen(false);
            }}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group relative",
              activePage === item.id 
                ? "bg-bg shadow-sm border border-bg4 text-text" 
                : "text-text2 hover:bg-bg3 hover:text-text"
            )}
          >
            <item.icon className={cn(
              "w-5 h-5 transition-transform group-hover:scale-110",
              activePage === item.id ? "text-po" : "text-text3 group-hover:text-text"
            )} />
            <span className={cn(
              "text-sm font-bold uppercase tracking-tight",
              activePage === item.id ? "text-text" : "text-text2"
            )}>{item.label}</span>
            {activePage === item.id && (
              <div className="absolute left-0 w-1 h-6 bg-po rounded-r-full shadow-[0_0_8px_rgba(225,29,72,0.4)]" />
            )}
            {activePage === item.id && <ChevronRight className="w-4 h-4 ml-auto text-po" />}
          </button>
        ))}
      </nav>

      <div className="p-6 border-t border-bg4 bg-bg/50 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-bg4 flex items-center justify-center text-text font-black text-lg uppercase shadow-inner border border-bg3 shrink-0">
            {user?.full_name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate text-text">{user?.full_name}</p>
            <div className="flex flex-col">
              <p className="text-xs text-po uppercase font-bold tracking-tight leading-none mt-1">{user?.role}</p>
              <p className="text-[11px] text-text2 uppercase font-medium tracking-tight mt-0.5">{user?.department}</p>
            </div>
          </div>
          <button 
            onClick={logout}
            className="p-2.5 bg-bg3 text-text3 hover:text-reject hover:bg-reject/10 rounded-xl transition-all border border-bg4 hover:border-reject/20"
            title="Logout"
          >
            <LogOut className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-bg overflow-hidden relative">
      {/* Desktop Sidebar */}
      <aside className={cn(
        "hidden lg:flex flex-col bg-bg2 border-r border-bg4 card-shadow z-30 transition-all duration-300 ease-in-out relative overflow-hidden",
        isSidebarCollapsed ? "w-0 opacity-0 -translate-x-full" : "w-72 opacity-100 translate-x-0"
      )}>
        <SidebarContent />
      </aside>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-bg2 border-r border-bg4 z-50 lg:hidden shadow-2xl"
            >
              <SidebarContent />
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="absolute top-6 right-[-48px] p-2 bg-po text-white rounded-lg shadow-lg hover:bg-orange-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden w-full">
        <header className="h-20 bg-bg/80 backdrop-blur-md border-b border-bg4 flex items-center justify-between px-4 sm:px-6 lg:px-10 sticky top-0 z-20 shrink-0">
          <div className="flex items-center gap-4">
          <button 
            onClick={() => {
              if (window.innerWidth < 1024) {
                setIsMobileMenuOpen(true);
              } else {
                setIsSidebarCollapsed(!isSidebarCollapsed);
              }
            }}
            className="p-2.5 bg-bg3 text-text hover:bg-bg4 rounded-xl border border-bg4 transition-all group relative"
            title={isSidebarCollapsed ? "Show Sidebar" : "Hide Sidebar"}
          >
            <Menu className="w-6 h-6" />
            {isSidebarCollapsed && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-po rounded-full border-2 border-bg animate-pulse" />
            )}
          </button>
          <div className="flex flex-col">
              <span className="text-xs font-bold text-text2 uppercase tracking-wider">Current Context</span>
              <span className="text-lg lg:text-xl font-bold uppercase tracking-tight text-text truncate max-w-[150px] sm:max-w-none">
                {menuItems.find(m => m.id === activePage)?.label}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-3 sm:gap-6">
            {/* Admin Approval Hub Button */}
            {user?.role === 'admin' && (
              <button
                onClick={() => setIsAdminApprovalModalOpen(true)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold border transition-all cursor-pointer relative",
                  pendingRequestsCount > 0
                    ? "bg-po text-white border-po shadow-lg shadow-po/20"
                    : "bg-bg3 text-text2 hover:text-text hover:bg-bg4 border-bg4"
                )}
                title="Admin Approval Center - Review permission & date change requests"
              >
                <ShieldCheck className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                <span className="hidden md:inline">
                  Approvals {pendingRequestsCount > 0 ? `(${pendingRequestsCount})` : ''}
                </span>
                <span className="md:hidden">
                  Approvals {pendingRequestsCount > 0 ? `(${pendingRequestsCount})` : ''}
                </span>
                {pendingRequestsCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-bg animate-ping" />
                )}
              </button>
            )}

            {/* Non-admin Quick Request Access Button */}
            {user?.role !== 'admin' && (
              <button
                onClick={() => openRequestModal('dept_access')}
                className="flex items-center gap-1.5 px-3 py-2 sm:px-3.5 sm:py-2.5 bg-bg3 hover:bg-bg4 text-text2 hover:text-po border border-bg4 rounded-xl text-xs font-bold uppercase tracking-tight transition-all cursor-pointer"
                title="Request department or page permissions from admin"
              >
                <ShieldAlert className="w-4 h-4 text-po" />
                <span className="hidden sm:inline">Request Access</span>
              </button>
            )}

            {/* My Requests Track Button */}
            <button
              onClick={() => setIsMyRequestsModalOpen(true)}
              className="p-2 sm:p-2.5 bg-bg3 text-text3 hover:text-text hover:bg-bg4 rounded-xl transition-all border border-bg4 relative"
              title="Track my permission & date change requests"
            >
              <History className="w-4.5 h-4.5" />
              {myPendingRequestsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-po rounded-full border-2 border-bg animate-pulse" />
              )}
            </button>

            {user?.role === 'admin' && (
              <>
                <button
                  onClick={() => setShowAlignConfirm(true)}
                  disabled={isReconciling}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold border transition-all cursor-pointer bg-bg3 text-text2 hover:text-text hover:bg-bg4 border-bg4",
                    isReconciling && "opacity-50 cursor-not-allowed"
                  )}
                  title="Auto-reconcile predecessor stock to fix negative stock situations"
                >
                  <Wrench className={cn("w-4 h-4 sm:w-4.5 sm:h-4.5", isReconciling && "animate-spin")} />
                  <span className="hidden md:inline">
                    {isReconciling ? 'Aligning...' : 'Auto-Align Stocks'}
                  </span>
                  <span className="md:hidden">
                    {isReconciling ? 'Aligning...' : 'Align'}
                  </span>
                </button>

                <button
                  onClick={() => {
                    const newValue = !isInitialStockMode;
                    setIsInitialStockMode(newValue);
                    if (newValue) {
                      toast.warning('Initial Stock Entry Mode: ENABLED', {
                        description: 'Sequential validations bypassed. Everyone can enter stock directly.'
                      });
                    } else {
                      toast.success('Routine Validation Mode: RESTORED', {
                        description: 'Sequenced validations and handovers are now active.'
                      });
                    }
                  }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold border transition-all cursor-pointer",
                    isInitialStockMode 
                      ? "bg-amber-500 border-amber-600 text-white shadow-lg shadow-amber-500/10" 
                      : "bg-bg3 text-text2 hover:text-text hover:bg-bg4 border-bg4"
                  )}
                  title="Toggle Initial Stock Entry Mode"
                >
                  <Database className={cn("w-4 h-4 sm:w-4.5 sm:h-4.5", isInitialStockMode && "animate-pulse")} />
                  <span className="hidden md:inline">
                    {isInitialStockMode ? 'Initial Entry Mode' : 'Normal Routine'}
                  </span>
                  <span className="md:hidden">
                    {isInitialStockMode ? 'Initial' : 'Normal'}
                  </span>
                </button>
              </>
            )}
            <button
              onClick={toggleTheme}
              className="p-2 sm:p-3 bg-bg3 text-text3 hover:text-text hover:bg-bg4 rounded-xl transition-all border border-bg4"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5 text-po" /> : <Moon className="w-5 h-5 text-po" />}
            </button>
            <div 
              onClick={() => {
                if (user?.role === 'admin') {
                  onNavigate('users');
                } else if (user?.role === 'supervisor' || user?.can_change_time === 1 || user?.can_change_time === true) {
                  setIsDirectTimeModalOpen(true);
                } else {
                  openRequestModal('datetime_change');
                }
              }}
              className="flex flex-col items-end hidden sm:flex cursor-pointer group"
              title={
                user?.role === 'admin' 
                  ? "Click to configure in Users page" 
                  : (user?.role === 'supervisor' || user?.can_change_time === 1 || user?.can_change_time === true)
                    ? "Click to adjust working time or revert to real-time clock"
                    : "Click to request Working Date change from Admin"
              }
            >
              <span className="text-[10px] font-black text-text3 uppercase tracking-[0.2em] mb-1 group-hover:text-po transition-colors">
                {workingDate ? 'Session Active' : 'Real-time Date'}
              </span>
              <div className="flex items-center gap-2.5 bg-po/10 group-hover:bg-po/20 px-3.5 py-1.5 rounded-xl border border-po/20 transition-all">
                <div className="w-2 h-2 rounded-full bg-po animate-pulse shadow-[0_0_8px_rgba(225,29,72,0.5)]" />
                <span className="text-xs font-black text-po uppercase tracking-widest font-mono">
                  {workingDate ? new Date(workingDate).toLocaleDateString() : 'Live'}
                </span>
                {(user?.role === 'supervisor' || user?.can_change_time === 1 || user?.can_change_time === true) && (
                  <span className="text-[10px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded font-bold">
                    ⏱️ Time / Revert
                  </span>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-10 bg-bg/30">
          {children}
        </div>
      </main>

      {/* Direct Working Time Adjustment Modal */}
      <DirectTimeModal
        isOpen={isDirectTimeModalOpen}
        onClose={() => setIsDirectTimeModalOpen(false)}
        onRequestDateChange={() => openRequestModal('datetime_change')}
      />

      {/* Permission Request Modal */}
      <RequestAccessModal
        isOpen={isRequestAccessModalOpen}
        onClose={() => setIsRequestAccessModalOpen(false)}
        initialType={requestModalInitialType}
        initialItem={requestModalInitialItem}
        onSubmitted={() => {
          fetchPendingCounts();
          setIsMyRequestsModalOpen(true);
        }}
      />

      {/* My Requests Tracker Modal */}
      <MyRequestsModal
        isOpen={isMyRequestsModalOpen}
        onClose={() => setIsMyRequestsModalOpen(false)}
        onRequestNew={() => openRequestModal('dept_access')}
      />

      {/* Admin Approval Center Modal */}
      <AdminApprovalModal
        isOpen={isAdminApprovalModalOpen}
        onClose={() => setIsAdminApprovalModalOpen(false)}
        onReviewed={() => {
          fetchPendingCounts();
          refreshUser();
        }}
      />

      {/* Direct Permission Grant Modal (Admin Will) */}
      <DirectPermissionGrantModal
        isOpen={isDirectGrantModalOpen}
        onClose={() => setIsDirectGrantModalOpen(false)}
        onGranted={() => {
          fetchPendingCounts();
          refreshUser();
        }}
      />

      {/* Auto-Align Confirm Modal */}
      {showAlignConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-bg2 border border-bg4 w-full max-w-md rounded-2xl p-6 shadow-2xl relative overflow-hidden space-y-4">
            <div className="flex items-center gap-3 text-amber-500">
              <Wrench className="w-6 h-6 animate-pulse" />
              <h3 className="text-lg font-black uppercase tracking-tight text-text">
                Confirm Auto-Alignment
              </h3>
            </div>
            
            <p className="text-xs text-text3 leading-relaxed">
              This will automatically reconcile predecessor records (<strong>Cut, Feeding, Stitching, Finishing, Blister Pack</strong>) for any styles where quantities are mismatched or negative because they were entered in random order (e.g., Initial Stock Mode without prior departments' stocks).
            </p>
            
            <p className="text-xs text-text2 font-bold bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl">
              ⚠️ This will update predecessor stage balances to exactly matching required quantities (reconciled to 0 deficit), bringing your physical inventory pipelines into perfect alignment.
            </p>
            
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowAlignConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-bg3 text-text3 hover:text-text border border-bg4 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={triggerAutoReconcile}
                className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20 transition-all"
              >
                Let's Align
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
