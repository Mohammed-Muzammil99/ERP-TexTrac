import React, { useEffect, useState } from 'react';
import { statusService } from '../../services/erpService';
import { 
  FileText, 
  Download, 
  Search, 
  TrendingUp,
  Layers
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion } from 'motion/react';
import * as XLSX from 'xlsx';

interface WIPRow {
  po_number: string;
  due_date: string;
  style_num: string;
  color: string;
  buyer: string;
  sizes: { [key: string]: number };
  total_wip: number;
  est_dates?: string[];
}

interface WIPReportProps {
  embedded?: boolean;
}

export const WIPReport: React.FC<WIPReportProps> = ({ embedded = false }) => {
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [detailedStatus, setDetailedStatus] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Selected buyer sheet tab state
  const [selectedBuyer, setSelectedBuyer] = useState<string>('All');
  
  const sizeHeaders = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const detailed = await statusService.getDetailedStatus(undefined, dateRange.start, dateRange.end);
      setDetailedStatus(detailed);
    } catch (error) {
      console.error('Failed to fetch WIP report data', error);
    } finally {
      setIsLoading(false);
    }
  };

  const groupedData = detailedStatus.reduce((acc: { [key: string]: WIPRow }, curr) => {
    if (String(curr.po_status || '').toLowerCase() !== 'active') return acc;

    const key = `${curr.po_number}-${curr.style_num}-${curr.color}`;
    const wip = curr.order_qty || 0;
    
    if (!acc[key]) {
      acc[key] = {
        po_number: curr.po_number,
        due_date: curr.delivery_date || 'N/A',
        style_num: curr.style_num,
        color: curr.color,
        buyer: curr.buyer || 'Unknown',
        sizes: {},
        total_wip: 0,
        est_dates: []
      };
      sizeHeaders.forEach(s => acc[key].sizes[s] = 0);
    }

    const currentSize = (curr.size || '').trim().toUpperCase();
    if (acc[key].sizes.hasOwnProperty(currentSize)) {
      acc[key].sizes[currentSize] += wip;
    }
    
    if (curr.est_date) {
      const formattedDate = curr.est_date.substring(0, 10);
      if (!acc[key].est_dates?.includes(formattedDate)) {
        acc[key].est_dates?.push(formattedDate);
      }
    }
    
    acc[key].total_wip += wip;
    return acc;
  }, {});

  const allWipRows = (Object.values(groupedData) as WIPRow[]).filter(row => row.total_wip > 0);
  const uniqueBuyers = Array.from(new Set(allWipRows.map(r => r.buyer))).sort();

  // Handle fallback if selectedBuyer is no longer available/active
  useEffect(() => {
    if (selectedBuyer !== 'All' && !uniqueBuyers.includes(selectedBuyer)) {
      setSelectedBuyer('All');
    }
  }, [uniqueBuyers, selectedBuyer]);

  const rows = allWipRows.filter(row => {
    const matchSearch = row.po_number.toLowerCase().includes(searchTerm.toLowerCase()) || 
                       row.style_num.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       row.color.toLowerCase().includes(searchTerm.toLowerCase());
    const matchBuyer = selectedBuyer === 'All' || row.buyer === selectedBuyer;
    return matchSearch && matchBuyer;
  });

  const exportToExcel = () => {
    // Group rows by buyer name
    const buyersGroup: { [buyerName: string]: any[] } = {};
    
    rows.forEach(r => {
      const b = (r.buyer || 'Unknown').trim();
      if (!buyersGroup[b]) {
        buyersGroup[b] = [];
      }
      buyersGroup[b].push({
        'PO #': r.po_number,
        'DUE DATE': r.due_date,
        'STYLE #': r.style_num,
        'COLOR': r.color,
        ...r.sizes,
        'Total WIP': r.total_wip,
        'ESTIMATED DATE': r.est_dates && r.est_dates.length > 0 ? r.est_dates.join(', ') : ''
      });
    });

    const wb = XLSX.utils.book_new();
    const buyerNames = Object.keys(buyersGroup).sort();
    
    if (buyerNames.length === 0) {
      const ws = XLSX.utils.json_to_sheet([]);
      XLSX.utils.book_append_sheet(wb, ws, "WIP Report");
    } else {
      buyerNames.forEach(buyerName => {
        const ws = XLSX.utils.json_to_sheet(buyersGroup[buyerName]);
        // Excel sheets can't contain special characters and must be max 31 characters
        const sheetName = buyerName.replace(/[:\\/?*\[\]]/g, '').substring(0, 31) || "WIP";
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });
    }
    XLSX.writeFile(wb, `WIP_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (isLoading) {
    return (
      <div className="h-96 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-bg4 border-t-po rounded-full animate-spin" />
          <p className="text-text3 font-mono text-[10px] uppercase tracking-widest animate-pulse">Scanning WIP Inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {!embedded && (
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-po/10 text-po rounded-2xl ring-4 ring-po/5">
                <Layers className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-4xl font-black tracking-tighter text-text uppercase">WIP Inventory</h1>
                <p className="text-text3 text-[10px] font-mono uppercase tracking-[0.3em] font-medium leading-tight mt-1">Work in Progress Breakdown by Size</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="bg-bg2 border border-bg4 p-6 rounded-3xl shadow-sm">
          <p className="text-[10px] font-black text-text3 uppercase tracking-widest mb-2 font-mono leading-none">Total WIP Units</p>
          <h3 className="text-3xl font-black tracking-tighter text-text leading-none">
            {rows.reduce((sum, r) => sum + r.total_wip, 0).toLocaleString()} <span className="text-xs font-mono text-text3 ml-2 uppercase font-medium">PCS</span>
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 bg-bg2 border border-bg4 rounded-xl px-2.5 h-12 shadow-sm">
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

          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text3 group-focus-within:text-po transition-colors" />
            <input 
              type="text" 
              placeholder="Search PO/Style/Color..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-bg2 border border-bg4 rounded-xl py-2.5 pl-10 pr-4 text-xs w-full md:w-64 focus:ring-2 focus:ring-po/10 outline-none transition-all h-12 font-bold"
            />
          </div>

          <button 
            onClick={exportToExcel}
            className="flex items-center justify-center gap-2 bg-pass text-white px-8 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-pass/20 hover:scale-105 active:scale-95 transition-all h-12"
          >
            <Download className="w-4 h-4" /> Export Excel
          </button>
        </div>
      </div>

      <div className="bg-bg2 border border-bg4 rounded-[2rem] overflow-hidden shadow-2xl relative">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead>
              <tr className="bg-bg3/50">
                <th className="p-6 text-[11px] font-mono uppercase font-black text-text3 border-b border-bg4 tracking-widest sticky left-0 bg-bg2/95 backdrop-blur-md z-10 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">PO #</th>
                <th className="p-6 text-[11px] font-mono uppercase font-black text-text3 border-b border-bg4 tracking-widest min-w-[120px]">Due Date</th>
                <th className="p-6 text-[11px] font-mono uppercase font-black text-text3 border-b border-bg4 tracking-widest min-w-[120px]">Style #</th>
                <th className="p-6 text-[11px] font-mono uppercase font-black text-text3 border-b border-bg4 tracking-widest min-w-[150px]">Color</th>
                
                {sizeHeaders.map(size => (
                  <th key={size} className="p-4 text-[11px] font-mono uppercase font-black text-text3 border-b border-bg4 text-center tracking-widest bg-bg2/50 w-20">
                    {size}
                  </th>
                ))}
                
                <th className="p-6 text-[11px] font-mono uppercase font-black text-text border-b border-bg4 text-center tracking-widest bg-po/10 shadow-[-2px_0_5px_rgba(0,0,0,0.05)]">Total</th>
                <th className="p-6 text-[11px] font-mono uppercase font-black text-text3 border-b border-bg4 tracking-widest min-w-[150px]">Est. Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bg4">
              {rows.map((row, idx) => (
                <motion.tr 
                  key={`${row.po_number}-${row.style_num}-${row.color}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.01 }}
                  className="group hover:bg-bg3/10 transition-all"
                >
                  <td className="p-6 font-black text-xs text-po sticky left-0 bg-bg2/95 group-hover:bg-bg/90 transition-all z-10 border-r border-bg4/30 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                    {row.po_number}
                  </td>
                  <td className="p-6 text-[10px] font-bold text-text3 font-mono">
                    {row.due_date}
                  </td>
                  <td className="p-6 text-xs font-black text-text tracking-tight uppercase">
                    {row.style_num}
                  </td>
                  <td className="p-6 text-[10px] font-black text-text3 uppercase italic">
                    {row.color}
                  </td>

                  {sizeHeaders.map(size => (
                    <td key={size} className={cn(
                      "p-4 text-center text-xs font-black border-l border-bg4/30",
                      row.sizes[size] > 0 ? "text-text" : "text-text3/20"
                    )}>
                      {row.sizes[size] > 0 ? row.sizes[size].toLocaleString() : '—'}
                    </td>
                  ))}

                  <td className="p-6 text-center bg-po/5 border-l border-bg4 shadow-[-2px_0_5px_rgba(0,0,0,0.05)]">
                    <span className="text-sm font-black text-po tracking-tighter leading-none">
                      {row.total_wip.toLocaleString()}
                    </span>
                  </td>
                  <td className="p-6 text-[10px] font-mono text-text3 font-bold">
                    {row.est_dates && row.est_dates.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-w-[150px]">
                        {row.est_dates.map(d => (
                          <span key={d} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black tracking-tight bg-po/10 text-po border border-po/20">
                            {d}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-text3/30">—</span>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          
          {rows.length === 0 && (
            <div className="p-20 text-center">
              <div className="w-16 h-16 bg-bg3 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-text3 opacity-30" />
              </div>
              <p className="text-text3 font-mono text-[10px] uppercase tracking-widest">No WIP Inventory Found</p>
            </div>
          )}
        </div>

        {/* Excel-like Bottom Sheet Tab Bar */}
        <div className="flex items-center bg-bg3/50 border-t border-bg4 overflow-x-auto custom-scrollbar select-none">
          <div className="flex items-center border-r border-bg4 bg-bg2/40 px-5 py-3 font-mono text-[10px] text-text3 font-extrabold uppercase tracking-wider shrink-0 gap-1.5 h-11">
            <span className="w-1.5 h-1.5 rounded-full bg-po animate-pulse" />
            Workbook Buyer Sheets:
          </div>
          
          <button
            onClick={() => setSelectedBuyer('All')}
            className={cn(
              "px-6 py-3 text-xs font-bold transition-all border-r border-bg4 flex items-center gap-2 shrink-0 h-11 relative uppercase font-mono tracking-tight",
              selectedBuyer === 'All'
                ? "bg-bg2 text-po font-black shadow-[0_-2px_0_0_#e11d48_inset]"
                : "text-text3 hover:text-text hover:bg-bg3/20"
            )}
          >
            All Buyers
            {selectedBuyer === 'All' && (
              <motion.div 
                layoutId="excelTabActiveEmbedded" 
                className="absolute bottom-0 left-0 right-0 h-[3px] bg-po" 
              />
            )}
          </button>

          {uniqueBuyers.map(buyerName => (
            <button
              key={buyerName}
              onClick={() => setSelectedBuyer(buyerName)}
              className={cn(
                "px-6 py-3 text-xs font-bold transition-all border-r border-bg4 flex items-center gap-2 shrink-0 h-11 relative uppercase font-mono tracking-tight",
                selectedBuyer === buyerName
                  ? "bg-bg2 text-po font-black shadow-[0_-2px_0_0_#e11d48_inset]"
                  : "text-text3 hover:text-text hover:bg-bg3/20"
              )}
            >
              {buyerName}
              {selectedBuyer === buyerName && (
                <motion.div 
                  layoutId="excelTabActiveEmbedded" 
                  className="absolute bottom-0 left-0 right-0 h-[3px] bg-po" 
                />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
