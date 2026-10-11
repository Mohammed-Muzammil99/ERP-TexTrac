import React, { useEffect, useState } from 'react';
import { statusService } from '../services/erpService';
import { useSystem } from '../context/SystemContext';
import { 
  BarChart3, 
  Search, 
  Download, 
  Filter, 
  ChevronRight,
  Scissors,
  Send,
  Activity,
  CheckCircle2,
  Package,
  Truck,
  TrendingUp,
  Calendar,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

export const StatusPage: React.FC = () => {
  const { workingDate } = useSystem();
  const [activeTab, setActiveTab] = useState<'overview' | 'cutting' | 'production' | 'qc' | 'shipping'>('overview');
  const [poStatus, setPOStatus] = useState<any[]>([]);
  const [detailedStatus, setDetailedStatus] = useState<any[]>([]);
  const [stitchingLines, setStitchingLines] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterBuyer, setFilterBuyer] = useState<string>('All');
  const [filterFloor, setFilterFloor] = useState<string>('All');
  const [filterPOStatus, setFilterPOStatus] = useState<string>('All');
  const [filterStyle, setFilterStyle] = useState<string>('All');
  const [filterColor, setFilterColor] = useState<string>('All');

  useEffect(() => {
    fetchData();
  }, [filterDate]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [status, detailed, sum, lines] = await Promise.all([
        statusService.getPOStatus(filterDate),
        statusService.getDetailedStatus(filterDate),
        statusService.getSummary(filterDate),
        statusService.getStitchingLines(filterDate)
      ]);
      setPOStatus(status);
      setDetailedStatus(detailed);
      setSummary(sum);
      setStitchingLines(lines);
    } catch (error) {
      console.error('Failed to fetch status data', error);
    } finally {
      setIsLoading(false);
    }
  };

  const exportToExcel = () => {
    const dataToExport = activeTab === 'overview' ? filteredPOs : filteredDetailed;
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${activeTab} Status`);
    XLSX.writeFile(wb, `Production_${activeTab}_Status_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const filteredPOs = poStatus.filter(po => {
    const matchSearch = (po.po_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                       (po.buyer || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchBuyer = filterBuyer === 'All' || (po.buyer || '').split(',').map(b => b.trim()).includes(filterBuyer);
    const matchFloor = filterFloor === 'All' || po.floor === filterFloor;
    const matchPOStatus = filterPOStatus === 'All' || po.status === filterPOStatus;
    
    // For cumulative PO rows, we can't easily filter by Style/Color unless we check products, 
    // but the poStatus array usually contains PO-level aggregates.
    // If user filters by Style, we might show POs that contain that style.
    // However, the detailed view is better for this.
    // For now, let's just make the PO list match if ANY product in that PO (fetched in detailed) matches.
    // But since poStatus is separate, let's just filter the detailed items strictly.
    
    return matchSearch && matchBuyer && matchFloor && matchPOStatus;
  });

  const filteredDetailed = detailedStatus.filter(p => {
    const matchSearch = (p.po_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                       (p.style_num || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchBuyer = filterBuyer === 'All' || (p.buyer || '').split(',').map(b => b.trim()).includes(filterBuyer);
    const matchFloor = filterFloor === 'All' || p.floor === filterFloor;
    const matchPOStatus = filterPOStatus === 'All' || p.status === filterPOStatus;
    const matchStyle = filterStyle === 'All' || p.style_num === filterStyle;
    const matchColor = filterColor === 'All' || p.color === filterColor;
    
    const hasValues = (p.cut_accepted || 0) > 0 || 
                      (p.send_accepted || 0) > 0 || 
                      (p.stitch_accepted || 0) > 0 || 
                      (p.pass_accepted || 0) > 0 || 
                      (p.total_packed || 0) > 0 || 
                      (p.total_shipped || 0) > 0;

    return matchSearch && matchBuyer && matchFloor && matchPOStatus && matchStyle && matchColor && hasValues;
  });

  const buyers = [...new Set(poStatus.flatMap(po => (po.buyer || '').split(',').map(b => b.trim()).filter(Boolean)))].sort();
  const floors = [...new Set(poStatus.map(po => po.floor).filter(Boolean))].sort();
  const styles = [...new Set(detailedStatus.map(p => p.style_num).filter(Boolean))].sort();
  const colors = [...new Set(detailedStatus.map(p => p.color).filter(Boolean))].sort();
  const poStatuses = ['Active', 'Draft', 'On Hold', 'Closed'];

  const stages = [
    { key: 'total_po_qty', label: 'Production Orders', icon: BarChart3, color: 'text-po', bg: 'bg-po/10' },
    { key: 'total_cut', label: 'Cutting Output', icon: Scissors, color: 'text-cut', bg: 'bg-cut/10' },
    { key: 'total_sent', label: 'Net Fed', icon: Send, color: 'text-send', bg: 'bg-send/10' },
    { key: 'total_stitched', label: 'Net Stitched', icon: Activity, color: 'text-stitch', bg: 'bg-stitch/10' },
    { key: 'total_passed', label: 'Net QC Pass', icon: CheckCircle2, color: 'text-pass', bg: 'bg-pass/10' },
    { key: 'total_blistered', label: 'Blistered', icon: Package, color: 'text-pass', bg: 'bg-pass/10' },
    { key: 'total_packed', label: 'In Cartons', icon: Package, color: 'text-pack', bg: 'bg-pack/10' },
    { key: 'total_shipped', label: 'Shipped', icon: Truck, color: 'text-ship', bg: 'bg-ship/10' },
  ];

  if (isLoading && !poStatus.length) {
    return <div className="flex items-center justify-center h-full text-text3 font-mono text-xs animate-pulse tracking-widest uppercase">Calculating Master Status...</div>;
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tighter flex items-center gap-2 uppercase">
            <BarChart3 className="w-6 h-6 text-po shrink-0" />
            Master Dept Status
          </h2>
          <p className="text-text3 text-[10px] font-mono uppercase tracking-widest mt-1">Live tracking across all manufacturing units</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-2 bg-bg2 border border-bg4 rounded-xl px-2 py-1.5 min-h-10">
            <Filter className="w-3.5 h-3.5 text-text3 ml-1 shrink-0" />
            
            <select 
              value={filterBuyer}
              onChange={e => setFilterBuyer(e.target.value)}
              className="bg-transparent border-none text-[9px] font-black outline-none uppercase min-w-[70px] cursor-pointer"
            >
              <option value="All">All Buyers</option>
              {buyers.map(b => <option key={b} value={b}>{b}</option>)}
            </select>

            <div className="w-[1px] h-4 bg-bg4 mx-1" />

            <select 
              value={filterFloor}
              onChange={e => setFilterFloor(e.target.value)}
              className="bg-transparent border-none text-[9px] font-black outline-none uppercase min-w-[70px] cursor-pointer"
            >
              <option value="All">All Floors</option>
              {floors.map(f => <option key={f} value={f}>{f}</option>)}
            </select>

            <div className="w-[1px] h-4 bg-bg4 mx-1" />

            <select 
              value={filterPOStatus}
              onChange={e => setFilterPOStatus(e.target.value)}
              className="bg-transparent border-none text-[9px] font-black outline-none uppercase min-w-[70px] cursor-pointer"
            >
              <option value="All">All Status</option>
              {poStatuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <div className="w-[1px] h-4 bg-bg4 mx-1" />

            <select 
              value={filterStyle}
              onChange={e => setFilterStyle(e.target.value)}
              className="bg-transparent border-none text-[9px] font-black outline-none uppercase min-w-[70px] cursor-pointer"
            >
              <option value="All">All Styles</option>
              {styles.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <div className="w-[1px] h-4 bg-bg4 mx-1" />

            <select 
              value={filterColor}
              onChange={e => setFilterColor(e.target.value)}
              className="bg-transparent border-none text-[9px] font-black outline-none uppercase min-w-[70px] cursor-pointer"
            >
              <option value="All">All Colors</option>
              {colors.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-bg2 border border-bg4 rounded-xl px-3 py-1.5 h-10">
            <Calendar className="w-4 h-4 text-text3 shrink-0" />
            <input 
              type="date" 
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="bg-transparent border-none text-[10px] font-black outline-none uppercase"
            />
            {filterDate && (
              <button 
                onClick={() => setFilterDate('')}
                className="text-text3 hover:text-po"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="relative group flex-1 md:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text3 group-focus-within:text-po transition-colors" />
            <input 
              type="text" 
              placeholder="Search..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full md:w-48 bg-bg2 border border-bg4 rounded-xl py-2 pl-10 pr-4 text-sm h-10 focus:ring-1 focus:ring-po/20 outline-none transition-all"
            />
          </div>
          <button 
            onClick={exportToExcel}
            className="flex items-center justify-center gap-2 bg-pass text-white hover:bg-emerald-600 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-pass/20 h-10 w-full sm:w-auto"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {filterDate && (
        <div className="bg-po/5 border border-po/20 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-po/10 flex items-center justify-center text-po">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-black uppercase text-po tracking-widest leading-none mb-1">Filtered Report</p>
              <p className="text-sm font-bold text-text">Showing daily performance for {new Date(filterDate).toLocaleDateString(undefined, { dateStyle: 'full' })}</p>
            </div>
          </div>
          <button 
            onClick={() => setFilterDate('')}
            className="text-[10px] font-black uppercase text-text3 hover:text-white hover:bg-bg4 border border-bg4 px-4 py-2 rounded-lg transition-all"
          >
            Show Cumulative Total
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-bg2 p-1 rounded-xl border border-bg4 w-fit overflow-x-auto max-w-full">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart3 },
          { id: 'cutting', label: 'Cutting Status', icon: Scissors },
          { id: 'production', label: 'Production Flow', icon: Activity },
          { id: 'qc', label: 'QC & Packaging', icon: CheckCircle2 },
          { id: 'shipping', label: 'Shipped Status', icon: Truck },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap shadow-sm",
              activeTab === tab.id 
                ? "bg-bg text-text ring-1 ring-bg4 shadow-inner" 
                : "text-text3 hover:text-text hover:bg-bg3"
            )}
          >
            <tab.icon className={cn("w-3.5 h-3.5", activeTab === tab.id ? "text-po" : "")} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {stages.map((stage) => (
          <div key={stage.key} className="bg-bg2 border border-bg4 p-3 sm:p-4 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <stage.icon className={cn("w-4 h-4", stage.color)} />
              <div className={cn("px-1.5 py-0.5 rounded text-[7px] sm:text-[8px] font-black uppercase whitespace-nowrap", stage.bg, stage.color)}>
                {stage.label}
              </div>
            </div>
            <p className="text-xl sm:text-2xl font-black tracking-tight">
              {summary?.[stage.key]?.toLocaleString() || 0}
            </p>
            <p className="text-[8px] sm:text-[10px] font-mono text-text3 mt-1 uppercase">PCS {filterDate ? 'ON DATE' : 'TOTAL'}</p>
          </div>
        ))}
      </div>

      {stitchingLines.length > 0 && (
        <div className="bg-bg2 border border-bg4 p-6 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-4 h-4 text-stitch" />
              Line-Wise Stitching Output
            </h3>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-stitch animate-pulse" />
              <span className="text-[10px] font-mono text-text3 uppercase font-black">Live Production Units</span>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {stitchingLines.map((line) => (
              <div key={line.line_number} className="bg-bg p-4 rounded-xl border border-bg4 hover:border-stitch/30 transition-all group">
                <p className="text-[10px] font-mono text-text3 uppercase mb-1">Line status</p>
                <p className="text-lg font-black group-hover:text-stitch transition-colors">#{line.line_number}</p>
                <div className="mt-3">
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-black text-stitch">{line.total_stitched.toLocaleString()}</span>
                    <span className="text-[10px] font-bold text-text3 uppercase">pcs</span>
                  </div>
                  <p className="text-[9px] text-text3 mt-1 uppercase font-bold tracking-tighter">Active on {line.po_count} POs</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Status Table */}
      <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-auto max-h-[600px]">
          {activeTab === 'overview' ? (
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="bg-bg3/50 border-b border-bg4 text-text font-black sticky top-0 z-20 shadow-sm backdrop-blur-sm bg-bg2">
                  <th className="p-5 text-xs font-mono uppercase sticky top-0 left-0 bg-bg2 z-30 w-48 font-black text-text">Production Order</th>
                  <th className="p-5 text-xs font-mono uppercase text-center w-24 font-black text-text sticky top-0 bg-bg2 z-20">Order Qty</th>
                  {stages.map(s => (
                    <th key={s.key} className="p-5 text-xs font-mono uppercase text-center border-l border-bg4/30 font-black text-text sticky top-0 bg-bg2 z-20">
                      <div className="flex flex-col items-center gap-1">
                        <s.icon className={cn("w-3 h-3", s.color)} />
                        {s.label}
                      </div>
                    </th>
                  ))}
                  <th className="p-5 text-xs font-mono uppercase text-center border-l border-bg4/30 font-black text-text sticky top-0 bg-bg2 z-20">Completion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bg4">
                {filteredPOs.map((po, idx) => {
                  const shipPercent = po.total_qty > 0 ? Math.min((po.shipped / po.total_qty) * 100, 100) : 0;
                  
                  return (
                    <motion.tr 
                      key={`${po.po_number}-${po.buyer || idx}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.02 }}
                      className="hover:bg-bg3/20 transition-colors group"
                    >
                      <td className="p-5 sticky left-0 bg-bg2/95 backdrop-blur-sm group-hover:bg-bg3/40 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-bg4 flex items-center justify-center shrink-0">
                            <TrendingUp className="w-4 h-4 text-po" />
                          </div>
                          <div>
                            <p className="font-bold text-sm text-po leading-none mb-1">{po.po_number}</p>
                            <p className="text-[10px] font-mono text-text3 uppercase">{po.buyer} • {po.delivery_date}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-5 text-center">
                        <p className="font-black text-sm">{(po.total_qty || 0).toLocaleString()}</p>
                        <p className="text-[9px] font-mono text-text3 uppercase">Total Pcs</p>
                      </td>
                      
                      {stages.map(s => {
                        const val = po[s.key] || 0;
                        const percent = Math.min((val / (po.total_qty || 1)) * 100, 100);
                        
                        return (
                          <td key={s.key} className="p-5 text-center border-l border-bg4/10">
                            <div className="space-y-1">
                              <p className={cn("font-black text-sm", val > 0 ? s.color : "text-text3")}>
                                {Number(val || 0).toLocaleString()}
                              </p>
                              <div className="w-full bg-bg4 h-1 rounded-full overflow-hidden">
                                <div 
                                  className={cn("h-full transition-all duration-700", s.color.replace('text-', 'bg-'))}
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                              <p className="text-[8px] font-mono text-text3 uppercase">{Math.round(percent)}% Complete</p>
                            </div>
                          </td>
                        );
                      })}

                      <td className="p-5 text-center border-l border-bg4/20 bg-bg3/10">
                        <div className="inline-flex flex-col items-center">
                          <div className="relative w-12 h-12 flex items-center justify-center">
                            <svg className="w-full h-full -rotate-90">
                              <circle 
                                cx="24" cy="24" r="20" 
                                fill="none" stroke="currentColor" strokeWidth="2" 
                                className="text-bg4"
                              />
                              <circle 
                                cx="24" cy="24" r="20" 
                                fill="none" stroke="currentColor" strokeWidth="2" 
                                strokeDasharray={126}
                                strokeDashoffset={!isFinite(shipPercent) ? 126 : 126 - (126 * (shipPercent || 0)) / 100}
                                className={cn(
                                  "transition-all duration-1000",
                                  shipPercent >= 100 ? "text-pass" : "text-ship"
                                )}
                              />
                            </svg>
                            <span className="absolute text-[10px] font-black">{Math.round(shipPercent || 0)}%</span>
                          </div>
                          <p className={cn(
                            "text-[8px] font-black uppercase mt-1 tracking-tighter",
                            shipPercent >= 100 ? "text-pass" : "text-ship"
                          )}>
                            {shipPercent >= 100 ? "LIFT OFF" : "IN WIP"}
                          </p>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="bg-bg3/50 border-b border-bg4 text-text font-black sticky top-0 z-20 shadow-sm backdrop-blur-sm bg-bg2">
                  <th className="p-5 text-xs font-mono uppercase sticky top-0 left-0 bg-bg2 z-30 font-black text-text">PO Number</th>
                  <th className="p-5 text-xs font-mono uppercase font-black text-text sticky top-0 bg-bg2 z-20">Style</th>
                  <th className="p-5 text-xs font-mono uppercase font-black text-text sticky top-0 bg-bg2 z-20">Color</th>
                  <th className="p-5 text-xs font-mono uppercase font-black text-text sticky top-0 bg-bg2 z-20">Size</th>
                  <th className="p-5 text-xs font-mono uppercase text-center font-black text-text sticky top-0 bg-bg2 z-20">Order Qty</th>
                  {activeTab === 'cutting' && (
                    <>
                      <th className="p-5 text-xs font-mono uppercase text-center border-l border-bg4/30 text-cut font-black sticky top-0 bg-bg2 z-20">Cut Qty</th>
                      <th className="p-5 text-xs font-mono uppercase text-center border-l border-bg4/30 font-black text-text sticky top-0 bg-bg2 z-20">Balance</th>
                    </>
                  )}
                  {activeTab === 'production' && (
                    <>
                      <th className="p-5 text-xs font-mono uppercase text-center border-l border-bg4/30 text-cut font-black sticky top-0 bg-bg2 z-20">Cut</th>
                      <th className="p-5 text-xs font-mono uppercase text-center border-l border-bg4/30 text-send font-black sticky top-0 bg-bg2 z-20">Net Fed</th>
                      <th className="p-5 text-xs font-mono uppercase text-center border-l border-bg4/30 text-stitch font-black sticky top-0 bg-bg2 z-20">Net Stitched</th>
                      <th className="p-5 text-xs font-mono uppercase text-center border-l border-bg4/30 text-reject font-black text-[9px] sticky top-0 bg-bg2 z-20">Returned</th>
                      <th className="p-5 text-xs font-mono uppercase text-center border-l border-bg4/30 font-black text-text sticky top-0 bg-bg2 z-20">WIP</th>
                    </>
                  )}
                  {activeTab === 'qc' && (
                    <>
                      <th className="p-5 text-xs font-mono uppercase text-center border-l border-bg4/30 text-stitch font-black sticky top-0 bg-bg2 z-20">Stitched</th>
                      <th className="p-5 text-xs font-mono uppercase text-center border-l border-bg4/30 text-pass font-black sticky top-0 bg-bg2 z-20">Net Pass</th>
                      <th className="p-5 text-xs font-mono uppercase text-center border-l border-bg4/30 text-pass font-black text-[9px] sticky top-0 bg-bg2 z-20">Lse Avail</th>
                      <th className="p-5 text-xs font-mono uppercase text-center border-l border-bg4/30 text-pass font-black sticky top-0 bg-bg2 z-20">Blistered</th>
                      <th className="p-5 text-xs font-mono uppercase text-center border-l border-bg4/30 text-pack font-black text-[9px] sticky top-0 bg-bg2 z-20">Bls Avail</th>
                      <th className="p-5 text-xs font-mono uppercase text-center border-l border-bg4/30 text-pack font-black sticky top-0 bg-bg2 z-20">In Cartons</th>
                    </>
                  )}
                  {activeTab === 'shipping' && (
                    <>
                      <th className="p-5 text-xs font-mono uppercase text-center border-l border-bg4/30 text-pack font-black text-text sticky top-0 bg-bg2 z-20">Total Packed</th>
                      <th className="p-5 text-xs font-mono uppercase text-center border-l border-bg4/30 text-ship font-black sticky top-0 bg-bg2 z-20">Total Shipped</th>
                      <th className="p-5 text-xs font-mono uppercase text-center border-l border-bg4/30 font-black text-text sticky top-0 bg-bg2 z-20">In Warehouse</th>
                    </>
                  )}
                  <th className="p-5 text-xs font-mono uppercase text-center border-l border-bg4/30 font-black text-text sticky top-0 bg-bg2 z-20">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bg4">
                {filteredDetailed.map((p, idx) => {
                  const currentVal = activeTab === 'cutting' ? p.cut_accepted : 
                                   activeTab === 'production' ? p.stitch_accepted :
                                   activeTab === 'qc' ? p.total_packed : p.total_shipped;
                  const percent = Math.min((currentVal / p.order_qty) * 100, 100);

                  return (
                    <motion.tr 
                      key={`${p.po_number}-${p.style_num}-${p.color}-${p.size}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.01 }}
                      className="hover:bg-bg3/20 transition-colors group"
                    >
                      <td className="p-5 sticky left-0 bg-bg2/95 backdrop-blur-sm group-hover:bg-bg3/40 transition-colors">
                        <p className="font-bold text-xs text-po">{p.po_number}</p>
                      </td>
                      <td className="p-5">
                        <p className="text-sm font-black tracking-tight leading-tight">{p.style_num}</p>
                      </td>
                      <td className="p-5">
                        <p className="text-xs font-bold text-text2 uppercase">{p.color}</p>
                      </td>
                      <td className="p-5">
                        <p className="text-xs font-mono font-black text-text3 uppercase bg-bg3/30 px-2 py-0.5 rounded w-fit">{p.size}</p>
                      </td>
                      <td className="p-5 text-center font-mono font-black">{p.order_qty}</td>
                      
                      {activeTab === 'cutting' && (
                        <>
                          <td className="p-5 text-center font-black text-cut border-l border-bg4/10">{p.cut_accepted}</td>
                          <td className="p-5 text-center font-mono text-text3 border-l border-bg4/10">{Math.max(0, p.order_qty - p.cut_accepted)}</td>
                        </>
                      )}
                      
                      {activeTab === 'production' && (
                        <>
                          <td className="p-5 text-center font-black text-cut border-l border-bg4/10">{p.cut_accepted}</td>
                          <td className="p-5 text-center font-black text-send border-l border-bg4/10">{p.send_accepted}</td>
                          <td className="p-5 text-center font-black text-stitch border-l border-bg4/10">{p.stitch_accepted}</td>
                          <td className="p-5 text-center font-bold text-reject border-l border-bg4/10 text-xs">{p.stitch_rejected}</td>
                          <td className="p-5 text-center font-mono text-text3 border-l border-bg4/10">{Math.max(0, p.send_accepted - p.stitch_accepted)}</td>
                        </>
                      )}

                      {activeTab === 'qc' && (
                        <>
                          <td className="p-5 text-center font-black text-stitch border-l border-bg4/10">{p.stitch_accepted}</td>
                          <td className="p-5 text-center font-black text-pass border-l border-bg4/10">{p.pass_accepted}</td>
                          <td className="p-5 text-center font-black text-pass/60 border-l border-bg4/10 text-xs">{p.loose_available}</td>
                          <td className="p-5 text-center font-black text-pass border-l border-bg4/10">{p.total_blistered}</td>
                          <td className="p-5 text-center font-black text-pack/60 border-l border-bg4/10 text-xs">{p.blister_available}</td>
                          <td className="p-5 text-center font-black text-pack border-l border-bg4/10">{p.total_packed}</td>
                        </>
                      )}

                      {activeTab === 'shipping' && (
                        <>
                          <td className="p-5 text-center font-black text-pack border-l border-bg4/10">{p.total_packed}</td>
                          <td className="p-5 text-center font-black text-ship border-l border-bg4/10">{p.total_shipped}</td>
                          <td className="p-5 text-center font-mono font-black text-pass border-l border-bg4/10">{Number(p.store_available_pcs || 0).toLocaleString()}</td>
                        </>
                      )}

                      <td className="p-5 text-center border-l border-bg4/10 w-48">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 bg-bg4 h-2 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${percent}%` }}
                              className={cn(
                                "h-full transition-all duration-1000",
                                activeTab === 'cutting' ? 'bg-cut' : 
                                activeTab === 'production' ? 'bg-stitch' :
                                activeTab === 'qc' ? 'bg-pack' : 'bg-ship'
                              )}
                            />
                          </div>
                          <span className="text-[10px] font-black w-8">{Math.round(percent)}%</span>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
