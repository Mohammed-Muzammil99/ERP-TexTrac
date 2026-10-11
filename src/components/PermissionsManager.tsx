import React, { useState } from 'react';
import { 
  LayoutDashboard, Building2, Layers, Activity, FileText, Scissors, Send, 
  CheckCircle2, Package, Warehouse, Truck, Droplets, Users, Database, 
  RotateCcw, Trash2, Check, X, Shield, ShieldCheck, Sparkles, Filter, Search,
  Lock, Key, Sliders, CheckSquare, Square, Clock, AlertCircle, Bell
} from 'lucide-react';
import { cn } from '../lib/utils';
import { User, Role } from '../types';

export interface SystemPageDef {
  id: string;
  label: string;
  category: 'analytics' | 'production' | 'inventory' | 'admin';
  categoryLabel: string;
  description: string;
  icon: any;
}

export const SYSTEM_PAGES: SystemPageDef[] = [
  // Analytics & Reports
  { 
    id: 'dashboard', 
    label: 'Dashboard', 
    category: 'analytics', 
    categoryLabel: 'Analytics & Reports', 
    description: 'Live metrics, KPI overview & hourly production one-view', 
    icon: LayoutDashboard 
  },
  { 
    id: 'master_report', 
    label: 'Factory 360°', 
    category: 'analytics', 
    categoryLabel: 'Analytics & Reports', 
    description: 'Factory-wide progress matrix and master style tracker', 
    icon: Building2 
  },
  { 
    id: 'wip_report', 
    label: 'WIP Report', 
    category: 'analytics', 
    categoryLabel: 'Analytics & Reports', 
    description: 'Stage pipelines, WIP store balances & bottleneck indicators', 
    icon: Layers 
  },
  { 
    id: 'status', 
    label: 'Department Status', 
    category: 'analytics', 
    categoryLabel: 'Analytics & Reports', 
    description: 'Real-time hourly and daily department output log summary', 
    icon: Activity 
  },

  // Production Flow Stages
  { 
    id: 'po', 
    label: 'Production Orders', 
    category: 'production', 
    categoryLabel: 'Production Pipeline', 
    description: 'PO master, purchase order creation, priority & buyer breakdown', 
    icon: FileText 
  },
  { 
    id: 'cutting', 
    label: 'Cutting Department', 
    category: 'production', 
    categoryLabel: 'Production Pipeline', 
    description: 'Cutting orders, marker plans, lay records & cutting logs', 
    icon: Scissors 
  },
  { 
    id: 'sending', 
    label: 'Feeding / Sending', 
    category: 'production', 
    categoryLabel: 'Production Pipeline', 
    description: 'Line feeding handovers, cutting-to-stitching distribution', 
    icon: Send 
  },
  { 
    id: 'stitching', 
    label: 'Stitching Lines', 
    category: 'production', 
    categoryLabel: 'Production Pipeline', 
    description: 'Line-wise sewing output, operator records & hourly inputs', 
    icon: Activity 
  },
  { 
    id: 'finishing', 
    label: 'Finishing & Inspection', 
    category: 'production', 
    categoryLabel: 'Production Pipeline', 
    description: 'Garment checking, quality auditing & audit passing logs', 
    icon: CheckCircle2 
  },
  { 
    id: 'packing', 
    label: 'Packing Department', 
    category: 'production', 
    categoryLabel: 'Production Pipeline', 
    description: 'Blister packing, polybag packing, carton logging & ratio audits', 
    icon: Package 
  },
  { 
    id: 'press', 
    label: 'Pressing Log', 
    category: 'production', 
    categoryLabel: 'Production Pipeline', 
    description: 'Ironing, pressing & garment steam finishing logs', 
    icon: CheckCircle2 
  },
  { 
    id: 'discards', 
    label: 'Discards Log', 
    category: 'production', 
    categoryLabel: 'Production Pipeline', 
    description: 'Factory scrap, fabric defect & discarded garment records', 
    icon: Trash2 
  },
  { 
    id: 'returns', 
    label: 'Returns Log', 
    category: 'production', 
    categoryLabel: 'Production Pipeline', 
    description: 'Defect return logs between stitching, finishing and stores', 
    icon: RotateCcw 
  },

  // Inventory & Logistics
  { 
    id: 'fabric', 
    label: 'Fabric Management', 
    category: 'inventory', 
    categoryLabel: 'Inventory & Stores', 
    description: 'Fabric rolls, inspection, GSM, consumption & stock balances', 
    icon: Droplets 
  },
  { 
    id: 'store', 
    label: 'Store (Stock)', 
    category: 'inventory', 
    categoryLabel: 'Inventory & Stores', 
    description: 'Finished goods inventory, warehouse balances & stock receipts', 
    icon: Warehouse 
  },
  { 
    id: 'dept_stores', 
    label: 'Dept Buffer Stores', 
    category: 'inventory', 
    categoryLabel: 'Inventory & Stores', 
    description: 'Intermediate stage WIP stores & departmental handovers', 
    icon: Layers 
  },
  { 
    id: 'old_stock', 
    label: 'Old Stock Store', 
    category: 'inventory', 
    categoryLabel: 'Inventory & Stores', 
    description: 'Archival inventory, legacy styles & surplus stock records', 
    icon: RotateCcw 
  },
  { 
    id: 'shipping', 
    label: 'Shipped / Logistics', 
    category: 'inventory', 
    categoryLabel: 'Inventory & Stores', 
    description: 'Container dispatch, gate passes, export logs & shipments', 
    icon: Truck 
  },

  // Administration & Diagnostics
  { 
    id: 'users', 
    label: 'User Management', 
    category: 'admin', 
    categoryLabel: 'System & Admin', 
    description: 'User credentials, roles, granular page & department access', 
    icon: Users 
  },
  { 
    id: 'sqa_diagnostics', 
    label: 'SQA Diagnostics', 
    category: 'admin', 
    categoryLabel: 'System & Admin', 
    description: 'Database integrity diagnostics, sequence auditing & health', 
    icon: Database 
  },
  { 
    id: 'custom_depts', 
    label: 'Custom Depts', 
    category: 'admin', 
    categoryLabel: 'System & Admin', 
    description: 'Dynamic custom department workflows and entries', 
    icon: Building2 
  },
];

