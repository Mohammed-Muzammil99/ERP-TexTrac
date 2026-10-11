import React, { useEffect, useState } from 'react';
import { statusService } from '../services/erpService';
import { 
  FileText, 
  Download, 
  Search, 
  TrendingUp,
  Filter,
  Calendar,
  Layers,
  ArrowUpDown,
  Truck
} from 'lucide-react';
import { cn } from '../lib/utils';
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

export const WIPReport: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'wip' | 'shipment_program'>('wip');
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [detailedStatus, setDetailedStatus] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Search state for standard WIP
  const [searchTerm, setSearchTerm] = useState('');
  
  // Selected buyer sheet tab state
  const [selectedBuyer, setSelectedBuyer] = useState<string>('All');
  
  // Search & Filter state for Shipment Program
  const [shipmentSearchTerm, setShipmentSearchTerm] = useState('');
  const [shipmentStatusFilter, setShipmentStatusFilter] = useState<'all' | 'pending' | 'shipped'>('all');
  
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

  const handleUpdateEstDate = async (productId: number, dateValue: string) => {
    try {
      await statusService.updateEstDate(productId, dateValue || null);
      // Update local state instantly so standard WIP and Shipment Program are synchronized
      setDetailedStatus(prev => prev.map(item => {
        if (item.product_id === productId) {
          return { ...item, est_date: dateValue };
        }
        return item;
      }));
    } catch (error) {
      console.error('Failed to update estimated date', error);
    }
  };

  // --- 1. Standard WIP processing ---
  // Group and pivot data
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
      // Initialize sizes
      sizeHeaders.forEach(s => acc[key].sizes[s] = 0);
    }

    // Assign WIP to sizes, matching ignoring case and extra whitespace
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

  // --- 2. Shipment Program processing ---
  // Filter products that have been cut
  const shipmentProgramRecords = detailedStatus.filter(curr => {
    return (curr.total_cut || 0) > 0 || (curr.cut_accepted || 0) > 0;
  });

  const filteredShipmentRecords = shipmentProgramRecords.filter(row => {
    const term = shipmentSearchTerm.toLowerCase();
    const matchSearch = (
      String(row.po_number || '').toLowerCase().includes(term) ||
      String(row.style_num || '').toLowerCase().includes(term) ||
      String(row.color || '').toLowerCase().includes(term) ||
      String(row.size || '').toLowerCase().includes(term)
    );

    const balance = row.order_qty || 0;
    if (shipmentStatusFilter === 'pending') {
      return matchSearch && balance > 0;
    } else if (shipmentStatusFilter === 'shipped') {
      return matchSearch && balance === 0;
    }
    
    return matchSearch;
  });

  const exportToExcel = () => {
    if (activeTab === 'wip') {
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
        XLSX.utils.book_append_sheet(wb, ws, "WIP Sizes Pivot");
      } else {
        buyerNames.forEach(buyerName => {
          const ws = XLSX.utils.json_to_sheet(buyersGroup[buyerName]);
          // Replace invalid Excel sheet characters with spaces or remove them
          const sheetName = buyerName.replace(/[:\\/?*\[\]]/g, '').substring(0, 31) || "WIP";
          XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });
      }
      XLSX.writeFile(wb, `WIP_Sizes_Pivot_${new Date().toISOString().split('T')[0]}.xlsx`);
    } else {
      // Group shipment records by buyer name
      const buyersGroup: { [buyerName: string]: any[] } = {};
      
      filteredShipmentRecords.forEach(r => {
        const b = (r.buyer || 'Unknown').trim();
        if (!buyersGroup[b]) {
          buyersGroup[b] = [];
        }
        buyersGroup[b].push({
          'PO #': r.po_number,
          'STYLE #': r.style_num,
          'COLOR': r.color,
          'SIZE': r.size,
          'ORDER QTY': r.order_qty,
          'TOTAL CUT': r.total_cut,
          'CUT ACCEPTED': r.cut_accepted,
          'TOTAL SHIPPED': r.total_shipped,
          'REMAINING WIP': r.order_qty || 0,
          'DELIVERY DATE': r.delivery_date,
          'ESTIMATED DATE': r.est_date ? r.est_date.substring(0, 10) : ''
        });
      });

      const wb = XLSX.utils.book_new();
      const buyerNames = Object.keys(buyersGroup).sort();
      
      if (buyerNames.length === 0) {
        const ws = XLSX.utils.json_to_sheet([]);
        XLSX.utils.book_append_sheet(wb, ws, "Shipment Program");
      } else {
        buyerNames.forEach(buyerName => {
          const ws = XLSX.utils.json_to_sheet(buyersGroup[buyerName]);
          const sheetName = buyerName.replace(/[:\\/?*\[\]]/g, '').substring(0, 31) || "Shipment";
          XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });
      }
      XLSX.writeFile(wb, `Shipment_Program_${new Date().toISOString().split('T')[0]}.xlsx`);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-bg4 border-t-po rounded-full animate-spin" />
          <p className="text-text3 font-mono text-[10px] uppercase tracking-widest animate-pulse">Scanning WIP Inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-bg4 pb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-po/10 text-po rounded-2xl ring-4 ring-po/5">
            {activeTab === 'wip' ? (
              <Layers className="w-8 h-8" />
            ) : (
              <Truck className="w-8 h-8 text-pass" />
            )}
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-text uppercase">
              {activeTab === 'wip' ? 'WIP Inventory' : 'Shipment Program'}
            </h1>
            <p className="text-text3 text-[10px] font-mono uppercase tracking-[0.25em] font-medium leading-tight mt-1">
              {activeTab === 'wip' 
                ? 'Work in Progress Breakdown by Size' 
                : 'Automated Shipment Schedule for Cut Products'}
            </p>
          </div>
        </div>

        {/* Tab Selection, Search & Action Header Bar */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Tabs */}
          <div className="flex bg-bg2 p-1.5 rounded-2xl border border-bg4 shrink-0 shadow-sm">
            <button
              onClick={() => setActiveTab('wip')}
              className={cn(
                "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2",
                activeTab === 'wip'
                  ? 'bg-po text-white shadow-md shadow-po/10'
                  : 'text-text3 hover:text-text'
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              WIP Sizes Pivot
            </button>
            <button
              onClick={() => setActiveTab('shipment_program')}
              className={cn(
                "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2",
                activeTab === 'shipment_program'
                  ? 'bg-pass text-white shadow-md shadow-pass/10'
                  : 'text-text3 hover:text-text'
              )}
            >
              <Truck className="w-3.5 h-3.5" />
              Shipment Program
            </button>
          </div>

          {/* Date range filter */}
          <div className="flex items-center gap-2 bg-bg2 border border-bg4 rounded-xl px-2.5 h-11 shadow-sm">
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

          {/* Dynamic Search Box */}
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text3 group-focus-within:text-po transition-colors" />
            <input 
              type="text" 
              placeholder={activeTab === 'wip' ? "Search PO, Style or Color..." : "Search PO, Style, Color or Size..."}
              value={activeTab === 'wip' ? searchTerm : shipmentSearchTerm}
              onChange={e => activeTab === 'wip' ? setSearchTerm(e.target.value) : setShipmentSearchTerm(e.target.value)}
              className="bg-bg2 border border-bg4 rounded-xl py-2.5 pl-10 pr-4 text-sm w-full md:w-60 focus:ring-2 focus:ring-po/10 outline-none transition-all h-11"
            />
          </div>

          {/* Filter Dropdown for Shipment Program tab */}
          {activeTab === 'shipment_program' && (
            <select
              value={shipmentStatusFilter}
              onChange={e => setShipmentStatusFilter(e.target.value as any)}
              className="bg-bg2 border border-bg4 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider text-text3 focus:ring-2 focus:ring-po/10 outline-none h-11 cursor-pointer"
            >
              <option value="all">All Items</option>
              <option value="pending">Remaining Shortage</option>
              <option value="shipped">Fully Shipped</option>
            </select>
          )}

          {/* Export Action */}
          <button 
            onClick={exportToExcel}
            className="flex items-center justify-center gap-2 bg-pass hover:bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all h-11 shadow-sm"
          >
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* Summary Metrics Displays depending on Active Tab */}
      {activeTab === 'wip' ? (
        <div className="bg-bg2 border border-bg4 p-6 rounded-3xl inline-block shadow-lg">
          <p className="text-[10px] font-black text-text3 uppercase tracking-widest mb-2 font-mono">Total WIP Units Dashboard</p>
          <h3 className="text-3xl font-black tracking-tighter text-text">
            {rows.reduce((sum, r) => sum + r.total_wip, 0).toLocaleString()} <span className="text-sm font-mono text-text3 ml-2 uppercase font-medium">PCS</span>
          </h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-bg2 border border-bg4 p-6 rounded-3xl shadow-sm hover:border-po/20 transition-colors">
            <p className="text-[10px] font-black text-text3 uppercase tracking-widest mb-1 font-mono text-po">Products Cut Scheduled</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black tracking-tighter text-text">
                {filteredShipmentRecords.length.toLocaleString()}
              </span>
              <span className="text-xs font-mono text-text3 uppercase tracking-wider">SKUs</span>
            </div>
            <p className="text-[9px] text-text3 mt-2 uppercase tracking-wide font-mono">Automatically synced cutting logs</p>
          </div>
          <div className="bg-bg2 border border-bg4 p-6 rounded-3xl shadow-sm hover:border-pass/20 transition-colors">
            <p className="text-[10px] font-black text-text3 uppercase tracking-widest mb-1 font-mono text-pass">Total Pieces Cut</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black tracking-tighter text-text">
                {filteredShipmentRecords.reduce((sum, r) => sum + (r.cut_accepted || 0), 0).toLocaleString()}
              </span>
              <span className="text-xs font-mono text-text3 uppercase tracking-wider">PCS</span>
            </div>
            <p className="text-[9px] text-text3 mt-2 uppercase tracking-wide font-mono">Completed cutting totals</p>
          </div>
          <div className="bg-bg2 border border-bg4 p-6 rounded-3xl shadow-sm hover:border-blue-500/20 transition-colors">
            <p className="text-[10px] font-black text-text3 uppercase tracking-widest mb-1 font-mono text-blue-500">Total Shipped Pieces</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black tracking-tighter text-text">
                {filteredShipmentRecords.reduce((sum, r) => sum + (r.total_shipped || 0), 0).toLocaleString()}
              </span>
              <span className="text-xs font-mono text-text3 uppercase tracking-wider">PCS</span>
            </div>
            <p className="text-[9px] text-text3 mt-2 uppercase tracking-wide font-mono">Completed logistics shipments</p>
          </div>
          <div className="bg-bg2 border border-bg4 p-6 rounded-3xl shadow-sm hover:border-zinc-500/20 transition-colors">
            <p className="text-[10px] font-black text-text3 uppercase tracking-widest mb-1 font-mono text-zinc-400">Shipment Balance Pending</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black tracking-tighter text-text">
                {filteredShipmentRecords.reduce((sum, r) => sum + (r.order_qty || 0), 0).toLocaleString()}
              </span>
              <span className="text-xs font-mono text-text3 uppercase tracking-wider">PCS</span>
            </div>
            <p className="text-[9px] text-text3 mt-2 uppercase tracking-wide font-mono">Unshipped cutting stock balance</p>
          </div>
        </div>
      )}

      {/* MAIN VIEWPORT */}
      {activeTab === 'wip' ? (
        /* ================= WIP Inventory Size Pivot Table ================= */
        <div className="bg-bg2 border border-bg4 rounded-[2rem] overflow-hidden shadow-2xl relative">
          <div className="overflow-auto max-h-[650px] custom-scrollbar">
            <table className="w-full text-left border-separate border-spacing-0">
              <thead>
                <tr className="bg-bg3/50 sticky top-0 z-20">
                  <th className="p-6 text-[11px] font-mono uppercase font-black text-text3 border-b border-bg4 tracking-widest sticky top-0 left-0 bg-bg2/95 backdrop-blur-md z-30">PO #</th>
                  <th className="p-6 text-[11px] font-mono uppercase font-black text-text3 border-b border-bg4 tracking-widest min-w-[120px] sticky top-0 bg-bg2/95 z-20">Due Date</th>
                  <th className="p-6 text-[11px] font-mono uppercase font-black text-text3 border-b border-bg4 tracking-widest min-w-[120px] sticky top-0 bg-bg2/95 z-20">Style #</th>
                  <th className="p-6 text-[11px] font-mono uppercase font-black text-text3 border-b border-bg4 tracking-widest min-w-[150px] sticky top-0 bg-bg2/95 z-20">Color</th>
                  
                  {sizeHeaders.map(size => (
                    <th key={size} className="p-4 text-[11px] font-mono uppercase font-black text-text3 border-b border-bg4 text-center tracking-widest bg-bg2/50 w-20 sticky top-0 bg-bg2 z-20">
                      {size}
                    </th>
                  ))}
                  
                  <th className="p-6 text-[11px] font-mono uppercase font-black text-text border-b border-bg4 text-center tracking-widest bg-po/10 sticky top-0 z-20">Total</th>
                  <th className="p-6 text-[11px] font-mono uppercase font-black text-text3 border-b border-bg4 tracking-widest min-w-[150px] sticky top-0 bg-bg2/95 z-20">Est. Date</th>
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
                    <td className="p-6 font-black text-xs text-po sticky left-0 bg-bg2/95 group-hover:bg-bg/90 transition-all z-10 border-r border-bg4/30">
                      {row.po_number}
                    </td>
                    <td className="p-6 text-xs font-bold text-text3 font-mono">
                      {row.due_date}
                    </td>
                    <td className="p-6 text-sm font-black text-text tracking-tight uppercase">
                      {row.style_num}
                    </td>
                    <td className="p-6 text-xs font-black text-text3 uppercase italic">
                      {row.color}
                    </td>

                    {sizeHeaders.map(size => (
                      <td key={size} className={cn(
                        "p-4 text-center text-sm font-black border-l border-bg4/30",
                        row.sizes[size] > 0 ? "text-text" : "text-text3/20"
                      )}>
                        {row.sizes[size] > 0 ? row.sizes[size].toLocaleString() : '—'}
                      </td>
                    ))}

                    <td className="p-6 text-center bg-po/5 border-l border-bg4">
                      <span className="text-base font-black text-po tracking-tighter">
                        {row.total_wip.toLocaleString()}
                      </span>
                    </td>
                    <td className="p-6 text-xs font-mono">
                      {row.est_dates && row.est_dates.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-[150px]">
                          {row.est_dates.map(d => (
                            <span key={d} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black tracking-tight bg-po/10 text-po border border-po/20 shadow-sm w-fit">
                              <span className="w-1 h-1 rounded-full bg-po animate-pulse" />
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
                <p className="text-text3 font-mono text-xs uppercase tracking-widest">No WIP Inventory Found</p>
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
                  layoutId="excelTabActive" 
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
                    layoutId="excelTabActive" 
                    className="absolute bottom-0 left-0 right-0 h-[3px] bg-po" 
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* ================= Shipment Program Schedule (Cut Products) ================= */
        <div className="bg-bg2 border border-bg4 rounded-[2rem] overflow-hidden shadow-2xl relative">
          <div className="p-4 bg-bg3/20 border-b border-bg4 flex items-center justify-between px-6">
            <span className="text-[10px] font-mono text-text3 uppercase tracking-widest font-black">
              Autogenerated Shipment Program Scheduler &bull; Tracking Cut Products
            </span>
          </div>
          
          <div className="overflow-auto max-h-[650px] custom-scrollbar">
            <table className="w-full text-left border-separate border-spacing-0">
              <thead>
                <tr className="bg-bg3/50 sticky top-0 z-20 text-left">
                  <th className="p-4 text-[11px] font-mono uppercase font-black text-text3 border-b border-bg4 tracking-widest sticky top-0 left-0 bg-bg2/95 backdrop-blur-md z-30">PO #</th>
                  <th className="p-4 text-[11px] font-mono uppercase font-black text-text3 border-b border-bg4 tracking-widest min-w-[125px] sticky top-0 bg-bg2/95 z-20">Style #</th>
                  <th className="p-4 text-[11px] font-mono uppercase font-black text-text3 border-b border-bg4 tracking-widest min-w-[125px] sticky top-0 bg-bg2/95 z-20">Color</th>
                  <th className="p-4 text-[11px] font-mono uppercase font-black text-text3 border-b border-bg4 text-center tracking-widest w-20 sticky top-0 bg-bg2/95 z-20">Size</th>
                  <th className="p-4 text-[11px] font-mono uppercase font-black text-text3 border-b border-bg4 tracking-widest sticky top-0 bg-bg2/95 z-20">Delivery Date</th>
                  <th className="p-4 text-[11px] font-mono uppercase font-black text-text3 border-b border-bg4 tracking-widest min-w-[145px] sticky top-0 bg-bg2/95 z-20">Est. Date</th>
                  <th className="p-4 text-[11px] font-mono uppercase font-black text-text3 border-b border-bg4 text-center tracking-widest w-24 sticky top-0 bg-bg2/95 z-20">Order Qty</th>
                  <th className="p-4 text-[11px] font-mono uppercase font-black text-text border-b border-bg4 text-center tracking-widest w-40 bg-po/5 sticky top-0 z-20">Cutting Process</th>
                  <th className="p-4 text-[11px] font-mono uppercase font-black text-text border-b border-bg4 text-center tracking-widest w-40 bg-pass/5 sticky top-0 z-20">Shipping Process</th>
                  <th className="p-4 text-[11px] font-mono uppercase font-black text-text border-b border-bg4 text-center tracking-widest w-24 sticky top-0 bg-bg2/95 z-20">Remaining</th>
                  <th className="p-4 text-[11px] font-mono uppercase font-black text-text3 border-b border-bg4 text-center tracking-widest w-28 sticky top-0 bg-bg2/95 z-20">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bg4">
                {filteredShipmentRecords.map((row, idx) => {
                  const orderQty = row.order_qty || 0;
                  const cutQty = row.cut_accepted || 0;
                  const shippedQty = row.total_shipped || 0;
                  const balanceQty = orderQty;

                  const cutPct = orderQty > 0 ? Math.min(100, Math.round((cutQty / orderQty) * 100)) : 0;
                  const shipPct = orderQty > 0 ? Math.min(100, Math.round((shippedQty / orderQty) * 100)) : 0;

                  return (
                    <motion.tr 
                      key={`${row.po_number}-${row.style_num}-${row.color}-${row.size}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.005 }}
                      className="group hover:bg-bg3/10 transition-all font-bold text-xs text-text2"
                    >
                      {/* PO # */}
                      <td className="p-4 font-black text-xs text-po sticky left-0 bg-bg2/95 group-hover:bg-bg/90 transition-all z-10 border-r border-bg4/30">
                        {row.po_number}
                      </td>
                      
                      {/* Style # */}
                      <td className="p-4 text-sm font-black text-text tracking-tight uppercase">
                        {row.style_num}
                      </td>

                      {/* Color */}
                      <td className="p-4 font-black text-text3 uppercase italic">
                        {row.color}
                      </td>

                      {/* Size */}
                      <td className="p-4 text-center text-sm font-black">
                        <span className="bg-bg3 border border-bg4 text-text px-2.5 py-1 rounded-xl text-xs uppercase font-mono">
                          {row.size}
                        </span>
                      </td>

                      {/* Delivery Date */}
                      <td className="p-4 text-text3 font-mono text-center">
                        {row.delivery_date || 'N/A'}
                      </td>

                      {/* Est. Date */}
                      <td className="p-4 border-l border-bg4/30">
                        <input
                          type="date"
                          value={row.est_date ? row.est_date.substring(0, 10) : ''}
                          onChange={(e) => handleUpdateEstDate(row.product_id, e.target.value)}
                          className="bg-bg3 border border-bg4 rounded-xl px-2.5 py-1.5 text-xs font-mono font-bold tracking-tight text-text focus:ring-2 focus:ring-po/10 focus:border-po outline-none w-[135px] cursor-pointer"
                        />
                      </td>

                      {/* Order Quantity */}
                      <td className="p-4 text-center font-mono">
                        {orderQty.toLocaleString()}
                      </td>

                      {/* Cutting Progress Bar */}
                      <td className="p-4 bg-po/[0.01] border-l border-bg4/30">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-text3 font-medium uppercase">
                            <span>Cut {cutPct}%</span>
                            <span>{cutQty.toLocaleString()} / {orderQty.toLocaleString()}</span>
                          </div>
                          <div className="w-full bg-bg3/30 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-po h-full transition-all duration-500 rounded-full" style={{ width: `${cutPct}%` }}></div>
                          </div>
                        </div>
                      </td>

                      {/* Shipment Progress Bar */}
                      <td className="p-4 bg-pass/[0.01] border-l border-bg4/30">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-text3 font-bold uppercase">
                            <span className="text-pass">Shipped {shipPct}%</span>
                            <span>{shippedQty.toLocaleString()} / {orderQty.toLocaleString()}</span>
                          </div>
                          <div className="w-full bg-bg3/30 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-pass h-full transition-all duration-500 rounded-full" style={{ width: `${shipPct}%` }}></div>
                          </div>
                        </div>
                      </td>

                      {/* Balance (Remaining) */}
                      <td className="p-4 text-center border-l border-bg4/30">
                        <span className={cn(
                          "font-mono text-sm font-black",
                          balanceQty > 0 ? "text-text" : "text-text3/35"
                        )}>
                          {balanceQty > 0 ? balanceQty.toLocaleString() : '—'}
                        </span>
                      </td>

                      {/* Status Tag */}
                      <td className="p-4 text-center">
                        {balanceQty === 0 ? (
                          <span className="bg-pass/10 text-pass border border-pass/20 text-[9px] px-2 py-1 rounded-xl uppercase tracking-widest font-black inline-block">
                            Complete
                          </span>
                        ) : (
                          <span className="bg-po/10 text-po border border-po/20 text-[9px] px-2 py-1 rounded-xl uppercase tracking-widest font-black inline-block">
                            Pending ({balanceQty.toLocaleString()})
                          </span>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>

            {filteredShipmentRecords.length === 0 && (
              <div className="p-20 text-center">
                <div className="w-16 h-16 bg-bg3 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Truck className="w-8 h-8 text-text3 opacity-30" />
                </div>
                <p className="text-text3 font-mono text-xs uppercase tracking-widest">No Shipment Program records matched search</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer Definition Box */}
      <div className="bg-bg2 border border-bg4 p-6 rounded-2xl">
        <h4 className="text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-pass" />
            {activeTab === 'wip' ? 'WIP Definition' : 'Shipment Program logic'}
        </h4>
        <p className="text-text3 text-xs font-medium leading-relaxed max-w-2xl">
          {activeTab === 'wip' ? (
            <>The quantities shown in this report represent the <span className="text-text font-bold italic">Order Quantity</span> minus the <span className="text-text font-bold italic">Total Shipped Quantity</span> for each size. This provides a clear view of exactly what is still inside the factory ecosystem (from cutting to warehouse).</>
          ) : (
            <>The <span className="text-text font-bold uppercase">Shipment Program</span> automatically parses current system logs, dynamically pulling in any sku model that has been recorded within the cutting department. It ensures high transparency by carrying all relative data points including active purchase order number, style pattern, colors, sizes, cutting rate, and ultimate dispatch balances in real-time.</>
          )}
        </p>
      </div>
    </div>
  );
};
