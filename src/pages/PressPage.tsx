import React, { useState, useEffect, useMemo } from 'react';
import { pressService } from '../services/erpService';
import { 
  CheckCircle2, 
  Trash2, 
  Search, 
  Calendar, 
  Plus, 
  Activity,
  User,
  Hash,
  FileSpreadsheet
} from 'lucide-react';
import { cn, fmtDate } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

export const PressPage: React.FC = () => {
  const [records, setRecords] = useState<any[]>([]);
  const [pcsPressedInput, setPcsPressedInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    setIsLoading(true);
    try {
      const data = await pressService.list();
      setRecords(data);
    } catch (error: any) {
      toast.error('Failed to load press records');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(pcsPressedInput);
    if (isNaN(qty) || qty <= 0) {
      toast.error('Please enter a valid positive number');
      return;
    }

    setIsSubmitting(true);
    try {
      await pressService.create(qty);
      toast.success('Press record added successfully');
      setPcsPressedInput('');
      fetchRecords();
    } catch (error: any) {
      toast.error(error.message || 'Failed to add press record');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number, qty: number) => {
    if (!window.confirm(`Are you sure you want to delete this press record of ${qty} pieces?`)) {
      return;
    }

    try {
      await pressService.delete(id);
      toast.success('Press record deleted');
      fetchRecords();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete record');
    }
  };

  const exportToExcel = () => {
    if (records.length === 0) {
      toast.error('No records to export');
      return;
    }
    const worksheet = XLSX.utils.json_to_sheet(
      records.map((r, i) => ({
        'S.No': i + 1,
        'Pieces Pressed': r.pcs_pressed,
        'Operator / Logged By': r.operator_name || 'System',
        'Date / Time': r.created_at ? new Date(r.created_at).toLocaleString() : '-'
      }))
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Press Records');
    XLSX.writeFile(workbook, 'Press_Records.xlsx');
    toast.success('Excel file downloaded successfully');
  };

  // Filtered records
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const searchLower = searchTerm.toLowerCase();
      const operatorName = (r.operator_name || '').toLowerCase();
      const dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString().toLowerCase() : '';
      return operatorName.includes(searchLower) || dateStr.includes(searchLower) || String(r.pcs_pressed).includes(searchLower);
    });
  }, [records, searchTerm]);

  // Statistics calculation
  const totalPressed = useMemo(() => {
    return records.reduce((sum, r) => sum + (r.pcs_pressed || 0), 0);
  }, [records]);

  const pressedToday = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return records
      .filter(r => r.created_at && r.created_at.startsWith(todayStr))
      .reduce((sum, r) => sum + (r.pcs_pressed || 0), 0);
  }, [records]);

  return (
    <div className="space-y-8 pb-12" id="pressing-log-view">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-bg4">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold tracking-tight text-text uppercase">Pressing Dept</h1>
          <p className="text-text2 text-xs font-semibold uppercase tracking-wider font-medium leading-tight">
            Record and monitor independent workstation pressing totals
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 bg-bg2 border border-bg4 text-text hover:bg-bg3 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
            id="export-press-excel"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-500" /> Export Excel
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6" id="press-stats-container">
        <div className="bg-bg2 border border-bg4 p-6 rounded-2xl relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <CheckCircle2 className="w-12 h-12 text-purple-500" />
          </div>
          <p className="text-text2 text-[10px] font-bold uppercase tracking-wider mb-2">Lifetime Pressed</p>
          <h3 className="text-3xl font-black tracking-tight text-purple-500">
            {totalPressed.toLocaleString()} <span className="text-xs text-text3 font-sans">PCS</span>
          </h3>
          <div className="mt-3 flex items-center gap-1 text-[9px] font-bold text-text3">
            <Activity className="w-3 h-3 text-pass animate-pulse" />
            <span>ALL ENTRIES CUMULATIVE</span>
          </div>
        </div>

        <div className="bg-bg2 border border-bg4 p-6 rounded-2xl relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Calendar className="w-12 h-12 text-teal-500" />
          </div>
          <p className="text-text2 text-[10px] font-bold uppercase tracking-wider mb-2">Today's Pressing</p>
          <h3 className="text-3xl font-black tracking-tight text-teal-500">
            {pressedToday.toLocaleString()} <span className="text-xs text-text3 font-sans">PCS</span>
          </h3>
          <div className="mt-3 flex items-center gap-1 text-[9px] font-bold text-text3">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500 inline-block animate-pulse" />
            <span>REAL-TIME UPDATE</span>
          </div>
        </div>

        <div className="bg-bg2 border border-bg4 p-6 rounded-2xl relative overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <User className="w-12 h-12 text-sky-500" />
          </div>
          <p className="text-text2 text-[10px] font-bold uppercase tracking-wider mb-2">Total Entry Logs</p>
          <h3 className="text-3xl font-black tracking-tight text-sky-500">
            {records.length} <span className="text-xs text-text3 font-sans">ENTRIES</span>
          </h3>
          <div className="mt-3 flex items-center gap-1 text-[9px] font-bold text-text3">
            <Hash className="w-3 h-3" />
            <span>DATABASE ROWS</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Simple Form Block */}
        <div className="lg:col-span-1">
          <div className="bg-bg2 border border-bg4 rounded-2xl p-6 shadow-sm sticky top-6">
            <div className="flex items-center gap-2 mb-6 border-b border-bg3 pb-3">
              <Plus className="w-5 h-5 text-purple-500" />
              <h2 className="text-lg font-black uppercase tracking-wider text-text">New Press Entry</h2>
            </div>

            <form onSubmit={handleSubmit} id="pressing-entry-form" className="space-y-6">
              <div>
                <label htmlFor="pcs_pressed_input" className="block text-xs font-bold text-text2 uppercase tracking-wider mb-2">
                  Total Pieces Pressed
                </label>
                <div className="relative">
                  <input
                    type="number"
                    id="pcs_pressed_input"
                    placeholder="Enter total pieces..."
                    value={pcsPressedInput}
                    onChange={(e) => setPcsPressedInput(e.target.value)}
                    className="w-full bg-bg border border-bg4 rounded-xl px-4 py-3 text-text font-semibold placeholder:text-text3 text-sm focus:border-purple-500 focus:outline-none transition-all h-12"
                    min="1"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white font-bold py-3.5 px-4 rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-purple-600/15"
                id="submit-press-btn"
              >
                {isSubmitting ? 'Logging...' : 'Log Pressing Entry'}
              </button>
            </form>
          </div>
        </div>

        {/* List of Press records */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-bg2 border border-bg4 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-lg font-black uppercase tracking-wider text-text">Pressing Logs Ledger</h3>
                <p className="text-xs text-text2 uppercase tracking-wide">Historical logs of independent pressing</p>
              </div>

              {/* Search Bar */}
              <div className="relative max-w-xs">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text3" />
                <input
                  type="text"
                  id="pressing-search"
                  placeholder="Search operator/date..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-bg border border-bg4 text-text text-xs font-semibold rounded-xl pl-10 pr-4 py-2.5 outline-none placeholder:text-text3 focus:border-purple-500 transition-all w-full"
                />
              </div>
            </div>

            {isLoading ? (
              <div className="py-12 text-center text-text3 font-mono text-xs">
                LOADING PRESS RECORDS LEDGER...
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="py-12 text-center text-text3 font-mono text-xs border border-dashed border-bg4 rounded-2xl">
                {searchTerm ? 'NO RECORDS MATCHING SEARCH FILTER' : 'NO PRESS ENTRIES RECORDED YET'}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-bg4">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-bg border-b border-bg4 text-text2 uppercase font-bold tracking-wider">
                      <th className="p-4 w-16">ID</th>
                      <th className="p-4">Pieces Pressed</th>
                      <th className="p-4">Logged By</th>
                      <th className="p-4">Date / Time</th>
                      <th className="p-4 w-16 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence mode="popLayout">
                      {filteredRecords.map((r, i) => (
                        <motion.tr
                          key={r.id}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="border-b border-bg4 last:border-0 hover:bg-bg/40 transition-colors"
                        >
                          <td className="p-4 font-mono text-text3">{i + 1}</td>
                          <td className="p-4 font-extrabold text-sm text-text font-mono">
                            {r.pcs_pressed.toLocaleString()}
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center font-bold text-[10px]">
                                {(r.operator_name || 'U')[0].toUpperCase()}
                              </div>
                              <span className="font-semibold text-text">{r.operator_name || 'System User'}</span>
                            </div>
                          </td>
                          <td className="p-4 text-text2 font-mono">
                            {fmtDate(r.created_at)}
                          </td>
                          <td className="p-4 text-center">
                            <button
                              onClick={() => handleDelete(r.id, r.pcs_pressed)}
                              className="text-text3 hover:text-reject p-1.5 hover:bg-reject/10 rounded-lg transition-colors inline-block"
                              title="Delete record"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
