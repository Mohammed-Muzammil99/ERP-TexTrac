import React, { useState, useEffect, useMemo } from 'react';
import { stitchingService, statusService } from '../../services/erpService';
import { Search, History, Activity } from 'lucide-react';
import { cn, fmtDate } from '../../lib/utils';
import { StockStoreTable } from './StockStoreTable';

interface StitchingReportProps {
  embedded?: boolean;
}

export const StitchingReport: React.FC<StitchingReportProps> = ({ embedded = false }) => {
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
        stitchingService.list(),
        statusService.getDetailedStatus()
      ]);
      setHistory(historyData);
      setDetailedStatus(detailedStats);
    } catch (error) {
      console.error('Failed to fetch stitching report data', error);
    }
  };

  const outputStats = useMemo(() => {
    if (!showReport) return [];

    const stats: Record<string, any> = {};
    
    // Aggregated Dispatched in period
    const filteredHistory = history.filter(h => {
      const hDate = h.created_at ? h.created_at.substring(0, 10) : '';
      return hDate >= dateRange.start && hDate <= dateRange.end && h.status !== 'rejected';
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
        sum + (p.send_accepted || 0) - (p.total_stitched || 0), 0
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
      return hDate >= dateRange.start && hDate <= dateRange.end && matchesSearch && h.status !== 'rejected';
    });

    filteredHistory.forEach(rec => {
      const date = rec.created_at ? rec.created_at.substring(0, 10) : '';
      const key = `${date}-${rec.po_number}-${rec.style_num}-${rec.color}-${rec.line_number}-${rec.creator_name || 'System'}`;
      
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
      
      groups[key].sizes[rec.size] = (groups[key].sizes[rec.size] || 0) + rec.quantity;
      allSizes.add(rec.size);
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
    <div className="space-y-8">
      <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-6 bg-stitch/5 border-b border-bg4 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-1">
            <h3 className="text-xl font-black uppercase tracking-tight text-stitch">1. Style Output Summary</h3>
            <p className="text-[10px] font-mono text-text3 uppercase font-bold tracking-widest mt-1">Available balance and production performance</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 bg-bg3 p-1.5 rounded-xl border border-bg4">
              <input type="date" value={dateRange.start} onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="bg-transparent text-xs font-black outline-none" />
              <span className="text-[10px] font-mono text-text3 px-2">TO</span>
              <input type="date" value={dateRange.end} onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="bg-transparent text-xs font-black outline-none" />
            </div>

            <button
              onClick={() => setShowReport(!showReport)}
              className={cn(
                "px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all shadow-lg",
                showReport ? "bg-bg4" : "bg-stitch text-white shadow-stitch/20"
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
                className="bg-bg3 border border-bg4 rounded-xl py-2 px-4 text-xs font-bold outline-none"
              />
            )}
          </div>
        </div>
        <div className="overflow-auto max-h-[400px]">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-bg3 text-text border-b border-bg4 sticky top-0 z-20 shadow-sm">
                <th className="p-4 font-black text-xs uppercase tracking-widest border-r border-bg4 sticky top-0 bg-bg3 z-20">Style Number</th>
                <th className="p-4 font-black text-xs uppercase tracking-widest border-r border-bg4 text-center sticky top-0 bg-bg3 z-20">Color</th>
                <th className="p-4 font-black text-xs uppercase tracking-widest border-r border-bg4 text-center sticky top-0 bg-bg3 z-20">Production Line</th>
                <th className="p-4 font-black text-xs uppercase tracking-widest text-right border-r border-bg4 text-stitch bg-stitch/5 sticky top-0 bg-bg3 z-20">Available</th>
                <th className="p-4 font-black text-xs uppercase tracking-widest text-right text-emerald-600 bg-emerald-50/50 sticky top-0 bg-bg3 z-20">Dispatched (Stitched)</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-bg4">
              {!showReport ? (
                <tr><td colSpan={5} className="p-16 text-center text-text3 font-mono uppercase font-black tracking-widest">Click Generate to process reports</td></tr>
              ) : outputStats.length === 0 ? (
                <tr><td colSpan={5} className="p-16 text-center text-text3 font-mono uppercase font-black">No records found</td></tr>
              ) : (
                outputStats.map((stat: any) => (
                  <tr key={`${stat.style_num}-${stat.color}-${stat.line_number}`} className="hover:bg-bg3/40 transition-colors border-b border-bg4 group">
                    <td className="p-4 font-black text-sm text-text border-r border-bg4">{stat.style_num}</td>
                    <td className="p-4 font-black uppercase text-sm border-r border-bg4 text-center">{stat.color}</td>
                    <td className="p-4 text-center border-r border-bg4 font-mono">
                      <span className="bg-stitch/10 text-stitch border border-stitch/20 text-[10px] font-bold px-2 py-0.5 rounded font-mono">
                        Line {stat.line_number}
                      </span>
                    </td>
                    <td className="p-4 text-right font-black text-base text-stitch bg-stitch/5 border-r border-bg4">{stat.available} <span className="text-[10px] opacity-60">PCS</span></td>
                    <td className="p-4 text-right font-black text-base text-emerald-600 bg-emerald-50/50">{stat.dispatchedInPeriod} <span className="text-[10px] opacity-60">PCS</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <StockStoreTable data={detailedStatus} dept="stitching" />

      <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-6 bg-bg3/30 border-b border-bg4 flex items-center justify-between">
          <h3 className="text-xl font-black uppercase tracking-tight">2. Detailed Stitching Log (Pivoted)</h3>
          <input
            type="text"
            placeholder="Global Search..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            className="bg-bg3 border border-bg4 rounded-xl py-1.5 px-4 text-xs font-bold outline-none"
          />
        </div>
        <div className="overflow-auto max-h-[500px]">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-bg3/50 border-b border-bg4 uppercase sticky top-0 z-20 backdrop-blur-md">
                <th className="p-4 font-mono font-black sticky top-0 left-0 bg-bg2 z-35 border-b border-bg4 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">Date</th>
                <th className="p-4 font-mono font-black sticky top-0 bg-bg2 border-b border-bg4 z-20">PO / Line</th>
                <th className="p-4 font-mono font-black sticky top-0 bg-bg2 border-b border-bg4 z-20">Style / Color</th>
                {pivotedHistory.sizes.map(s => <th key={s} className="p-4 font-mono font-black text-center sticky top-0 bg-bg2 border-b border-bg4 z-20">{s}</th>)}
                <th className="p-4 font-mono font-black text-center bg-bg4/30 sticky top-0 border-b border-bg4 z-20">Total</th>
                <th className="p-4 font-mono font-black sticky top-0 bg-bg2 border-b border-bg4 z-20">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bg4">
              {pivotedHistory.rows.map((row: any) => (
                <tr key={`${row.date}-${row.po_number}-${row.style_num}-${row.color}-${row.line_number}`} className="hover:bg-bg3/10 transition-colors">
                  <td className="p-4 font-mono text-text3 sticky left-0 bg-bg2">{fmtDate(row.date)}</td>
                  <td className="p-4">
                    <p className="font-bold text-po">{row.po_number}</p>
                    <span className="text-[9px] bg-stitch/10 text-stitch px-1.5 py-0.5 rounded uppercase">Line {row.line_number}</span>
                  </td>
                  <td className="p-4">
                    <p className="font-black text-sm">{row.style_num}</p>
                    <p className="text-[10px] text-text3 uppercase font-medium">{row.color}</p>
                  </td>
                  {pivotedHistory.sizes.map(s => (
                    <td key={s} className="p-4 text-center font-mono font-bold text-stitch">{row.sizes[s] || '-'}</td>
                  ))}
                  <td className="p-4 text-center bg-bg4/10">
                    <span className="bg-slate-900 text-white px-2 py-1 rounded-full font-black text-[10px]">
                      {Object.values(row.sizes).reduce((a: any, b: any) => a + b, 0) as number}
                    </span>
                  </td>
                  <td className="p-4 font-mono text-text3">{row.creator_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