export const PERMISSION_PRESETS: { name: string; icon: string; desc: string; pages: string[]; depts: string[] }[] = [
  {
    name: 'Full Admin',
    icon: '⚡',
    desc: 'All 21 system pages & all departments',
    pages: SYSTEM_PAGES.map(p => p.id),
    depts: ['All']
  },
  {
    name: 'Cutting & Fabric Team',
    icon: '✂️',
    desc: 'Dashboard, Status, Cutting, Feeding, Fabric, Dept Stores, Discards',
    pages: ['dashboard', 'status', 'cutting', 'sending', 'fabric', 'dept_stores', 'discards'],
    depts: ['Cutting']
  },
  {
    name: 'Stitching Team',
    icon: '🪡',
    desc: 'Dashboard, Status, Stitching, Dept Stores, Returns, Discards',
    pages: ['dashboard', 'status', 'stitching', 'dept_stores', 'returns', 'discards'],
    depts: ['Stitching']
  },
  {
    name: 'Finishing & QC Team',
    icon: '✨',
    desc: 'Dashboard, Status, Finishing, Pressing, Discards, Dept Stores, Returns',
    pages: ['dashboard', 'status', 'finishing', 'press', 'discards', 'dept_stores', 'returns'],
    depts: ['Finishing', 'Quality']
  },
  {
    name: 'Packing & Warehouse',
    icon: '📦',
    desc: 'Dashboard, Status, Packing, Store Stock, Dept Stores, Old Stock',
    pages: ['dashboard', 'status', 'packing', 'store', 'dept_stores', 'old_stock'],
    depts: ['Packing', 'Store']
  },
  {
    name: 'Shipping & Logistics',
    icon: '🚚',
    desc: 'Dashboard, Status, Store Stock, Shipping',
    pages: ['dashboard', 'status', 'store', 'shipping'],
    depts: ['Shipping', 'Store']
  },
  {
    name: 'Factory Supervisor',
    icon: '🏭',
    desc: 'All production, inventory & analytics pages across all departments',
    pages: SYSTEM_PAGES.filter(p => p.id !== 'users').map(p => p.id),
    depts: ['All']
  },
  {
    name: 'Executive Viewer',
    icon: '👁️',
    desc: 'Read-only access to Dashboard, Factory 360°, WIP & Status reports',
    pages: ['dashboard', 'master_report', 'wip_report', 'status', 'dept_stores'],
    depts: ['All']
  },
];

