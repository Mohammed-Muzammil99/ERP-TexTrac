import React, { useState, useEffect, useMemo } from 'react';
import { sendingService, statusService } from '../../services/erpService';
import { Search, History, Send } from 'lucide-react';
import { cn, fmtDate } from '../../lib/utils';
import { StockStoreTable } from './StockStoreTable';

interface FeedingReportProps {
  embedded?: boolean;
}

export const FeedingReport: React.FC<FeedingReportProps> = ({ embedded = false }) => {
  const [history, setHistory] = useState<any[]>([]);
  const [detailedStatus, setDetailedStatus] = useState<any[]>([]);
  const [showReport, setShowReport] = useState(true);
  const [reportSearch, setReportSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [historyData, detailedStats] = await Promise.all([
        sendingService.list(),
        statusService.getDetailedStatus()
      ]);
      setHistory(historyData);
      setDetailedStatus(detailedStats);
    } catch (error) {
      console.error('Failed to fetch feeding report data', error);
    }
  };

  const outputStats = useMemo(() => {
    if (!showReport) return [];

    const stats: Record<string, any> = {};
    
    // Aggregated Dispatched in period
    const filteredHistory = history.filter(h => {
      const hDate = h.created_at ? h.created_at.substring(0, 10) : '';
      return hDate >= dateRange.start && hDate <= dateRange.end;
    });

    filteredHistory.forEach(h => {
      const key = `${h.style_num}-${h.color}-${h.line_number || 'All'}`;
      if (!stats[key]) {
        stats[key] = {
          style_num: h.style_num,
          color: h.color,
          line_number: h.line_number || 'All',
          dispatchedInPeriod: 0
        };
      }
      stats[key].dispatchedInPeriod += h.quantity;
    });

    // Merge with Detailed Status for current availability (Stock)
    const result = Object.values(stats).map((s: any) => {
      const matchingProds = detailedStatus.filter(p => 
        p.style_num === s.style_num && p.color === s.color
      );
      
      const totalAvailable = matchingProds.reduce((sum, p) => 
        sum + (p.cut_accepted || 0) - (p.total_sent || 0), 0
      );

      return {
        ...s,
        available: totalAvailable
      };
    });
    
    if (!reportSearch) return result;
    const search = reportSearch.toLowerCase();
    return result.filter((s: any) => 
      s.style_num.toLowerCase().includes(search) || 
      s.color.toLowerCase().includes(search) ||
      String(s.line_number).toLowerCase().includes(search)
    );
  }, [history, detailedStatus, dateRange, showReport, reportSearch]);

  const pivotedHistory = useMemo(() => {
    const groups: Record<string, any> = {};
    const allSizes = new Set<string>();

    const filteredHistory = history.filter(h => {
      const hDate = h.created_at ? h.created_at.substring(0, 10) : '';
      const search = historySearch.toLowerCase();
      const matchesSearch = !historySearch || 
                           h.po_number.toLowerCase().includes(search) ||
                           h.style_num.toLowerCase().includes(search) ||
                           h.color.toLowerCase().includes(search) ||
                           (h.creator_name && h.creator_name.toLowerCase().includes(search));
      return hDate >= dateRange.start && hDate <= dateRange.end && matchesSearch;
    });

    filteredHistory.forEach(rec => {
      const date = rec.created_at ? rec.created_at.substring(0, 10) : '';
      const key = `${date}-${rec.po_number}-${rec.style_num}-${rec.color}-${rec.line_number || 'All'}-${rec.creator_name || 'System'}`;
      
      if (!groups[key]) {
        groups[key] = {
          date: rec.created_at,
          po_number: rec.po_number,
          style_num: rec.style_num,
          color: rec.color,
          line_number: rec.line_number,
          creator_name: rec.creator_name || 'System',
          sizes: {}
        };
      }
      
      const sizeKey = rec.size;
      if (!groups[key].sizes[sizeKey]) {
        groups[key].sizes[sizeKey] = 0;
      }
      groups[key].sizes[sizeKey] += rec.quantity;
      allSizes.add(sizeKey);
    });

    const order = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL'];
    const sortedSizes = Array.from(allSizes).sort((a, b) => {
      const indexA = order.indexOf(a.toUpperCase());
      const indexB = order.indexOf(b.toUpperCase());
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      return a.localeCompare(b);
    });

    return {
      rows: Object.values(groups).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()),
      sizes: sortedSizes
    };
  }, [history, dateRange, historySearch]);

  return (
    <div className="space-y-10">
      <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-6 bg-send/5 border-b border-bg4 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div>
            <h3 className="text-2xl font-black uppercase tracking-tight text-send">1. Feeding Throughput</h3>
            <p className="text-[10px] font-mono text-text3 uppercase font-bold tracking-widest mt-1">Total components moved to production floor</p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 bg-bg3 p-1.5 rounded-xl border border-bg4 shadow-inner">
              <input type="date" value={dateRange.start} onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="bg-transparent text-xs font-black outline-none px-2" />
              <span className="text-[10px] font-black text-text3 uppercase tracking-widest">To</span>
              <input type="date" value={dateRange.end} onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="bg-transparent text-xs font-black outline-none px-2" />
            </div>

            <button
              onClick={() => setShowReport(!showReport)}
              className={cn(
                "px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg active:scale-95",
                showReport ? "bg-bg4 text-text border border-bg4" : "bg-send text-white shadow-send/20"
              )}
            >
              {showReport ? 'Hide Reports' : 'Generate Reports'}
            </button>

            {showReport && (
              <input
                type="text"
                placeholder="Search Style/Color..."
                value={reportSearch}
                onChange={(e) => setReportSearch(e.target.value)}
                className="bg-bg3 border border-bg4 rounded-xl py-3 px-6 text-xs font-bold outline-none focus:ring-1 focus:ring-send/30"
              />
            )}
          </div>
        </div>
        <div className="overflow-auto max-h-[400px]">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-bg3/30 border-b border-bg4 font-mono font-black uppercase tracking-widest text-[10px] sticky top-0 z-20 bg-bg2 shadow-sm">
                <th className="p-5 sticky top-0 bg-bg3 z-20">Style Number</th>
                <th className="p-5 sticky top-0 bg-bg3 z-20">Color</th>
                <th className="p-5 sticky top-0 bg-bg3 z-20">Production Line</th>
                <th className="p-5 text-right text-send bg-send/5 sticky top-0 bg-bg3 z-20">Available</th>
                <th className="p-5 text-right text-emerald-600 bg-emerald-50/50 sticky top-0 bg-bg3 z-20">Dispatched (Fed)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bg4">
              {!showReport ? (
                <tr><td colSpan={5} className="p-20 text-center font-black uppercase tracking-[0.3em] text-text3">Ready for query execution</td></tr>
              ) : outputStats.length === 0 ? (
                <tr><td colSpan={5} className="p-16 text-center text-text3 font-bold uppercase">No records matching period</td></tr>
              ) : (
                outputStats.map((stat: any, i) => {
                  return (
                    <tr key={i} className="hover:bg-bg3/20 transition-colors">
                      <td className="p-5 font-black text-sm">{stat.style_num}</td>
                      <td className="p-5 font-bold uppercase text-text2">{stat.color}</td>
                      <td className="p-5 font-bold font-mono">
                         <span className="bg-send/10 text-send border border-send/20 text-[10px] font-bold px-2 py-0.5 rounded font-mono">
                           Line {stat.line_number}
                         </span>
                      </td>
                      <td className="p-5 text-right font-black text-sm text-send bg-send/5">{stat.available} PCS</td>
                      <td className="p-5 text-right font-black text-sm text-emerald-600 bg-emerald-50/50">{stat.dispatchedInPeriod} PCS</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <StockStoreTable data={detailedStatus} dept="feeding" />

      <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-6 bg-bg3/20 border-b border-bg4 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h3 className="text-2xl font-black uppercase tracking-tight">2. Component Feeding Log</h3>
            <p className="text-[10px] font-mono text-text3 uppercase font-bold tracking-widest mt-1">Granular feeding history with size variants</p>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text3" />
            <input
              type="text"
              placeholder="Global Feeding Search..."
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              className="w-full bg-bg3 border border-bg4 rounded-xl py-3 pl-12 pr-6 text-xs font-bold outline-none focus:ring-1 focus:ring-po/30 transition-all"
            />
          </div>
        </div>
        <div className="overflow-auto max-h-[500px]">
          <table className="w-full text-xs text-left border-collapse border-separate border-spacing-0">
            <thead className="sticky top-0 z-20">
              <tr className="bg-bg3/80 backdrop-blur-md border-b border-bg4 uppercase">
                <th className="p-5 font-mono font-black border-b border-bg4 sticky top-0 left-0 bg-bg2 z-35 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">Timeline</th>
                <th className="p-5 font-mono font-black border-b border-bg4 sticky top-0 bg-bg2 z-20">PO Metadata</th>
                <th className="p-5 font-mono font-black border-b border-bg4 sticky top-0 bg-bg2 z-20">Product Specs</th>
                {pivotedHistory.sizes.map(s => (
                  <th key={s} className="p-5 font-mono font-black text-center border-b border-bg4 min-w-[70px] sticky top-0 bg-bg2 z-20">{s} (Qty)</th>
                ))}
                <th className="p-5 font-mono font-black text-center border-b border-bg4 bg-bg4/30 sticky top-0 z-20">Batch Yield</th>
                <th className="p-5 font-mono font-black border-b border-bg4 sticky top-0 bg-bg2 z-20">Dispatched By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bg4">
              {pivotedHistory.rows.map((row: any, i) => {
                let batchQty = 0;
                Object.values(row.sizes).forEach((q: any) => {
                  batchQty += q;
                });
                return (
                  <tr key={i} className="hover:bg-bg3/10 transition-colors group">
                    <td className="p-5 font-mono text-text3 font-medium sticky left-0 bg-bg2 border-r border-bg4 group-hover:bg-bg3/10 transition-colors">{fmtDate(row.date)}</td>
                    <td className="p-5">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-black text-po uppercase tracking-widest">{row.po_number}</p>
                        {row.line_number && (
                          <span className="bg-send/10 text-send border border-send/25 text-[9px] font-black px-1.5 py-0.5 rounded font-mono">
                            Line {row.line_number}
                          </span>
                        )}
                      </div>
                      <span className="text-[8px] bg-bg4 px-1.5 py-0.5 rounded uppercase font-black">Line Feeding</span>
                    </td>
                    <td className="p-5">
                      <p className="font-black text-sm">{row.style_num}</p>
                      <p className="text-[10px] text-text3 uppercase font-black opacity-60 tracking-wider font-mono">{row.color}</p>
                    </td>
                    {pivotedHistory.sizes.map(s => {
                      const qty = row.sizes[s];
                      if (qty === undefined) return <td key={s} className="p-5 text-center text-bg4">—</td>;
                      return (
                        <td key={s} className="p-5 text-center font-black text-send text-xs">
                          {qty}
                        </td>
                      );
                    })}
                    <td className="p-5 text-center bg-bg4/10">
                        <div className="flex flex-col items-center">
                          <p className="text-sm font-black text-slate-900 dark:text-white leading-none">{batchQty}</p>
                          <p className="text-[8px] font-mono text-text3 uppercase mt-1">Batch Total</p>
                        </div>
                    </td>
                    <td className="p-5 font-mono text-text3 font-black text-[10px] uppercase opacity-70 tracking-widest">{row.creator_name}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
