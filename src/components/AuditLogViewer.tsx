import React, { useState, useMemo } from 'react';
import { 
  History, Search, Filter, RotateCcw, AlertTriangle, CheckCircle, 
  Eye, Download, RefreshCw, Clock, Layers, User as UserIcon, Tag,
  ArrowRight, ShieldCheck, X, ChevronRight, FileSpreadsheet, Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { EnrichedAuditLog } from '../types';
import { cn } from '../lib/utils';

interface AuditLogViewerProps {
  logs: EnrichedAuditLog[];
  loading: boolean;
  onRefresh: () => void;
  onUndo: (logId: number) => Promise<void>;
  undoingLogId: number | null;
}

const DEPARTMENTS = [
  'All',
  'Cutting',
  'Feeding',
  'Stitching',
  'Finishing',
  'Packing',
  'Press / Ironing',
  'Fabric Store',
  'Shipping',
  'Returns',
  'Discards',
  'PO / Orders',
  'System & Working Date',
  'Permissions & Time',
  'Users & Access'
];

const ACTION_TYPES = [
  { id: 'ALL', label: 'All Operations' },
  { id: 'CREATE', label: 'Entries & Creations' },
  { id: 'UPDATE', label: 'Modifications / Edits' },
  { id: 'DELETE', label: 'Deletions' },
  { id: 'HANDOVER', label: 'Handovers & Dispatches' },
  { id: 'TIME', label: 'Working Date & Time' },
  { id: 'USER_ACCESS', label: 'User & Permissions' }
];

// Helper to convert ISO/UTC audit timestamps into user's real browser local time
export const formatAuditDateTime = (dateStr: string | null | undefined) => {
  if (!dateStr) return { date: '-', time: '', full: '-', localYMD: '', relative: '' };
  
  let isoStr = dateStr;
  if (!dateStr.includes('T') && !dateStr.includes('Z')) {
    isoStr = dateStr.replace(' ', 'T') + 'Z';
  } else if (dateStr.includes('T') && !dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-')) {
    isoStr = dateStr + 'Z';
  }

  const d = new Date(isoStr);
  if (isNaN(d.getTime())) {
    return { 
      date: dateStr.split(' ')[0] || '-', 
      time: dateStr.split(' ')[1] || '', 
      full: dateStr, 
      localYMD: dateStr.split(' ')[0] || '', 
      relative: '' 
    };
  }

  // Real local date and time in the user's current device / browser timezone
  const localDate = d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  });
  
  const localTime = d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  // Calculate friendly relative elapsed time
  const diffMs = Date.now() - d.getTime();
  let relative = '';
  if (diffMs < 60000 && diffMs >= 0) relative = 'Just now';
  else if (diffMs < 3600000 && diffMs >= 0) relative = `${Math.floor(diffMs / 60000)}m ago`;
  else if (diffMs < 86400000 && diffMs >= 0) relative = `${Math.floor(diffMs / 3600000)}h ago`;
  else if (diffMs < 604800000 && diffMs >= 0) relative = `${Math.floor(diffMs / 86400000)}d ago`;

  // ISO date string in YYYY-MM-DD in local time for filter comparisons
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const localYMD = `${year}-${month}-${day}`;

  return {
    date: localDate,
    time: localTime,
    full: `${localDate}, ${localTime}`,
    localYMD,
    relative
  };
};

