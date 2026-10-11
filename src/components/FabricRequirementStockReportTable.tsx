import React, { useState, useEffect } from 'react';
import { fabricService } from '../services/erpService';
import { FabricRequirementStockReportItem } from '../types';
import { 
  Layers, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowUpRight, 
  Filter, 
  RefreshCw, 
  Package, 
  Sparkles,
  Download
} from 'lucide-react';

interface Props {
  onFillInhouseForm?: (item: FabricRequirementStockReportItem) => void;
  title?: string;
  subtitle?: string;
}

export const FabricRequirementStockReportTable: React.FC<Props> = ({
  onFillInhouseForm,
  title = "Fabric-Wise Requirement & In-House Stock Report",
  subtitle = "Real-time fabric allocation, store balance, shortages, and extreme excess (>10%) across active production orders"
}) => {
  const [reportData, setReportData] = useState<FabricRequirementStockReportItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SHORTAGE' | 'COVERED' | 'EXTREME_EXCESS'>('ALL');
  const [buyerFilter, setBuyerFilter] = useState<string>('ALL');
  const [fabricFilter, setFabricFilter] = useState<string>('ALL');

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fabricService.getRequirementStockReport();
      setReportData(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load fabric report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  // Extract unique buyers and fabric types for dropdown filters
  const uniqueBuyers = Array.from(new Set(reportData.map(i => i.buyer).filter(Boolean))).sort();
  const uniqueFabrics = Array.from(new Set(reportData.map(i => i.fabric_type).filter(Boolean))).sort();

  // Filtered dataset
  const filteredData = reportData.filter(item => {
    // Status match
    if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;

    // Buyer match
    if (buyerFilter !== 'ALL' && !item.buyer.toLowerCase().includes(buyerFilter.toLowerCase())) return false;

    // Fabric match
    if (fabricFilter !== 'ALL' && item.fabric_type.toLowerCase() !== fabricFilter.toLowerCase()) return false;

    // Search query match
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchStyle = item.style.toLowerCase().includes(q);
      const matchColor = item.color.toLowerCase().includes(q);
      const matchBuyer = item.buyer.toLowerCase().includes(q);
      const matchFabric = item.fabric_type.toLowerCase().includes(q);
      if (!matchStyle && !matchColor && !matchBuyer && !matchFabric) return false;
    }

    return true;
  });

  // KPI Calculations
  const totalLines = reportData.length;
  const shortageCount = reportData.filter(i => i.status === 'SHORTAGE').length;
  const coveredCount = reportData.filter(i => i.status === 'COVERED').length;
  const extremeExcessCount = reportData.filter(i => i.status === 'EXTREME_EXCESS').length;

  const totalRequiredKg = reportData.reduce((sum, i) => sum + i.required_kg, 0);
  const totalStockKg = reportData.reduce((sum, i) => sum + i.current_stock_kg, 0);
  const totalShortageKg = reportData.reduce((sum, i) => sum + i.net_needed_kg, 0);
  const totalExcessKg = reportData.reduce((sum, i) => sum + i.excess_kg, 0);

  // CSV Export
  const exportCSV = () => {
    const headers = ['Buyer', 'Style #', 'Color', 'Fabric Type', 'Buyer GSM', 'Target Cut Pcs', 'Required KG', 'Current Stock KG', 'Net Shortage KG', 'Excess KG', 'Status'];
    const rows = filteredData.map(i => [
      `"${i.buyer}"`,
      `"${i.style}"`,
      `"${i.color}"`,
      `"${i.fabric_type}"`,
      `"${i.buyer_gsm}"`,
      i.target_cut_pcs,
      i.required_kg,
      i.current_stock_kg,
      i.net_needed_kg,
      i.excess_kg,
      `"${i.status}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `fabric_requirement_stock_report_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-bg2 border border-bg4 rounded-3xl p-6 shadow-2xl text-text space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-bg4/60 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-po/10 text-po rounded-2xl border border-po/20">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight text-text flex items-center gap-2">
              {title}
            </h2>
            <p className="text-xs text-text3 font-medium mt-0.5">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          <button
            onClick={fetchReport}
            disabled={loading}
            className="px-3.5 py-2 bg-bg3 hover:bg-bg4 text-text2 rounded-xl border border-bg4 font-bold text-xs flex items-center gap-2 transition-all"
            title="Refresh Report Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-po' : ''}`} />
            Refresh
          </button>
          <button
            onClick={exportCSV}
            disabled={filteredData.length === 0}
            className="px-3.5 py-2 bg-po/10 hover:bg-po/20 text-po rounded-xl border border-po/30 font-bold text-xs flex items-center gap-2 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {/* Total Lines */}
        <div className="bg-bg3/60 border border-bg4 p-3.5 rounded-2xl">
          <div className="text-[10px] font-black uppercase tracking-wider text-text3">Total Fabric Lines</div>
          <div className="text-lg font-black text-text mt-1">{totalLines}</div>
          <div className="text-[10px] text-text3 mt-0.5">{totalRequiredKg.toFixed(1)} KG Total Req.</div>
        </div>

        {/* Shortage Count */}
        <div className="bg-reject/5 border border-reject/20 p-3.5 rounded-2xl">
          <div className="text-[10px] font-black uppercase tracking-wider text-reject flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Shortage Lines
          </div>
          <div className="text-lg font-black text-reject mt-1">{shortageCount}</div>
          <div className="text-[10px] text-reject/80 font-bold mt-0.5">{totalShortageKg.toFixed(1)} KG Shortage</div>
        </div>

        {/* Covered Count */}
        <div className="bg-pass/5 border border-pass/20 p-3.5 rounded-2xl">
          <div className="text-[10px] font-black uppercase tracking-wider text-pass flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Covered Lines
          </div>
          <div className="text-lg font-black text-pass mt-1">{coveredCount}</div>
          <div className="text-[10px] text-pass/80 font-bold mt-0.5">Exact/Adequate Stock</div>
        </div>

        {/* Extreme Excess Count (Yellow) */}
        <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-2xl">
          <div className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Extreme Excess
          </div>
          <div className="text-lg font-black text-amber-400 mt-1">{extremeExcessCount}</div>
          <div className="text-[10px] text-amber-400/80 font-bold mt-0.5">+{totalExcessKg.toFixed(1)} KG ({'>'}10% Over)</div>
        </div>

        {/* Total Current Stock */}
        <div className="bg-bg3/60 border border-bg4 p-3.5 rounded-2xl">
          <div className="text-[10px] font-black uppercase tracking-wider text-text3">In-House Stock</div>
          <div className="text-lg font-black text-text mt-1">{totalStockKg.toFixed(1)} <span className="text-xs font-medium text-text3">KG</span></div>
          <div className="text-[10px] text-text3 mt-0.5">Across Store Balances</div>
        </div>

        {/* Total Required */}
        <div className="bg-bg3/60 border border-bg4 p-3.5 rounded-2xl">
          <div className="text-[10px] font-black uppercase tracking-wider text-text3">Total Req. KG</div>
          <div className="text-lg font-black text-po mt-1">{totalRequiredKg.toFixed(1)} <span className="text-xs font-medium text-text3">KG</span></div>
          <div className="text-[10px] text-text3 mt-0.5">Based on Target Cut</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-bg3/40 p-3 rounded-2xl border border-bg4/60">
        {/* Status Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all whitespace-nowrap ${
              statusFilter === 'ALL'
                ? 'bg-po text-white shadow-lg shadow-po/20'
                : 'bg-bg3 text-text3 hover:text-text hover:bg-bg4'
            }`}
          >
            All Items ({reportData.length})
          </button>
          <button
            onClick={() => setStatusFilter('SHORTAGE')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap ${
              statusFilter === 'SHORTAGE'
                ? 'bg-reject text-white shadow-lg shadow-reject/20'
                : 'bg-reject/10 text-reject hover:bg-reject/20'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-reject" />
            🔴 Shortage ({shortageCount})
          </button>
          <button
            onClick={() => setStatusFilter('COVERED')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap ${
              statusFilter === 'COVERED'
                ? 'bg-pass text-white shadow-lg shadow-pass/20'
                : 'bg-pass/10 text-pass hover:bg-pass/20'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-pass" />
            🟢 Covered ({coveredCount})
          </button>
          <button
            onClick={() => setStatusFilter('EXTREME_EXCESS')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap ${
              statusFilter === 'EXTREME_EXCESS'
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            🟡 Extreme Excess ({'>'}10%) ({extremeExcessCount})
          </button>
        </div>

        {/* Search & Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Buyer Filter */}
          <select
            value={buyerFilter}
            onChange={e => setBuyerFilter(e.target.value)}
            className="px-3 py-1.5 bg-bg2 border border-bg4 text-text rounded-xl text-xs font-bold focus:outline-none focus:border-po"
          >
            <option value="ALL">All Buyers</option>
            {uniqueBuyers.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>

          {/* Fabric Type Filter */}
          <select
            value={fabricFilter}
            onChange={e => setFabricFilter(e.target.value)}
            className="px-3 py-1.5 bg-bg2 border border-bg4 text-text rounded-xl text-xs font-bold focus:outline-none focus:border-po"
          >
            <option value="ALL">All Fabric Types</option>
            {uniqueFabrics.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>

          {/* Search Box */}
          <div className="relative min-w-[180px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
            <input
              type="text"
              placeholder="Search style, color..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-bg2 border border-bg4 text-text text-xs rounded-xl focus:outline-none focus:border-po placeholder:text-text3/60 font-medium"
            />
          </div>
        </div>
      </div>

      {/* Table Section */}
      {loading ? (
        <div className="py-16 text-center text-text3 space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-po" />
          <p className="text-xs font-bold uppercase tracking-wider">Generating Real-time Fabric Stock Report...</p>
        </div>
      ) : error ? (
        <div className="py-12 text-center text-reject space-y-2 bg-reject/5 rounded-2xl border border-reject/20">
          <AlertTriangle className="w-8 h-8 mx-auto" />
          <p className="text-sm font-bold">{error}</p>
          <button onClick={fetchReport} className="px-4 py-1.5 bg-reject text-white rounded-xl text-xs font-bold mt-2">Retry</button>
        </div>
      ) : filteredData.length === 0 ? (
        <div className="py-12 text-center text-text3 space-y-2 bg-bg3/30 rounded-2xl border border-bg4">
          <Package className="w-8 h-8 mx-auto text-text3/50" />
          <p className="text-xs font-bold uppercase tracking-wider">No fabric allocation records match the active filter</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-bg4/80 rounded-2xl shadow-inner">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-bg3 text-[10px] font-black uppercase tracking-wider text-text3 border-b border-bg4">
                <th className="p-3.5">Buyer</th>
                <th className="p-3.5">Style #</th>
                <th className="p-3.5">Color</th>
                <th className="p-3.5">Fabric Type</th>
                <th className="p-3.5 text-center">Buyer GSM</th>
                <th className="p-3.5 text-right">Target Cut (Pcs)</th>
                <th className="p-3.5 text-right text-po">Required (KG)</th>
                <th className="p-3.5 text-right">In-House Stock (KG)</th>
                <th className="p-3.5 text-right">Net Shortage / Excess</th>
                <th className="p-3.5 text-center">Status</th>
                {onFillInhouseForm && <th className="p-3.5 text-center">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-bg4/50 text-xs font-medium">
              {filteredData.map((item, idx) => {
                const isShortage = item.status === 'SHORTAGE';
                const isExtreme = item.status === 'EXTREME_EXCESS';
                const isCovered = item.status === 'COVERED';

                return (
                  <tr 
                    key={`${item.style}-${item.color}-${item.fabric_type}-${idx}`}
                    className={`hover:bg-bg3/80 transition-colors ${
                      isShortage ? 'bg-reject/5' : isExtreme ? 'bg-amber-500/5' : ''
                    }`}
                  >
                    {/* Buyer */}
                    <td className="p-3.5 font-bold text-text">
                      <span className="bg-bg4/60 px-2 py-0.5 rounded text-[11px] font-mono text-text2">
                        {item.buyer}
                      </span>
                    </td>

                    {/* Style */}
                    <td className="p-3.5 font-black text-text text-sm">
                      #{item.style}
                    </td>

                    {/* Color */}
                    <td className="p-3.5 font-bold text-text2">
                      {item.color}
                    </td>

                    {/* Fabric Type */}
                    <td className="p-3.5 font-black text-po">
                      {item.fabric_type}
                    </td>

                    {/* Buyer GSM */}
                    <td className="p-3.5 text-center">
                      {item.buyer_gsm !== '—' ? (
                        <span className="bg-po/10 text-po font-black text-[10px] px-2 py-0.5 rounded border border-po/20">
                          {item.buyer_gsm}
                        </span>
                      ) : (
                        <span className="text-text3 text-[10px]">—</span>
                      )}
                    </td>

                    {/* Target Cut Pcs */}
                    <td className="p-3.5 text-right font-black text-text">
                      {item.target_cut_pcs.toLocaleString()} <span className="text-[10px] font-normal text-text3">Pcs</span>
                    </td>

                    {/* Required KG */}
                    <td className="p-3.5 text-right font-black text-po">
                      {item.required_kg.toFixed(2)} <span className="text-[10px] font-normal text-text3">KG</span>
                    </td>

                    {/* Current Stock KG */}
                    <td className="p-3.5 text-right font-black text-text">
                      {item.current_stock_kg.toFixed(2)} <span className="text-[10px] font-normal text-text3">KG</span>
                    </td>

                    {/* Net Shortage / Excess */}
                    <td className="p-3.5 text-right font-black">
                      {isShortage ? (
                        <span className="text-reject">
                          -{item.net_needed_kg.toFixed(2)} KG
                        </span>
                      ) : isExtreme ? (
                        <span className="text-amber-400">
                          +{item.excess_kg.toFixed(2)} KG ({Math.round((item.current_stock_kg / (item.required_kg || 1) - 1) * 100)}% over)
                        </span>
                      ) : (
                        <span className="text-pass">
                          0.00 KG
                        </span>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="p-3.5 text-center">
                      {isShortage && (
                        <span className="inline-flex items-center gap-1 bg-reject/10 text-reject text-[10px] font-black px-2.5 py-1 rounded-lg border border-reject/30 uppercase tracking-tight">
                          <span className="w-1.5 h-1.5 rounded-full bg-reject animate-pulse" />
                          🔴 Shortage
                        </span>
                      )}
                      {isExtreme && (
                        <span className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-400 text-[10px] font-black px-2.5 py-1 rounded-lg border border-amber-500/30 uppercase tracking-tight">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          🟡 Extreme Excess
                        </span>
                      )}
                      {isCovered && (
                        <span className="inline-flex items-center gap-1 bg-pass/10 text-pass text-[10px] font-black px-2.5 py-1 rounded-lg border border-pass/30 uppercase tracking-tight">
                          <span className="w-1.5 h-1.5 rounded-full bg-pass" />
                          🟢 Covered
                        </span>
                      )}
                    </td>

                    {/* Action Button */}
                    {onFillInhouseForm && (
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => onFillInhouseForm(item)}
                          className="px-2.5 py-1 bg-po/10 hover:bg-po text-po hover:text-white rounded-lg text-[10px] font-black transition-all flex items-center gap-1 mx-auto border border-po/30"
                          title="Auto-fill In-House Receive Form"
                        >
                          Procure <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
