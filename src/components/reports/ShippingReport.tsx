import React, { useState, useEffect, useMemo } from 'react';
import { shippingService } from '../../services/erpService';
import { Search, Package, Truck, CheckCircle2, Calendar as CalendarIcon } from 'lucide-react';
import { cn, fmtDate } from '../../lib/utils';

interface ShippingReportProps {
  embedded?: boolean;
}

export const ShippingReport: React.FC<ShippingReportProps> = ({ embedded = false }) => {
  const [history, setHistory] = useState<any[]>([]);
  const [startDate, setStartDate] = useState(new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportSearch, setReportSearch] = useState('');

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    const data = await shippingService.list();
    setHistory(data);
  };

  const reportData = useMemo(() => {
    return history.filter(rec => {
      const recDate = rec.created_at ? rec.created_at.substring(0, 10) : '';
      const matchesSearch = reportSearch === '' || 
        rec.po_number.toLowerCase().includes(reportSearch.toLowerCase()) ||
        rec.style_num.toLowerCase().includes(reportSearch.toLowerCase()) ||
        rec.sscc?.toLowerCase().includes(reportSearch.toLowerCase());
      const withinRange = (!startDate || recDate >= startDate) && (!endDate || recDate <= endDate);
      return matchesSearch && withinRange;
    });
  }, [history, reportSearch, startDate, endDate]);

  const shippingStats = useMemo(() => {
    const stats: Record<string, any> = {};
    reportData.forEach(rec => {
      const key = `${rec.style_num}-${rec.color}`;
      if (!stats[key]) {
        stats[key] = {
          style: rec.style_num,
          color: rec.color,
          totalQty: 0,
          totalCartons: 0,
          pos: new Set()
        };
      }
      stats[key].totalQty += rec.quantity;
      stats[key].totalCartons += (rec.cartons || 0);
      stats[key].pos.add(rec.po_number);
    });
    return Object.values(stats);
  }, [reportData]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-bg2 border border-bg4 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-mono text-text3 uppercase font-black">Gross Dispatched</p>
            <div className="p-2 bg-ship/10 rounded-lg text-ship"><Package className="w-4 h-4" /></div>
          </div>
          <p className="text-3xl font-black tracking-tight text-text">
            {reportData.reduce((acc, curr) => acc + curr.quantity, 0).toLocaleString()}
          </p>
          <p className="text-[10px] font-mono text-text3 mt-1 uppercase font-bold tracking-widest">PCS SHIPPED</p>
        </div>
        <div className="bg-bg2 border border-bg4 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-mono text-text3 uppercase font-black">Carton Throughput</p>
            <div className="p-2 bg-po/10 rounded-lg text-po"><Truck className="w-4 h-4" /></div>
          </div>
          <p className="text-3xl font-black tracking-tight text-text">
            {reportData.reduce((acc, curr) => acc + (curr.cartons || 0), 0).toLocaleString()}
          </p>
          <p className="text-[10px] font-mono text-text3 mt-1 uppercase font-bold tracking-widest">TOTAL CARTONS</p>
        </div>
        <div className="bg-bg2 border border-bg4 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-mono text-text3 uppercase font-black">Active PO Coverage</p>
            <div className="p-2 bg-pass/10 rounded-lg text-pass"><CheckCircle2 className="w-4 h-4" /></div>
          </div>
          <p className="text-3xl font-black tracking-tight text-text">
            {new Set(reportData.map(r => r.po_number)).size}
          </p>
          <p className="text-[10px] font-mono text-text3 mt-1 uppercase font-bold tracking-widest">UNIQUE ORDERS</p>
        </div>
      </div>

      <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-bg4 bg-bg3/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-black uppercase tracking-tight">Shipment Analytics</h3>
            <p className="text-[10px] font-mono text-text3 uppercase font-bold tracking-widest mt-1">Historical Dispatch Performance</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-bg3 border border-bg4 rounded-lg px-3 py-1.5 shadow-inner">
              <CalendarIcon className="w-3.5 h-3.5 text-text3" />
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent border-none text-[10px] font-black outline-none uppercase" />
              <span className="text-text3 text-[10px] font-black">TO</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent border-none text-[10px] font-black outline-none uppercase" />
            </div>
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text3 group-focus-within:text-ship transition-colors" />
              <input 
                type="text" 
                placeholder="Search PO/Style/SSCC..."
                value={reportSearch}
                onChange={e => setReportSearch(e.target.value)}
                className="bg-bg3 border border-bg4 rounded-lg py-2 pl-9 pr-4 text-[10px] font-black w-56 focus:ring-1 focus:ring-ship/20 outline-none transition-all placeholder:font-bold uppercase tracking-widest"
              />
            </div>
          </div>
        </div>

        <div className="p-6">
          <h4 className="text-[10px] font-black uppercase text-text3 mb-4 tracking-widest font-mono">Aggregated Statistics</h4>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="overflow-auto max-h-[350px] border border-bg4 rounded-xl shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-bg3/50 border-b border-bg4 sticky top-0 z-20 shadow-sm backdrop-blur-sm bg-bg2">
                    <th className="p-4 text-xs font-mono uppercase font-black text-text sticky top-0 bg-bg3 z-20">Style Number</th>
                    <th className="p-4 text-xs font-mono uppercase font-black text-text sticky top-0 bg-bg3 z-20">Color</th>
                    <th className="p-4 text-xs font-mono uppercase font-black text-center text-text font-black bg-ship/5 sticky top-0 bg-bg3 z-20">Units</th>
                    <th className="p-4 text-xs font-mono uppercase font-black text-center text-text font-black sticky top-0 bg-bg3 z-20">Cartons</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg4 text-text font-sans">
                  {shippingStats.length === 0 ? (
                    <tr><td colSpan={4} className="p-12 text-center text-text3 uppercase text-[10px] font-black tracking-widest">No matching records</td></tr>
                  ) : (
                    shippingStats.map((stat) => (
                      <tr key={`${stat.style}-${stat.color}`} className="hover:bg-bg3/10 transition-colors">
                        <td className="p-4 font-black text-xs text-text">{stat.style}</td>
                        <td className="p-4 text-[10px] font-black uppercase text-text2">{stat.color}</td>
                        <td className="p-4 text-center font-black text-xs text-ship">{stat.totalQty.toLocaleString()}</td>
                        <td className="p-4 text-center text-[10px] font-black">{stat.totalCartons || 0}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-auto max-h-[350px] border border-bg4 rounded-xl shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-bg3/50 border-b border-bg4 sticky top-0 z-20 shadow-sm backdrop-blur-sm bg-bg2">
                    <th className="p-4 text-xs font-mono uppercase font-black text-text sticky top-0 bg-bg3 z-20">Dispatch Timeline</th>
                    <th className="p-4 text-xs font-mono uppercase font-black text-text sticky top-0 bg-bg3 z-20">Metadata</th>
                    <th className="p-4 text-xs font-mono uppercase font-black text-center text-text font-black bg-bg4/30 sticky top-0 bg-bg3 z-20">Total Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg4 text-text font-sans">
                  {reportData.length === 0 ? (
                    <tr><td colSpan={3} className="p-12 text-center text-text3 uppercase text-[10px] font-black tracking-widest">No records found</td></tr>
                  ) : (
                    reportData.slice(0, 20).map((rec) => (
                      <tr key={rec.id || `${rec.created_at}-${rec.po_number}-${rec.style_num}-${rec.color}-${rec.size}`} className="hover:bg-bg3/10 transition-colors">
                        <td className="p-4">
                          <p className="font-black text-[9px] text-text font-mono uppercase">{fmtDate(rec.created_at)}</p>
                          <p className="text-[9px] font-black text-po font-mono uppercase leading-none mt-1">{rec.po_number}</p>
                        </td>
                        <td className="p-4">
                          <p className="font-black text-xs text-text tracking-tight leading-none mb-1 normal-case font-sans">{rec.style_num}</p>
                          <p className="text-[9px] font-mono text-text3 uppercase font-bold mb-1">{rec.color} • {rec.size}</p>
                          {rec.sscc && <span className="text-[8px] bg-bg4 px-1.5 py-0.5 rounded font-mono font-black text-text">SSCC: {rec.sscc}</span>}
                        </td>
                        <td className="p-4 text-center font-black text-xs text-ship bg-bg4/10">{(rec.quantity || 0).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {reportData.length > 20 && (
                <div className="p-3 bg-bg3/30 text-center text-[9px] font-mono text-text3 uppercase font-black border-t border-bg4">
                  + {reportData.length - 20} More Dispatch Records
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
