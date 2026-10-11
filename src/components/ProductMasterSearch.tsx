import React, { useState, useMemo } from 'react';
import { Search, MapPin, Package, Clipboard, ChevronDown, ChevronUp, Layers, HelpCircle, Eye } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface ProductMasterSearchProps {
  allocatedData: any[];
  unallocatedData: any[];
}

const SIZES_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', 'FREE'];

export const ProductMasterSearch: React.FC<ProductMasterSearchProps> = ({ allocatedData = [], unallocatedData = [] }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [expandedPOs, setExpandedPOs] = useState<Record<string, boolean>>({});

  // Get all unique styles in the system
  const uniqueStyles = useMemo(() => {
    const styles = new Set<string>();
    allocatedData.forEach(item => {
      if (item.style_num) styles.add(item.style_num.trim().toUpperCase());
    });
    unallocatedData.forEach(item => {
      if (item.style) styles.add(item.style.trim().toUpperCase());
    });
    return Array.from(styles).sort();
  }, [allocatedData, unallocatedData]);

  // Get all unique colors in the system
  const uniqueColors = useMemo(() => {
    const colors = new Set<string>();
    allocatedData.forEach(item => {
      if (item.color) colors.add(item.color.trim().toUpperCase());
    });
    unallocatedData.forEach(item => {
      if (item.color) colors.add(item.color.trim().toUpperCase());
    });
    return Array.from(colors).sort();
  }, [allocatedData, unallocatedData]);

  // Filter colors based on selected style for helpful suggestions
  const relevantColors = useMemo(() => {
    if (!selectedStyle) return uniqueColors;
    const colors = new Set<string>();
    allocatedData.forEach(item => {
      if (item.style_num?.trim().toUpperCase() === selectedStyle && item.color) {
        colors.add(item.color.trim().toUpperCase());
      }
    });
    unallocatedData.forEach(item => {
      if (item.style?.trim().toUpperCase() === selectedStyle && item.color) {
        colors.add(item.color.trim().toUpperCase());
      }
    });
    return Array.from(colors).sort();
  }, [selectedStyle, uniqueColors, allocatedData, unallocatedData]);

  // Handle auto query suggestion matches
  const filteredSuggestions = useMemo(() => {
    const query = searchQuery.trim().toUpperCase();
    if (!query) return [];
    
    const results: Array<{ style: string; color: string; type: 'style-color' }> = [];
    
    // Find style-color pairs that match our search query
    const seenPairs = new Set<string>();
    
    const processPair = (style: string, color: string) => {
      if (!style || !color) return;
      const key = `${style}|${color}`;
      if (seenPairs.has(key)) return;
      
      const styleMatches = style.includes(query);
      const colorMatches = color.includes(query);
      const combinedMatches = `${style} ${color}`.includes(query) || `${color} ${style}`.includes(query);

      if (styleMatches || colorMatches || combinedMatches) {
        seenPairs.add(key);
        results.push({ style, color, type: 'style-color' });
      }
    };

    allocatedData.forEach(item => processPair(item.style_num?.trim().toUpperCase(), item.color?.trim().toUpperCase()));
    unallocatedData.forEach(item => processPair(item.style?.trim().toUpperCase(), item.color?.trim().toUpperCase()));

    return results.slice(0, 10); // Limit to top 10 results
  }, [searchQuery, allocatedData, unallocatedData]);

  // Core search result matching
  const searchResults = useMemo(() => {
    const targetStyle = selectedStyle.trim().toUpperCase();
    const targetColor = selectedColor.trim().toUpperCase();

    if (!targetStyle && !targetColor) return null;

    interface DeptStock {
      feeding: number;
      stitching: number;
      finishing: number;
      finishingRejects: number;
      packingLoose: number;
      packingBlister: number;
      packingCartons: number;
      cartonCount: number;
    }

    interface POSummary {
      poNumber: string;
      buyer: string;
      style: string;
      color: string;
      sizes: Record<string, DeptStock>;
      totals: DeptStock;
    }

    const posMap: Record<string, POSummary> = {};

    const getOrCreatePO = (po: string, buyer: string, style: string, color: string): POSummary => {
      const key = `${po}|${style}|${color}`;
      if (!posMap[key]) {
        posMap[key] = {
          poNumber: po,
          buyer: buyer || 'N/A',
          style,
          color,
          sizes: {},
          totals: {
            feeding: 0,
            stitching: 0,
            finishing: 0,
            finishingRejects: 0,
            packingLoose: 0,
            packingBlister: 0,
            packingCartons: 0,
            cartonCount: 0,
          },
        };
      }
      return posMap[key];
    };

    // 1. Process Allocated Data
    allocatedData.forEach(item => {
      const itemStyle = (item.style_num || '').trim().toUpperCase();
      const itemColor = (item.color || '').trim().toUpperCase();

      // Check if item matches search filters
      if (targetStyle && itemStyle !== targetStyle) return;
      if (targetColor && itemColor !== targetColor) return;

      const po = getOrCreatePO(item.po_number || 'UNKNOWN PO', item.buyer_name || item.buyer, itemStyle, itemColor);
      const sizeStr = (item.size || 'UNKN').toUpperCase();

      if (!po.sizes[sizeStr]) {
        po.sizes[sizeStr] = {
          feeding: 0,
          stitching: 0,
          finishing: 0,
          finishingRejects: 0,
          packingLoose: 0,
          packingBlister: 0,
          packingCartons: 0,
          cartonCount: 0,
        };
      }

      // Calculate stock logic per department
      const feedingVal = Math.max(0, (item.cut_accepted || 0) - (item.total_sent || 0));
      const stitchingVal = Math.max(0, (item.send_accepted || 0) - (item.total_stitched || 0));
      const finishingVal = Math.max(0, (item.stitch_accepted || 0) - (item.total_passed || 0) - (item.total_rejected || 0));
      const finishingRejVal = item.total_rejected || 0;
      const looseVal = item.loose_available || 0;
      const blisterVal = item.blister_available || 0;
      const cartonPcs = item.store_available_pcs || 0;
      const cartonCount = Math.max(0, item.store_available_cartons || 0);

      // Add to sizes
      po.sizes[sizeStr].feeding += feedingVal;
      po.sizes[sizeStr].stitching += stitchingVal;
      po.sizes[sizeStr].finishing += finishingVal;
      po.sizes[sizeStr].finishingRejects += finishingRejVal;
      po.sizes[sizeStr].packingLoose += looseVal;
      po.sizes[sizeStr].packingBlister += blisterVal;
      po.sizes[sizeStr].packingCartons += cartonPcs;
      po.sizes[sizeStr].cartonCount += cartonCount;

      // Add to totals
      po.totals.feeding += feedingVal;
      po.totals.stitching += stitchingVal;
      po.totals.finishing += finishingVal;
      po.totals.finishingRejects += finishingRejVal;
      po.totals.packingLoose += looseVal;
      po.totals.packingBlister += blisterVal;
      po.totals.packingCartons += cartonPcs;
      po.totals.cartonCount += cartonCount;
    });

    // 2. Process Unallocated Data
    unallocatedData.forEach(item => {
      const itemStyle = (item.style || '').trim().toUpperCase();
      const itemColor = (item.color || '').trim().toUpperCase();

      if (targetStyle && itemStyle !== targetStyle) return;
      if (targetColor && itemColor !== targetColor) return;

      const po = getOrCreatePO('UNALLOCATED HOLDING POOL', 'No Buyer', itemStyle, itemColor);
      const sizeStr = (item.size || 'UNKN').toUpperCase();
      const qty = item.quantity || 0;
      const dept = (item.department || '').toLowerCase();

      if (!po.sizes[sizeStr]) {
        po.sizes[sizeStr] = {
          feeding: 0,
          stitching: 0,
          finishing: 0,
          finishingRejects: 0,
          packingLoose: 0,
          packingBlister: 0,
          packingCartons: 0,
          cartonCount: 0,
        };
      }

      // Map unallocated department to the corresponding key
      if (dept === 'feeding') {
        po.sizes[sizeStr].feeding += qty;
        po.totals.feeding += qty;
      } else if (dept === 'stitching') {
        po.sizes[sizeStr].stitching += qty;
        po.totals.stitching += qty;
      } else if (dept === 'finishing') {
        po.sizes[sizeStr].finishing += qty;
        po.totals.finishing += qty;
      } else if (dept === 'packing') {
        // Unallocated packing stock is treated as loose by default unless specified
        po.sizes[sizeStr].packingLoose += qty;
        po.totals.packingLoose += qty;
      }
    });

    // Clean up results with no stock in any department
    return Object.values(posMap).filter(po => {
      const grandTotal = 
        po.totals.feeding + 
        po.totals.stitching + 
        po.totals.finishing + 
        po.totals.finishingRejects + 
        po.totals.packingLoose + 
        po.totals.packingBlister + 
        po.totals.packingCartons;
      return grandTotal > 0;
    });
  }, [selectedStyle, selectedColor, allocatedData, unallocatedData]);

  const togglePOExpand = (poKey: string) => {
    setExpandedPOs(prev => ({
      ...prev,
      [poKey]: !prev[poKey],
    }));
  };

  const getDepartmentStats = (totals: any) => {
    return [
      { id: 'feeding', label: 'Feeding Store', pcs: totals.feeding, color: 'text-send bg-send/5 border-send/10' },
      { id: 'stitching', label: 'Stitching Store', pcs: totals.stitching, color: 'text-stitch bg-stitch/5 border-stitch/10' },
      { id: 'finishing', label: 'Finishing Store', pcs: totals.finishing, extra: totals.finishingRejects ? `(${totals.finishingRejects} Rejected)` : null, color: 'text-pass bg-pass/5 border-pass/10' },
      { id: 'packing', label: 'Packing Store', pcs: totals.packingLoose + totals.packingBlister + totals.packingCartons, detail: `Loose: ${totals.packingLoose} | Blister: ${totals.packingBlister} | Cartons: ${totals.packingCartons} (${totals.cartonCount} Ctns)`, color: 'text-po bg-po/5 border-po/10' },
    ];
  };

  const hasSearchParameters = selectedStyle || selectedColor;

  return (
    <div className="bg-bg2 border border-bg4 rounded-[2.5rem] p-6 md:p-8 space-y-6 shadow-xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-po/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-cut/5 rounded-full blur-3xl pointer-events-none" />
      
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-bg4/65 pb-6">
        <div>
          <h4 className="text-lg font-black uppercase tracking-tight flex items-center gap-2 text-text">
            <Layers className="w-5 h-5 text-po" />
            Product Master Stock Finder
          </h4>
          <p className="text-[10px] font-bold text-text3 uppercase tracking-widest mt-1">
            Search Style & Color to track available stock across all stores and PO allocations instantaneously
          </p>
        </div>

        {hasSearchParameters && (
          <button
            onClick={() => {
              setSelectedStyle('');
              setSelectedColor('');
              setSearchQuery('');
              setExpandedPOs({});
            }}
            className="px-4 py-2 border border-bg4 hover:bg-bg3 text-[10px] font-black uppercase tracking-wider text-text3 hover:text-text rounded-xl transition-all w-fit cursor-pointer animate-in fade-in"
          >
            Clear Selected
          </button>
        )}
      </div>

      {/* Grid Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Style Selector */}
        <div className="space-y-1.5 flex flex-col">
          <label className="text-[9px] font-black uppercase tracking-wider text-text3 ml-1">Filter by Style</label>
          <select
            value={selectedStyle}
            onChange={(e) => {
              setSelectedStyle(e.target.value);
              // Reset color if it's no longer relevant
              if (selectedColor && e.target.value) {
                // Keep it if it's in relevantColors for the new style, otherwise reset
                const isRelevant = allocatedData.some(item => item.style_num?.trim().toUpperCase() === e.target.value && item.color?.trim().toUpperCase() === selectedColor) ||
                                  unallocatedData.some(item => item.style?.trim().toUpperCase() === e.target.value && item.color?.trim().toUpperCase() === selectedColor);
                if (!isRelevant) setSelectedColor('');
              }
            }}
            className="w-full bg-bg border border-bg4 rounded-xl px-4 py-3 text-xs font-black uppercase outline-none focus:ring-1 focus:ring-po/30 transition-all font-sans cursor-pointer"
          >
            <option value="">-- ALL STYLES --</option>
            {uniqueStyles.map(st => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        </div>

        {/* Color Selector */}
        <div className="space-y-1.5 flex flex-col">
          <label className="text-[9px] font-black uppercase tracking-wider text-text3 ml-1">Filter by Color</label>
          <select
            value={selectedColor}
            onChange={(e) => setSelectedColor(e.target.value)}
            className="w-full bg-bg border border-bg4 rounded-xl px-4 py-3 text-xs font-black uppercase outline-none focus:ring-1 focus:ring-po/30 transition-all font-sans cursor-pointer"
          >
            <option value="">-- ALL COLORS --</option>
            {relevantColors.map(col => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>
        </div>

        {/* Autocomplete Quick Search Text Input */}
        <div className="space-y-1.5 flex flex-col relative">
          <label className="text-[9px] font-black uppercase tracking-wider text-text3 ml-1">Fuzzy Search Suggestions</label>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text3" />
            <input
              type="text"
              placeholder="Type to search Style or Color..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-bg border border-bg4 rounded-xl pl-11 pr-4 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-po/20 transition-all font-sans uppercase placeholder:normal-case"
            />
          </div>

          {/* Typeahead lookup dropdown suggestions */}
          <AnimatePresence>
            {filteredSuggestions.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="absolute left-0 right-0 top-[105%] bg-bg border border-bg4 rounded-2xl shadow-2xl z-30 overflow-hidden divide-y divide-bg4 max-h-56 overflow-y-auto"
              >
                {filteredSuggestions.map((item, idx) => (
                  <button
                    key={`${item.style}-${item.color}-${idx}`}
                    onClick={() => {
                      setSelectedStyle(item.style);
                      setSelectedColor(item.color);
                      setSearchQuery('');
                    }}
                    className="w-full text-left p-3 hover:bg-po/5 flex items-center justify-between text-xs transition-colors cursor-pointer"
                  >
                    <div>
                      <span className="font-black text-text font-mono mr-2">{item.style}</span>
                      <span className="text-text3 text-[10px] font-bold uppercase">{item.color}</span>
                    </div>
                    <span className="text-[8px] bg-bg3 text-po font-black uppercase px-2 py-0.5 rounded-md font-mono">Matched</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Visualizer Area */}
      <div className="pt-4 border-t border-bg4/30">
        {!hasSearchParameters ? (
          <div className="p-10 text-center bg-bg/30 border border-dashed border-bg4 rounded-3xl flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 bg-bg3/60 rounded-2xl border border-bg4 flex items-center justify-center text-text3">
              <Search className="w-5 h-5 opacity-40 animate-pulse" />
            </div>
            <div>
              <p className="text-sm font-black uppercase text-text mb-1">No Active Query Selected</p>
              <p className="text-xs text-text3 max-w-sm mx-auto leading-relaxed">
                Choose a Style or Color above, or search via typeahead to view live stock details in each warehouse location.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <h5 className="text-[10px] font-mono uppercase tracking-widest font-black text-text3">
              Search Results: Style "{selectedStyle || 'ANY'}" • Color "{selectedColor || 'ANY'}"
            </h5>

            {!searchResults || searchResults.length === 0 ? (
              <div className="p-12 text-center bg-bg/50 border border-bg4 rounded-[2rem] text-xs font-black uppercase tracking-wider text-text3 flex flex-col items-center gap-3">
                <HelpCircle className="w-10 h-10 opacity-20" />
                No physical stock found in any department under these parameters.
              </div>
            ) : (
              <div className="space-y-4">
                {searchResults.map((poGroup, idx) => {
                  const poKey = `${poGroup.poNumber}-${poGroup.style}-${poGroup.color}`;
                  const isExpanded = !!expandedPOs[poKey];
                  const dStats = getDepartmentStats(poGroup.totals);
                  const grandTotal = dStats.reduce((sum, d) => sum + d.pcs, 0);

                  return (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      key={poKey}
                      className="bg-bg border border-bg4 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all"
                    >
                      {/* Accordion Trigger Head row */}
                      <button
                        onClick={() => togglePOExpand(poKey)}
                        className="w-full p-5 flex flex-col sm:flex-row sm:items-center justify-between text-left gap-4 bg-bg2 hover:bg-bg3/35 transition-colors border-b border-bg4/35 cursor-pointer"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "px-2.5 py-0.5 rounded text-[8px] font-mono font-black uppercase",
                              poGroup.poNumber.startsWith('UNALLOCATED') 
                                ? "bg-amber-500/15 text-amber-500 border border-amber-500/20" 
                                : "bg-po/15 text-po border border-po/20"
                            )}>
                              {poGroup.poNumber.startsWith('UNALLOCATED') ? 'Holding WIP' : 'Allocated Order'}
                            </span>
                            <span className="font-black text-po font-mono text-sm tracking-wide">{poGroup.poNumber}</span>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-text2 font-bold uppercase mt-0.5">
                            <span>Buyer: <span className="text-text font-black">{poGroup.buyer}</span></span>
                            <span className="text-bg4">•</span>
                            <span>Style: <span className="font-mono text-text font-extrabold">{poGroup.style}</span></span>
                            <span className="text-bg4">•</span>
                            <span>Color: <span className="text-text font-black">{poGroup.color}</span></span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0 sm:self-center">
                          <div className="text-right space-y-0.5">
                            <span className="text-[10px] text-text3 font-bold uppercase tracking-widest block font-mono">Cumulative stock</span>
                            <span className="text-base font-black text-pass font-mono">{grandTotal.toLocaleString()} <span className="text-xs font-bold opacity-60">PCS</span></span>
                          </div>
                          <div className="p-2 border border-bg4 rounded-xl bg-bg shadow-sm text-text3 hover:text-text">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </div>
                      </button>

                      {/* Content details matrix */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: 'auto' }}
                            exit={{ height: 0 }}
                            className="overflow-hidden bg-bg/20"
                          >
                            <div className="p-6 space-y-6">
                              {/* Store location summary row */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                {dStats.map(store => (
                                  <div
                                    key={store.id}
                                    className={cn(
                                      "p-4 rounded-2xl border flex flex-col justify-between gap-1.5",
                                      store.color
                                    )}
                                  >
                                    <span className="text-[9px] font-black uppercase tracking-wider text-text3 opacity-80">{store.label}</span>
                                    <div className="space-y-0.5">
                                      <p className="text-sm font-black font-mono leading-none">{store.pcs.toLocaleString()} <span className="text-[9px] font-bold opacity-60">PCS</span></p>
                                      {store.extra && <p className="text-[8px] font-black text-reject uppercase mt-1 leading-none">{store.extra}</p>}
                                      {store.detail && <p className="text-[8px] font-black text-text3 uppercase mt-1 leading-none">{store.detail}</p>}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Size dimension table log */}
                              <div className="border border-bg4 rounded-2xl overflow-hidden">
                                <div className="p-4 bg-bg3/40 border-b border-bg4 text-[10px] font-black uppercase tracking-widest text-text3">
                                  Store Inventory Matrix by Sizes
                                </div>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                      <tr className="bg-bg3 border-b border-bg4 font-bold text-[10px] text-text2 uppercase tracking-tight">
                                        <th className="p-3">Store Location</th>
                                        {SIZES_ORDER.map(s => {
                                          const hasQty = Object.keys(poGroup.sizes).some(size => size === s && 
                                            (poGroup.sizes[size].feeding > 0 || poGroup.sizes[size].stitching > 0 || poGroup.sizes[size].finishing > 0 || poGroup.sizes[size].packingLoose > 0 || poGroup.sizes[size].packingBlister > 0 || poGroup.sizes[size].packingCartons > 0)
                                          );
                                          if (!hasQty) return null;
                                          return <th key={s} className="p-3 text-center w-16">{s}</th>;
                                        })}
                                        <th className="p-3 text-right w-24">Total</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-bg4 font-mono font-medium">

                                      {/* Feeding */}
                                      {poGroup.totals.feeding > 0 && (
                                        <tr className="hover:bg-bg3/10">
                                          <td className="p-3 font-sans font-black text-[10px] uppercase text-send">Feeding Store</td>
                                          {SIZES_ORDER.map(s => {
                                            const hasQty = Object.keys(poGroup.sizes).some(size => size === s);
                                            if (!hasQty) return null;
                                            const val = poGroup.sizes[s]?.feeding || 0;
                                            return <td key={s} className="p-3 text-center font-bold text-text2">{val > 0 ? val.toLocaleString() : '—'}</td>;
                                          })}
                                          <td className="p-3 text-right font-black text-send font-mono">{poGroup.totals.feeding.toLocaleString()}</td>
                                        </tr>
                                      )}

                                      {/* Stitching */}
                                      {poGroup.totals.stitching > 0 && (
                                        <tr className="hover:bg-bg3/10">
                                          <td className="p-3 font-sans font-black text-[10px] uppercase text-stitch">Stitching Store</td>
                                          {SIZES_ORDER.map(s => {
                                            const hasQty = Object.keys(poGroup.sizes).some(size => size === s);
                                            if (!hasQty) return null;
                                            const val = poGroup.sizes[s]?.stitching || 0;
                                            return <td key={s} className="p-3 text-center font-bold text-text2">{val > 0 ? val.toLocaleString() : '—'}</td>;
                                          })}
                                          <td className="p-3 text-right font-black text-stitch font-mono">{poGroup.totals.stitching.toLocaleString()}</td>
                                        </tr>
                                      )}

                                      {/* Finishing */}
                                      {(poGroup.totals.finishing > 0 || poGroup.totals.finishingRejects > 0) && (
                                        <tr className="hover:bg-bg3/10">
                                          <td className="p-3 font-sans font-black text-[10px] uppercase text-pass">
                                            Finishing Store
                                          </td>
                                          {SIZES_ORDER.map(s => {
                                            const hasQty = Object.keys(poGroup.sizes).some(size => size === s);
                                            if (!hasQty) return null;
                                            const val = poGroup.sizes[s]?.finishing || 0;
                                            const rej = poGroup.sizes[s]?.finishingRejects || 0;
                                            return (
                                              <td key={s} className="p-3 text-center font-bold">
                                                <div className="flex flex-col items-center leading-none gap-1">
                                                  <span className="text-text2">{val > 0 ? val.toLocaleString() : '—'}</span>
                                                  {rej > 0 && <span className="text-[8px] font-black text-reject">({rej} R)</span>}
                                                </div>
                                              </td>
                                            );
                                          })}
                                          <td className="p-3 text-right font-black text-pass font-mono">
                                            <div className="flex flex-col items-end leading-none gap-1">
                                              <span>{poGroup.totals.finishing.toLocaleString()}</span>
                                              {poGroup.totals.finishingRejects > 0 && <span className="text-[8px] font-black text-reject">({poGroup.totals.finishingRejects} Rej)</span>}
                                            </div>
                                          </td>
                                        </tr>
                                      )}

                                      {/* Packing Store (Combined) */}
                                      {(poGroup.totals.packingLoose > 0 || poGroup.totals.packingBlister > 0 || poGroup.totals.packingCartons > 0) && (
                                        <tr className="hover:bg-bg3/10">
                                          <td className="p-3 font-sans font-black text-[10px] uppercase text-po">Packing Store</td>
                                          {SIZES_ORDER.map(s => {
                                            const hasQty = Object.keys(poGroup.sizes).some(size => size === s);
                                            if (!hasQty) return null;
                                            const sInfo = poGroup.sizes[s];
                                            const hasTotal = (sInfo?.packingLoose || 0) + (sInfo?.packingBlister || 0) + (sInfo?.packingCartons || 0);
                                            if (!hasTotal) return <td key={s} className="p-3 text-center text-text3/20">—</td>;
                                            return (
                                              <td key={s} className="p-3 text-center font-bold">
                                                <div className="flex flex-col items-center gap-0.5 text-[9px] font-bold">
                                                  {sInfo.packingLoose > 0 && <span className="text-pass" title="Loose">L: {sInfo.packingLoose}</span>}
                                                  {sInfo.packingBlister > 0 && <span className="text-pack" title="Blister">B: {sInfo.packingBlister}</span>}
                                                  {sInfo.packingCartons > 0 && <span className="text-po" title="Cartons">C: {sInfo.packingCartons}</span>}
                                                </div>
                                              </td>
                                            );
                                          })}
                                          <td className="p-3 text-right font-black text-po font-mono text-xs">
                                            <div className="flex flex-col items-end leading-normal text-[9px] font-bold">
                                              {poGroup.totals.packingLoose > 0 && <span className="text-pass">Loose: {poGroup.totals.packingLoose}</span>}
                                              {poGroup.totals.packingBlister > 0 && <span className="text-pack">Blister: {poGroup.totals.packingBlister}</span>}
                                              {poGroup.totals.packingCartons > 0 && <span className="text-po">Carton: {poGroup.totals.packingCartons} ({poGroup.totals.cartonCount} C)</span>}
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
