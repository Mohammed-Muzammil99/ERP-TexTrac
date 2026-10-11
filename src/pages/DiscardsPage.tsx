import React, { useState, useEffect, useMemo } from 'react';
import { discardService } from '../services/erpService';
import { 
  Trash2, 
  Search, 
  Filter, 
  Trash,
  Calendar,
  AlertCircle,
  FileText,
  User,
  RefreshCw,
  XCircle,
  Hash
} from 'lucide-react';
import { cn, fmtDate } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

export const DiscardsPage: React.FC = () => {
  const [discards, setDiscards] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Filters and search
  const [filterPO, setFilterPO] = useState<string>('All');
  const [filterDept, setFilterDept] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchDiscards();
  }, []);

  const fetchDiscards = async () => {
    setIsLoading(true);
    try {
      const data = await discardService.list();
      setDiscards(data);
    } catch (error: any) {
      toast.error('Failed to fetch discard records');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: number, qty: number, style: string) => {
    if (!window.confirm(`Are you sure you want to delete this discard record? This will revert the discarded ${qty} pieces of style ${style} back into holding stock.`)) {
      return;
    }

    try {
      await discardService.delete(id);
      toast.success('Discard record removed', {
        description: `Successfully reverted ${qty} pieces of style ${style} back into active holding stock.`
      });
      fetchDiscards();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete discard record');
    }
  };

  // Get unique PO numbers and departments for filters
  const uniquePOs = useMemo(() => {
    const pos = discards.map(d => d.po_number).filter(Boolean);
    return ['All', ...Array.from(new Set(pos))];
  }, [discards]);

  const uniqueDepts = useMemo(() => {
    const depts = discards.map(d => d.department).filter(Boolean);
    return ['All', ...Array.from(new Set(depts))];
  }, [discards]);

  // Filtered discards
  const filteredDiscards = useMemo(() => {
    return discards.filter(d => {
      const poMatch = filterPO === 'All' || d.po_number === filterPO;
      const deptMatch = filterDept === 'All' || d.department === filterDept;
      
      const searchLower = searchTerm.toLowerCase();
      const termMatch = !searchTerm || 
        (d.po_number && d.po_number.toLowerCase().includes(searchLower)) ||
        (d.style_num && d.style_num.toLowerCase().includes(searchLower)) ||
        (d.color && d.color.toLowerCase().includes(searchLower)) ||
        (d.size && d.size.toLowerCase().includes(searchLower)) ||
        (d.reason && d.reason.toLowerCase().includes(searchLower)) ||
        (d.creator_name && d.creator_name.toLowerCase().includes(searchLower));

      return poMatch && deptMatch && termMatch;
    });
  }, [discards, filterPO, filterDept, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    const totalQty = filteredDiscards.reduce((sum, d) => sum + (d.quantity || 0), 0);
    const uniqueItemsCount = new Set(filteredDiscards.map(d => d.product_id)).size;
    
    // Group by dept
    const deptSummary: Record<string, number> = {};
    filteredDiscards.forEach(d => {
      deptSummary[d.department] = (deptSummary[d.department] || 0) + (d.quantity || 0);
    });

    return {
      totalQty,
      uniqueItemsCount,
      deptSummary
    };
  }, [filteredDiscards]);

  return (
    <div className="space-y-6">
      {/* Upper Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg2 p-6 rounded-3xl border border-bg4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-reject/10 rounded-2xl text-reject shadow-lg shadow-reject/5">
            <Trash2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-text">DISCARDS LOG</h1>
            <p className="text-[10px] text-text3 font-mono uppercase tracking-widest mt-0.5">Track, audit and manage permanently discarded products</p>
          </div>
        </div>
        
        <button
          onClick={fetchDiscards}
          disabled={isLoading}
          className="flex items-center gap-2 bg-bg3 hover:bg-bg4 border border-bg4 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50"
        >
          <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          Reload Log
        </button>
      </div>

      {/* Analytics Briefing */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-bg2 p-6 rounded-3xl border border-bg4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 scale-150 rotate-12 text-reject">
            <Trash className="w-20 h-20" />
          </div>
          <p className="text-xs font-bold text-text3 uppercase tracking-wider mb-2">Total Discarded Pieces</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-reject">{stats.totalQty.toLocaleString()}</span>
            <span className="text-xs font-bold text-text3 font-mono">Pcs</span>
          </div>
          <p className="text-[10px] text-text3 mt-1.5 font-mono">Across {filteredDiscards.length} logged incidents</p>
        </div>

        <div className="bg-bg2 p-6 rounded-3xl border border-bg4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 scale-150 rotate-12 text-po">
            <FileText className="w-20 h-20" />
          </div>
          <p className="text-xs font-bold text-text3 uppercase tracking-wider mb-2">Affected Products</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-po">{stats.uniqueItemsCount}</span>
            <span className="text-xs font-bold text-text3 font-mono">Unique SKUs</span>
          </div>
          <p className="text-[10px] text-text3 mt-1.5 font-mono">From active Production Orders</p>
        </div>

        <div className="bg-bg2 p-6 rounded-3xl border border-bg4">
          <p className="text-xs font-bold text-text3 uppercase tracking-wider mb-3">Discard Breakdown by Dept</p>
          <div className="space-y-2 max-h-[80px] overflow-y-auto pr-2">
            {Object.keys(stats.deptSummary).length === 0 ? (
              <p className="text-[10px] text-text3 font-mono uppercase italic py-2">No discards in selection</p>
            ) : (
              Object.entries(stats.deptSummary).map(([dept, qty]) => (
                <div key={dept} className="flex justify-between items-center text-xs">
                  <span className="font-bold text-text3">{dept}</span>
                  <span className="font-mono font-black text-reject bg-reject/5 px-2 py-0.5 rounded-full">{qty.toLocaleString()} Pcs</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Filters and Search Dashboard */}
      <div className="bg-bg2 p-6 rounded-3xl border border-bg4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search box */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text3" />
            <input
              type="text"
              placeholder="Search Style, PO, Color, Reason..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-bg3 border border-bg4 rounded-xl py-2.5 pl-10 pr-4 text-xs font-bold focus:ring-1 focus:ring-reject/20 outline-none transition-all placeholder:text-text3/50"
            />
          </div>

          {/* Filter PO */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-black text-text3 uppercase shrink-0">PO:</span>
            <div className="relative flex-1">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text3" />
              <select
                value={filterPO}
                onChange={(e) => setFilterPO(e.target.value)}
                className="w-full bg-bg3 border border-bg4 rounded-xl py-2.5 pl-9 pr-4 text-xs font-black focus:ring-1 focus:ring-reject/20 outline-none transition-all appearance-none"
              >
                {uniquePOs.map(po => (
                  <option key={po} value={po}>{po === 'All' ? 'All Orders' : po}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Filter Dept */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-black text-text3 uppercase shrink-0">Dept:</span>
            <div className="relative flex-1">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text3" />
              <select
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
                className="w-full bg-bg3 border border-bg4 rounded-xl py-2.5 pl-9 pr-4 text-xs font-black focus:ring-1 focus:ring-reject/20 outline-none transition-all appearance-none"
              >
                {uniqueDepts.map(dept => (
                  <option key={dept} value={dept}>{dept === 'All' ? 'All Departments' : dept}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Statistics summary inline */}
          <div className="flex items-center justify-end">
            <span className="text-[10px] font-mono text-text3 uppercase font-black">
              Showing {filteredDiscards.length} of {discards.length} Records
            </span>
          </div>
        </div>

        {/* Discards Table */}
        <div className="border border-bg4 rounded-2xl overflow-hidden bg-bg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-bg2/80 border-b border-bg4 text-text2">
                <th className="p-4 text-xs font-mono uppercase font-black">PO / Style</th>
                <th className="p-4 text-xs font-mono uppercase font-black">Color / Size</th>
                <th className="p-4 text-xs font-mono uppercase font-black text-center">Source Dept</th>
                <th className="p-4 text-xs font-mono uppercase font-black text-center">Discarded Qty</th>
                <th className="p-4 text-xs font-mono uppercase font-black">Reason for Discard</th>
                <th className="p-4 text-xs font-mono uppercase font-black">Logged At / By</th>
                <th className="p-4 text-xs font-mono uppercase font-black text-center w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bg4">
              {filteredDiscards.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <AlertCircle className="w-10 h-10 text-text3/30 mb-3" />
                      <p className="text-text3 text-xs font-mono uppercase tracking-widest font-black">No discard records found</p>
                      <p className="text-[10px] text-text3 mt-1.5 font-mono">No discards match the selected filters or search parameters</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredDiscards.map((row: any) => {
                  return (
                    <tr key={row.id} className="hover:bg-bg3/20 transition-colors text-xs">
                      <td className="p-4">
                        <div className="font-black text-text">{row.po_number}</div>
                        <div className="text-[10px] text-text3 font-bold mt-0.5">{row.style_num}</div>
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-text2 uppercase">{row.color}</div>
                        <div className="text-[10px] text-text3 font-mono uppercase font-black mt-0.5 bg-bg3 px-1.5 py-0.5 rounded inline-block">
                          {row.size}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <span className="font-black text-reject bg-reject/[0.04] border border-reject/10 rounded-full px-3 py-1 font-mono uppercase text-[9px]">
                          {row.department}
                        </span>
                      </td>
                      <td className="p-4 text-center font-mono font-black text-sm text-reject">
                        {row.quantity?.toLocaleString()}
                      </td>
                      <td className="p-4 max-w-[200px]">
                        <p className="text-text2 italic line-clamp-2" title={row.reason}>
                          "{row.reason || 'No reason provided'}"
                        </p>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5 text-[10px] text-text2 font-bold uppercase font-mono">
                          <Calendar className="w-3 h-3 opacity-60 text-text3" />
                          {fmtDate(row.created_at)}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-text3 font-bold uppercase font-mono mt-1">
                          <User className="w-3 h-3 opacity-60" />
                          {row.creator_name || 'System Operator'}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => handleDelete(row.id, row.quantity, row.style_num)}
                          className="p-2 text-text3 hover:text-reject hover:bg-reject/5 rounded-xl transition-all"
                          title="Restore and delete discard record"
                        >
                          <XCircle className="w-5 h-5 text-reject/70 hover:text-reject" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
