import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, ShieldCheck, Shield, Key, Sliders, Users, 
  Check, X, Sparkles, Building2, Layers, Clock, AlertTriangle, 
  Search, CheckCircle2, ArrowRight, UserCheck, Lock
} from 'lucide-react';
import { userService, departmentService } from '../services/erpService';
import { User, Role } from '../types';
import { 
  PermissionsSelector, 
  SYSTEM_PAGES, 
  PERMISSION_PRESETS 
} from './PermissionsManager';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

interface DirectPermissionGrantModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialUserId?: number;
  onGranted?: () => void;
}

export const DirectPermissionGrantModal: React.FC<DirectPermissionGrantModalProps> = ({
  isOpen,
  onClose,
  initialUserId,
  onGranted
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [departments, setDepartments] = useState<string[]>([
    'Admin', 'Cutting', 'Stitching', 'Finishing', 'Packing', 'Store', 'Shipping', 'Quality'
  ]);
  
  const [selectedUserId, setSelectedUserId] = useState<number | ''>(initialUserId || '');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  
  // Permission states for the target user
  const [systemRole, setSystemRole] = useState<Role>('operator');
  const [primaryDept, setPrimaryDept] = useState<string>('Cutting');
  const [allowedPages, setAllowedPages] = useState<string[]>([]);
  const [allowedDepts, setAllowedDepts] = useState<string[]>([]);
  const [canChangeTime, setCanChangeTime] = useState<boolean>(false);
  const [adminNote, setAdminNote] = useState<string>('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadUsersAndDepartments();
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialUserId) {
      setSelectedUserId(initialUserId);
    }
  }, [initialUserId]);

  const loadUsersAndDepartments = async () => {
    setIsLoadingUsers(true);
    try {
      const [usersData, deptsData] = await Promise.all([
        userService.list(),
        departmentService.list().catch(() => [])
      ]);
      setUsers(usersData || []);
      
      const customDeptNames = (deptsData || []).map((d: any) => d.name);
      const combinedDepts = Array.from(new Set([
        'Admin', 'Cutting', 'Stitching', 'Finishing', 'Packing', 'Store', 'Shipping', 'Quality',
        ...customDeptNames
      ]));
      setDepartments(combinedDepts);

      // If an initial user is requested, load their config
      if (initialUserId && usersData) {
        const found = usersData.find((u: User) => u.id === initialUserId);
        if (found) {
          populateUserForm(found);
        }
      } else if (usersData && usersData.length > 0 && !selectedUserId) {
        // Default to first non-admin user if available
        const firstTarget = usersData.find((u: User) => u.role !== 'admin') || usersData[0];
        if (firstTarget) {
          setSelectedUserId(firstTarget.id);
          populateUserForm(firstTarget);
        }
      }
    } catch (err: any) {
      toast.error('Failed to load users list', { description: err.message });
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const populateUserForm = (u: User) => {
    setSystemRole(u.role);
    setPrimaryDept(u.department || 'Cutting');

    const parsedPages = u.allowed_pages
      ? (Array.isArray(u.allowed_pages) ? u.allowed_pages : JSON.parse(u.allowed_pages as any))
      : (u.role === 'admin' ? SYSTEM_PAGES.map(p => p.id) : []);

    const parsedDepts = u.allowed_departments
      ? (Array.isArray(u.allowed_departments) ? u.allowed_departments : JSON.parse(u.allowed_departments as any))
      : (u.role === 'admin' || u.department === 'All' ? ['All'] : [u.department || 'Cutting']);

    setAllowedPages(parsedPages);
    setAllowedDepts(parsedDepts);
    setCanChangeTime(u.can_change_time === 1 || u.can_change_time === true);
    setAdminNote('');
  };

  const handleSelectUser = (id: number) => {
    setSelectedUserId(id);
    const target = users.find(u => u.id === id);
    if (target) {
      populateUserForm(target);
    }
  };

  if (!isOpen) return null;

  const selectedUser = users.find(u => u.id === selectedUserId);

  const filteredUsers = users.filter(u => {
    if (!userSearchQuery.trim()) return true;
    const q = userSearchQuery.toLowerCase();
    return u.full_name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || u.department.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
  });

  const handleApplyPermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !selectedUser) {
      toast.error('Please select a user to grant permissions to.');
      return;
    }

    setIsSubmitting(true);
    try {
      await userService.update(selectedUserId, {
        role: systemRole,
        department: primaryDept,
        allowed_pages: allowedPages,
        allowed_departments: allowedDepts,
        can_change_time: canChangeTime,
        is_active: true
      });

      toast.success(`Access permissions granted successfully!`, {
        description: `Updated access permissions for @${selectedUser.username} (${selectedUser.full_name}).`
      });

      onGranted?.();
      onClose();
    } catch (err: any) {
      toast.error('Failed to update user permissions', {
        description: err.response?.data?.error || err.message || 'Unknown error occurred.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-bg2 border border-bg4 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-6 border-b border-bg4 bg-bg3/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-po/10 text-po flex items-center justify-center border border-po/20 shadow-inner">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-text uppercase tracking-tight">
                  Grant User Access Permissions
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[10px] font-black uppercase font-mono tracking-wider">
                  Admin Authority
                </span>
              </div>
              <p className="text-xs text-text3 font-medium">
                Directly configure role, primary department, system pages, department pipelines, and clock privileges for any user account.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl text-text3 hover:text-text hover:bg-bg4 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <form onSubmit={handleApplyPermissions} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Target User Selector Box */}
          <div className="bg-bg3/50 border border-bg4 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-text3 font-black flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-po" /> Select Target User:
                </label>
                <p className="text-xs text-text3 mt-0.5">
                  Choose the user whose access credentials you want to authorize or upgrade.
                </p>
              </div>

              {/* User search filter */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
                <input
                  type="text"
                  placeholder="Filter users..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-bg2 border border-bg4 rounded-xl text-xs text-text placeholder:text-text3/50 focus:border-po outline-none"
                />
              </div>
            </div>

            {isLoadingUsers ? (
              <div className="py-6 text-center text-xs text-text3 font-mono">
                Loading system users list...
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto pr-1">
                {filteredUsers.map((u) => {
                  const isSelected = selectedUserId === u.id;
                  return (
                    <div
                      key={u.id}
                      onClick={() => handleSelectUser(u.id)}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none",
                        isSelected
                          ? "bg-po/10 border-po text-text shadow-sm"
                          : "bg-bg2 border-bg4 hover:bg-bg3/70 text-text2"
                      )}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 uppercase border",
                        isSelected 
                          ? "bg-po text-white border-po" 
                          : "bg-bg4 text-text border-bg4"
                      )}>
                        {u.full_name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black truncate">{u.full_name}</p>
                        <p className="text-[10px] font-mono text-text3 truncate">
                          @{u.username} • <span className="uppercase">{u.role}</span>
                        </p>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="w-4 h-4 text-po shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {selectedUser && (
              <div className="bg-bg2/80 border border-bg4 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-500" />
                  <span>Configuring permissions for: <strong>{selectedUser.full_name}</strong> (@{selectedUser.username})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-bg4 text-text3 uppercase">
                    Current Dept: {selectedUser.department}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-po/10 text-po uppercase font-bold">
                    Current Role: {selectedUser.role}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* System Role & Primary Department Dropdowns (Exact visual styling as screenshot) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-mono text-text3 uppercase tracking-widest font-black flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-po" /> SYSTEM ROLE
              </label>
              <select
                value={systemRole}
                onChange={(e) => {
                  const nextRole = e.target.value as Role;
                  const nextDept = nextRole === 'supervisor' ? 'All' : (primaryDept === 'All' ? 'Cutting' : primaryDept);
                  let defaultPages = allowedPages;
                  if (nextRole === 'admin') {
                    defaultPages = SYSTEM_PAGES.map(p => p.id);
                  } else if (nextRole === 'viewer') {
                    defaultPages = ['dashboard', 'master_report', 'wip_report', 'status', 'dept_stores'];
                  }
                  setSystemRole(nextRole);
                  setPrimaryDept(nextDept);
                  setAllowedPages(defaultPages);
                  if (nextDept === 'All') {
                    setAllowedDepts(['All']);
                  }
                }}
                className="w-full bg-bg3 border border-bg4 rounded-2xl px-4 py-3.5 text-sm font-bold text-text outline-none focus:border-po shadow-xs cursor-pointer"
              >
                <option value="operator">Operator (Stage Data Entry)</option>
                <option value="supervisor">Supervisor (Manager)</option>
                <option value="admin">Administrator (Full Master)</option>
                <option value="viewer">Status Viewer (ReadOnly)</option>
              </select>
              <p className="text-[10px] text-text3 italic">
                {systemRole === 'viewer' && "* Read-only observer across production metrics and store reports."}
                {systemRole === 'operator' && "* Standard floor operator with transaction data-entry permissions."}
                {systemRole === 'supervisor' && "* Production supervisor with multi-line line management capabilities."}
                {systemRole === 'admin' && "* Full unrestricted administrator with master controls."}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-mono text-text3 uppercase tracking-widest font-black flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-emerald-500" /> PRIMARY DEPARTMENT
              </label>
              <select
                value={primaryDept}
                onChange={(e) => {
                  const dept = e.target.value;
                  setPrimaryDept(dept);
                  if (dept === 'All') {
                    setAllowedDepts(['All']);
                  } else if (!allowedDepts.includes('All') && !allowedDepts.includes(dept)) {
                    setAllowedDepts([...allowedDepts, dept]);
                  }
                }}
                className="w-full bg-bg3 border border-bg4 rounded-2xl px-4 py-3.5 text-sm font-bold text-text outline-none focus:border-po shadow-xs cursor-pointer"
              >
                {systemRole === 'supervisor' && (
                  <option value="All">All Departments (Universal Supervisor)</option>
                )}
                {departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <p className="text-[10px] text-text3 italic">
                * The primary department pipeline where this user logs daily workflows.
              </p>
            </div>
          </div>

          {/* Granular Permissions Selector (Pages, Departments, Time Control) */}
          <div className="space-y-2">
            <PermissionsSelector
              selectedPages={allowedPages}
              onChangePages={setAllowedPages}
              selectedDepartments={allowedDepts}
              onChangeDepartments={setAllowedDepts}
              departments={departments}
              role={systemRole}
              canChangeTime={canChangeTime}
              onChangeCanChangeTime={setCanChangeTime}
            />
          </div>

          {/* Optional Admin Reason / Audit Note */}
          <div className="space-y-2">
            <label className="text-[10px] font-mono text-text3 uppercase tracking-widest font-black">
              Admin Authorization Note (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Authorized special supervisor access for factory night shift..."
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              className="w-full bg-bg3 border border-bg4 rounded-xl px-4 py-2.5 text-xs text-text placeholder:text-text3/50 focus:border-po outline-none"
            />
          </div>

          {/* Modal Footer Controls */}
          <div className="flex items-center justify-between pt-4 border-t border-bg4 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-bg3 text-text3 hover:text-text font-bold rounded-xl text-xs uppercase cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedUserId}
              className="px-6 py-3 bg-po hover:bg-blue-600 disabled:opacity-50 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-po/25 flex items-center gap-2 cursor-pointer transition-all hover:scale-102"
            >
              <Key className="w-4 h-4" />
              {isSubmitting ? 'Granting Access...' : '⚡ Grant & Apply Permissions Now'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
