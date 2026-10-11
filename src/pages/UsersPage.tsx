import React, { useState, useEffect } from 'react';
import { userService, departmentService } from '../services/erpService';
import { useSystem } from '../context/SystemContext';
import { useAuth } from '../context/AuthContext';
import { User, Role, EnrichedAuditLog } from '../types';
import { 
  Users, UserPlus, Trash2, Edit2, X, Shield, ShieldAlert, ShieldCheck, 
  Calendar, Clock, RotateCcw, History, Search, PlusCircle, AlertTriangle, 
  CheckCircle, Key, Lock, Sliders, Layers, Building2, Check, Eye
} from 'lucide-react';
import { 
  PermissionsSelector, 
  UserPermissionsBadge, 
  UserPermissionsModal,
  SYSTEM_PAGES,
  PERMISSION_PRESETS 
} from '../components/PermissionsManager';
import { DirectPermissionGrantModal } from '../components/DirectPermissionGrantModal';
import { AuditLogViewer } from '../components/AuditLogViewer';
import { PublicAppUrlSettings } from '../components/PublicAppUrlSettings';
import { cn, fmtDate } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export const UsersPage: React.FC = () => {
  const { workingDate, setWorkingDate } = useSystem();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingDate, setIsUpdatingDate] = useState(false);
  const [viewingUserPermissions, setViewingUserPermissions] = useState<any | null>(null);

  // Direct Admin Permission Grant State
  const [isDirectGrantOpen, setIsDirectGrantOpen] = useState(false);
  const [directGrantTargetUserId, setDirectGrantTargetUserId] = useState<number | null>(null);

  // Custom visual dialogues for perfect sandboxed iframe compatibility
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification((curr) => curr && curr.message === message ? null : curr);
    }, 4500);
  };

  const [tempDate, setTempDate] = useState(() => {
    if (workingDate) {
      return workingDate.replace(' ', 'T').substring(0, 16);
    }
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return (new Date(now.getTime() - tzOffset)).toISOString().slice(0, 16);
  });

  useEffect(() => {
    if (workingDate) {
      setTempDate(workingDate.replace(' ', 'T').substring(0, 16));
    } else {
      const now = new Date();
      const tzOffset = now.getTimezoneOffset() * 60000;
      setTempDate((new Date(now.getTime() - tzOffset)).toISOString().slice(0, 16));
    }
  }, [workingDate]);

  const [showCreate, setShowCreate] = useState(false);
  const [showCreatePermissions, setShowCreatePermissions] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    full_name: '',
    password: '',
    role: 'operator' as Role,
    department: 'Cutting' as any,
    allowed_pages: ['dashboard', 'status', 'cutting', 'sending', 'fabric', 'dept_stores'] as string[],
    allowed_departments: ['Cutting'] as string[],
    can_change_time: false
  });

  // Edit State
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editTab, setEditTab] = useState<'account' | 'permissions'>('account');
  const [editForm, setEditForm] = useState({
    username: '',
    full_name: '',
    password: '',
    role: 'operator' as Role,
    department: 'Cutting' as any,
    allowed_pages: [] as string[],
    allowed_departments: [] as string[],
    can_change_time: false,
    is_active: true
  });

  // Audit Logs state
  const [auditLogs, setAuditLogs] = useState<EnrichedAuditLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [undoingLogId, setUndoingLogId] = useState<number | null>(null);

  const [departments, setDepartments] = useState<string[]>(['Admin', 'Cutting', 'Stitching', 'Finishing', 'Packing', 'Shipping', 'Quality']);
  const [rawDepartments, setRawDepartments] = useState<any[]>([]);
  const [newDeptName, setNewDeptName] = useState('');

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      fetchUsers();
      fetchAuditLogs();
    } else {
      setIsLoading(false);
    }
    fetchDepartments();
  }, [currentUser]);

  const fetchDepartments = async () => {
    try {
      const data = await departmentService.list();
      setRawDepartments(data);
      if (data && data.length > 0) {
        setDepartments(data.map((d: any) => d.name));
      }
    } catch (error) {
      console.error('Failed to fetch departments:', error);
    }
  };

  const handleCreateDepartment = async () => {
    if (!newDeptName.trim()) {
      showToast('Department name cannot be empty', 'error');
      return;
    }
    try {
      await departmentService.create(newDeptName);
      showToast(`Department "${newDeptName}" created successfully!`);
      setNewDeptName('');
      fetchDepartments();
    } catch (error: any) {
      showToast(error.message || 'Failed to create department', 'error');
    }
  };

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const data = await userService.list();
      setUsers(data);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const logs = await userService.getAuditLogs();
      setAuditLogs(logs);
    } catch (error) {
      console.error('Failed to fetch audit logs', error);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await userService.create(newUser);
      setShowCreate(false);
      setNewUser({ 
        username: '', 
        full_name: '', 
        password: '', 
        role: 'operator', 
        department: 'Cutting',
        allowed_pages: ['dashboard', 'status', 'cutting', 'sending', 'fabric', 'dept_stores'],
        allowed_departments: ['Cutting'],
        can_change_time: false
      });
      fetchUsers();
      showToast('User account created with customized permissions successfully!');
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  const handleDelete = async (id: number) => {
    setConfirmDialog({
      title: 'Delete User Account',
      message: 'Are you sure you want to permanently delete this user account? This action cannot be reverted.',
      onConfirm: async () => {
        try {
          const res = await userService.delete(id);
          if (res.message) {
            showToast(res.message);
          } else {
            showToast('User deleted successfully.');
          }
          fetchUsers();
        } catch (error: any) {
          showToast(error.message || 'Failed to delete user.', 'error');
        }
      }
    });
  };

  const handleEditClick = (user: any) => {
    setEditingUser(user);
    setEditTab('account');

    const userPages = user.allowed_pages 
      ? (Array.isArray(user.allowed_pages) ? user.allowed_pages : JSON.parse(user.allowed_pages))
      : (user.role === 'admin' ? SYSTEM_PAGES.map(p => p.id) : []);

    const userDepts = user.allowed_departments
      ? (Array.isArray(user.allowed_departments) ? user.allowed_departments : JSON.parse(user.allowed_departments))
      : (user.role === 'admin' || user.department === 'All' ? ['All'] : [user.department || 'Cutting']);

    setEditForm({
      username: user.username,
      full_name: user.full_name,
      password: '', // Kept empty unless changing
      role: user.role,
      department: user.department,
      allowed_pages: userPages,
      allowed_departments: userDepts,
      can_change_time: user.can_change_time === 1 || user.can_change_time === true,
      is_active: user.is_active === 1 || user.is_active === true
    });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      await userService.update(editingUser.id, editForm);
      setEditingUser(null);
      showToast('User details updated successfully!');
      fetchUsers();
    } catch (error: any) {
      showToast(error.message || 'Failed to update user.', 'error');
    }
  };

  const getRoleIcon = (role: Role) => {
    switch (role) {
      case 'admin': return <ShieldAlert className="w-4 h-4 text-reject" />;
      case 'supervisor': return <ShieldCheck className="w-4 h-4 text-po" />;
      case 'viewer': return <Shield className="w-4 h-4 text-pass" />;
      default: return <Shield className="w-4 h-4 text-text3" />;
    }
  };

  const [deptFilter, setDeptFilter] = useState<string>('All');

  const filteredUsers = deptFilter === 'All' 
    ? users 
    : users.filter(u => u.department === deptFilter);

  const handleUpdateWorkingDate = async () => {
    setIsUpdatingDate(true);
    try {
      // tempDate has 'YYYY-MM-DDTHH:MM'
      // Replace 'T' with ' ' and append ':00' to fit DB format 'YYYY-MM-DD HH:MM:00'
      const dateToSet = tempDate ? tempDate.replace('T', ' ') + ':00' : '';
      await setWorkingDate(dateToSet);
      showToast('System calendar date and time updated successfully');
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setIsUpdatingDate(false);
    }
  };

  const handleClearWorkingDate = async () => {
    setConfirmDialog({
      title: 'Revert to Real-time Clock',
      message: 'Are you sure you want to revert system transactions to the local server date and time? Custom working date control will be disabled.',
      onConfirm: async () => {
        setIsUpdatingDate(true);
        try {
          await setWorkingDate(''); // Empty string to revert
          showToast('System clock successfully reverted to real-time');
        } catch (error: any) {
          showToast(error.message, 'error');
        } finally {
          setIsUpdatingDate(false);
        }
      }
    });
  };

  if (currentUser?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8 bg-bg2 rounded-2xl border border-bg4 shadow-sm">
        <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-text mb-2 uppercase tracking-wide">Administrator Access Required</h2>
        <p className="text-sm text-text3 max-w-md mb-6">
          User account administration, permissions management, and global calendar configuration require Administrator privileges.
        </p>
        <div className="text-xs text-text3 font-mono bg-bg3 px-4 py-2 rounded-xl border border-bg4">
          Logged in as: <span className="font-bold text-text">{currentUser?.username}</span> ({currentUser?.role})
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* System Settings Section */}
      <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-6 border-b border-bg4 bg-bg3/30 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold tracking-tight flex items-center gap-2">
              <Calendar className="w-5 h-5 text-po" />
              System Production Calendar
            </h3>
            <p className="text-text3 text-[10px] font-mono uppercase tracking-widest mt-1">Global Working Date Control</p>
          </div>
          {workingDate && (
            <button 
              onClick={handleClearWorkingDate}
              className="flex items-center gap-2 text-text3 hover:text-po text-[10px] font-mono uppercase tracking-widest transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Revert to Real-time
            </button>
          )}
        </div>
        <div className="p-8">
          <div className="max-w-md space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-mono text-text3 uppercase tracking-widest flex items-center gap-2">
                <Clock className="w-3 h-3" /> Set System Work Date & Time
              </label>
              <div className="flex gap-3">
                <input 
                  type="datetime-local" 
                  value={tempDate}
                  onChange={e => setTempDate(e.target.value)}
                  className="flex-1 bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold focus:ring-1 focus:ring-po/20 outline-none [.color-scheme-dark]:color-scheme-dark"
                />
                <button 
                  onClick={handleUpdateWorkingDate}
                  disabled={isUpdatingDate}
                  className="bg-po text-white font-black px-8 py-3 rounded-xl disabled:opacity-50 transition-all hover:scale-105 hover:bg-blue-600 uppercase tracking-widest text-xs shadow-lg shadow-po/20"
                >
                  {isUpdatingDate ? 'Updating...' : 'Set Date'}
                </button>
              </div>
            </div>
            <p className="text-xs text-text3 italic">
              * Every work recorded in Cutting, Stitching, Finishing etc. will use this date until changed.
            </p>
          </div>
        </div>
      </div>

      {/* Public ERP URL & WhatsApp Mobile Remote Actions Configuration */}
      <PublicAppUrlSettings />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h3 className="text-xl font-bold tracking-tight">User Management</h3>
          <p className="text-text3 text-xs font-mono uppercase tracking-widest mt-1">System Access Control</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-bg2 border border-bg4 rounded-xl px-3 py-1.5 overflow-hidden">
            <span className="text-[10px] font-mono text-text3 uppercase whitespace-nowrap">Filter Dept:</span>
            <select 
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
              className="bg-transparent border-none text-[10px] font-black outline-none uppercase min-w-[80px]"
            >
              <option value="All">All Departments</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => {
              setDirectGrantTargetUserId(null);
              setIsDirectGrantOpen(true);
            }}
            className="bg-amber-500/10 text-amber-500 border border-amber-500/30 hover:bg-amber-500/20 font-black px-5 py-3 rounded-xl flex items-center justify-center gap-2 transition-all uppercase tracking-widest text-xs w-full sm:w-auto cursor-pointer shadow-xs"
            title="Directly Grant & Assign Access Permissions to Any User by Admin Will"
          >
            <Key className="w-4 h-4 text-amber-500" />
            <span>Grant User Access</span>
          </button>
          <button 
            onClick={() => setShowCreate(!showCreate)}
            className="bg-po text-white font-black px-8 py-3 rounded-xl shadow-xl shadow-po/30 flex items-center justify-center gap-2 hover:scale-105 hover:bg-blue-600 transition-all uppercase tracking-widest text-xs w-full sm:w-auto"
          >
            <UserPlus className="w-5 h-5" /> {showCreate ? 'Cancel' : 'Create New User'}
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="bg-bg2 border border-bg4 rounded-2xl p-6 sm:p-8 max-w-4xl shadow-2xl">
          <form onSubmit={handleCreate} className="space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-bg4">
              <div>
                <h4 className="text-base font-black text-text flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-po" />
                  Create New System Account
                </h4>
                <p className="text-[10px] text-text3 font-mono uppercase tracking-widest mt-0.5">
                  Configure credentials, role, departments and allowed pages
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="p-1.5 text-text3 hover:text-text hover:bg-bg3 rounded-xl transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-text3 uppercase tracking-widest">Username</label>
                <input 
                  type="text" 
                  required
                  value={newUser.username}
                  onChange={e => setNewUser({...newUser, username: e.target.value})}
                  className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold text-text outline-none focus:border-po"
                  placeholder="e.g. cutting_lead"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-text3 uppercase tracking-widest">Full Name</label>
                <input 
                  type="text" 
                  required
                  value={newUser.full_name}
                  onChange={e => setNewUser({...newUser, full_name: e.target.value})}
                  className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold text-text outline-none focus:border-po"
                  placeholder="e.g. John Doe"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-text3 uppercase tracking-widest">Password</label>
                <input 
                  type="password" 
                  required
                  value={newUser.password}
                  onChange={e => setNewUser({...newUser, password: e.target.value})}
                  className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold text-text outline-none focus:border-po"
                  placeholder="Min 6 characters"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-text3 uppercase tracking-widest">System Role</label>
                <select 
                  value={newUser.role}
                  onChange={e => {
                    const nextRole = e.target.value as Role;
                    const nextDept = nextRole === 'supervisor' ? 'All' : (newUser.department === 'All' ? 'Cutting' : newUser.department);
                    let defaultPages = newUser.allowed_pages;
                    if (nextRole === 'admin') {
                      defaultPages = SYSTEM_PAGES.map(p => p.id);
                    } else if (nextRole === 'viewer') {
                      defaultPages = ['dashboard', 'master_report', 'wip_report', 'status', 'dept_stores'];
                    }
                    setNewUser({
                      ...newUser, 
                      role: nextRole, 
                      department: nextDept,
                      allowed_pages: defaultPages,
                      allowed_departments: nextDept === 'All' ? ['All'] : [nextDept]
                    });
                  }}
                  className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold text-text outline-none"
                >
                  <option value="operator">Operator (Stage Data Entry)</option>
                  <option value="supervisor">Supervisor (Manager)</option>
                  <option value="admin">Administrator (Full Control)</option>
                  <option value="viewer">Status Viewer (ReadOnly)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono text-text3 uppercase tracking-widest">Primary Department</label>
                <select 
                  value={newUser.department}
                  onChange={e => {
                    const dept = e.target.value as any;
                    setNewUser({
                      ...newUser, 
                      department: dept,
                      allowed_departments: dept === 'All' ? ['All'] : [dept]
                    });
                  }}
                  className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold text-text outline-none"
                >
                  {newUser.role === 'supervisor' && (
                    <option value="All">All Departments (Universal Supervisor)</option>
                  )}
                  {departments.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Granular Page & Department Access Selector */}
            <div className="pt-2">
              <PermissionsSelector
                selectedPages={newUser.allowed_pages}
                onChangePages={(pages) => setNewUser({...newUser, allowed_pages: pages})}
                selectedDepartments={newUser.allowed_departments}
                onChangeDepartments={(depts) => setNewUser({...newUser, allowed_departments: depts})}
                departments={departments}
                role={newUser.role}
                canChangeTime={newUser.can_change_time}
                onChangeCanChangeTime={(canChange) => setNewUser({...newUser, can_change_time: canChange})}
              />
            </div>

            <button 
              type="submit"
              className="w-full bg-pass text-white font-black py-4 rounded-xl shadow-xl shadow-pass/30 hover:bg-emerald-600 transition-all uppercase tracking-widest text-sm cursor-pointer"
            >
              Initialize User Account & Grant Access
            </button>
          </form>
        </div>
      )}

      <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[750px]">
          <thead>
            <tr className="bg-bg3/50 border-b border-bg4 text-text">
              <th className="p-4 text-xs font-mono uppercase font-black">User</th>
              <th className="p-4 text-xs font-mono uppercase font-black">Dept / Role</th>
              <th className="p-4 text-xs font-mono uppercase font-black">Access Permissions</th>
              <th className="p-4 text-xs font-mono uppercase font-black">Status</th>
              <th className="p-4 text-xs font-mono uppercase font-black">Joined</th>
              <th className="p-4 text-xs font-mono uppercase font-black text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bg4">
            {filteredUsers.map((user) => (
              <tr key={user.id} className="hover:bg-bg3/20 transition-colors">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-bg4 flex items-center justify-center text-text2 font-bold uppercase shadow-inner border border-bg3">
                      {user.full_name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-text">{user.full_name}</p>
                      <p className="text-xs text-text3 font-mono">@{user.username}</p>
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-mono text-text3 uppercase font-black">{user.department}</span>
                    <div className="flex items-center gap-1.5">
                      {getRoleIcon(user.role)}
                      <span className="text-xs font-bold uppercase tracking-wider text-text">{user.role}</span>
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <UserPermissionsBadge 
                    user={user} 
                    onClick={() => setViewingUserPermissions(user)}
                  />
                </td>
                <td className="p-4">
                  <span className={cn(
                    "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase inline-block",
                    user.is_active ? "bg-pass/10 text-pass border border-pass/20" : "bg-reject/10 text-reject border border-reject/20"
                  )}>
                    {user.is_active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td className="p-4 text-xs font-mono text-text3">{fmtDate(user.created_at)}</td>
                <td className="p-4 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button 
                      onClick={() => setViewingUserPermissions(user)}
                      className="p-2 text-text3 hover:text-po hover:bg-bg3 rounded-lg transition-colors cursor-pointer"
                      title="Inspect User Access & Permissions"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => {
                        setDirectGrantTargetUserId(user.id);
                        setIsDirectGrantOpen(true);
                      }}
                      className="p-2 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors cursor-pointer"
                      title="Grant / Modify User Access by Admin Will"
                    >
                      <Key className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleEditClick(user)}
                      className="p-2 text-text3 hover:text-po hover:bg-bg3 rounded-lg transition-colors cursor-pointer"
                      title="Configure User Credentials & Permissions"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {user.id !== currentUser?.id && user.role !== 'admin' && (
                      <button 
                        onClick={() => handleDelete(user.id)}
                        className="p-2 text-text3 hover:text-reject hover:bg-reject/10 rounded-lg transition-colors cursor-pointer"
                        title="Delete User"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    {/* Dynamic Department Builder (Admin Only) - Hidden for future improvements */}
    {false && currentUser?.role === 'admin' && (
      <div className="space-y-6">
        <div>
          <h3 className="text-xl font-bold tracking-tight">Dynamic Department Builder</h3>
          <p className="text-text3 text-xs font-mono uppercase tracking-widest mt-1">Configure and manage ERP system departments dynamically</p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Create Form */}
          <div className="bg-bg2 border border-bg4 rounded-2xl p-6 h-fit space-y-4">
            <h4 className="text-sm font-bold uppercase tracking-wider text-text flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-po" />
              Add Dynamic Department
            </h4>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-mono text-text3 uppercase tracking-widest">Department Name</label>
                <input 
                  type="text"
                  placeholder="e.g. Sampling, Embroidery"
                  value={newDeptName}
                  onChange={e => setNewDeptName(e.target.value)}
                  className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold mt-1"
                />
              </div>
              <p className="text-[10px] text-text3 italic">
                * Newly created departments are custom. Standard departments (like Cutting, Stitching) cannot be modified or duplicated.
              </p>
              <button 
                onClick={handleCreateDepartment}
                className="w-full bg-po text-white font-black py-3 rounded-xl shadow-lg transition-all hover:bg-blue-600 uppercase tracking-widest text-xs"
              >
                Create Department
              </button>
            </div>
          </div>

          {/* Department List */}
          <div className="lg:col-span-2 bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 bg-bg3/30 border-b border-bg4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-text">Configured Departments</h4>
            </div>
            <div className="divide-y divide-bg4 max-h-[300px] overflow-y-auto">
              {rawDepartments.map((dept) => (
                <div key={dept.id} className="p-4 flex items-center justify-between hover:bg-bg3/20 transition-all">
                  <div>
                    <h5 className="font-bold text-sm text-text">{dept.name}</h5>
                    <p className="text-[9px] font-mono text-text3 uppercase tracking-wide">
                      Added: {fmtDate(dept.created_at)}
                    </p>
                  </div>
                  <div>
                    {dept.is_system ? (
                      <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-po/10 text-po border border-po/20">
                        System (Locked)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-pass/10 text-pass border border-pass/20">
                        Custom
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )}

    {/* System Audit Logs (Admin Only) */}
    {currentUser?.role === 'admin' && (
      <div className="space-y-6 mt-8">
        <div>
          <h3 className="text-xl font-bold tracking-tight">System Audit Trail & Live Activity Ledger</h3>
          <p className="text-text3 text-xs font-mono uppercase tracking-widest mt-1">Plain-English Operator Operations, Style/Color/Size Specs, & One-Click State Undo</p>
        </div>
        <AuditLogViewer
          logs={auditLogs}
          loading={isLoadingLogs}
          onRefresh={fetchAuditLogs}
          onUndo={async (logId: number) => {
            setUndoingLogId(logId);
            try {
              const res = await userService.undoAuditLog(logId);
              showToast(res.message || 'Action reverted successfully!');
              fetchAuditLogs();
              fetchUsers();
            } catch (error: any) {
              showToast(error.error || error.message || 'Failed to undo action.', 'error');
            } finally {
              setUndoingLogId(null);
            }
          }}
          undoingLogId={undoingLogId}
        />
      </div>
    )}

    {/* Edit User Modal */}
    <AnimatePresence>
      {editingUser !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setEditingUser(null)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-4xl bg-bg2 border border-bg4 rounded-2xl shadow-2xl p-6 sm:p-8 overflow-hidden z-10 text-left max-h-[90vh] flex flex-col"
          >
            <div className="flex items-center justify-between pb-4 border-b border-bg4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-po/10 flex items-center justify-center text-po font-black text-lg">
                  {editForm.full_name.charAt(0) || 'U'}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-text">Edit User Profile & Permissions</h3>
                  <p className="text-[10px] text-text3 font-mono uppercase tracking-widest mt-0.5">
                    User: @{editForm.username} • Role: {editForm.role}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setEditingUser(null)}
                className="p-2 text-text3 hover:text-text hover:bg-bg3 rounded-xl transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex border-b border-bg4 gap-3 pt-3 shrink-0">
              <button
                type="button"
                onClick={() => setEditTab('account')}
                className={cn(
                  "pb-2.5 px-3 text-xs font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer flex items-center gap-2",
                  editTab === 'account'
                    ? "border-po text-po"
                    : "border-transparent text-text3 hover:text-text"
                )}
              >
                <Users className="w-4 h-4" />
                Account & Credentials
              </button>
              <button
                type="button"
                onClick={() => setEditTab('permissions')}
                className={cn(
                  "pb-2.5 px-3 text-xs font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer flex items-center gap-2",
                  editTab === 'permissions'
                    ? "border-po text-po"
                    : "border-transparent text-text3 hover:text-text"
                )}
              >
                <Sliders className="w-4 h-4" />
                Page & Department Permissions
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-po/10 text-po">
                  {editForm.allowed_pages.length} Pages
                </span>
              </button>
            </div>

            <form onSubmit={handleUpdate} className="flex-1 overflow-y-auto space-y-6 pt-5 pr-1 flex flex-col">
              {editTab === 'account' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono text-text3 uppercase tracking-widest">Full Name</label>
                      <input 
                        type="text" 
                        required
                        value={editForm.full_name}
                        onChange={e => setEditForm({...editForm, full_name: e.target.value})}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold text-text focus:border-po outline-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-mono text-text3 uppercase tracking-widest">Username</label>
                      <input 
                        type="text" 
                        required
                        value={editForm.username}
                        onChange={e => setEditForm({...editForm, username: e.target.value})}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold text-text focus:border-po outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-mono text-text3 uppercase tracking-widest">New Password (leave blank to keep current)</label>
                    <input 
                      type="password" 
                      value={editForm.password}
                      placeholder="••••••••••••"
                      onChange={e => setEditForm({...editForm, password: e.target.value})}
                      className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold text-text focus:border-po outline-none placeholder:text-text3/40"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono text-text3 uppercase tracking-widest">System Role</label>
                      <select 
                        value={editForm.role}
                        onChange={e => {
                          const nextRole = e.target.value as Role;
                          const nextDept = nextRole === 'supervisor' ? 'All' : (editForm.department === 'All' ? 'Cutting' : editForm.department);
                          let defaultPages = editForm.allowed_pages;
                          if (nextRole === 'admin' && defaultPages.length === 0) {
                            defaultPages = SYSTEM_PAGES.map(p => p.id);
                          }
                          setEditForm({
                            ...editForm, 
                            role: nextRole, 
                            department: nextDept,
                            allowed_pages: defaultPages
                          });
                        }}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold text-text outline-none"
                      >
                        <option value="operator">Operator (Stage Data Entry)</option>
                        <option value="supervisor">Supervisor (Manager)</option>
                        <option value="admin">Administrator (Full Master)</option>
                        <option value="viewer">Status Viewer (ReadOnly)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono text-text3 uppercase tracking-widest">Primary Department</label>
                      <select 
                        value={editForm.department}
                        onChange={e => setEditForm({...editForm, department: e.target.value})}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold text-text outline-none"
                      >
                        {editForm.role === 'supervisor' && (
                          <option value="All">All Departments (Universal Supervisor)</option>
                        )}
                        {departments.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-bg3/40 border border-bg4 rounded-xl p-4">
                    <input 
                      type="checkbox" 
                      id="edit_is_active"
                      checked={editForm.is_active}
                      onChange={e => setEditForm({...editForm, is_active: e.target.checked})}
                      className="w-4 h-4 text-po focus:ring-po border-bg4 rounded"
                    />
                    <div>
                      <label htmlFor="edit_is_active" className="text-xs font-bold text-text block cursor-pointer">Active Account</label>
                      <span className="text-[10px] text-text3 font-mono uppercase">Allow this user to sign in to the platform</span>
                    </div>
                  </div>
                </div>
              )}

              {editTab === 'permissions' && (
                <div className="space-y-4">
                  <PermissionsSelector
                    selectedPages={editForm.allowed_pages}
                    onChangePages={(pages) => setEditForm({...editForm, allowed_pages: pages})}
                    selectedDepartments={editForm.allowed_departments}
                    onChangeDepartments={(depts) => setEditForm({...editForm, allowed_departments: depts})}
                    departments={departments}
                    role={editForm.role}
                    canChangeTime={editForm.can_change_time}
                    onChangeCanChangeTime={(canChange) => setEditForm({...editForm, can_change_time: canChange})}
                  />
                </div>
              )}

              <div className="flex justify-between items-center pt-4 border-t border-bg4 mt-auto shrink-0">
                <div className="flex items-center gap-2 text-xs text-text3">
                  {editTab === 'account' ? (
                    <button
                      type="button"
                      onClick={() => setEditTab('permissions')}
                      className="text-po font-bold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Sliders className="w-3.5 h-3.5" /> Next: Configure Permissions →
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditTab('account')}
                      className="text-po font-bold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      ← Back to Account Credentials
                    </button>
                  )}
                </div>

                <div className="flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="px-6 py-3 bg-bg3 text-text hover:bg-bg4 font-bold rounded-xl text-xs uppercase cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-6 py-3 bg-po text-white font-black hover:bg-blue-600 rounded-xl text-xs uppercase shadow-lg shadow-po/15 cursor-pointer"
                  >
                    Save Changes & Permissions
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

    {/* User Permissions Preview Modal */}
    <UserPermissionsModal
      user={viewingUserPermissions}
      onClose={() => setViewingUserPermissions(null)}
      onEdit={(user) => {
        setDirectGrantTargetUserId(user.id);
        setIsDirectGrantOpen(true);
      }}
    />

    {/* Direct Permission Grant Modal (Admin Will) */}
    <DirectPermissionGrantModal
      isOpen={isDirectGrantOpen}
      onClose={() => {
        setIsDirectGrantOpen(false);
        setDirectGrantTargetUserId(null);
      }}
      initialUserId={directGrantTargetUserId || undefined}
      onGranted={() => {
        fetchUsers();
      }}
    />

    {/* Custom Toast Notification Overlay */}
    <AnimatePresence>
      {notification && (
        <motion.div
          id="system-toast"
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className={cn(
            "fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl border font-bold text-sm min-w-[320px] max-w-md",
            notification.type === 'success' 
              ? "bg-bg2 border-pass/30 text-pass shadow-pass/5" 
              : "bg-bg2 border-reject/30 text-reject shadow-reject/5"
          )}
        >
          {notification.type === 'success' ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0 text-pass" />
          ) : (
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-reject" />
          )}
          <div className="flex-1 text-text">{notification.message}</div>
          <button 
            type="button"
            onClick={() => setNotification(null)}
            className="text-text3 hover:text-text transition-colors p-1 rounded-lg hover:bg-bg3"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Custom Confirmation Dialog Overlay */}
    <AnimatePresence>
      {confirmDialog && (
        <div id="system-confirm-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-bg2 border border-bg4 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-6"
          >
            <div className="space-y-2">
              <h4 className="text-base font-black text-text tracking-tight flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-po" />
                {confirmDialog.title}
              </h4>
              <p className="text-xs text-text3 leading-relaxed">{confirmDialog.message}</p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 bg-bg3 text-text hover:bg-bg4 hover:text-text font-bold rounded-lg text-xs uppercase"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const action = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  action();
                }}
                className="px-4 py-2 bg-po text-white hover:bg-blue-600 font-black rounded-lg text-xs uppercase shadow-lg shadow-po/15"
              >
                Confirm
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  </div>
);
};