interface PermissionsSelectorProps {
  selectedPages: string[];
  onChangePages: (pages: string[]) => void;
  selectedDepartments: string[];
  onChangeDepartments: (depts: string[]) => void;
  departments: string[];
  role?: Role;
  canChangeTime?: boolean;
  onChangeCanChangeTime?: (canChange: boolean) => void;
}

export const PermissionsSelector: React.FC<PermissionsSelectorProps> = ({
  selectedPages,
  onChangePages,
  selectedDepartments,
  onChangeDepartments,
  departments,
  role,
  canChangeTime = false,
  onChangeCanChangeTime
}) => {
  const [activeTab, setActiveTab] = useState<'pages' | 'departments' | 'time'>('pages');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const categories = [
    { id: 'all', label: 'All Categories' },
    { id: 'analytics', label: 'Analytics & Reports' },
    { id: 'production', label: 'Production Pipeline' },
    { id: 'inventory', label: 'Inventory & Stores' },
    { id: 'admin', label: 'System & Admin' },
  ];

  const filteredPages = SYSTEM_PAGES.filter(page => {
    if (categoryFilter !== 'all' && page.category !== categoryFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return page.label.toLowerCase().includes(q) || page.description.toLowerCase().includes(q) || page.id.toLowerCase().includes(q);
    }
    return true;
  });

  const togglePage = (pageId: string) => {
    if (selectedPages.includes(pageId)) {
      onChangePages(selectedPages.filter(p => p !== pageId));
    } else {
      onChangePages([...selectedPages, pageId]);
    }
  };

  const selectAllPages = () => {
    onChangePages(SYSTEM_PAGES.map(p => p.id));
  };

  const clearAllPages = () => {
    onChangePages([]);
  };

  const toggleCategoryPages = (catId: string) => {
    const catPageIds = SYSTEM_PAGES.filter(p => p.category === catId).map(p => p.id);
    const allSelected = catPageIds.every(id => selectedPages.includes(id));
    if (allSelected) {
      onChangePages(selectedPages.filter(id => !catPageIds.includes(id)));
    } else {
      const merged = Array.from(new Set([...selectedPages, ...catPageIds]));
      onChangePages(merged);
    }
  };

  const applyPreset = (preset: typeof PERMISSION_PRESETS[0]) => {
    onChangePages(preset.pages);
    onChangeDepartments(preset.depts);
  };

  const toggleDepartment = (dept: string) => {
    if (dept === 'All') {
      if (selectedDepartments.includes('All')) {
        onChangeDepartments([]);
      } else {
        onChangeDepartments(['All']);
      }
      return;
    }

    let next = selectedDepartments.filter(d => d !== 'All');
    if (next.includes(dept)) {
      next = next.filter(d => d !== dept);
    } else {
      next = [...next, dept];
    }
    onChangeDepartments(next);
  };

  const selectAllDepartments = () => {
    onChangeDepartments(['All', ...departments]);
  };

  const clearAllDepartments = () => {
    onChangeDepartments([]);
  };

  const allAvailableDepts = Array.from(new Set(['Admin', 'Cutting', 'Stitching', 'Finishing', 'Packing', 'Shipping', 'Store', 'Quality', ...departments]));

  return (
    <div className="space-y-5 bg-bg3/30 border border-bg4 rounded-2xl p-5 text-left">
      {/* Header with Preset Quick-Actions */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-po" />
            <h4 className="text-xs font-black uppercase tracking-wider text-text">
              Access Control & Permissions Matrix
            </h4>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-po/10 text-po border border-po/20">
              {selectedPages.length} of {SYSTEM_PAGES.length} Pages
            </span>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              {selectedDepartments.includes('All') ? 'All Depts' : `${selectedDepartments.length} Depts`}
            </span>
            {(canChangeTime || role === 'admin') && (
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Time-Access
              </span>
            )}
          </div>
        </div>

        {/* Presets Toolbar */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono uppercase tracking-widest text-text3 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-amber-500" /> 1-Click Role & Workflow Presets:
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PERMISSION_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => applyPreset(preset)}
                className="px-2.5 py-1.5 bg-bg2 hover:bg-po hover:text-white text-text2 text-[11px] font-bold rounded-xl border border-bg4 transition-all flex items-center gap-1.5 group cursor-pointer shadow-xs"
                title={preset.desc}
              >
                <span>{preset.icon}</span>
                <span>{preset.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-bg4 gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('pages')}
          className={cn(
            "pb-2.5 px-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer flex items-center gap-2 whitespace-nowrap",
            activeTab === 'pages'
              ? "border-po text-po"
              : "border-transparent text-text3 hover:text-text"
          )}
        >
          <Layers className="w-4 h-4" />
          Pages Access ({selectedPages.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('departments')}
          className={cn(
            "pb-2.5 px-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer flex items-center gap-2 whitespace-nowrap",
            activeTab === 'departments'
              ? "border-po text-po"
              : "border-transparent text-text3 hover:text-text"
          )}
        >
          <Building2 className="w-4 h-4" />
          Departments ({selectedDepartments.includes('All') ? 'All' : selectedDepartments.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('time')}
          className={cn(
            "pb-2.5 px-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer flex items-center gap-2 whitespace-nowrap",
            activeTab === 'time'
              ? "border-amber-500 text-amber-500"
              : (canChangeTime ? "border-transparent text-amber-500/80 hover:text-amber-400" : "border-transparent text-text3 hover:text-text")
          )}
        >
          <Clock className="w-4 h-4" />
          Time Control {canChangeTime || role === 'admin' ? '(Enabled)' : '(Disabled)'}
        </button>
      </div>

      {/* Tab Content: Time Control */}
      {activeTab === 'time' && (
        <div className="space-y-4 pt-1">
          <div className={cn(
            "p-5 rounded-2xl border transition-all",
            canChangeTime || role === 'admin'
              ? "bg-amber-500/10 border-amber-500/30"
              : "bg-bg2/60 border-bg4"
          )}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
                  canChangeTime || role === 'admin'
                    ? "bg-amber-500/20 text-amber-500 border-amber-500/40"
                    : "bg-bg3 text-text3 border-bg4"
                )}>
                  <Clock className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-black text-text">Direct Time Adjustment (Date Locked)</h4>
                    {role === 'admin' ? (
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        Admin Unrestricted
                      </span>
                    ) : canChangeTime ? (
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        Privilege Granted
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-bg4 text-text3 border border-bg4">
                        Standard Request Required
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text2 leading-relaxed">
                    Allows this user to adjust the active factory working clock/time directly without waiting for admin approval. 
                    The date remains strictly locked to prevent backdating errors, and the Admin receives an automated real-time notification.
                  </p>
                </div>
              </div>

              {onChangeCanChangeTime && role !== 'admin' && (
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                  <input
                    type="checkbox"
                    checked={canChangeTime}
                    onChange={(e) => onChangeCanChangeTime(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-bg4 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              )}
            </div>

            {/* Feature Details / Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-bg4/60">
              <div className="flex items-start gap-2 text-xs text-text2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>Instant Time Change:</strong> Switch line shifts and timestamps on demand.</span>
              </div>
              <div className="flex items-start gap-2 text-xs text-text2">
                <Lock className="w-4 h-4 text-po shrink-0 mt-0.5" />
                <span><strong>Date Strictly Locked:</strong> Cannot alter the calendar date without Admin Request.</span>
              </div>
              <div className="flex items-start gap-2 text-xs text-text2">
                <Bell className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span><strong>Admin Auto-Notification:</strong> Auto-logged into audit trails & request history.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: Pages */}
      {activeTab === 'pages' && (
        <div className="space-y-4">
          {/* Controls: Search, Filter & Quick Bulk Actions */}
          <div className="flex flex-col sm:flex-row gap-2 justify-between items-stretch sm:items-center">
            <div className="flex flex-1 gap-2 items-center">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
                <input
                  type="text"
                  placeholder="Filter pages (e.g. cutting, wip, reports)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-bg2 border border-bg4 rounded-xl text-xs text-text placeholder:text-text3/50 focus:border-po outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text3 hover:text-text"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-bg2 border border-bg4 rounded-xl px-2.5 py-1.5 text-xs font-bold text-text outline-none"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={selectAllPages}
                className="px-3 py-1.5 bg-bg2 hover:bg-bg4 text-text2 text-[11px] font-bold rounded-xl border border-bg4 transition-colors cursor-pointer flex items-center gap-1"
              >
                <CheckSquare className="w-3.5 h-3.5 text-emerald-500" /> Select All
              </button>
              <button
                type="button"
                onClick={clearAllPages}
                className="px-3 py-1.5 bg-bg2 hover:bg-bg4 text-text2 text-[11px] font-bold rounded-xl border border-bg4 transition-colors cursor-pointer flex items-center gap-1"
              >
                <Square className="w-3.5 h-3.5 text-rose-500" /> Clear All
              </button>
            </div>
          </div>

          {/* Category Sections */}
          <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
            {['analytics', 'production', 'inventory', 'admin'].map((catId) => {
              const catPages = filteredPages.filter(p => p.category === catId);
              if (catPages.length === 0) return null;

              const allCatSelected = catPages.every(p => selectedPages.includes(p.id));
              const selectedCount = catPages.filter(p => selectedPages.includes(p.id)).length;
              const catDef = categories.find(c => c.id === catId);

              return (
                <div key={catId} className="bg-bg2 border border-bg4/70 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between pb-1.5 border-b border-bg4/50">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-black uppercase tracking-wider text-text">
                        {catDef?.label}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-bg3 text-text3">
                        {selectedCount}/{catPages.length} active
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleCategoryPages(catId)}
                      className="text-[10px] font-bold text-po hover:underline cursor-pointer"
                    >
                      {allCatSelected ? 'Deselect Category' : 'Select Category'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {catPages.map((page) => {
                      const Icon = page.icon;
                      const isSelected = selectedPages.includes(page.id);
                      return (
                        <div
                          key={page.id}
                          onClick={() => togglePage(page.id)}
                          className={cn(
                            "flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer select-none",
                            isSelected
                              ? "bg-po/5 border-po/50 shadow-xs"
                              : "bg-bg3/40 border-bg4 hover:border-bg4 hover:bg-bg3"
                          )}
                        >
                          <div className={cn(
                            "w-4 h-4 rounded mt-0.5 flex items-center justify-center border transition-all shrink-0",
                            isSelected
                              ? "bg-po border-po text-white"
                              : "border-bg4 bg-bg2"
                          )}>
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Icon className={cn("w-3.5 h-3.5 shrink-0", isSelected ? "text-po" : "text-text3")} />
                              <span className={cn(
                                "text-xs font-bold truncate",
                                isSelected ? "text-text" : "text-text2"
                              )}>
                                {page.label}
                              </span>
                            </div>
                            <p className="text-[10px] text-text3 line-clamp-1 mt-0.5">
                              {page.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab Content: Departments */}
      {activeTab === 'departments' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-bg4">
            <p className="text-xs text-text3">
              Configure which factory department pipelines this user can access or switch between.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAllDepartments}
                className="px-2.5 py-1 bg-bg2 hover:bg-bg4 text-text2 text-[11px] font-bold rounded-lg border border-bg4 transition-colors cursor-pointer"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={clearAllDepartments}
                className="px-2.5 py-1 bg-bg2 hover:bg-bg4 text-text2 text-[11px] font-bold rounded-lg border border-bg4 transition-colors cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {/* All Departments (Universal) Card */}
            <div
              onClick={() => toggleDepartment('All')}
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer col-span-full select-none",
                selectedDepartments.includes('All')
                  ? "bg-po/10 border-po/60 shadow-xs"
                  : "bg-bg2 border-bg4 hover:bg-bg3"
              )}
            >
              <div className={cn(
                "w-5 h-5 rounded flex items-center justify-center border transition-all shrink-0",
                selectedDepartments.includes('All')
                  ? "bg-po border-po text-white"
                  : "border-bg4 bg-bg3"
              )}>
                {selectedDepartments.includes('All') && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-po" />
                  <span className="text-xs font-black uppercase tracking-wider text-text">
                    All Factory Departments (Universal Access)
                  </span>
                </div>
                <p className="text-[10px] text-text3 mt-0.5">
                  Bypasses all departmental restrictions (ideal for General Factory Supervisors & Plant Managers).
                </p>
              </div>
            </div>

            {allAvailableDepts.map((dept) => {
              const isSelected = selectedDepartments.includes('All') || selectedDepartments.includes(dept);
              return (
                <div
                  key={dept}
                  onClick={() => toggleDepartment(dept)}
                  className={cn(
                    "flex items-center gap-2.5 p-3 rounded-xl border transition-all cursor-pointer select-none",
                    isSelected
                      ? "bg-emerald-500/10 border-emerald-500/40 shadow-xs"
                      : "bg-bg2 border-bg4 hover:bg-bg3"
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 rounded flex items-center justify-center border transition-all shrink-0",
                    isSelected
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : "border-bg4 bg-bg3"
                  )}>
                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-text block">{dept}</span>
                    <span className="text-[10px] text-text3 font-mono">Department</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// Interactive Permissions Badge for Table View
export const UserPermissionsBadge: React.FC<{ user: User; onClick?: () => void }> = ({ user, onClick }) => {
  if (user.role === 'admin') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-500 border border-rose-500/20 text-xs font-black tracking-wide uppercase hover:bg-rose-500/20 transition-all cursor-pointer"
        title="Admin has full unrestricted access to all pages, departments, and date/time controls"
      >
        <ShieldCheck className="w-3.5 h-3.5" />
        Full Admin Access
      </button>
    );
  }

  const pagesCount = user.allowed_pages && Array.isArray(user.allowed_pages) 
    ? user.allowed_pages.length 
    : (user.allowed_pages ? JSON.parse(user.allowed_pages as any).length : null);

  const deptsCount = user.allowed_departments && Array.isArray(user.allowed_departments)
    ? user.allowed_departments.length
    : (user.allowed_departments ? JSON.parse(user.allowed_departments as any).length : null);

  const hasTimeAccess = user.can_change_time === 1 || user.can_change_time === true;
  const isCustomConfigured = pagesCount !== null || deptsCount !== null || hasTimeAccess;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition-all cursor-pointer flex-wrap",
        isCustomConfigured
          ? "bg-po/10 text-po border-po/30 hover:bg-po/20"
          : "bg-bg3 text-text3 border-bg4 hover:text-text hover:bg-bg4"
      )}
      title="Click to view full permissions breakdown"
    >
      <Key className="w-3.5 h-3.5 shrink-0" />
      {pagesCount !== null ? (
        <span>{pagesCount} Pages</span>
      ) : (
        <span>Role Default</span>
      )}
      <span className="text-text3">•</span>
      {deptsCount !== null ? (
        <span>{user.allowed_departments?.includes('All') ? 'All Depts' : `${deptsCount} Depts`}</span>
      ) : (
        <span>{user.department}</span>
      )}
      {hasTimeAccess && (
        <>
          <span className="text-text3">•</span>
          <span className="inline-flex items-center gap-0.5 text-amber-500 font-mono text-[11px]" title="Direct Time Adjustment Enabled (Date Locked)">
            <Clock className="w-3 h-3" /> Time-Access
          </span>
        </>
      )}
    </button>
  );
};

// Detailed Read-only Permissions Breakdown Modal
export const UserPermissionsModal: React.FC<{
  user: User | null;
  onClose: () => void;
  onEdit?: (user: User) => void;
}> = ({ user, onClose, onEdit }) => {
  if (!user) return null;

  const rawPages = user.allowed_pages 
    ? (Array.isArray(user.allowed_pages) ? user.allowed_pages : JSON.parse(user.allowed_pages as any)) 
    : (user.role === 'admin' ? SYSTEM_PAGES.map(p => p.id) : []);

  const rawDepts = user.allowed_departments
    ? (Array.isArray(user.allowed_departments) ? user.allowed_departments : JSON.parse(user.allowed_departments as any))
    : (user.role === 'admin' || user.department === 'All' ? ['All'] : [user.department]);

  const hasTimePrivilege = user.role === 'admin' || user.can_change_time === 1 || user.can_change_time === true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-bg2 border border-bg4 w-full max-w-2xl rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden space-y-6 text-left max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-bg4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-po/10 border border-po/20 flex items-center justify-center text-po font-black text-lg">
              {user.full_name.charAt(0)}
            </div>
            <div>
              <h3 className="text-base font-black text-text flex items-center gap-2">
                {user.full_name}
                <span className="text-xs font-mono text-text3 font-normal">(@{user.username})</span>
              </h3>
              <p className="text-[10px] text-po font-mono uppercase tracking-widest mt-0.5">
                Role: {user.role} • Primary Dept: {user.department}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-text3 hover:text-text hover:bg-bg3 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {/* Time Control Privilege Card */}
          <div className={cn(
            "p-3.5 rounded-xl border flex items-start gap-3 text-xs",
            hasTimePrivilege
              ? "bg-amber-500/10 border-amber-500/25 text-text"
              : "bg-bg3/40 border-bg4 text-text3"
          )}>
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border mt-0.5",
              hasTimePrivilege
                ? "bg-amber-500/20 text-amber-500 border-amber-500/30"
                : "bg-bg4 text-text3 border-bg4"
            )}>
              <Clock className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-text">Direct Time Adjustment Access</span>
                {hasTimePrivilege ? (
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Granted (Date Locked)
                  </span>
                ) : (
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-bg4 text-text3 border border-bg4">
                    Admin Request Required
                  </span>
                )}
              </div>
              <p className="text-[11px] text-text3 mt-0.5 leading-relaxed">
                {hasTimePrivilege
                  ? "User can adjust production time (HH:mm) directly without admin pre-approval. Working date is locked, and admin is notified automatically."
                  : "User cannot modify time directly; must request time/date change permissions via the Admin Approval workflow."}
              </p>
            </div>
          </div>

          {/* Departments Allowed */}
          <div className="space-y-2">
            <h4 className="text-xs font-mono uppercase tracking-wider text-text3 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-emerald-500" />
              Allowed Departments ({rawDepts.includes('All') ? 'All Factory Departments' : rawDepts.length}):
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {rawDepts.includes('All') ? (
                <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-xs font-bold rounded-lg">
                  ⚡ All Factory Departments (Universal)
                </span>
              ) : (
                rawDepts.map((d: string) => (
                  <span key={d} className="px-2.5 py-1 bg-bg3 text-text text-xs font-bold rounded-lg border border-bg4">
                    {d}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Pages Allowed */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-mono uppercase tracking-wider text-text3 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-po" />
                Granted Pages & Modules ({rawPages.length} of {SYSTEM_PAGES.length}):
              </h4>
              {user.role === 'admin' && (
                <span className="text-[10px] font-bold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded">
                  Admin Unrestricted
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SYSTEM_PAGES.map((page) => {
                const hasAccess = user.role === 'admin' || rawPages.length === 0 || rawPages.includes(page.id);
                const Icon = page.icon;
                return (
                  <div
                    key={page.id}
                    className={cn(
                      "flex items-start gap-2.5 p-2.5 rounded-xl border text-xs",
                      hasAccess
                        ? "bg-bg3/60 border-bg4 text-text"
                        : "bg-bg2/40 border-bg4/30 text-text3 opacity-40"
                    )}
                  >
                    <div className={cn(
                      "w-4 h-4 rounded mt-0.5 flex items-center justify-center shrink-0",
                      hasAccess ? "text-emerald-500" : "text-text3/50"
                    )}>
                      {hasAccess ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <X className="w-3.5 h-3.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-bold truncate">{page.label}</span>
                      </div>
                      <p className="text-[10px] text-text3 line-clamp-1 mt-0.5">{page.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex justify-between items-center pt-4 border-t border-bg4 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-bg3 text-text hover:bg-bg4 font-bold rounded-xl text-xs uppercase cursor-pointer"
          >
            Close
          </button>
          {onEdit && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit(user);
              }}
              className="px-5 py-2.5 bg-po hover:bg-blue-600 text-white font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-po/20 flex items-center gap-2 cursor-pointer"
            >
              <Sliders className="w-4 h-4" />
              Modify User Permissions
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
