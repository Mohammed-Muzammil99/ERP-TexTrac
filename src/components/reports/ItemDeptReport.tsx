import React, { useState, useMemo } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  Search, 
  Download, 
  Filter, 
  Layers, 
  Package, 
  Scissors, 
  Send, 
  Activity, 
  CheckCircle2,
  Maximize2,
  Minimize2,
  MapPin
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

interface SizeBreakdown {
  size: string;
  order_qty: number;
  cutting_store: number;
  feeding_store: number;
  stitching_store: number;
  finishing_store: number;
  packing_store: number;
}

interface ItemGroup {
  key: string;
  po_number: string;
  style_num: string;
  color: string;
  buyer: string;
  total_order_qty: number;
  total_cutting_store: number;
  total_feeding_store: number;
  total_stitching_store: number;
  total_finishing_store: number;
  total_packing_store: number;
  sizes: SizeBreakdown[];
}

interface ItemDeptReportProps {
  detailedStatus: any[];
  isLoading?: boolean;
}

const SIZES_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', 'FREE'];

export const ItemDeptReport: React.FC<ItemDeptReportProps> = ({ detailedStatus, isLoading = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBuyer, setSelectedBuyer] = useState<string>('All');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [onlyActiveStores, setOnlyActiveStores] = useState(false);
  const [pageSize, setPageSize] = useState<number | 'All'>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Reset to page 1 whenever filters or page size change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedBuyer, onlyActiveStores, pageSize]);

  // Group raw detailedStatus records by PO + Style + Color
  const itemGroups = useMemo(() => {
    const map: { [key: string]: ItemGroup } = {};

    detailedStatus.forEach((curr: any) => {
      const po = (curr.po_number || '').trim();
      const style = (curr.style_num || '').trim();
      const color = (curr.color || '').trim();
      if (!po || !style || !color) return;

      const key = `${po}|${style}|${color}`;

      const orderQty = Number(curr.order_qty) || 0;
      const totalCut = Number(curr.total_cut) || 0;
      const cutAccepted = Number(curr.cut_accepted) || 0;
      const totalSent = Number(curr.total_sent) || 0;
      const sendAccepted = Number(curr.send_accepted) || 0;
      const totalStitched = Number(curr.total_stitched) || 0;
      const stitchAccepted = Number(curr.stitch_accepted) || 0;
      const totalPassed = Number(curr.total_passed) || 0;
      const totalRejected = Number(curr.total_rejected) || 0;
      const loose = Number(curr.loose_available) || 0;
      const blister = Number(curr.blister_available) || 0;
      const storePcs = Number(curr.store_available_pcs) || 0;

      const cuttingStore = Math.max(0, orderQty - totalCut);
      const feedingStore = Math.max(0, cutAccepted - totalSent);
      const stitchingStore = Math.max(0, sendAccepted - totalStitched);
      const finishingStore = Math.max(0, stitchAccepted - totalPassed - totalRejected);
      const packingStore = Math.max(0, loose + blister + storePcs);

      if (!map[key]) {
        map[key] = {
          key,
          po_number: po,
          style_num: style,
          color,
          buyer: curr.buyer || 'Unknown',
          total_order_qty: 0,
          total_cutting_store: 0,
          total_feeding_store: 0,
          total_stitching_store: 0,
          total_finishing_store: 0,
          total_packing_store: 0,
          sizes: []
        };
      }

      const grp = map[key];
      grp.total_order_qty += orderQty;
      grp.total_cutting_store += cuttingStore;
      grp.total_feeding_store += feedingStore;
      grp.total_stitching_store += stitchingStore;
      grp.total_finishing_store += finishingStore;
      grp.total_packing_store += packingStore;

      grp.sizes.push({
        size: (curr.size || 'FREE').trim().toUpperCase(),
        order_qty: orderQty,
        cutting_store: cuttingStore,
        feeding_store: feedingStore,
        stitching_store: stitchingStore,
        finishing_store: finishingStore,
        packing_store: packingStore
      });
    });

    // Sort sizes for each group
    Object.values(map).forEach(grp => {
      grp.sizes.sort((a, b) => {
        const idxA = SIZES_ORDER.indexOf(a.size);
        const idxB = SIZES_ORDER.indexOf(b.size);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.size.localeCompare(b.size);
      });
    });

    return Object.values(map).sort((a, b) => {
      const poComp = a.po_number.localeCompare(b.po_number, undefined, { numeric: true });
      if (poComp !== 0) return poComp;
      const styleComp = a.style_num.localeCompare(b.style_num, undefined, { numeric: true });
      if (styleComp !== 0) return styleComp;
      return a.color.localeCompare(b.color);
    });
  }, [detailedStatus]);

  // Unique Buyers list for filter
  const uniqueBuyers = useMemo(() => {
    const set = new Set<string>();
    itemGroups.forEach(g => {
      if (g.buyer) {
        g.buyer.split(',').forEach(b => {
          const trimmed = b.trim();
          if (trimmed) set.add(trimmed);
        });
      }
    });
    return Array.from(set).sort();
  }, [itemGroups]);

  // Filtered rows based on search, buyer, active stores
  const filteredGroups = useMemo(() => {
    return itemGroups.filter(grp => {
      if (selectedBuyer !== 'All') {
        const buyersList = grp.buyer.split(',').map(b => b.trim().toLowerCase());
        if (!buyersList.includes(selectedBuyer.toLowerCase())) return false;
      }

      if (onlyActiveStores) {
        const hasStockInStores = (grp.total_feeding_store + grp.total_stitching_store + grp.total_finishing_store + grp.total_packing_store + grp.total_cutting_store) > 0;
        if (!hasStockInStores) return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchesPo = grp.po_number.toLowerCase().includes(q);
        const matchesStyle = grp.style_num.toLowerCase().includes(q);
        const matchesColor = grp.color.toLowerCase().includes(q);
        const matchesBuyer = grp.buyer.toLowerCase().includes(q);
        if (!matchesPo && !matchesStyle && !matchesColor && !matchesBuyer) return false;
      }

      return true;
    });
  }, [itemGroups, selectedBuyer, onlyActiveStores, searchTerm]);

  // Calculate pagination
  const totalPages = useMemo(() => {
    if (pageSize === 'All') return 1;
    return Math.ceil(filteredGroups.length / pageSize) || 1;
  }, [filteredGroups.length, pageSize]);

  const paginatedGroups = useMemo(() => {
    if (pageSize === 'All') return filteredGroups;
    const start = (currentPage - 1) * pageSize;
    return filteredGroups.slice(start, start + pageSize);
  }, [filteredGroups, currentPage, pageSize]);

  // Totals for summary KPI cards
  const summaryTotals = useMemo(() => {
    return filteredGroups.reduce((acc, grp) => {
      acc.order += grp.total_order_qty;
      acc.cutting += grp.total_cutting_store;
      acc.feeding += grp.total_feeding_store;
      acc.stitching += grp.total_stitching_store;
      acc.finishing += grp.total_finishing_store;
      acc.packing += grp.total_packing_store;
      return acc;
    }, {
      order: 0,
      cutting: 0,
      feeding: 0,
      stitching: 0,
      finishing: 0,
      packing: 0
    });
  }, [filteredGroups]);

  // Expand / Collapse all
  const toggleExpandAll = () => {
    if (expandedKeys.size === filteredGroups.length) {
      setExpandedKeys(new Set());
    } else {
      setExpandedKeys(new Set(filteredGroups.map(g => g.key)));
    }
  };

  const toggleRow = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Export to Excel
  const exportToExcel = () => {
    const exportRows: any[] = [];

    filteredGroups.forEach(grp => {
      // Summary Row for Item
      exportRows.push({
        'PO Number': grp.po_number,
        'Style Number': grp.style_num,
        'Color': grp.color,
        'Buyer': grp.buyer,
        'Size': 'ALL SIZES (TOTAL)',
        'Order (WIP)': grp.total_order_qty,
        'Cutting Store': grp.total_cutting_store,
        'Feeding Store': grp.total_feeding_store,
        'Stitching Store': grp.total_stitching_store,
        'Finishing Store': grp.total_finishing_store,
        'Packing Store': grp.total_packing_store
      });

      // Size Breakdown Rows
      grp.sizes.forEach(sz => {
        exportRows.push({
          'PO Number': grp.po_number,
          'Style Number': grp.style_num,
          'Color': grp.color,
          'Buyer': grp.buyer,
          'Size': sz.size,
          'Order (WIP)': sz.order_qty,
          'Cutting Store': sz.cutting_store,
          'Feeding Store': sz.feeding_store,
          'Stitching Store': sz.stitching_store,
          'Finishing Store': sz.finishing_store,
          'Packing Store': sz.packing_store
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Item_Dept_Location_Report");
    XLSX.writeFile(wb, `Item_Department_Location_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Determine current main department location for a group
  const getPrimaryLocation = (grp: ItemGroup) => {
    const stores = [
      { name: 'Feeding Store', qty: grp.total_feeding_store, color: 'text-send bg-send/10 border-send/20' },
      { name: 'Stitching Store', qty: grp.total_stitching_store, color: 'text-stitch bg-stitch/10 border-stitch/20' },
      { name: 'Finishing Store', qty: grp.total_finishing_store, color: 'text-pass bg-pass/10 border-pass/20' },
      { name: 'Packing Store', qty: grp.total_packing_store, color: 'text-po bg-po/10 border-po/20' },
      { name: 'Cutting Store', qty: grp.total_cutting_store, color: 'text-cut bg-cut/10 border-cut/20' }
    ];

    const topStore = stores.reduce((max, curr) => curr.qty > max.qty ? curr : max, stores[0]);
    if (topStore.qty === 0) {
      return { name: 'Completed / Shipped', color: 'text-text3 bg-bg3 border-bg4' };
    }
    return topStore;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 gap-3">
        <div className="w-10 h-10 border-4 border-bg4 border-t-po rounded-full animate-spin" />
        <p className="text-xs text-text3 font-mono font-bold uppercase tracking-wider">Generating Department Location Matrix...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-bg2 border border-bg4 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-text3 text-[10px] font-mono font-bold uppercase tracking-wider">
            <span>Order (WIP)</span>
            <Layers className="w-3.5 h-3.5 text-po" />
          </div>
          <p className="text-xl font-black text-text mt-1">{summaryTotals.order.toLocaleString()}</p>
          <p className="text-[9px] text-text3 font-mono mt-0.5">{filteredGroups.length} items</p>
        </div>

        <div className="bg-bg2 border border-bg4 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-text3 text-[10px] font-mono font-bold uppercase tracking-wider">
            <span>Cutting Store</span>
            <Scissors className="w-3.5 h-3.5 text-cut" />
          </div>
          <p className="text-xl font-black text-cut mt-1">{summaryTotals.cutting.toLocaleString()}</p>
          <p className="text-[9px] text-text3 font-mono mt-0.5">Uncut WIP</p>
        </div>

        <div className="bg-bg2 border border-bg4 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-text3 text-[10px] font-mono font-bold uppercase tracking-wider">
            <span>Feeding Store</span>
            <Send className="w-3.5 h-3.5 text-send" />
          </div>
          <p className="text-xl font-black text-send mt-1">{summaryTotals.feeding.toLocaleString()}</p>
          <p className="text-[9px] text-text3 font-mono mt-0.5">Cut waiting for line</p>
        </div>

        <div className="bg-bg2 border border-bg4 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-text3 text-[10px] font-mono font-bold uppercase tracking-wider">
            <span>Stitching Store</span>
            <Activity className="w-3.5 h-3.5 text-stitch" />
          </div>
          <p className="text-xl font-black text-stitch mt-1">{summaryTotals.stitching.toLocaleString()}</p>
          <p className="text-[9px] text-text3 font-mono mt-0.5">In stitching WIP</p>
        </div>

        <div className="bg-bg2 border border-bg4 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-text3 text-[10px] font-mono font-bold uppercase tracking-wider">
            <span>Finishing Store</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-pass" />
          </div>
          <p className="text-xl font-black text-pass mt-1">{summaryTotals.finishing.toLocaleString()}</p>
          <p className="text-[9px] text-text3 font-mono mt-0.5">Passed / QC Store</p>
        </div>

        <div className="bg-bg2 border border-bg4 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between text-text3 text-[10px] font-mono font-bold uppercase tracking-wider">
            <span>Packing Store</span>
            <Package className="w-3.5 h-3.5 text-po" />
          </div>
          <p className="text-xl font-black text-po mt-1">{summaryTotals.packing.toLocaleString()}</p>
          <p className="text-[9px] text-text3 font-mono mt-0.5">Loose, Blister & Carton</p>
        </div>
      </div>

      {/* Control Bar: Filters & Actions */}
      <div className="bg-bg2 border border-bg4 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text3" />
            <input 
              type="text" 
              placeholder="Search PO, Style, Color or Buyer..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-bg border border-bg4 rounded-xl py-2 pl-9 pr-3 text-xs font-bold outline-none focus:border-po text-text"
            />
          </div>

          {/* Buyer Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-text3" />
            <select 
              value={selectedBuyer} 
              onChange={e => setSelectedBuyer(e.target.value)}
              className="bg-bg border border-bg4 rounded-xl px-3 py-2 text-xs font-bold outline-none text-text cursor-pointer"
            >
              <option value="All">All Buyers</option>
              {uniqueBuyers.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Filter checkbox: Only items currently in store */}
          <label className="flex items-center gap-2 text-xs font-bold text-text3 hover:text-text cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={onlyActiveStores}
              onChange={e => setOnlyActiveStores(e.target.checked)}
              className="rounded border-bg4 text-po focus:ring-po/20 cursor-pointer"
            />
            <span>Active Store Stock Only</span>
          </label>
        </div>

        {/* Buttons: Row limit selector, Expand All & Export */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Show Rows selector buttons */}
          <div className="flex items-center gap-1 bg-bg border border-bg4 p-1 rounded-xl">
            <span className="text-[10px] font-mono font-bold uppercase text-text3 px-2">Show:</span>
            {[10, 25, 50, 100, 'All'].map(size => (
              <button
                key={String(size)}
                onClick={() => setPageSize(size as number | 'All')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-black transition-all",
                  pageSize === size 
                    ? "bg-po text-white shadow-sm" 
                    : "text-text3 hover:text-text hover:bg-bg3"
                )}
              >
                {size}
              </button>
            ))}
          </div>

          <button 
            onClick={toggleExpandAll}
            className="flex items-center gap-1.5 bg-bg3 hover:bg-bg4 border border-bg4 text-text font-bold text-xs px-3 py-2 rounded-xl transition-all"
          >
            {expandedKeys.size === filteredGroups.length ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-po" />
                <span>Collapse All</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-po" />
                <span>Expand All Sizes</span>
              </>
            )}
          </button>

          <button 
            onClick={exportToExcel}
            className="flex items-center gap-1.5 bg-pass hover:bg-pass/90 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-md transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Main Location Report Table */}
      <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden card-shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-bg3/80 text-[10px] font-mono uppercase font-black text-text3 border-b border-bg4 tracking-widest">
                <th className="p-3 w-10 text-center"></th>
                <th className="p-3 min-w-[120px]">PO #</th>
                <th className="p-3 min-w-[100px]">Style #</th>
                <th className="p-3 min-w-[100px]">Color</th>
                <th className="p-3 text-right min-w-[100px] bg-po/5 text-po font-black">Order (WIP)</th>
                <th className="p-3 text-right min-w-[110px] text-send">Feeding Store</th>
                <th className="p-3 text-right min-w-[110px] text-stitch">Stitching Store</th>
                <th className="p-3 text-right min-w-[110px] text-pass">Finishing Store</th>
                <th className="p-3 text-right min-w-[110px] text-po">Packing Store</th>
                <th className="p-3 text-center min-w-[150px]">Current Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bg4 text-xs font-sans">
              {filteredGroups.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-text3 font-mono">
                    <p className="text-sm font-bold">No order items match the selected filter criteria.</p>
                  </td>
                </tr>
              ) : (
                paginatedGroups.map(grp => {
                  const isExpanded = expandedKeys.has(grp.key);
                  const primaryLoc = getPrimaryLocation(grp);

                  return (
                    <React.Fragment key={grp.key}>
                      {/* Collapsed Item Summation Row */}
                      <tr 
                        onClick={() => toggleRow(grp.key)}
                        className={cn(
                          "hover:bg-bg3/50 transition-colors cursor-pointer select-none font-medium",
                          isExpanded && "bg-bg3/40"
                        )}
                      >
                        <td className="p-3 text-center text-text3">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-po font-bold" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-text3" />
                          )}
                        </td>
                        <td className="p-3 font-black text-text font-mono">
                          <div>
                            <span>{grp.po_number}</span>
                            <span className="block text-[9px] text-text3 font-mono uppercase font-normal">{grp.buyer}</span>
                          </div>
                        </td>
                        <td className="p-3 font-bold text-text font-mono">
                          {grp.style_num}
                        </td>
                        <td className="p-3 font-bold">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-bg3 border border-bg4 text-text text-[11px]">
                            <span className="w-2 h-2 rounded-full bg-po/60" />
                            {grp.color}
                          </span>
                        </td>
                        <td className="p-3 text-right font-black text-po bg-po/5">
                          {grp.total_order_qty.toLocaleString()}
                        </td>
                        <td className={cn("p-3 text-right font-black font-mono", grp.total_feeding_store > 0 ? "text-send" : "text-text3/30")}>
                          {grp.total_feeding_store > 0 ? grp.total_feeding_store.toLocaleString() : '—'}
                        </td>
                        <td className={cn("p-3 text-right font-black font-mono", grp.total_stitching_store > 0 ? "text-stitch" : "text-text3/30")}>
                          {grp.total_stitching_store > 0 ? grp.total_stitching_store.toLocaleString() : '—'}
                        </td>
                        <td className={cn("p-3 text-right font-black font-mono", grp.total_finishing_store > 0 ? "text-pass" : "text-text3/30")}>
                          {grp.total_finishing_store > 0 ? grp.total_finishing_store.toLocaleString() : '—'}
                        </td>
                        <td className={cn("p-3 text-right font-black font-mono", grp.total_packing_store > 0 ? "text-po" : "text-text3/30")}>
                          {grp.total_packing_store > 0 ? grp.total_packing_store.toLocaleString() : '—'}
                        </td>
                        <td className="p-3 text-center">
                          <span className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider", primaryLoc.color)}>
                            <MapPin className="w-3 h-3" />
                            {primaryLoc.name}
                          </span>
                        </td>
                      </tr>

                      {/* Expanded Size Breakdown Section */}
                      {isExpanded && (
                        <tr className="bg-bg3/20">
                          <td colSpan={10} className="p-0 border-b border-bg4">
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="px-6 py-4 bg-bg3/30 border-y border-bg4/60 space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-mono font-black uppercase text-po tracking-wider flex items-center gap-1.5">
                                  <Layers className="w-3.5 h-3.5" />
                                  Size-Wise Department Breakdown for PO #{grp.po_number} | Style #{grp.style_num} ({grp.color})
                                </span>
                                <span className="text-[10px] text-text3 font-mono font-medium">
                                  {grp.sizes.length} sizes recorded
                                </span>
                              </div>

                              <div className="overflow-x-auto border border-bg4 rounded-xl bg-bg2">
                                <table className="w-full text-left border-collapse text-xs">
                                  <thead>
                                    <tr className="bg-bg3/60 text-[9px] font-mono uppercase text-text3 border-b border-bg4">
                                      <th className="p-2.5 font-bold w-24">Size</th>
                                      <th className="p-2.5 text-right font-bold text-po bg-po/5">Order (WIP)</th>
                                      <th className="p-2.5 text-right font-bold text-send">Feeding Store</th>
                                      <th className="p-2.5 text-right font-bold text-stitch">Stitching Store</th>
                                      <th className="p-2.5 text-right font-bold text-pass">Finishing Store</th>
                                      <th className="p-2.5 text-right font-bold text-po">Packing Store</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-bg4 font-mono text-[11px]">
                                    {grp.sizes.map((sz, i) => (
                                      <tr key={`${grp.key}-${sz.size}-${i}`} className="hover:bg-bg3/30">
                                        <td className="p-2.5 font-black text-text">
                                          <span className="bg-bg3 border border-bg4 px-2 py-0.5 rounded font-mono text-xs">
                                            {sz.size}
                                          </span>
                                        </td>
                                        <td className="p-2.5 text-right font-bold text-po bg-po/5">
                                          {sz.order_qty.toLocaleString()}
                                        </td>
                                        <td className={cn("p-2.5 text-right font-bold", sz.feeding_store > 0 ? "text-send" : "text-text3/30")}>
                                          {sz.feeding_store > 0 ? sz.feeding_store.toLocaleString() : '—'}
                                        </td>
                                        <td className={cn("p-2.5 text-right font-bold", sz.stitching_store > 0 ? "text-stitch" : "text-text3/30")}>
                                          {sz.stitching_store > 0 ? sz.stitching_store.toLocaleString() : '—'}
                                        </td>
                                        <td className={cn("p-2.5 text-right font-bold", sz.finishing_store > 0 ? "text-pass" : "text-text3/30")}>
                                          {sz.finishing_store > 0 ? sz.finishing_store.toLocaleString() : '—'}
                                        </td>
                                        <td className={cn("p-2.5 text-right font-bold", sz.packing_store > 0 ? "text-po" : "text-text3/30")}>
                                          {sz.packing_store > 0 ? sz.packing_store.toLocaleString() : '—'}
                                        </td>
                                      </tr>
                                    ))}
                                    {/* Total row inside size breakdown */}
                                    <tr className="bg-bg3/80 font-black text-xs border-t-2 border-bg4">
                                      <td className="p-2.5 text-text uppercase">Total Sum</td>
                                      <td className="p-2.5 text-right text-po bg-po/10">{grp.total_order_qty.toLocaleString()}</td>
                                      <td className="p-2.5 text-right text-send">{grp.total_feeding_store.toLocaleString()}</td>
                                      <td className="p-2.5 text-right text-stitch">{grp.total_stitching_store.toLocaleString()}</td>
                                      <td className="p-2.5 text-right text-pass">{grp.total_finishing_store.toLocaleString()}</td>
                                      <td className="p-2.5 text-right text-po">{grp.total_packing_store.toLocaleString()}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {filteredGroups.length > 0 && (
          <div className="bg-bg3/60 border-t border-bg4 px-4 py-3 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
            <div className="text-text3 font-medium">
              Showing <span className="font-bold text-text">{pageSize === 'All' ? 1 : Math.min((currentPage - 1) * (pageSize as number) + 1, filteredGroups.length)}</span> to <span className="font-bold text-text">{pageSize === 'All' ? filteredGroups.length : Math.min(currentPage * (pageSize as number), filteredGroups.length)}</span> of <span className="font-bold text-text">{filteredGroups.length}</span> items
            </div>

            <div className="flex items-center gap-3">
              {/* Row limit selector */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-text3 uppercase font-bold mr-1">Rows per page:</span>
                {[10, 25, 50, 100, 'All'].map(size => (
                  <button
                    key={String(size)}
                    onClick={() => setPageSize(size as number | 'All')}
                    className={cn(
                      "px-2 py-0.5 rounded text-[11px] font-bold transition-all",
                      pageSize === size ? "bg-po text-white font-black shadow-sm" : "text-text3 hover:text-text hover:bg-bg4"
                    )}
                  >
                    {size}
                  </button>
                ))}
              </div>

              {/* Page Controls */}
              {pageSize !== 'All' && totalPages > 1 && (
                <div className="flex items-center gap-1.5 border-l border-bg4 pl-3">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded-lg border border-bg4 bg-bg2 hover:bg-bg3 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-text transition-colors"
                  >
                    Prev
                  </button>
                  <span className="text-xs font-bold text-text px-1">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1 rounded-lg border border-bg4 bg-bg2 hover:bg-bg3 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-text transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
