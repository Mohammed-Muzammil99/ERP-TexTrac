import React, { useState, useEffect, useMemo } from 'react';
import { cuttingService, fabricService, statusService } from '../../services/erpService';
import { Scissors, Search, History, ChevronDown, ChevronRight, Package } from 'lucide-react';
import { cn, fmtDate } from '../../lib/utils';
import { StockStoreTable } from './StockStoreTable';

interface CuttingReportProps {
  embedded?: boolean;
}

export const CuttingReport: React.FC<CuttingReportProps> = ({ embedded = false }) => {
  const [history, setHistory] = useState<any[]>([]);
  const [consumptionStats, setConsumptionStats] = useState<any[]>([]);
  const [detailedStatus, setDetailedStatus] = useState<any[]>([]);
  const [fabricRecords, setFabricRecords] = useState<any[]>([]);
  const [showReport, setShowReport] = useState(true);
  const [reportSearch, setReportSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [expandedColors, setExpandedColors] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [fabricReportDateRange, setFabricReportDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0], // Last 30 days default
    end: new Date().toISOString().split('T')[0]
  });
  const [fabricReportSearch, setFabricReportSearch] = useState('');
  const [expandedFabricRows, setExpandedFabricRows] = useState<string[]>([]);
  const [consumptionRates, setConsumptionRates] = useState<any[]>([]);

  const REPORT_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];

  const getDisplaySizeLabel = (sz: string) => {
    const upper = sz.toUpperCase();
    if (upper === 'XS') return 'xs';
    if (upper === 'S') return 's';
    if (upper === 'M') return 'm';
    if (upper === 'L') return 'L';
    if (upper === 'XL') return 'xl';
    if (upper === '2XL') return '2xl';
    if (upper === '3XL') return '3xl';
    if (upper === '4XL') return '4xl';
    return sz.toLowerCase();
  };

  const getExpectedConsForGroup = (styleNum: string, matches: any[], groupPo?: string) => {
    if (!styleNum) return null;
    const cleanStyle = styleNum.trim().toUpperCase();

    // 1. Try to find unique fabric names from the provided matches
    let uniqueFabrics: string[] = [];
    if (matches && matches.length > 0) {
      uniqueFabrics = Array.from(new Set(matches.map(m => (m.fabric_name || '').trim().toUpperCase()).filter(Boolean)));
    }

    // 2. If no matches or fabric names, try to find any fabric records for this PO and style
    if (uniqueFabrics.length === 0 && groupPo) {
      const cleanPo = groupPo.trim().toUpperCase();
      const poStyleRecords = fabricRecords.filter(f => 
        String(f.style_num || '').trim().toUpperCase() === cleanStyle &&
        String(f.po_number || '').trim().toUpperCase() === cleanPo
      );
      if (poStyleRecords.length > 0) {
        uniqueFabrics = Array.from(new Set(poStyleRecords.map(m => (m.fabric_name || '').trim().toUpperCase()).filter(Boolean)));
      }
    }

    // 3. Match against the style rates using fabric names
    if (uniqueFabrics.length > 0) {
      for (const fn of uniqueFabrics) {
        const rate = consumptionRates.find(r => {
          const searchStyle = r.style_num.trim().toUpperCase();
          const rateFabric = r.fabric_type.trim().toUpperCase();
          return (cleanStyle.includes(searchStyle) || searchStyle.includes(cleanStyle)) && 
                 (rateFabric === fn);
        });
        if (rate) return rate.expected_consumption;
      }
    }

    // 4. Fallback: find any rate configured for this style
    const styleRates = consumptionRates.filter(r => {
      const searchStyle = r.style_num.trim().toUpperCase();
      return cleanStyle.includes(searchStyle) || searchStyle.includes(cleanStyle);
    });

    if (styleRates.length > 0) {
      // If we have multiple, see if we can match on any fabric type mentioned in any fabric records of this style
      if (styleRates.length > 1) {
        const styleRecords = fabricRecords.filter(f => 
          String(f.style_num || '').trim().toUpperCase() === cleanStyle
        );
        const styleFabrics = Array.from(new Set(styleRecords.map(m => (m.fabric_name || '').trim().toUpperCase()).filter(Boolean)));
        for (const sf of styleFabrics) {
          const rate = styleRates.find(r => r.fabric_type.trim().toUpperCase() === sf);
          if (rate) return rate.expected_consumption;
        }
      }
      // Ultimate fallback: first rate configured for this style
      return styleRates[0].expected_consumption;
    }

    return null;
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [h, s, ds, f, r] = await Promise.all([
        cuttingService.list(),
        cuttingService.getConsumptionStats(),
        statusService.getDetailedStatus(),
        fabricService.list(),
        fabricService.getConsumptionRates().catch(() => [])
      ]);
      setHistory(h || []);
      setConsumptionStats(s || []);
      setDetailedStatus(ds || []);
      setFabricRecords(f || []);
      setConsumptionRates(r || []);
    } catch (error) {
      console.error('Failed to fetch cutting report data', error);
    }
  };

  const individualFabricConsReport = useMemo(() => {
    if (!showReport) return [];

    const filteredHistory = history.filter(h => {
      const hDate = h.created_at ? h.created_at.substring(0, 10) : '';
      return hDate >= fabricReportDateRange.start && hDate <= fabricReportDateRange.end;
    });

    const cutGroups: Record<string, {
      date: string;
      po_number: string;
      style_num: string;
      color: string;
      total_pcs: number;
      sizes: Record<string, number>;
    }> = {};

    filteredHistory.forEach(rec => {
      const datePart = rec.created_at ? rec.created_at.substring(0, 10) : '';
      const key = `${datePart}_${rec.po_number.trim().toUpperCase()}_${String(rec.style_num).trim().toUpperCase()}_${String(rec.color).trim().toUpperCase()}`;
      if (!cutGroups[key]) {
        cutGroups[key] = {
          date: datePart,
          po_number: rec.po_number,
          style_num: rec.style_num,
          color: rec.color,
          total_pcs: 0,
          sizes: {}
        };
      }
      cutGroups[key].total_pcs += Number(rec.quantity || 0);
      const sz = String(rec.size || '').trim().toUpperCase();
      if (sz) {
        cutGroups[key].sizes[sz] = (cutGroups[key].sizes[sz] || 0) + Number(rec.quantity || 0);
      }
    });

    const list = Object.values(cutGroups).map((group: any) => {
      const matches = fabricRecords.filter(f => {
        const typeMatch = f.record_type === 'consumption';
        const dateMatch = f.created_at && f.created_at.substring(0, 10) === group.date;
        const poMatch = String(f.po_number).trim().toUpperCase() === String(group.po_number).trim().toUpperCase();
        const styleMatch = String(f.style_num).trim().toUpperCase() === String(group.style_num).trim().toUpperCase();
        
        if (!typeMatch || !dateMatch || !poMatch || !styleMatch) return false;
        
        // Color matching (handle multi-color split components)
        const fColor = String(f.color || '').trim().toUpperCase();
        const gColor = String(group.color || '').trim().toUpperCase();
        
        if (fColor === gColor) return true;
        
        const gColors = gColor.split(/[\/\+,]/).map(c => c.trim()).filter(Boolean);
        const fColors = fColor.split(/[\/\+,]/).map(c => c.trim()).filter(Boolean);
        
        const hasMutualComponent = gColors.some(gc => fColors.includes(gc)) || fColors.some(fc => gColors.includes(fc));
        if (hasMutualComponent) return true;
        
        if (!fColor || fColor === 'UNIVERSAL' || gColor === 'UNIVERSAL') return true;

        return false;
      });

      const fabricType = matches.length > 0 
        ? matches.map(m => `${m.fabric_name || 'Standard'}${m.gsm ? ` (${m.gsm} GSM)` : ''}`).join(', ')
        : 'N/A';
      
      const weightUsed = matches.reduce((sum, m) => sum + Number(m.quantity_kg || 0), 0);
      const actualCons = group.total_pcs > 0 ? (weightUsed / group.total_pcs) : 0;

      return {
        ...group,
        fabricType,
        weightUsed,
        actualCons,
        matches
      };
    }).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (!fabricReportSearch) return list;
    const search = fabricReportSearch.toLowerCase();
    return list.filter(item => 
      (item.po_number || '').toLowerCase().includes(search) ||
      (item.style_num || '').toLowerCase().includes(search) ||
      (item.color || '').toLowerCase().includes(search) ||
      (item.fabricType || '').toLowerCase().includes(search)
    );
  }, [history, fabricRecords, fabricReportDateRange, fabricReportSearch, showReport, consumptionRates]);

  const combinations = useMemo(() => {
    if (!showReport) return [];

    const filteredHistory = history.filter(h => {
      const hDate = h.created_at ? h.created_at.substring(0, 10) : '';
      return hDate >= dateRange.start && hDate <= dateRange.end;
    });

    const styleColors: Record<string, string[]> = {};
    filteredHistory.forEach(h => {
      if (!styleColors[h.style_num]) styleColors[h.style_num] = [];
      if (!styleColors[h.style_num].includes(h.color)) styleColors[h.style_num].push(h.color);
    });

    const result: any[] = [];
    Object.entries(styleColors).forEach(([styleNum, colors]) => {
      colors.forEach(productColor => {
        const components = productColor.split('/').map(s => s.trim().toUpperCase());
        const relevantStats = consumptionStats.filter(s => 
          (s.style_num || '').toUpperCase() === styleNum.toUpperCase() && 
          components.includes((s.color || '').trim().toUpperCase())
        );

        if (relevantStats.length > 0) {
          const totalWeight = relevantStats.reduce((sum, s) => sum + Number(s.total_kg || 0), 0);
          const totalPcs = Math.max(...relevantStats.map(s => Number(s.total_qty || 0)));
          const totalPlanned = Math.max(...relevantStats.map(s => Number(s.total_planned || 0)));
          const totalIssued = relevantStats.reduce((sum, s) => sum + Number(s.total_issued || 0), 0);
          
          const actualCons = totalPcs > 0 ? (totalWeight / totalPcs).toFixed(3) : '0.000';
          const expectedCons = totalPlanned > 0 ? (totalIssued / totalPlanned).toFixed(3) : '0.000';

          result.push({
            combinationId: `${styleNum}-${productColor}`,
            colorCombination: productColor,
            styleNum,
            totalWeight,
            totalPcs,
            totalPlanned,
            actualCons,
            expectedCons,
            components: relevantStats
          });
        }
      });
    });

    if (!reportSearch) return result;
    const search = reportSearch.toLowerCase();
    return result.filter(c => 
      c.styleNum.toLowerCase().includes(search) || 
      c.colorCombination.toLowerCase().includes(search)
    );
  }, [history, consumptionStats, reportSearch, showReport, dateRange]);

  const individualColorStats = useMemo(() => {
    if (!showReport) return [];
    
    const colorGroups: Record<string, any[]> = {};
    consumptionStats.forEach(stat => {
      const color = stat.color.trim().toUpperCase();
      if (!colorGroups[color]) colorGroups[color] = [];
      colorGroups[color].push(stat);
    });

    const result = Object.entries(colorGroups).map(([color, stats]) => {
      const totalKg = stats.reduce((sum, s) => sum + Number(s.total_kg), 0);
      const totalPcs = stats.reduce((sum, s) => sum + Number(s.total_qty), 0);
      const totalPlanned = stats.reduce((sum, s) => sum + Number(s.total_planned || 0), 0);
      const totalIssued = stats.reduce((sum, s) => sum + Number(s.total_issued || 0), 0);

      const actualCons = totalPcs > 0 ? (totalKg / totalPcs).toFixed(3) : '0.000';
      const expectedCons = totalPlanned > 0 ? (totalIssued / totalPlanned).toFixed(3) : '0.000';

      return {
        color, 
        originalColorName: stats[0].color.trim(), 
        stats,
        totalKg,
        totalPcs,
        actualCons,
        expectedCons
      };
    });

    if (!reportSearch) return result;
    const search = reportSearch.toLowerCase();
    return result.filter(r => r.color.toLowerCase().includes(search) || r.stats.some((s: any) => s.style_num.toLowerCase().includes(search)));
  }, [consumptionStats, showReport, reportSearch]);

  const pivotedHistory = useMemo(() => {
    const groups: Record<string, any> = {};
    const allSizes = new Set<string>();

    const filteredHistory = history.filter(h => {
      const hDate = h.created_at ? h.created_at.substring(0, 10) : '';
      return hDate >= dateRange.start && hDate <= dateRange.end;
    });

    filteredHistory.forEach(rec => {
      const date = rec.created_at ? rec.created_at.substring(0, 10) : '';
      const key = `${date}-${rec.po_number}-${rec.style_num}-${rec.color}-${rec.creator_name || 'System'}-${rec.buyer || ''}`;
      
      const search = historySearch.toLowerCase();
      const matchesSearch = !historySearch || 
                           rec.po_number.toLowerCase().includes(search) ||
                           rec.style_num.toLowerCase().includes(search) ||
                           rec.color.toLowerCase().includes(search) ||
                           (rec.buyer && rec.buyer.toLowerCase().includes(search)) ||
                           (rec.creator_name && rec.creator_name.toLowerCase().includes(search));

      if (matchesSearch) {
        if (!groups[key]) {
          groups[key] = {
            date: rec.created_at,
            po_number: rec.po_number,
            style_num: rec.style_num,
            color: rec.color,
            buyer: rec.buyer || '',
            creator_name: rec.creator_name || 'System',
            sizes: {}
          };
        }
        
        groups[key].sizes[rec.size] = (groups[key].sizes[rec.size] || 0) + rec.quantity;
        allSizes.add(rec.size);
      }
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
      {/* Aggregated Style/Color Consumption Table */}
      <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-6 bg-cut/5 border-b border-bg4 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-1">
            <h3 className="text-xl font-black uppercase tracking-tight text-cut">1. Color Combination Summary</h3>
            <p className="text-[10px] font-mono text-text3 uppercase">Aggregated averages by product color combinations</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 bg-bg3 p-1.5 rounded-xl border border-bg4">
              <div className="flex flex-col px-3">
                <span className="text-[10px] font-mono text-text3 uppercase font-bold">From</span>
                <input type="date" value={dateRange.start} onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="bg-transparent text-xs font-black text-text outline-none" />
              </div>
              <div className="w-px h-8 bg-bg4" />
              <div className="flex flex-col px-3">
                <span className="text-[10px] font-mono text-text3 uppercase font-bold">To</span>
                <input type="date" value={dateRange.end} onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="bg-transparent text-xs font-black text-text outline-none" />
              </div>
            </div>

            <button
              onClick={() => setShowReport(!showReport)}
              className={cn(
                "px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg active:scale-95",
                showReport ? "bg-bg4 text-text hover:bg-bg3 border border-bg4" : "bg-cut text-white hover:bg-orange-600 shadow-cut/20"
              )}
            >
              {showReport ? 'Hide Reports' : 'Generate Reports'}
            </button>

            {showReport && (
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text3 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Global Reports Search..."
                  value={reportSearch}
                  onChange={(e) => {
                    setReportSearch(e.target.value);
                    setHistorySearch(e.target.value);
                  }}
                  className="w-full bg-bg3 border border-bg4 rounded-xl py-2 pl-10 pr-4 text-xs font-bold focus:border-cut focus:ring-1 focus:ring-cut/20 outline-none transition-all"
                />
              </div>
            )}
          </div>
        </div>
        <div className="overflow-auto max-h-[500px]">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-bg3 text-text border-b border-bg4 sticky top-0 z-20 shadow-sm">
                <th className="p-4 font-black text-xs uppercase tracking-widest border-r border-bg4 sticky top-0 bg-bg3 z-20">Color Combination</th>
                <th className="p-4 font-black text-xs uppercase tracking-widest border-r border-bg4 sticky top-0 bg-bg3 z-20">Style</th>
                <th className="p-4 font-black text-xs uppercase tracking-widest text-right border-r border-bg4 text-cut bg-cut/5 group-hover:bg-cut/10 transition-colors sticky top-0 bg-bg3 z-20">Available</th>
                <th className="p-4 font-black text-xs uppercase tracking-widest text-right border-r border-bg4 text-emerald-600 bg-emerald-50/50 group-hover:bg-emerald-100/50 transition-colors sticky top-0 bg-bg3 z-20">Dispatched (Cut)</th>
                <th className="p-4 font-black text-xs uppercase tracking-widest text-right border-r border-bg4 text-cut sticky top-0 bg-bg3 z-20">Actual Cons.</th>
                <th className="p-4 font-black text-xs uppercase tracking-widest text-right text-text sticky top-0 bg-bg3 z-20">Expected Cons.</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-bg4">
              {!showReport ? (
                <tr><td colSpan={6} className="p-16 text-center text-text3 uppercase text-xs font-black tracking-widest">Analysis Standby</td></tr>
              ) : combinations.length === 0 ? (
                <tr><td colSpan={6} className="p-12 text-center text-text3 italic uppercase text-xs font-bold tracking-widest">No consumption data found</td></tr>
              ) : (
                combinations.map((comb) => {
                  const isExpanded = expandedColors.includes(comb.combinationId);
                  const available = Math.max(0, comb.totalPlanned - comb.totalPcs);
                  return (
                    <React.Fragment key={comb.combinationId}>
                      <tr onClick={() => isExpanded ? setExpandedColors(expandedColors.filter(c => c !== comb.combinationId)) : setExpandedColors([...expandedColors, comb.combinationId])} className={cn("cursor-pointer transition-colors border-b-2 border-bg4 font-black group", isExpanded ? "bg-bg3 shadow-inner" : "hover:bg-bg3/30")}>
                        <td className="p-4 border-r border-bg4">
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronDown className="w-5 h-5 text-cut" /> : <ChevronRight className="w-5 h-5 text-text3" />}
                            <span className="text-base uppercase tracking-tight text-text leading-tight">{comb.colorCombination}</span>
                          </div>
                        </td>
                        <td className="p-4 border-r border-bg4 text-center font-black text-sm">{comb.styleNum}</td>
                        <td className="p-4 border-r border-bg4 text-right font-black text-base text-cut bg-cut/5">{available} <span className="text-[10px] opacity-60">PCS</span></td>
                        <td className="p-4 border-r border-bg4 text-right font-black text-base text-emerald-600 bg-emerald-50/50">{comb.totalPcs} <span className="text-[10px] opacity-60">PCS</span></td>
                        <td className="p-4 border-r border-bg4 text-right font-black text-base text-cut">{comb.actualCons}</td>
                        <td className="p-4 text-right font-black text-base text-text">{comb.expectedCons}</td>
                      </tr>
                      {isExpanded && comb.components.map((comp: any, idx: number) => (
                        <tr key={`${comb.combinationId}-comp-${idx}`} className="bg-bg2/80 border-b border-bg4/50">
                          <td className="p-3 pl-12 border-r border-bg4/30 text-[12px] uppercase font-black text-text2">
                            <div>{comp.color}</div>
                            <div className="text-[10px] text-text3 font-bold font-mono tracking-tight">{comp.fabric_name || '-'} / {comp.gsm || '-'} GSM</div>
                          </td>
                          <td className="p-3 border-r border-bg4/30 text-center font-black text-[12px] text-text3">{comp.style_num}</td>
                          <td className="p-3 border-r border-bg4/30 text-right font-black text-[12px]">{Number(comp.total_kg).toFixed(2)}</td>
                          <td className="p-3 border-r border-bg4/30 text-right font-black text-[12px]">{comp.total_qty}</td>
                          <td className="p-3 border-r border-bg4/30 text-right font-black text-[12px] text-cut/80">{comp.actual_consumption}</td>
                          <td className="p-3 text-right font-black text-[12px] text-text">{comp.expected_consumption}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <StockStoreTable data={detailedStatus} dept="cutting" title="Pending Production Orders (Cutting Dept Stock)" />

      {showReport && individualColorStats.length > 0 && (
        <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-6 bg-bg3/30 border-b border-bg4 font-black uppercase tracking-tight text-po">Individual Color Tables</div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {individualColorStats.map((colorSet) => (
              <div key={colorSet.color} className="space-y-4">
                <h4 className="text-sm font-black text-cut uppercase tracking-widest border-b-2 border-cut pb-2 inline-block">{colorSet.originalColorName}</h4>
                <div className="bg-bg3/50 rounded-xl overflow-hidden border border-bg4">
                  <table className="w-full text-[10px] text-left">
                    <thead>
                      <tr className="bg-bg4/30 text-text3"><th className="p-2 uppercase font-black">Style</th><th className="p-2 uppercase font-black text-right">Total KG</th><th className="p-2 uppercase font-black text-right">Actual</th><th className="p-2 uppercase font-black text-right">Expected</th></tr>
                    </thead>
                    <tbody className="divide-y divide-bg4/30">
                      {colorSet.stats.map((s: any, i: number) => (
                        <tr key={i}><td className="p-2 font-bold">{s.style_num}</td><td className="p-2 text-right font-mono">{Number(s.total_kg).toFixed(2)}</td><td className="p-2 text-right font-mono text-cut font-black">{s.actual_consumption}</td><td className="p-2 text-right font-mono text-black font-black">{s.expected_consumption}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Detailed Cutting Log */}
      {showReport && (
        <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-6 bg-bg3/30 border-b border-bg4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-xl font-black uppercase tracking-tight text-text1">3. Detailed Cutting Log</h3>
              <p className="text-[10px] font-mono text-text3 uppercase">Individual entry records for matching period</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text3 w-3.5 h-3.5" />
                <input
                  type="text"
                  placeholder="Search Log (PO, Style, User)..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full bg-bg3 border border-bg4 rounded-xl py-1.5 pl-9 pr-4 text-[10px] font-bold focus:border-cut focus:ring-1 focus:ring-cut/20 outline-none transition-all placeholder:text-text3/50"
                />
              </div>
              <div className="h-6 w-px bg-bg4 hidden md:block" />
              <span className="text-[10px] font-mono text-text3 uppercase bg-bg4 px-3 py-1 rounded-full whitespace-nowrap">{pivotedHistory.rows.length} Records</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-bg2 text-text border-b border-bg4">
                  <th className="p-4 font-mono text-xs uppercase tracking-widest font-black sticky left-0 bg-bg2 z-10">Date</th>
                  <th className="p-4 font-mono text-xs uppercase tracking-widest font-black">PO # / Buyer</th>
                  <th className="p-4 font-mono text-xs uppercase tracking-widest font-black">Style</th>
                  <th className="p-4 font-mono text-xs uppercase tracking-widest font-black">Color</th>
                  {pivotedHistory.sizes.map(size => (
                    <th key={size} className="p-4 font-mono text-xs uppercase tracking-widest font-black text-center min-w-[60px] bg-bg3/20">
                      {size}
                    </th>
                  ))}
                  <th className="p-4 font-mono text-xs uppercase tracking-widest font-black text-center bg-bg4/30">Total</th>
                  <th className="p-4 font-mono text-xs uppercase tracking-widest font-black">Creator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bg4">
                {pivotedHistory.rows.length === 0 ? (
                  <tr>
                    <td colSpan={pivotedHistory.sizes.length + 6} className="p-8 text-center text-text3 italic uppercase text-[10px] tracking-widest">No records matching filters</td>
                  </tr>
                ) : (
                  pivotedHistory.rows.map((row: any, i: number) => {
                    const total = Object.values(row.sizes).reduce((sum: number, q: any) => sum + q, 0) as number;
                    return (
                      <tr key={i} className="hover:bg-bg3/50 transition-colors">
                        <td className="p-4 font-mono text-xs text-text3 sticky left-0 bg-bg2/90 backdrop-blur-sm z-10 font-bold">
                          {fmtDate(row.date)}
                        </td>
                        <td className="p-4">
                          <p className="font-bold text-po text-sm">{row.po_number}</p>
                          <p className="text-[10px] text-text3 uppercase font-medium">{row.buyer}</p>
                        </td>
                        <td className="p-4 font-black">{row.style_num}</td>
                        <td className="p-4 font-bold uppercase text-text2">{row.color}</td>
                        {pivotedHistory.sizes.map(size => (
                          <td key={size} className="p-4 text-center font-mono text-xs font-bold">
                            {row.sizes[size] !== undefined ? (
                              <span className="text-cut">{row.sizes[size]}</span>
                            ) : (
                              <span className="text-text3/20">-</span>
                            )}
                          </td>
                        ))}
                        <td className="p-4 text-center bg-bg4/10">
                          <span className="bg-cut text-white px-3 py-1 rounded-full font-black text-[11px]">
                            {total}
                          </span>
                        </td>
                        <td className="p-4 font-mono text-[10px] text-text3 truncate max-w-[120px]">
                          {row.creator_name}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Date-wise Individual Fabric Consumption Report */}
      {showReport && (
        <div id="fabric-consumption-report-section" className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl animate-fade-in">
          <div className="p-6 bg-amber-500/5 border-b border-bg4 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-1 font-sans">
              <h3 className="text-xl font-black uppercase tracking-tight text-amber-500">4. Date-Wise Individual Fabric Consumption</h3>
              <p className="text-[10px] font-mono text-text3 uppercase">Individual consumption metrics per cutting batch / entry</p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {/* Dedicated Date Filters for Fabric Report */}
              <div className="flex items-center gap-2 bg-bg3 p-1.5 rounded-xl border border-bg4">
                <div className="flex flex-col px-3">
                  <span className="text-[10px] font-mono text-text3 uppercase font-bold">
                    From
                  </span>
                  <input
                    type="date"
                    value={fabricReportDateRange.start}
                    onChange={(e) =>
                      setFabricReportDateRange((prev) => ({
                        ...prev,
                        start: e.target.value,
                      }))
                    }
                    className="bg-transparent text-xs font-black text-text outline-none"
                  />
                </div>
                <div className="w-px h-8 bg-bg4" />
                <div className="flex flex-col px-3">
                  <span className="text-[10px] font-mono text-text3 uppercase font-bold">
                    To
                  </span>
                  <input
                    type="date"
                    value={fabricReportDateRange.end}
                    onChange={(e) =>
                      setFabricReportDateRange((prev) => ({
                        ...prev,
                        end: e.target.value,
                      }))
                    }
                    className="bg-transparent text-xs font-black text-text outline-none"
                  />
                </div>
              </div>

              {/* Dedicated Search Filter */}
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text3 w-3.5 h-3.5" />
                <input
                  type="text"
                  placeholder="Search Fabric Log (PO, Style)..."
                  value={fabricReportSearch}
                  onChange={(e) => setFabricReportSearch(e.target.value)}
                  className="w-full bg-bg3 border border-bg4 rounded-xl py-1.5 pl-9 pr-4 text-[10px] font-bold focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 outline-none transition-all placeholder:text-text3/50"
                />
              </div>

              <span className="text-[10px] font-mono text-[11px] font-black text-amber-600 bg-amber-500/10 px-3 py-1 rounded-full whitespace-nowrap">
                {individualFabricConsReport.length} Entries
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-bg3 text-text border-b border-bg4">
                  <th className="p-4 font-mono text-xs uppercase tracking-widest font-black sticky left-0 bg-bg3 z-10">Date</th>
                  <th className="p-4 font-mono text-xs uppercase tracking-widest font-black">PO Number</th>
                  <th className="p-4 font-mono text-xs uppercase tracking-widest font-black">Style</th>
                  <th className="p-4 font-mono text-xs uppercase tracking-widest font-black">Color</th>
                  <th className="p-4 font-mono text-xs uppercase tracking-widest font-black">Fabric Type</th>
                  {REPORT_SIZES.map(sz => (
                    <th key={sz} className="p-2 font-mono text-xs uppercase tracking-widest font-black text-center min-w-[50px] bg-bg3/45">
                      {getDisplaySizeLabel(sz)}
                    </th>
                  ))}
                  <th className="p-4 font-mono text-xs uppercase tracking-widest font-black text-center">Total Pcs Cut</th>
                  <th className="p-4 font-mono text-xs uppercase tracking-widest font-black text-right">Weight Used</th>
                  <th className="p-4 font-mono text-xs uppercase tracking-widest font-black text-right text-pass bg-pass/5">Expected Consumption</th>
                  <th className="p-4 font-mono text-xs uppercase tracking-widest font-black text-right text-cut font-black bg-cut/5">Actual Consumption</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bg4">
                {individualFabricConsReport.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="p-8 text-center text-text3 italic uppercase text-[10px] tracking-widest font-bold">
                      No matching cutting entries with consumption recorded
                    </td>
                  </tr>
                ) : (
                  individualFabricConsReport.map((row: any, idx: number) => {
                    const rowKey = `${row.date}_${row.po_number}_${row.style_num}_${row.color}`;
                    const isExpanded = expandedFabricRows.includes(rowKey);
                    const displayMatches = row.matches && row.matches.length > 1 ? row.matches : [];

                    const toggleRow = () => {
                      if (isExpanded) {
                        setExpandedFabricRows(expandedFabricRows.filter(k => k !== rowKey));
                      } else {
                        setExpandedFabricRows([...expandedFabricRows, rowKey]);
                      }
                    };

                    if (isExpanded && displayMatches.length > 0) {
                      return displayMatches.map((m: any, mIdx: number) => {
                        const actCons = row.total_pcs > 0 ? (m.quantity_kg / row.total_pcs) : 0;
                        const expectedValue = getExpectedConsForGroup(row.style_num, [m], row.po_number);
                        const hasConfigured = expectedValue !== null;
                        const isOverConsumed = hasConfigured && actCons > (expectedValue as number) && actCons > 0;

                        return (
                          <tr 
                            key={`${rowKey}-split-${mIdx}`} 
                            onClick={toggleRow}
                            className="cursor-pointer bg-amber-500/[0.04] hover:bg-amber-500/[0.08] border-b border-dashed border-amber-500/20 transition-all duration-200"
                            title="Click to merge fabrics back into combined row"
                          >
                            <td className="p-4 font-mono text-xs text-text3 font-bold flex items-center gap-1">
                              <span className="text-amber-500 font-extrabold text-base">↳</span>
                              {fmtDate(row.date)}
                            </td>
                            <td className="p-4 font-bold text-red-600 bg-red-500/[0.01]">
                              {row.po_number}
                            </td>
                            <td className="p-4 font-black text-slate-800">
                              {row.style_num}
                            </td>
                            <td className="p-4 font-bold uppercase text-slate-700">
                              {m.color || row.color}
                            </td>
                            <td className="p-4 font-bold text-amber-600 font-mono flex items-center gap-1.5">
                              <span className="bg-amber-500/10 px-2 py-0.5 rounded text-[10px] uppercase font-black tracking-wide">
                                {m.fabric_name || 'Standard'}
                              </span>
                              <span>{m.gsm ? `(${m.gsm} GSM)` : ''}</span>
                            </td>
                            {REPORT_SIZES.map(sz => {
                              const qty = row.sizes[sz.toUpperCase()] || 0;
                              return (
                                <td key={sz} className="p-2 text-center font-mono text-xs font-bold bg-amber-500/5">
                                  {qty > 0 ? (
                                    <span className="text-amber-500 font-extrabold">{qty}</span>
                                  ) : (
                                    <span className="text-text3/30">-</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="p-4 text-center font-black font-mono text-sm text-text1">
                              {row.total_pcs} <span className="text-[9px] opacity-65">PCS</span>
                            </td>
                            <td className="p-4 text-right font-black text-sm text-red-600 bg-red-500/5">
                              {m.quantity_kg > 0 ? `${m.quantity_kg.toFixed(2)} KG` : '-'}
                            </td>
                            <td className="p-4 text-right font-mono font-bold text-sm text-text border-r border-bg4/20 bg-bg2">
                              {hasConfigured ? (
                                <div>
                                  {expectedValue.toFixed(3)}{' '}
                                  <span className="text-[9px] font-medium opacity-65 uppercase">kg/pc</span>
                                  <div className="text-[8px] font-mono text-pass uppercase tracking-widest font-bold mt-0.5">Configured</div>
                                </div>
                              ) : (
                                <span className="text-text3/50">-</span>
                              )}
                            </td>
                            <td className={cn(
                              "p-4 text-right font-mono font-extrabold text-base bg-amber-500/5 transition-all duration-300",
                              isOverConsumed ? "text-reject bg-reject/10 animate-pulse-slow" : "text-amber-500"
                            )}>
                              {m.quantity_kg > 0 ? `${actCons.toFixed(3)}` : '0.000'}{' '}
                              <span className="text-[9px] font-medium opacity-65 uppercase">kg/pc</span>
                              {isOverConsumed && (
                                <div className="text-[8px] font-mono text-reject uppercase tracking-widest font-black mt-0.5">
                                  EXCEEDS TARGET ⚠️
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      });
                    }

                    const expectedValue = getExpectedConsForGroup(row.style_num, row.matches, row.po_number);
                    const hasConfigured = expectedValue !== null;
                    const isOverConsumed = hasConfigured && row.actualCons > (expectedValue as number) && row.actualCons > 0;

                    return (
                      <tr 
                        key={idx} 
                        onClick={toggleRow}
                        className={cn(
                          "cursor-pointer hover:bg-bg3/55 transition-colors duration-150",
                          row.matches && row.matches.length > 1 ? "border-l-4 border-amber-500/60" : ""
                        )}
                        title={row.matches && row.matches.length > 1 ? "Click to split fabrics details" : undefined}
                      >
                        <td className="p-4 font-mono text-xs text-text3 sticky left-0 bg-bg2/90 backdrop-blur-sm z-10 font-bold">
                          {fmtDate(row.date)}
                        </td>
                        <td className="p-4 font-black text-po">{row.po_number}</td>
                        <td className="p-4 font-black">{row.style_num}</td>
                        <td className="p-4 font-bold uppercase text-text2">{row.color}</td>
                        <td className="p-4 font-medium text-text3 font-mono">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{row.fabricType}</span>
                            {row.matches && row.matches.length > 1 && (
                              <span className="bg-amber-500/10 text-amber-600 text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider animate-pulse whitespace-nowrap">
                                Click to Split ({row.matches.length})
                              </span>
                            )}
                          </div>
                        </td>
                        {REPORT_SIZES.map(sz => {
                          const qty = row.sizes[sz.toUpperCase()] || 0;
                          return (
                            <td key={sz} className="p-2 text-center font-mono text-xs font-bold">
                              {qty > 0 ? (
                                <span className="text-amber-500 font-extrabold">{qty}</span>
                              ) : (
                                <span className="text-text3/30">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="p-4 text-center font-bold font-mono text-sm text-text1">
                          {row.total_pcs} <span className="text-[9px] opacity-65">PCS</span>
                        </td>
                        <td className="p-4 text-right font-black text-sm text-po">
                          {row.weightUsed > 0 ? `${row.weightUsed.toFixed(2)} KG` : '-'}
                        </td>
                        <td className="p-4 text-right font-mono font-bold text-sm text-text border-r border-bg4/20 bg-bg2">
                          {hasConfigured ? (
                            <div>
                              {expectedValue.toFixed(3)}{' '}
                              <span className="text-[9px] font-medium opacity-65 uppercase">kg/pc</span>
                              <div className="text-[8px] font-mono text-pass uppercase tracking-widest font-bold mt-0.5">Configured</div>
                            </div>
                          ) : (
                            <span className="text-text3/50">-</span>
                          )}
                        </td>
                        <td className={cn(
                          "p-4 text-right font-mono font-extrabold text-base bg-cut/5 transition-all duration-300",
                          isOverConsumed ? "text-reject bg-reject/10 animate-pulse-slow" : "text-cut"
                        )}>
                          {row.weightUsed > 0 ? `${row.actualCons.toFixed(3)}` : '0.000'}{' '}
                          <span className="text-[9px] font-medium opacity-65 uppercase">kg/pc</span>
                          {isOverConsumed && (
                            <div className="text-[8px] font-mono text-reject uppercase tracking-widest font-black mt-0.5">
                              EXCEEDS TARGET ⚠️
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
