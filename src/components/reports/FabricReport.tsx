import React, { useState, useEffect, useMemo } from 'react';
import { fabricService, cuttingService } from '../../services/erpService';
import { FabricRecord } from '../../types';
import { Search, Droplets, ArrowUpRight, TrendingUp } from 'lucide-react';
import { cn } from '../../lib/utils';

interface FabricReportProps {
  embedded?: boolean;
}

export const FabricReport: React.FC<FabricReportProps> = ({ embedded = false }) => {
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [history, setHistory] = useState<FabricRecord[]>([]);
  const [allCuttingPrograms, setAllCuttingPrograms] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [recordList, allPrograms] = await Promise.all([
        fabricService.list(),
        cuttingService.getAllCuttingPrograms().catch(() => [])
      ]);
      setHistory(recordList);
      setAllCuttingPrograms(allPrograms || []);
    } catch (error) {
      console.error('Failed to fetch fabric data', error);
    } finally {
      setIsLoading(false);
    }
  };

  const normalizeFabric = (name: string) => {
    if (!name) return 'STANDARD';
    let n = name.trim().toUpperCase();
    if (n === 'S.JERSEY' || n === 'S/JERSEY' || n === 'JERSEY') return 'SINGLE JERSEY';
    if (n === 'F/TERRY' || n === 'F.TERRY') return 'FRENCH TERRY';
    return n;
  };

  const consumptionStats = useMemo(() => {
    const stats: Record<string, any> = {};
    
    const filteredHistory = history.filter(h => {
      const hDate = h.created_at ? h.created_at.substring(0, 10) : '';
      return hDate >= dateRange.start && hDate <= dateRange.end;
    });

    filteredHistory.forEach(h => {
      const hColor = (h.color || 'Universal').trim().toUpperCase();
      const hFabric = normalizeFabric(h.fabric_name || 'Standard');
      const hGsm = Number(h.gsm) || 0;
      
      const key = `${hColor}-${hFabric}-${hGsm}`;
      if (!stats[key]) {
        stats[key] = {
          po_list: new Set<string>(),
          style_list: new Set<string>(),
          color: h.color || 'Universal',
          fabric_name: hFabric,
          gsm: hGsm,
          total_issued: 0,
          total_consumed: 0,
          total_inhouse: 0,
          store_balance: 0,
          floor_balance: 0,
          planned_program: 0
        };
      }

      const stat = stats[key];
      if (h.po_number && h.po_number !== 'UNIVERSAL') stat.po_list.add(h.po_number);
      if (h.style_num && h.style_num !== 'GENERAL' && h.style_num !== 'N/A') stat.style_list.add(h.style_num);
      
      if (h.record_type === 'inhouse') {
        stat.total_inhouse += h.quantity_kg;
        stat.store_balance += h.quantity_kg;
      }
      else if (h.record_type === 'issue') {
        if (h.status !== 'rejected') {
          stat.total_issued += h.quantity_kg;
          stat.store_balance -= h.quantity_kg;
        }
        if (h.status === 'accepted') {
          stat.floor_balance += h.quantity_kg;
        }
      }
      else if (h.record_type === 'return') {
        if (h.status === 'accepted') stat.store_balance += h.quantity_kg;
        stat.floor_balance -= h.quantity_kg;
      }
      else if (h.record_type === 'consumption') {
        stat.total_consumed += h.quantity_kg;
        stat.floor_balance -= h.quantity_kg;
      }
    });

    Object.keys(stats).forEach(key => {
      const stat = stats[key];
      const relevantPrograms = allCuttingPrograms.filter(cp => {
        const cpColorRaw = String(cp.color || '').trim().toUpperCase();
        const cpColors = cpColorRaw.split('/').map((s: string) => s.trim());
        const matchesColor = cpColors.includes(stat.color.toUpperCase()) || cpColorRaw === stat.color.toUpperCase();
        return matchesColor;
      });
      stat.planned_program = relevantPrograms.reduce((sum: number, cp: any) => sum + (cp.planned_qty || 0), 0);
      
      stat.display_po = stat.po_list.size > 0 ? Array.from(stat.po_list).join(', ') : 'UNIVERSAL';
      stat.display_style = stat.style_list.size > 0 ? Array.from(stat.style_list).join(', ') : 'GENERAL';
    });

    const result = Object.values(stats);
    if (!searchTerm) return result;
    const search = searchTerm.toLowerCase();
    return result.filter((s: any) => 
      s.display_po.toLowerCase().includes(search) || 
      s.display_style.toLowerCase().includes(search) ||
      s.color.toLowerCase().includes(search) ||
      s.fabric_name.toLowerCase().includes(search)
    );
  }, [history, searchTerm, allCuttingPrograms, dateRange]);

  if (isLoading && !embedded) {
    return (
      <div className="p-20 flex justify-center">
        <div className="w-8 h-8 border-4 border-bg4 border-t-po rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h3 className="text-2xl font-black uppercase tracking-tight text-text">Fabric Inventory Status</h3>
            <p className="text-xs font-bold text-text3 uppercase tracking-widest mt-1">Global Stock & Consumption Report</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-bg3 p-1.5 rounded-xl border border-bg4 shadow-inner">
              <input 
                type="date" 
                value={dateRange.start} 
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))} 
                className="bg-transparent text-xs font-black outline-none px-2 text-text cursor-pointer" 
              />
              <span className="text-[10px] font-black text-text3 uppercase tracking-widest font-mono">To</span>
              <input 
                type="date" 
                value={dateRange.end} 
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))} 
                className="bg-transparent text-xs font-black outline-none px-2 text-text cursor-pointer" 
              />
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text3" />
              <input 
                type="text" 
                placeholder="Filter fabric records..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="bg-bg3 border border-bg4 rounded-xl py-2 pl-10 pr-4 text-sm w-64 outline-none focus:ring-2 focus:ring-po/10"
              />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-bg3 p-6 rounded-3xl border border-bg4">
          <p className="text-[10px] font-black text-text3 uppercase mb-2 tracking-widest">Total In-House</p>
          <p className="text-2xl font-black">{consumptionStats.reduce((sum, s) => sum + s.total_inhouse, 0).toFixed(1)} <span className="text-xs font-medium text-text3 uppercase">KG</span></p>
        </div>
        <div className="bg-bg3 p-6 rounded-3xl border border-bg4">
          <p className="text-[10px] font-black text-text3 uppercase mb-2 tracking-widest">Total Issued</p>
          <p className="text-2xl font-black text-po">{consumptionStats.reduce((sum, s) => sum + s.total_issued, 0).toFixed(1)} <span className="text-xs font-medium text-text3 uppercase">KG</span></p>
        </div>
        <div className="bg-bg3 p-6 rounded-3xl border border-bg4">
          <p className="text-[10px] font-black text-text3 uppercase mb-2 tracking-widest">Store Balance</p>
          <p className="text-2xl font-black text-pass">{consumptionStats.reduce((sum, s) => sum + s.store_balance, 0).toFixed(1)} <span className="text-xs font-medium text-text3 uppercase">KG</span></p>
        </div>
        <div className="bg-bg3 p-6 rounded-3xl border border-bg4">
          <p className="text-[10px] font-black text-text3 uppercase mb-2 tracking-widest">Floor Stock</p>
          <p className="text-2xl font-black text-ship">{consumptionStats.reduce((sum, s) => sum + s.floor_balance, 0).toFixed(1)} <span className="text-xs font-medium text-text3 uppercase">KG</span></p>
        </div>
      </div>

      <div className="overflow-auto max-h-[500px] rounded-[2rem] border border-bg4">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-bg3 text-text3 uppercase font-black tracking-widest sticky top-0 z-20 shadow-sm">
              <th className="p-4 border-b border-bg4 sticky top-0 bg-bg3 z-20">PO / Style</th>
              <th className="p-4 border-b border-bg4 sticky top-0 bg-bg3 z-20">Fabric & Color</th>
              <th className="p-4 border-b border-bg4 text-right sticky top-0 bg-bg3 z-20">In Store</th>
              <th className="p-4 border-b border-bg4 text-right sticky top-0 bg-bg3 z-20">Issued</th>
              <th className="p-4 border-b border-bg4 text-right sticky top-0 bg-bg3 z-20">Balance</th>
              <th className="p-4 border-b border-bg4 text-right sticky top-0 bg-bg3 z-20">Consumed</th>
              <th className="p-4 border-b border-bg4 text-right sticky top-0 bg-bg3 z-20">Actual Cons</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bg4">
            {consumptionStats.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-20 text-center text-text3 font-black uppercase tracking-widest">
                  <div className="flex flex-col items-center gap-4">
                    <Droplets className="w-12 h-12 opacity-10" />
                    No Fabric Records Identified
                  </div>
                </td>
              </tr>
            ) : (
              consumptionStats.map((stat: any, i) => {
                const actualCons = stat.planned_program > 0 ? (stat.total_consumed / stat.planned_program).toFixed(3) : '0.000';
                
                return (
                  <tr key={i} className="hover:bg-bg3/50 transition-all font-sans">
                    <td className="p-4">
                      <p className="font-black text-sm text-text">{stat.display_po}</p>
                      <p className="text-[10px] font-bold text-text3 uppercase mt-1">{stat.display_style}</p>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1">
                        <span className="bg-bg4/50 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tight w-fit">
                          {stat.fabric_name} • {stat.gsm} GSM
                        </span>
                        <span className="text-xs font-black text-text uppercase tracking-widest">{stat.color}</span>
                      </div>
                    </td>
                    <td className="p-4 text-right font-black text-sm">{stat.total_inhouse.toFixed(2)}</td>
                    <td className="p-4 text-right font-black text-sm text-po">{stat.total_issued.toFixed(2)}</td>
                    <td className={cn(
                      "p-4 text-right font-black text-sm",
                      stat.store_balance <= 0 ? "text-reject" : "text-pass"
                    )}>
                      {stat.store_balance.toFixed(2)}
                    </td>
                    <td className="p-4 text-right font-black text-sm">{stat.total_consumed.toFixed(2)}</td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-sm font-black">{actualCons}</span>
                        <ArrowUpRight className="w-3 h-3 text-text3" />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