export const AuditLogViewer: React.FC<AuditLogViewerProps> = ({
  logs,
  loading,
  onRefresh,
  onUndo,
  undoingLogId
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [selectedActionType, setSelectedActionType] = useState('ALL');
  const [onlyModifications, setOnlyModifications] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedLogForDetail, setSelectedLogForDetail] = useState<EnrichedAuditLog | null>(null);
  const [confirmUndoLog, setConfirmUndoLog] = useState<EnrichedAuditLog | null>(null);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // 1. Department filter
      if (selectedDept !== 'All' && log.department !== selectedDept) {
        return false;
      }

      // 2. Action Category filter
      const action = (log.action || '').toUpperCase();
      if (selectedActionType !== 'ALL') {
        if (selectedActionType === 'CREATE' && action !== 'CREATE') return false;
        if (selectedActionType === 'UPDATE' && action !== 'UPDATE') return false;
        if (selectedActionType === 'DELETE' && action !== 'DELETE') return false;
        if (selectedActionType === 'HANDOVER' && !['CONFIRM_HANDOVER', 'TRANSFER_TO_STORE'].includes(action)) return false;
        if (selectedActionType === 'TIME' && !['DIRECT_TIME_CHANGE', 'SET_WORKING_DATE', 'REVERT_TO_REALTIME'].includes(action)) return false;
        if (selectedActionType === 'USER_ACCESS' && !action.includes('USER') && !action.includes('PERMISSION')) return false;
      }

      // 3. Only Modifications toggle
      if (onlyModifications && !['UPDATE', 'DELETE', 'DIRECT_TIME_CHANGE', 'SET_WORKING_DATE', 'REVERT_TO_REALTIME'].includes(action)) {
        return false;
      }

      // 4. Date Range matching user's real local day
      if (log.created_at) {
        const dt = formatAuditDateTime(log.created_at);
        if (startDate && dt.localYMD < startDate) return false;
        if (endDate && dt.localYMD > endDate) return false;
      }

      // 5. Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchPo = log.po_number?.toLowerCase().includes(term);
        const matchStyle = log.style_num?.toLowerCase().includes(term);
        const matchColor = log.color?.toLowerCase().includes(term);
        const matchSize = log.size?.toLowerCase().includes(term);
        const matchBuyer = log.buyer?.toLowerCase().includes(term);
        const matchOperator = log.operator_name?.toLowerCase().includes(term) || log.username?.toLowerCase().includes(term);
        const matchDept = log.department?.toLowerCase().includes(term);
        const matchSummary = log.summary_sentence?.toLowerCase().includes(term);
        const matchAction = log.human_action?.toLowerCase().includes(term) || log.action?.toLowerCase().includes(term);
        const matchRecordId = String(log.record_id || '').toLowerCase().includes(term);

        if (!matchPo && !matchStyle && !matchColor && !matchSize && !matchBuyer && !matchOperator && !matchDept && !matchSummary && !matchAction && !matchRecordId) {
          return false;
        }
      }

      return true;
    });
  }, [logs, selectedDept, selectedActionType, onlyModifications, startDate, endDate, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    let creations = 0;
    let updatesAndDeletes = 0;
    let handovers = 0;
    let timeChanges = 0;

    for (const l of logs) {
      const act = (l.action || '').toUpperCase();
      if (act === 'CREATE') creations++;
      else if (act === 'UPDATE' || act === 'DELETE') updatesAndDeletes++;
      else if (act === 'CONFIRM_HANDOVER' || act === 'TRANSFER_TO_STORE') handovers++;
      else if (act.includes('TIME') || act.includes('DATE') || act.includes('REALTIME')) timeChanges++;
    }

    return {
      total: logs.length,
      creations,
      updatesAndDeletes,
      handovers,
      timeChanges
    };
  }, [logs]);

  // CSV Export
  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;
    const headers = [
      'Log ID',
      'Actual Local Time',
      'UTC Timestamp',
      'Operator Name',
      'Username',
      'Department',
      'Action Title',
      'Action Code',
      'PO Number',
      'Buyer',
      'Style',
      'Color',
      'Size',
      'Quantity',
      'Summary What Happened',
      'Is Undone',
      'IP Address'
    ];

    const rows = filteredLogs.map(l => {
      const dt = formatAuditDateTime(l.created_at);
      return [
        l.id,
        `"${dt.full}"`,
        `"${l.created_at || ''}"`,
        `"${(l.operator_name || '').replace(/"/g, '""')}"`,
        `"${l.username || ''}"`,
        `"${l.department || ''}"`,
        `"${(l.human_action || '').replace(/"/g, '""')}"`,
        `"${l.action || ''}"`,
        `"${l.po_number || ''}"`,
        `"${(l.buyer || '').replace(/"/g, '""')}"`,
        `"${l.style_num || ''}"`,
        `"${(l.color || '').replace(/"/g, '""')}"`,
        `"${l.size || ''}"`,
        l.quantity || '',
        `"${(l.summary_sentence || '').replace(/"/g, '""')}"`,
        l.is_undone === 1 ? 'YES' : 'NO',
        `"${l.ip_address || ''}"`
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `erp_audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getDeptColor = (dept: string) => {
    switch (dept) {
      case 'Cutting': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'Feeding': return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
      case 'Stitching': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'Finishing': return 'bg-pink-500/10 text-pink-400 border-pink-500/20';
      case 'Packing': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'Press / Ironing': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'Fabric Store': return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
      case 'Shipping': return 'bg-teal-500/10 text-teal-400 border-teal-500/20';
      case 'Returns': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'Discards': return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'PO / Orders': return 'bg-violet-500/10 text-violet-400 border-violet-500/20';
      case 'System & Working Date': return 'bg-slate-500/10 text-slate-300 border-slate-500/20';
      case 'Permissions & Time': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      case 'Users & Access': return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
      default: return 'bg-bg4/60 text-text2 border-bg4';
    }
  };

  const getActionBadgeStyle = (action: string) => {
    const act = action.toUpperCase();
    if (act === 'CREATE') return 'bg-pass/10 text-pass border-pass/20';
    if (act === 'UPDATE') return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    if (act === 'DELETE') return 'bg-reject/10 text-reject border-reject/20';
    if (act === 'CONFIRM_HANDOVER' || act === 'TRANSFER_TO_STORE') return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    if (act.includes('TIME') || act.includes('DATE') || act.includes('REALTIME')) return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
    if (act === 'UNDO_ACTION') return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
    return 'bg-bg4/60 text-text2 border-bg4';
  };

  return (
    <div className="space-y-6">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-bg2/70 border border-bg4/60 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-text3 uppercase tracking-wider">Total Recorded</span>
            <History className="w-4 h-4 text-text3" />
          </div>
          <div className="text-2xl font-black text-text mt-1">{stats.total.toLocaleString()}</div>
          <span className="text-[10px] text-text3">Historical audit points</span>
        </div>

        <div className="bg-bg2/70 border border-bg4/60 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-pass uppercase tracking-wider">New Entries</span>
            <CheckCircle className="w-4 h-4 text-pass" />
          </div>
          <div className="text-2xl font-black text-pass mt-1">{stats.creations.toLocaleString()}</div>
          <span className="text-[10px] text-text3">Department outputs recorded</span>
        </div>

        <div className="bg-bg2/70 border border-amber-500/30 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Edits & Deletions</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 mt-1">{stats.updatesAndDeletes.toLocaleString()}</div>
          <span className="text-[10px] text-text3">Values corrected or purged</span>
        </div>

        <div className="bg-bg2/70 border border-blue-500/30 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">Handovers</span>
            <Layers className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-blue-400 mt-1">{stats.handovers.toLocaleString()}</div>
          <span className="text-[10px] text-text3">Department bundle acceptances</span>
        </div>

        <div className="bg-bg2/70 border border-purple-500/30 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider">Time Shifts</span>
            <Clock className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-black text-purple-400 mt-1">{stats.timeChanges.toLocaleString()}</div>
          <span className="text-[10px] text-text3">Working date epoch adjustments</span>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-bg2 border border-bg4 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
        {/* Main Search Input + Quick Actions */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-text3 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by PO Number, Style, Color, Size, Operator Name, Action, or Department..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-bg3/50 border border-bg4 rounded-xl text-xs text-text placeholder:text-text3 focus:outline-none focus:border-po transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text3 hover:text-text text-xs cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setOnlyModifications(!onlyModifications)}
              className={cn(
                "px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer",
                onlyModifications
                  ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                  : "bg-bg3/50 border-bg4 text-text3 hover:text-text hover:bg-bg3"
              )}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Only Edits / Deletes</span>
            </button>

            <button
              onClick={handleExportCSV}
              disabled={filteredLogs.length === 0}
              className="px-3 py-2 bg-bg3/50 border border-bg4 hover:bg-bg3 text-text3 hover:text-text rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              title="Download Filtered Report as CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-2 bg-bg3/50 border border-bg4 hover:bg-bg3 text-text3 hover:text-text rounded-xl text-xs transition-all cursor-pointer disabled:opacity-40"
              title="Refresh Audit Trail"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin text-po")} />
            </button>
          </div>
        </div>

        {/* Date Filter & Action Type Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-bg4/50">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-text3 uppercase tracking-wider flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Operation:
            </span>
            {ACTION_TYPES.map((act) => (
              <button
                key={act.id}
                onClick={() => setSelectedActionType(act.id)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer",
                  selectedActionType === act.id
                    ? "bg-po text-white shadow-sm"
                    : "bg-bg3/40 text-text3 hover:text-text hover:bg-bg3"
                )}
              >
                {act.label}
              </button>
            ))}
          </div>

          {/* Date Picker Range */}
          <div className="flex items-center gap-2 text-xs">
            <Calendar className="w-3.5 h-3.5 text-text3" />
            <span className="text-[11px] text-text3 font-semibold">Date Range:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-bg3/50 border border-bg4 rounded-lg px-2 py-1 text-[11px] text-text focus:outline-none focus:border-po"
            />
            <span className="text-text3 text-[11px]">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-bg3/50 border border-bg4 rounded-lg px-2 py-1 text-[11px] text-text focus:outline-none focus:border-po"
            />
            {(startDate || endDate) && (
              <button
                onClick={() => { setStartDate(''); setEndDate(''); }}
                className="text-[10px] text-po hover:underline font-bold"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Department Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          <span className="text-[11px] font-bold text-text3 uppercase tracking-wider shrink-0 mr-1">
            Department:
          </span>
          {DEPARTMENTS.map((dept) => {
            const isSelected = selectedDept === dept;
            return (
              <button
                key={dept}
                onClick={() => setSelectedDept(dept)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all border cursor-pointer",
                  isSelected
                    ? "bg-text text-bg border-text shadow-sm"
                    : "bg-bg3/30 border-bg4/60 text-text3 hover:text-text hover:bg-bg3"
                )}
              >
                {dept}
              </button>
            );
          })}
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-bg4/60 flex flex-wrap items-center justify-between gap-2 bg-bg3/20">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-po" />
            <h3 className="text-sm font-bold text-text">Audit Event Log Stream</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-bg4/60 text-text2 font-bold">
              Showing {filteredLogs.length} of {logs.length}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-text3">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-bg3/80 border border-bg4 font-mono text-[10px]">
              <Clock className="w-3 h-3 text-po" />
              Real Clock Time Guaranteed
            </span>
            <span>Sorted newest first</span>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-text3 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-po" />
            <span className="text-xs font-semibold">Loading enriched audit records...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-16 text-center text-text3 flex flex-col items-center justify-center gap-2">
            <History className="w-8 h-8 text-text3 opacity-40 mb-1" />
            <span className="text-sm font-bold text-text2">No audit records match your filters</span>
            <span className="text-xs text-text3">Try resetting search keywords or changing the selected department</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-bg4 bg-bg3/40 text-[10px] font-black uppercase tracking-wider text-text3">
                  <th className="p-3.5 w-32">When & Who</th>
                  <th className="p-3.5 w-32">Department</th>
                  <th className="p-3.5 w-44">Garment Specs / PO</th>
                  <th className="p-3.5">What Happened (Plain English Description)</th>
                  <th className="p-3.5 w-32 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bg4/40">
                {filteredLogs.slice(0, 300).map((log) => {
                  return (
                    <tr 
                      key={log.id} 
                      className={cn(
                        "hover:bg-bg3/30 transition-colors group",
                        log.is_undone === 1 && "opacity-60 bg-bg3/10"
                      )}
                    >
                      {/* 1. Date & Operator */}
                      <td className="p-3.5 align-top">
                        {(() => {
                          const dt = formatAuditDateTime(log.created_at);
                          return (
                            <div className="flex flex-col gap-0.5">
                              <span className="font-mono text-[11px] font-bold text-text whitespace-nowrap">
                                {dt.date}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[10px] text-text3 font-semibold">
                                  {dt.time}
                                </span>
                                {dt.relative && (
                                  <span className="text-[9px] px-1 py-0.2 rounded bg-bg4 text-text3 font-mono">
                                    {dt.relative}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 mt-1 text-[11px]">
                                <UserIcon className="w-3 h-3 text-po shrink-0" />
                                <span className="font-bold text-text truncate max-w-[110px]" title={log.operator_name}>
                                  {log.operator_name}
                                </span>
                              </div>
                              <span className="text-[9px] text-text3 uppercase font-mono">
                                @{log.username} • {log.user_role}
                              </span>
                            </div>
                          );
                        })()}
                      </td>

                      {/* 2. Department & Action Category */}
                      <td className="p-3.5 align-top">
                        <div className="flex flex-col gap-1.5">
                          <span className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border whitespace-nowrap w-fit",
                            getDeptColor(log.department)
                          )}>
                            {log.department}
                          </span>

                          <span className={cn(
                            "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider border w-fit",
                            getActionBadgeStyle(log.action)
                          )}>
                            {log.human_action}
                          </span>
                        </div>
                      </td>

                      {/* 3. Garment Specs: PO, Style, Color, Size */}
                      <td className="p-3.5 align-top">
                        {log.po_number || log.style_num || log.color ? (
                          <div className="flex flex-col gap-1">
                            {log.po_number && (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-bold text-text3 uppercase">PO:</span>
                                <span className="font-bold text-po font-mono text-[11px]">{log.po_number}</span>
                              </div>
                            )}

                            {log.style_num && (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-bold text-text3 uppercase">Style:</span>
                                <span className="font-bold text-text text-[11px]">{log.style_num}</span>
                              </div>
                            )}

                            <div className="flex flex-wrap items-center gap-1 mt-0.5">
                              {log.color && (
                                <span className="px-1.5 py-0.5 rounded bg-bg3 border border-bg4 text-[10px] font-medium text-text2">
                                  {log.color}
                                </span>
                              )}
                              {log.size && (
                                <span className="px-1.5 py-0.5 rounded bg-bg3 border border-bg4 text-[10px] font-bold text-text2">
                                  {log.size}
                                </span>
                              )}
                              {log.line_number && (
                                <span className="px-1.5 py-0.5 rounded bg-bg3 border border-bg4 text-[10px] font-mono text-cyan-400">
                                  Line {log.line_number}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[11px] text-text3 italic">
                            {log.table_name === 'system_settings' ? 'System Clock' : log.table_name} (ID: {log.record_id})
                          </div>
                        )}
                      </td>

                      {/* 4. What Happened (Plain English Summary & Diffs) */}
                      <td className="p-3.5 align-top">
                        <div className="space-y-1.5">
                          <p className="text-xs text-text font-medium leading-relaxed">
                            {log.summary_sentence}
                          </p>

                          {/* Specific Field Changes Diffs */}
                          {log.changes && log.changes.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {log.changes.map((c, i) => (
                                <span 
                                  key={i} 
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-bg3/80 border border-bg4 text-[10px] font-mono"
                                >
                                  <span className="text-text3 font-semibold">{c.label}:</span>
                                  {c.old_value !== null && (
                                    <span className="text-reject line-through">{String(c.old_value)}</span>
                                  )}
                                  {c.old_value !== null && c.new_value !== null && (
                                    <ArrowRight className="w-2.5 h-2.5 text-text3" />
                                  )}
                                  {c.new_value !== null && (
                                    <span className="text-pass font-bold">{String(c.new_value)}</span>
                                  )}
                                  {c.diff && (
                                    <span className="text-amber-400 font-bold ml-0.5">({c.diff})</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}

                          {log.is_undone === 1 && (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-pass/10 border border-pass/30 text-pass text-[10px] font-bold">
                              <CheckCircle className="w-3 h-3" />
                              <span>Reversed & Restored by Admin</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 5. Actions: View Specs & Undo */}
                      <td className="p-3.5 align-top text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedLogForDetail(log)}
                            className="p-1.5 bg-bg3/60 hover:bg-bg3 border border-bg4 text-text3 hover:text-text rounded-lg transition-all cursor-pointer"
                            title="View Full Garment Specs & Raw Diff"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {log.is_undone === 1 ? (
                            <span className="px-2 py-1 rounded bg-pass/10 text-pass text-[10px] font-black uppercase tracking-wider">
                              Undone
                            </span>
                          ) : log.can_undo ? (
                            <button
                              disabled={undoingLogId !== null}
                              onClick={() => setConfirmUndoLog(log)}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-amber-500/10 hover:bg-amber-500 border border-amber-500/30 hover:border-amber-500 text-amber-400 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40"
                              title="Revert this action and restore previous database state"
                            >
                              {undoingLogId === log.id ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <RotateCcw className="w-3 h-3" />
                              )}
                              <span>Undo</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-text3/60 italic">Immutable</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Full Audit Log Detail Breakdown */}
      <AnimatePresence>
        {selectedLogForDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedLogForDetail(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="relative w-full max-w-2xl bg-bg2 border border-bg4 rounded-2xl shadow-2xl p-6 z-10 space-y-5 text-left max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between pb-3 border-b border-bg4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-po/10 text-po">
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-text">Audit Record #{selectedLogForDetail.id}</h3>
                    <p className="text-[11px] text-text3 font-mono">
                      Real Time: <span className="text-text font-bold">{formatAuditDateTime(selectedLogForDetail.created_at).full}</span> • IP: {selectedLogForDetail.ip_address || 'Internal/Direct'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedLogForDetail(null)}
                  className="p-1.5 rounded-lg text-text3 hover:text-text hover:bg-bg3 transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Garment Information Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-bg3/30 border border-bg4/60 rounded-xl p-3.5 text-xs">
                <div>
                  <span className="text-[10px] text-text3 uppercase font-bold block">Department</span>
                  <span className="font-bold text-text">{selectedLogForDetail.department}</span>
                </div>
                <div>
                  <span className="text-[10px] text-text3 uppercase font-bold block">PO Number</span>
                  <span className="font-bold text-po font-mono">{selectedLogForDetail.po_number || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-text3 uppercase font-bold block">Style Number</span>
                  <span className="font-bold text-text">{selectedLogForDetail.style_num || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-text3 uppercase font-bold block">Buyer</span>
                  <span className="font-bold text-text">{selectedLogForDetail.buyer || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-text3 uppercase font-bold block">Color</span>
                  <span className="font-bold text-text">{selectedLogForDetail.color || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-text3 uppercase font-bold block">Size</span>
                  <span className="font-bold text-text">{selectedLogForDetail.size || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-text3 uppercase font-bold block">Line / Pack</span>
                  <span className="font-bold text-text">{selectedLogForDetail.line_number ? `Line ${selectedLogForDetail.line_number}` : (selectedLogForDetail.packing_type || 'N/A')}</span>
                </div>
                <div>
                  <span className="text-[10px] text-text3 uppercase font-bold block">Quantity</span>
                  <span className="font-bold text-text">{selectedLogForDetail.quantity ? `${selectedLogForDetail.quantity.toLocaleString()} pcs` : 'N/A'}</span>
                </div>
              </div>

              {/* Natural Language Statement */}
              <div className="p-3.5 bg-po/5 border border-po/20 rounded-xl">
                <span className="text-[10px] font-bold text-po uppercase tracking-wider block mb-1">
                  Plain English Summary
                </span>
                <p className="text-xs text-text font-medium leading-relaxed">
                  {selectedLogForDetail.summary_sentence}
                </p>
              </div>

              {/* Changed Properties Breakdown */}
              {selectedLogForDetail.changes && selectedLogForDetail.changes.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-text uppercase tracking-wider block">
                    Detailed Value Comparison (Old ➔ New)
                  </span>
                  <div className="border border-bg4 rounded-xl overflow-hidden divide-y divide-bg4">
                    {selectedLogForDetail.changes.map((c, i) => (
                      <div key={i} className="p-3 flex items-center justify-between text-xs bg-bg3/20">
                        <span className="font-bold text-text2">{c.label}</span>
                        <div className="flex items-center gap-2 font-mono">
                          {c.old_value !== null ? (
                            <span className="px-2 py-0.5 rounded bg-reject/10 text-reject font-semibold">
                              {String(c.old_value)}
                            </span>
                          ) : (
                            <span className="text-text3 italic">None</span>
                          )}
                          <ArrowRight className="w-3.5 h-3.5 text-text3" />
                          {c.new_value !== null ? (
                            <span className="px-2 py-0.5 rounded bg-pass/10 text-pass font-bold">
                              {String(c.new_value)}
                            </span>
                          ) : (
                            <span className="text-text3 italic">Deleted</span>
                          )}
                          {c.diff && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold text-[10px]">
                              {c.diff}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Operator Information */}
              <div className="bg-bg3/30 border border-bg4/60 rounded-xl p-3.5 text-xs flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-text3 uppercase font-bold block">Operator Info</span>
                  <span className="font-bold text-text">{selectedLogForDetail.operator_name}</span>
                  <span className="text-text3 text-[11px] block">@{selectedLogForDetail.username} ({selectedLogForDetail.user_role})</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-text3 uppercase font-bold block">Table & Record</span>
                  <span className="font-mono text-text">{selectedLogForDetail.table_name}</span>
                  <span className="text-text3 text-[11px] block">ID: {selectedLogForDetail.record_id}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-bg4">
                <button
                  onClick={() => setSelectedLogForDetail(null)}
                  className="px-4 py-2 bg-bg3 hover:bg-bg4 text-text font-bold rounded-xl text-xs transition-all cursor-pointer"
                >
                  Close
                </button>
                {selectedLogForDetail.can_undo && selectedLogForDetail.is_undone !== 1 && (
                  <button
                    onClick={() => {
                      const l = selectedLogForDetail;
                      setSelectedLogForDetail(null);
                      setConfirmUndoLog(l);
                    }}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Undo This Action</span>
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal for Undo */}
      <AnimatePresence>
        {confirmUndoLog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmUndoLog(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="relative w-full max-w-md bg-bg2 border border-bg4 rounded-2xl shadow-2xl p-6 z-10 space-y-4 text-left"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-text">Revert & Undo This Action?</h3>
                <p className="text-xs text-text3 mt-1 leading-relaxed">
                  This will safely restore the previous database state for this record.
                </p>
              </div>

              <div className="p-3 bg-bg3/50 border border-bg4 rounded-xl text-xs space-y-1">
                <div className="font-bold text-text">{confirmUndoLog.human_action}</div>
                <div className="text-text3 text-[11px]">{confirmUndoLog.summary_sentence}</div>
                {confirmUndoLog.po_number && (
                  <div className="text-po font-mono text-[11px] font-bold">
                    PO: {confirmUndoLog.po_number} {confirmUndoLog.style_num ? `• Style: ${confirmUndoLog.style_num}` : ''}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setConfirmUndoLog(null)}
                  className="px-4 py-2 bg-bg3 hover:bg-bg4 text-text font-bold rounded-xl text-xs transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const id = confirmUndoLog.id;
                    setConfirmUndoLog(null);
                    await onUndo(id);
                  }}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Confirm Undo</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
