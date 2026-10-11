import React, { useEffect, useState } from 'react';
import { storeService, poService } from '../services/erpService';
import { toast } from 'sonner';
import { 
  Shuffle, 
  Search, 
  HelpCircle, 
  Briefcase, 
  Check, 
  Loader2, 
  AlertCircle, 
  Layers, 
  ArrowRight,
  X,
  RefreshCw
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface UnallocatedItem {
  style: string;
  color: string;
  size: string;
  department: string;
  quantity: number;
  recordCount: number;
}

interface POWithProducts {
  po_number: string;
  buyer: string;
  status: string;
  products?: {
    style_num: string;
    color: string;
    size: string;
  }[];
  styles?: string;
  colors?: string;
  sizes?: string;
}

interface UnallocatedHoldingPoolProps {
  onRefreshParent?: () => void;
}

export const UnallocatedHoldingPool: React.FC<UnallocatedHoldingPoolProps> = ({ onRefreshParent }) => {
  const [unallocated, setUnallocated] = useState<UnallocatedItem[]>([]);
  const [pos, setPOs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('All');

  // Multi-select state
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  // Reallocation modal state
  const [activeRealloc, setActiveRealloc] = useState<UnallocatedItem | null>(null);
  const [allocationMode, setAllocationMode] = useState<'manual' | 'auto'>('manual');
  const [reallocQty, setReallocQty] = useState<number>(0);
  const [selectedPO, setSelectedPO] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load datasets
  const loadData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const [unallocatedRes, posRes] = await Promise.all([
        storeService.getUnallocated(),
        poService.list()
      ]);
      setUnallocated(unallocatedRes.unallocated || []);
      setPOs(posRes || []);
      setSelectedKeys([]);
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to load holding pool and PO list.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter department colors
  const getDeptColor = (dept: string) => {
    switch (dept.toLowerCase()) {
      case 'cutting': return 'text-cut bg-cut/5 border-cut/10';
      case 'feeding': return 'text-send bg-send/5 border-send/10';
      case 'stitching': return 'text-stitch bg-stitch/5 border-stitch/10';
      case 'finishing': return 'text-pass bg-pass/5 border-pass/10';
      case 'packing': return 'text-po bg-po/5 border-po/10';
      default: return 'text-text3 bg-bg3 border-bg4';
    }
  };

  const getDeptLabel = (dept: string) => {
    return dept.charAt(0).toUpperCase() + dept.slice(1);
  };

  // Filter unallocated items
  const filteredItems = unallocated.filter(item => {
    const matchesSearch = item.style.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.color.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.size.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = selectedDeptFilter === 'All' || item.department.toLowerCase() === selectedDeptFilter.toLowerCase();
    return matchesSearch && matchesDept;
  });

  // Calculate matching POs for the currently open reallocating item
  const matchingPOs = React.useMemo(() => {
    if (!activeRealloc) return [];

    const itemStyle = activeRealloc.style.toUpperCase().trim();
    const itemColor = activeRealloc.color.toUpperCase().trim();
    const itemSize = activeRealloc.size.toUpperCase().trim();

    return pos.filter(po => {
      // Only allocate to active orders
      if (po.status !== 'Active') return false;
      if (po.po_number.startsWith('UNALLOCATED') || po.po_number === 'UNIVERSAL') return false;

      // Ensure the production order contains products matching style, color and size
      const hasProductSpec = po.products?.some((p: any) => 
        p.style_num.toUpperCase().trim() === itemStyle &&
        p.color.toUpperCase().trim() === itemColor &&
        p.size.toUpperCase().trim() === itemSize
      );

      // If specifications are packed into string metadata, do a fallback check
      const fallbackSpecCheck = !po.products && (
        po.styles?.toUpperCase().includes(itemStyle) &&
        po.colors?.toUpperCase().includes(itemColor) &&
        po.sizes?.toUpperCase().includes(itemSize)
      );

      return hasProductSpec || fallbackSpecCheck;
    });
  }, [activeRealloc, pos]);

  // Sort matched POs by priority (Urgent > Normal > Low) and then by delivery_date / created_at (FIFO)
  const sortedMatchingPOs = React.useMemo(() => {
    const priorityOrder: Record<string, number> = { 'Urgent': 3, 'Normal': 2, 'Low': 1 };
    return [...matchingPOs].sort((a, b) => {
      const pA = priorityOrder[a.priority] || 2;
      const pB = priorityOrder[b.priority] || 2;
      if (pA !== pB) return pB - pA; // Higher priority first

      if (a.delivery_date && b.delivery_date) {
        const dA = new Date(a.delivery_date).getTime();
        const dB = new Date(b.delivery_date).getTime();
        if (dA !== dB) return dA - dB; // Earliest delivery first
      } else if (a.delivery_date) {
        return -1;
      } else if (b.delivery_date) {
        return 1;
      }

      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); // Oldest first
    });
  }, [matchingPOs]);

  // Handle reallocate action
  const handleOpenRealloc = (item: UnallocatedItem) => {
    setActiveRealloc(item);
    setAllocationMode('manual');
    setReallocQty(item.quantity);
    setSelectedPO('');
  };

  const handlePerformReallocate = async () => {
    if (!activeRealloc) return;

    setIsSubmitting(true);
    try {
      if (allocationMode === 'auto') {
        const res = await storeService.autoAllocateBulk({
          items: [{
            style: activeRealloc.style,
            color: activeRealloc.color,
            size: activeRealloc.size,
            department: activeRealloc.department,
            quantity: reallocQty
          }]
        });

        toast.success(res.message || 'Auto-allocation processed successfully.');
        setActiveRealloc(null);
        loadData(true);
        if (onRefreshParent) onRefreshParent();
      } else {
        if (!selectedPO) {
          toast.error('Please select a target Production Order.');
          setIsSubmitting(false);
          return;
        }
        if (reallocQty <= 0 || reallocQty > activeRealloc.quantity) {
          toast.error(`Please select a valid quantity between 1 and ${activeRealloc.quantity}.`);
          setIsSubmitting(false);
          return;
        }

        const res = await storeService.reallocate({
          style: activeRealloc.style,
          color: activeRealloc.color,
          size: activeRealloc.size,
          department: activeRealloc.department,
          quantity: reallocQty,
          targetPoNumber: selectedPO
        });

        toast.success(res.message || 'Stock successfully reallocated');
        setActiveRealloc(null);
        loadData(true);
        if (onRefreshParent) onRefreshParent();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to reallocate stock.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Perform bulk auto allocation for checked items
  const handleBulkAutoAllocate = async (itemsToAllocate: UnallocatedItem[]) => {
    if (itemsToAllocate.length === 0) {
      toast.error('No items selected for auto allocation.');
      return;
    }

    setIsRefreshing(true);
    try {
      const payloadItems = itemsToAllocate.map(item => ({
        style: item.style,
        color: item.color,
        size: item.size,
        department: item.department,
        quantity: item.quantity
      }));

      const res = await storeService.autoAllocateBulk({ items: payloadItems });
      toast.success(res.message || 'Successfully processed bulk auto-allocation.');
      loadData(true);
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed bulk auto-allocation.');
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-10 h-10 border-t-po text-po animate-spin" />
        <div className="text-text3 font-bold uppercase tracking-widest text-xs">Querying Holding Pool...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Filters heading row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg2 p-4 border border-bg4 rounded-3xl">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Style, Color, Size..."
            className="w-full pl-12 pr-4 py-3 bg-bg border border-bg4 rounded-2xl text-xs font-semibold placeholder:text-text3 text-text focus:outline-none focus:ring-2 focus:ring-po/20 focus:border-po transition-all"
          />
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedDeptFilter}
            onChange={(e) => setSelectedDeptFilter(e.target.value)}
            className="px-4 py-3 bg-bg border border-bg4 rounded-2xl text-xs font-bold text-text focus:outline-none cursor-pointer"
          >
            <option value="All">All Departments</option>
            <option value="cutting">Cutting</option>
            <option value="feeding">Feeding</option>
            <option value="stitching">Stitching</option>
            <option value="finishing">Finishing</option>
            <option value="packing">Packing</option>
          </select>

          <button
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            className="p-3 bg-bg border border-bg4 hover:bg-bg3 rounded-2xl text-text3 hover:text-text transition-colors disabled:opacity-50"
            title="Refresh Pool"
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Bulk action selection control bar */}
      {filteredItems.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-bg2 p-4 border border-bg4 rounded-3xl">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="bulk-select-all"
              checked={selectedKeys.length === filteredItems.length}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedKeys(filteredItems.map(item => `${item.department}-${item.style}-${item.color}-${item.size}`));
                } else {
                  setSelectedKeys([]);
                }
              }}
              className="w-4 h-4 rounded border-bg4 bg-bg text-po focus:ring-po/30 cursor-pointer accent-po"
            />
            <label htmlFor="bulk-select-all" className="text-xs font-black uppercase text-text2 cursor-pointer select-none">
              Select All ({selectedKeys.length} / {filteredItems.length} items Selected)
            </label>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                const selectedItems = filteredItems.filter(item => 
                  selectedKeys.includes(`${item.department}-${item.style}-${item.color}-${item.size}`)
                );
                handleBulkAutoAllocate(selectedItems);
              }}
              disabled={selectedKeys.length === 0}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-po hover:bg-po/90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer shadow-md shadow-po/10"
            >
              <Shuffle className="w-3.5 h-3.5" />
              Auto-Allocate Selected
            </button>

            <button
              type="button"
              onClick={() => handleBulkAutoAllocate(filteredItems)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-bg hover:bg-bg3 border border-bg4 text-text font-black text-[10px] uppercase tracking-widest rounded-xl transition-all cursor-pointer"
            >
              Auto-Allocate All ({filteredItems.length})
            </button>
          </div>
        </div>
      )}

      {filteredItems.length === 0 ? (
        <div className="p-16 text-center border border-bg4 rounded-[2.5rem] bg-bg2 flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-3xl bg-bg3/60 flex items-center justify-center text-text3 border border-bg4">
            <Check className="w-8 h-8 text-pass" />
          </div>
          <div>
            <h4 className="font-black uppercase text-sm tracking-tight mb-2 text-text">Holding Pool is Clean</h4>
            <p className="text-xs text-text3 max-w-md mx-auto leading-relaxed">
              No items are currently parked in the Virtual UNALLOCATED holding pool. Every departmental report aligns with official production orders.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item, i) => (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              key={`${item.department}-${item.style}-${item.color}-${item.size}`}
              className="bg-bg2 border border-bg4 rounded-[2rem] p-6 shadow-md hover:shadow-xl transition-all hover:translate-y-[-2px] flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedKeys.includes(`${item.department}-${item.style}-${item.color}-${item.size}`)}
                      onChange={(e) => {
                        const key = `${item.department}-${item.style}-${item.color}-${item.size}`;
                        if (e.target.checked) {
                          setSelectedKeys(prev => [...prev, key]);
                        } else {
                          setSelectedKeys(prev => prev.filter(k => k !== key));
                        }
                      }}
                      className="w-4 h-4 rounded border-bg4 bg-bg text-po focus:ring-po/30 cursor-pointer accent-po"
                    />
                    <span className={cn(
                      "px-3.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider border",
                      getDeptColor(item.department)
                    )}>
                      {getDeptLabel(item.department)} Store
                    </span>
                  </div>
                  
                  <span className="text-[10px] font-black text-text3 font-mono">
                    {item.recordCount} records
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-black text-text3 uppercase tracking-widest block">Style</span>
                  <p className="text-lg font-black text-text font-mono leading-none">{item.style}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] font-black text-text3 uppercase tracking-widest block">Color</span>
                    <p className="text-xs font-bold text-text2 uppercase">{item.color}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-text3 uppercase tracking-widest block">Size / Qty</span>
                    <p className="text-xs font-bold text-text2">
                      <span className="bg-bg3 border border-bg4 px-2 py-0.5 rounded font-black text-text font-mono mr-1.5">{item.size}</span>
                      <span className="font-extrabold text-po">{item.quantity.toLocaleString()} pcs</span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-bg4">
                <button
                  type="button"
                  onClick={() => handleOpenRealloc(item)}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-po hover:bg-po/90 active:scale-95 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-md shadow-po/10 cursor-pointer"
                >
                  <Shuffle className="w-4 h-4 text-white" />
                  Reallocate Stock
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Reallocation dialog / overlay */}
      <AnimatePresence>
        {activeRealloc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveRealloc(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative bg-bg border border-bg4 rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl card-shadow flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-bg4 bg-bg2/40 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center border border-amber-500/20">
                    <Shuffle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-sm uppercase tracking-wider text-text">Reallocate WIP Stock</h4>
                    <p className="text-[10px] font-bold text-text3 uppercase tracking-widest">Supervisor Allocation Portal</p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveRealloc(null)}
                  className="w-8 h-8 rounded-full border border-bg4 hover:bg-bg3 flex items-center justify-center text-text3 hover:text-text cursor-pointer transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-6">
                {/* Details Card */}
                <div className="bg-bg2/80 rounded-2xl p-4 border border-bg4 space-y-3.5">
                  <span className={cn(
                    "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border",
                    getDeptColor(activeRealloc.department)
                  )}>
                    {getDeptLabel(activeRealloc.department)} Store
                  </span>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-[9px] font-black text-text3 uppercase tracking-wider block">Style</span>
                      <span className="font-black text-text font-mono text-sm">{activeRealloc.style}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-black text-text3 uppercase tracking-wider block">Color</span>
                      <span className="font-bold text-text2 uppercase text-[11px] truncate block">{activeRealloc.color}</span>
                    </div>
                    <div>
                      <span className="text-[9px] font-black text-text3 uppercase tracking-wider block">Size</span>
                      <span className="font-black text-text bg-bg3 border border-bg4 px-2 py-0.5 rounded font-mono text-[11px] block w-fit mt-1">{activeRealloc.size}</span>
                    </div>
                  </div>
                </div>

                {/* Range inputs */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-wider text-text2">Quantity to Reallocate</label>
                    <span className="text-xs font-black text-po">{reallocQty.toLocaleString()} / {activeRealloc.quantity.toLocaleString()} pcs</span>
                  </div>

                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="1"
                      max={activeRealloc.quantity}
                      value={reallocQty}
                      onChange={(e) => setReallocQty(parseInt(e.target.value))}
                      className="flex-1 accent-po h-1.5 bg-bg3 border border-bg4 rounded-lg cursor-pointer"
                    />
                    <input
                      type="number"
                      min="1"
                      max={activeRealloc.quantity}
                      value={reallocQty}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val)) {
                          setReallocQty(Math.min(activeRealloc.quantity, Math.max(1, val)));
                        }
                      }}
                      className="w-20 px-3 py-1.5 bg-bg border border-bg4 rounded-xl text-center font-black font-mono text-xs focus:ring-1 focus:ring-po/30 text-text"
                    />
                  </div>

                  {/* Preset quick buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setReallocQty(Math.round(activeRealloc.quantity / 2))}
                      className="px-3 py-1.5 rounded-lg border border-bg4 hover:bg-bg3 text-[9px] font-black uppercase text-text2 transition-all cursor-pointer"
                    >
                      50% Split
                    </button>
                    <button
                      type="button"
                      onClick={() => setReallocQty(activeRealloc.quantity)}
                      className="px-3 py-1.5 rounded-lg border border-bg4 hover:bg-bg3 text-[9px] font-black uppercase text-po bg-po/5 border-po/10 transition-all cursor-pointer"
                    >
                      All Stock
                    </button>
                  </div>
                </div>

                {/* Reallocation Mode Toggle */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-text2">Reallocation Rule</label>
                  <div className="grid grid-cols-2 gap-2 bg-bg2 p-1 border border-bg4 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setAllocationMode('manual')}
                      className={cn(
                        "py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer",
                        allocationMode === 'manual' 
                          ? "bg-bg text-po border border-bg4 shadow-sm" 
                          : "text-text3 hover:text-text"
                      )}
                    >
                      Manual Selection
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllocationMode('auto')}
                      className={cn(
                        "py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer",
                        allocationMode === 'auto' 
                          ? "bg-bg text-po border border-bg4 shadow-sm" 
                          : "text-text3 hover:text-text"
                      )}
                    >
                      Auto FIFO & Priority
                    </button>
                  </div>
                </div>

                {allocationMode === 'manual' ? (
                  /* Target Production Order */
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-wider text-text2">Select Target Production Order</label>
                    
                    {matchingPOs.length === 0 ? (
                      <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-2xl flex gap-2.5 text-xs text-red-500 font-semibold leading-relaxed">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          No active Production Orders contain <span className="font-black">{activeRealloc.style}</span> color <span className="font-black">{activeRealloc.color}</span> size <span className="font-black">{activeRealloc.size}</span> in their official specifications.
                          <p className="mt-1 font-normal text-[10px] opacity-75">
                            Please edit or add this product specification inside an active Production Order first.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <select
                          value={selectedPO}
                          onChange={(e) => setSelectedPO(e.target.value)}
                          className="w-full px-4 py-3 bg-bg border border-bg4 rounded-xl text-xs font-bold text-text focus:outline-none cursor-pointer text-text"
                        >
                          <option value="">-- Choose active Production Order --</option>
                          {matchingPOs.map(po => (
                            <option key={po.po_number} value={po.po_number}>
                              {po.po_number} (Buyer: {po.buyer || 'Unknown'})
                            </option>
                          ))}
                        </select>

                        <div className="p-3 bg-bg3/30 border border-bg4 rounded-xl text-[10px] leading-relaxed text-text3 flex gap-2">
                          <Briefcase className="w-3.5 h-3.5 text-po shrink-0 mt-0.5" />
                          <span>
                            Only active orders configured with matching specifications are shown. Auto-allocated WIP tags will move to the selected order's report.
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Auto FIFO & Priority Preview */
                  <div className="space-y-3.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-text2">Auto-allocation Precedence (FIFO & Priority)</label>
                    
                    {sortedMatchingPOs.length === 0 ? (
                      <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-2xl flex gap-2.5 text-xs text-red-500 font-semibold leading-relaxed font-mono">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          No active Production Orders found with matching style/color/size specification.
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-[10px] text-text3 font-bold uppercase tracking-wide">Precedence queue for matching target specifications:</p>
                        <div className="border border-bg4 rounded-2xl divide-y divide-bg4 overflow-hidden max-h-[160px] overflow-y-auto">
                          {sortedMatchingPOs.map((po, idx) => (
                            <div key={po.po_number} className="p-3 bg-bg2/40 flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-po/10 text-po flex items-center justify-center font-black text-[10px] font-mono">
                                  {idx + 1}
                                </span>
                                <div>
                                  <p className="font-black text-text font-mono text-[11px]">{po.po_number}</p>
                                  <p className="text-[9px] font-mono text-text3">Buyer: {po.buyer || 'Unknown'}</p>
                                </div>
                              </div>
                              <div className="text-right space-y-0.5">
                                <span className={cn(
                                  "inline-block px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider",
                                  po.priority === 'Urgent' ? "bg-red-500/10 text-red-500" :
                                  po.priority === 'Normal' ? "bg-po/10 text-po" : "bg-text3/10 text-text3"
                                )}>
                                  {po.priority || 'Normal'}
                                </span>
                                {po.delivery_date && (
                                  <p className="text-[9px] font-mono text-text3">Deliv: {po.delivery_date}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="p-3 bg-bg3/30 border border-bg4 rounded-xl text-[10px] leading-relaxed text-text3 flex gap-2">
                          <Check className="w-3.5 h-3.5 text-pass shrink-0 mt-0.5" />
                          <span>
                            Automated run prioritizes **Urgent** delivery orders, then runs oldest active orders first (**FIFO**).
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-bg4 bg-bg2/40 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setActiveRealloc(null)}
                  className="px-5 py-2 rounded-xl border border-bg4 hover:bg-bg3 text-[10px] font-black uppercase tracking-wider text-text3 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmitting || (allocationMode === 'manual' ? (!selectedPO || matchingPOs.length === 0) : (sortedMatchingPOs.length === 0))}
                  onClick={handlePerformReallocate}
                  className="flex items-center gap-2 px-6 py-2 bg-po text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-po/95 active:scale-95 transition-all shadow-lg shadow-po/10 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Allocating...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Move Stock ({reallocQty})
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
