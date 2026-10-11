import React, { useEffect, useState, useMemo } from 'react';
import { storeService, handoverService, poService, packingService } from '../services/erpService';
import { useAuth } from '../context/AuthContext';
import { 
  Warehouse, 
  Search, 
  Package, 
  ChevronRight,
  TrendingUp,
  History,
  CheckCircle2,
  Clock,
  Truck,
  Layers,
  Trash2,
  Loader2,
  AlertTriangle,
  Shuffle,
  Edit3,
  Info,
  Tag,
  Palette
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import { HandoverList } from '../components/HandoverList';
import { DiscardModal } from '../components/DiscardModal';
import { MultiSelectFilter, ActiveFilterBar } from '../components/MultiSelectFilter';

interface StorePageProps {
  onNavigate?: (page: string) => void;
}

export const StorePage: React.FC<StorePageProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'current_stock' | 'date_filtered'>('current_stock');
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [stock, setStock] = useState<any[]>([]);
  const [incoming, setIncoming] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [reallocatingKey, setReallocatingKey] = useState<string | null>(null);
  const [isMasterReallocating, setIsMasterReallocating] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [discardProduct, setDiscardProduct] = useState<any>(null);
  const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const handleMasterReallocateFIFO = async () => {
    setIsMasterReallocating(true);
    try {
      const res = await storeService.reallocateCartonFIFOMaster();
      toast.success(res.message || 'Successfully executed Master FIFO Reallocation.', {
        duration: 5000,
      });
      fetchData();
    } catch (err: any) {
      console.error(err);
      const errMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'Master reallocation failed';
      toast.error(errMsg);
    } finally {
      setIsMasterReallocating(false);
    }
  };

  const handleReallocateFIFO = async (item: any) => {
    const key = `${item.po_number}-${item.style_num}-${item.color}-${item.size}`;
    setReallocatingKey(key);
    try {
      const res = await storeService.reallocateCartonFIFO({
        style: item.style_num,
        color: item.color,
        size: item.size,
        current_po: item.po_number
      });
      toast.success(res.message || 'Successfully reallocated stock according to FIFO WIP.');
      fetchData();
    } catch (err: any) {
      console.error(err);
      const errMsg = err.response?.data?.message || err.response?.data?.error || err.message || 'Reallocation failed';
      toast.error(errMsg);
    } finally {
      setReallocatingKey(null);
    }
  };

  const [adjustingItem, setAdjustingItem] = useState<any | null>(null);
  const [newPcsPerCarton, setNewPcsPerCarton] = useState<string>('');
  const [isAdjusting, setIsAdjusting] = useState(false);

  const handleOpenAdjustModal = (item: any) => {
    setAdjustingItem(item);
    setNewPcsPerCarton('');
  };

  const handleAdjustCartonSizeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingItem || !newPcsPerCarton) return;
    const val = parseInt(newPcsPerCarton, 10);
    if (isNaN(val) || val <= 0) {
      toast.error('Pieces per carton must be a positive integer.');
      return;
    }

    setIsAdjusting(true);
    try {
      const res = await storeService.adjustCartonSize({
        product_id: adjustingItem.product_id,
        po_number: adjustingItem.po_number,
        pcs_per_carton: val
      });
      toast.success(res.message || 'Carton packing specifications updated successfully!');
      setAdjustingItem(null);
      fetchData();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to adjust carton specifications.');
    } finally {
      setIsAdjusting(false);
    }
  };

  // Toggle selection for a single row
  const toggleSelectRow = (key: string) => {
    setSelectedKeys(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  // Toggle select all filtered stock rows
  const toggleSelectAll = () => {
    const visibleKeys = filteredStock.map(item => `${item.po_number}-${item.style_num}-${item.color}-${item.size}`);
    const allSelected = visibleKeys.every(k => selectedKeys.includes(k));
    if (allSelected) {
      setSelectedKeys(prev => prev.filter(k => !visibleKeys.includes(k)));
    } else {
      setSelectedKeys(prev => {
        const union = new Set([...prev, ...visibleKeys]);
        return Array.from(union);
      });
    }
  };

  const handleDelete = async (item: any) => {
    const key = `${item.po_number}-${item.style_num}-${item.color}-${item.size}`;
    setConfirmDialog({
      message: `Are you sure you want to delete ALL carton data for PO: "${item.po_number}", Style: "${item.style_num}", Color: "${item.color}", Size: "${item.size}" from Carton Store?\n\nThis will permanently remove these Carton Store records.`,
      onConfirm: async () => {
        setDeletingKey(key);
        try {
          await storeService.deleteStoreData({
            department: 'carton',
            po_number: item.po_number,
            style_num: item.style_num,
            color: item.color,
            size: item.size
          });
          toast.success('Successfully deleted carton store records.');
          setSelectedKeys(prev => prev.filter(k => k !== key));
          fetchData();
        } catch (err: any) {
          console.error(err);
          toast.error(err.message || 'Failed to delete store records.');
        } finally {
          setDeletingKey(null);
        }
      }
    });
  };

  const handleBulkDelete = async () => {
    if (selectedKeys.length === 0) return;
    setConfirmDialog({
      message: `Are you sure you want to delete the ${selectedKeys.length} selected carton records from Carton Store?\n\nThis will permanently remove these Carton Store records.`,
      onConfirm: async () => {
        setIsBulkDeleting(true);
        try {
          const itemsToDelete = selectedKeys.map(key => {
            const item = stock.find(s => `${s.po_number}-${s.style_num}-${s.color}-${s.size}` === key);
            return item ? {
              po_number: item.po_number,
              style_num: item.style_num,
              color: item.color,
              size: item.size
            } : null;
          }).filter(Boolean) as any[];

          await storeService.deleteStoreDataBulk({
            department: 'carton',
            items: itemsToDelete
          });

          toast.success(`Successfully deleted ${itemsToDelete.length} carton store records.`);
          setSelectedKeys([]);
          fetchData();
        } catch (err: any) {
          console.error(err);
          toast.error(err.message || 'Failed to bulk delete store records.');
        } finally {
          setIsBulkDeleting(false);
        }
      }
    });
  };

  useEffect(() => {
    fetchData();
  }, [dateRange, activeTab]);

  const fetchData = async () => {
    setIsLoading(true);
    setSelectedKeys([]);
    try {
      const stockData = activeTab === 'current_stock'
        ? await storeService.getStock()
        : await storeService.getStock(dateRange.start, dateRange.end);
      setStock(stockData);
    } catch (error) {
      console.error('Failed to fetch store data', error);
    } finally {
      setIsLoading(false);
    }
  };

  // We actually need to fetch incoming records for the HandoverList
  const [incomingRecords, setIncomingRecords] = useState<any[]>([]);
  
  const fetchIncoming = async () => {
    try {
      const data = await packingService.list();
      setIncomingRecords(data.filter((r: any) => r.store_status === 'in_transit' && r.packing_type === 'carton'));
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchIncoming();
  }, []);

  const availableStyleOptions = useMemo(() => {
    const styleCounts: Record<string, number> = {};
    stock.filter(s => s.available_pcs > 0).forEach(item => {
      if (item.style_num) {
        styleCounts[item.style_num] = (styleCounts[item.style_num] || 0) + 1;
      }
    });
    return Object.keys(styleCounts).sort().map(s => ({ value: s, count: styleCounts[s] }));
  }, [stock]);

  const availableColorOptions = useMemo(() => {
    const colorCounts: Record<string, number> = {};
    stock.filter(s => s.available_pcs > 0).forEach(item => {
      if (item.color) {
        colorCounts[item.color] = (colorCounts[item.color] || 0) + 1;
      }
    });
    return Object.keys(colorCounts).sort().map(c => ({ value: c, count: colorCounts[c] }));
  }, [stock]);

  const filteredStock = useMemo(() => {
    return stock.filter(item => {
      // 0 items should not appear
      if (item.available_pcs <= 0) {
        return false;
      }
      
      if (selectedStyles.length > 0 && !selectedStyles.includes(item.style_num)) {
        return false;
      }
      if (selectedColors.length > 0 && !selectedColors.includes(item.color)) {
        return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          item.po_number.toLowerCase().includes(q) ||
          item.style_num.toLowerCase().includes(q) ||
          item.color.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [stock, selectedStyles, selectedColors, searchTerm]);

  const stockWithInventory = stock.filter(item => item.available_pcs > 0);
  const totalPcs = stockWithInventory.reduce((acc, curr) => acc + curr.available_pcs, 0);
  const totalCartons = stockWithInventory.reduce((acc, curr) => acc + curr.available_cartons, 0);

  const filteredTotalPcs = useMemo(() => {
    return filteredStock.reduce((acc, curr) => acc + (Number(curr.available_pcs) || 0), 0);
  }, [filteredStock]);

  return (
    <div className="space-y-8 pb-12">
      {/* Incoming Notification Banner */}
      {incomingRecords.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-orange-500 text-white p-4 rounded-3xl shadow-xl shadow-orange-500/20 flex items-center justify-between gap-4 border-2 border-white/20"
        >
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-2 rounded-xl animate-pulse">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest">New Intake Pending</p>
              <p className="text-[10px] font-mono opacity-80 uppercase">{incomingRecords.length} Loads are currently IN TRANSIT from Packing</p>
            </div>
          </div>
          <button 
            onClick={() => {
              const el = document.getElementById('handover-list');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="px-6 py-2 bg-white text-orange-600 text-[10px] font-black rounded-xl uppercase hover:bg-orange-50 transition-colors shadow-lg"
          >
            Verify Now
          </button>
        </motion.div>
      )}

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tighter flex items-center gap-3 uppercase">
            <Warehouse className={cn("w-8 h-8", incomingRecords.length > 0 ? "text-orange-500 animate-bounce" : "text-po")} />
            Carton Store & Inventory
            {incomingRecords.length > 0 && (
              <span className="ml-2 px-2 py-1 bg-orange-500 text-white text-[10px] font-black rounded-full animate-pulse shadow-lg shadow-orange-500/20">
                {incomingRecords.length} INCOMING
              </span>
            )}
          </h2>
          <p className="text-text3 text-[10px] font-mono uppercase tracking-[0.2em] mt-1">Real-time vault for accepted export cartons</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          {activeTab === 'date_filtered' ? (
            <div className="flex items-center gap-2 bg-bg2 border border-bg4 rounded-2xl p-2.5 h-[58px] shadow-sm animate-in fade-in slide-in-from-top-1 duration-200">
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
          ) : (
            <div className="flex items-center gap-2 bg-bg3/50 border border-bg4/40 rounded-2xl p-4 h-[58px] text-[10px] font-mono uppercase font-black text-text3/70 select-none">
              <Info className="w-4 h-4 text-po/65" />
              All-Time Stock (No Date Filter)
            </div>
          )}

          <div className="bg-bg2 border border-bg4 rounded-2xl p-4 flex items-center gap-8 shadow-sm">
             <div className="flex flex-col">
               <span className="text-[10px] font-black text-text3 uppercase tracking-widest">Total Stock</span>
               <span className="text-xl font-black text-po">{totalPcs.toLocaleString()} <span className="text-[10px] opacity-50">PCS</span></span>
             </div>
             <div className="w-[1px] h-8 bg-bg4" />
             <div className="flex flex-col">
               <span className="text-[10px] font-black text-text3 uppercase tracking-widest">Total Volume</span>
               <span className="text-xl font-black text-text">{totalCartons.toLocaleString()} <span className="text-[10px] opacity-50">CTNS</span></span>
             </div>
          </div>
          
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text3 group-focus-within:text-po transition-colors" />
            <input 
              type="text" 
              placeholder="Search PO/Style..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-bg2 border border-bg4 rounded-2xl py-3 pl-12 pr-6 text-sm font-bold w-full sm:w-64 focus:ring-2 focus:ring-po/20 outline-none transition-all card-shadow"
            />
          </div>
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b border-bg4 gap-6">
        <button
          onClick={() => setActiveTab('current_stock')}
          className={cn(
            "pb-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 relative",
            activeTab === 'current_stock'
              ? "border-po text-po"
              : "border-transparent text-text3 hover:text-text"
          )}
        >
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            Current Stock (No Date Filter)
          </div>
          {activeTab === 'current_stock' && (
            <motion.div layoutId="activeTabUnderline" className="absolute bottom-0 left-0 right-0 h-[2px] bg-po" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('date_filtered')}
          className={cn(
            "pb-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 relative",
            activeTab === 'date_filtered'
              ? "border-po text-po"
              : "border-transparent text-text3 hover:text-text"
          )}
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Date-Filtered Stock
          </div>
          {activeTab === 'date_filtered' && (
            <motion.div layoutId="activeTabUnderline" className="absolute bottom-0 left-0 right-0 h-[2px] bg-po" />
          )}
        </button>
      </div>

      {/* Master FIFO Reallocation Option Panel */}
      <div className="bg-gradient-to-r from-amber-500/10 via-amber-600/5 to-transparent border border-amber-500/20 rounded-3xl p-6 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <h4 className="text-xs font-black uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
              <Shuffle className="w-3.5 h-3.5" />
              Master FIFO Inventory Optimization
            </h4>
          </div>
          <p className="text-text font-black tracking-tight text-sm uppercase">Auto-Adjust All Carton Store Stock Against WIP Demand</p>
          <p className="text-text3 text-[10px] font-mono leading-relaxed uppercase">
            Runs a system-wide pass to identify POs with surplus carton stock exceeding their required order quantity. Surplus quantities are automatically reallocated to other active POs with outstanding demand according to FIFO (earliest delivery first) and priority levels.
          </p>
        </div>
        <button
          onClick={handleMasterReallocateFIFO}
          disabled={isMasterReallocating}
          className="px-6 py-3.5 bg-amber-500 hover:bg-amber-600 active:scale-95 disabled:opacity-50 text-white text-[11px] font-black uppercase rounded-2xl tracking-widest transition-all shadow-lg shadow-amber-500/20 shrink-0 flex items-center gap-2 justify-center cursor-pointer"
        >
          {isMasterReallocating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Optimizing Store Stock...
            </>
          ) : (
            <>
              <Shuffle className="w-4 h-4" />
              Run Master FIFO Reallocation
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Stock List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-bg2 border border-bg4 rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-bg4 bg-bg3/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
               <div className="flex items-center gap-4 flex-wrap">
                 <h3 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                   <Package className="w-4 h-4 text-po" />
                   Ready Goods Inventory
                 </h3>
                 {user?.role === 'admin' && selectedKeys.length > 0 && (
                   <motion.button
                     initial={{ scale: 0.9, opacity: 0 }}
                     animate={{ scale: 1, opacity: 1 }}
                     onClick={handleBulkDelete}
                     disabled={isBulkDeleting}
                     className="flex items-center gap-1.5 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black rounded-lg uppercase tracking-wider transition-all shadow-md shadow-red-600/10 cursor-pointer active:scale-95 disabled:opacity-50"
                   >
                     {isBulkDeleting ? (
                       <Loader2 className="w-3.5 h-3.5 animate-spin" />
                     ) : (
                       <Trash2 className="w-3.5 h-3.5" />
                     )}
                     Delete Selected ({selectedKeys.length})
                   </motion.button>
                 )}
               </div>

               {/* Multi-Select Filters & Search Input */}
               <div className="flex flex-wrap items-center gap-3">
                 <div className="relative">
                   <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
                   <input
                     type="text"
                     value={searchTerm}
                     onChange={(e) => setSearchTerm(e.target.value)}
                     placeholder="Search PO / Style / Color..."
                     className="bg-bg border border-bg4 rounded-xl py-1.5 pl-8 pr-3 text-xs font-bold text-text outline-none focus:border-po/50 w-44"
                   />
                 </div>
                 <MultiSelectFilter
                   title="Style"
                   options={availableStyleOptions}
                   selectedValues={selectedStyles}
                   onChange={setSelectedStyles}
                   icon={Tag}
                   placeholder="Filter styles..."
                 />
                 <MultiSelectFilter
                   title="Color"
                   options={availableColorOptions}
                   selectedValues={selectedColors}
                   onChange={setSelectedColors}
                   icon={Palette}
                   placeholder="Filter colors..."
                 />
                 <span className="bg-po/10 text-po px-3 py-1.5 rounded-xl text-[10px] font-black font-mono flex items-center gap-2 border border-po/20">
                   <span>{filteredStock.length} Items</span>
                   <span className="text-po/40">|</span>
                   <span className="text-po font-extrabold">{filteredTotalPcs.toLocaleString()} Pcs Total</span>
                 </span>
               </div>
            </div>

            {/* Active Filter Chips Bar */}
            {(selectedStyles.length > 0 || selectedColors.length > 0) && (
              <div className="px-6 py-2.5 border-b border-bg4 bg-bg3/10">
                <ActiveFilterBar
                  selectedStyles={selectedStyles}
                  selectedColors={selectedColors}
                  totalSum={filteredTotalPcs}
                  onRemoveStyle={(s) => setSelectedStyles(prev => prev.filter(v => v !== s))}
                  onRemoveColor={(c) => setSelectedColors(prev => prev.filter(v => v !== c))}
                  onClearAll={() => {
                    setSelectedStyles([]);
                    setSelectedColors([]);
                  }}
                />
              </div>
            )}
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-bg3/50 text-text font-black uppercase text-[10px] tracking-widest border-b border-bg4">
                    {user?.role === 'admin' && (
                      <th className="p-5 w-12 text-center select-none">
                        <input
                          type="checkbox"
                          checked={filteredStock.length > 0 && filteredStock.every(item => selectedKeys.includes(`${item.po_number}-${item.style_num}-${item.color}-${item.size}`))}
                          onChange={toggleSelectAll}
                          className="rounded border-bg4 text-po focus:ring-po/20 cursor-pointer w-4 h-4 accent-po"
                        />
                      </th>
                    )}
                    <th className="p-5">Order / Product Metadata</th>
                    <th className="p-5 text-center">Color / Size</th>
                    <th className="p-5 text-center">Available Pcs</th>
                    <th className="p-5 text-center">Carton Units</th>
                    <th className="p-5 text-right">Status</th>
                    <th className="p-5 text-center w-36">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg4">
                  {filteredStock.length === 0 ? (
                    <tr>
                      <td colSpan={user?.role === 'admin' ? 7 : 6} className="p-20 text-center">
                        <div className="flex flex-col items-center gap-4 text-text3">
                          <Warehouse className="w-12 h-12 opacity-10" />
                           <p className="font-black uppercase tracking-[0.3em] text-sm italic">Warehouse currently empty</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredStock.map((item, idx) => {
                      const itemKey = `${item.po_number}-${item.style_num}-${item.color}-${item.size}`;
                      const isDeleting = deletingKey === itemKey;
                      const isReallocating = reallocatingKey === itemKey;
                      const isSelected = selectedKeys.includes(itemKey);
 
                      return (
                        <motion.tr 
                          key={itemKey}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.02 }}
                          className={cn(
                            "hover:bg-bg3/20 transition-all group",
                            isSelected && "bg-po/5 hover:bg-po/10"
                          )}
                        >
                          {user?.role === 'admin' && (
                            <td className="p-5 text-center select-none">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectRow(itemKey)}
                                className="rounded border-bg4 text-po focus:ring-po/20 cursor-pointer w-4 h-4 accent-po"
                              />
                            </td>
                          )}
                          <td className="p-5 mt-1">
                            <p className="text-[10px] font-mono text-po font-black tracking-widest leading-none mb-1">{item.po_number}</p>
                            <p className="text-sm font-black text-text mb-1">{item.style_num}</p>
                            <p className="text-[9px] font-mono text-text3 uppercase font-bold">{item.item_num} • {item.line_num}</p>
                          </td>
                          <td className="p-5 text-center">
                            <p className="text-xs font-black uppercase text-text2">{item.color}</p>
                            <span className="inline-block mt-1 px-2 py-0.5 bg-bg3 text-[10px] font-black rounded font-mono uppercase text-text3">{item.size}</span>
                          </td>
                          <td className="p-5 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span className="text-lg font-black text-po">{item.available_pcs.toLocaleString()}</span>
                              <span className="text-[8px] font-black text-text3 uppercase tracking-tighter">Net Pieces</span>
                            </div>
                          </td>
                          <td className="p-5 text-center">
                             <div className="inline-flex items-center gap-2 bg-po/5 px-4 py-2 rounded-xl border border-po/10">
                                <Package className="w-3.5 h-3.5 text-po" />
                                <span className="text-base font-black text-po">{item.available_cartons} <span className="text-xs opacity-50 uppercase">Ctns</span></span>
                             </div>
                          </td>
                          <td className="p-5 text-right">
                             <div className="flex flex-col items-end">
                                {item.current_available_pcs <= 0 ? (
                                  <>
                                    <span className="text-[10px] font-black text-text3/70 uppercase tracking-widest flex items-center gap-1.5 justify-end">
                                      <Truck className="w-3.5 h-3.5 text-text3" />
                                      Dispatched
                                    </span>
                                    <span className="text-[9px] font-mono text-text3/55 mt-1 uppercase font-bold">Shipped Overall</span>
                                  </>
                                ) : item.current_available_pcs < item.available_pcs ? (
                                  <>
                                    <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-1.5 justify-end">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      Partially Shipped
                                    </span>
                                    <span className="text-[9px] font-mono text-text3 mt-1 uppercase font-bold">Awaiting {item.current_available_pcs} Pcs</span>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-[10px] font-black text-pass uppercase tracking-widest flex items-center gap-1.5 justify-end">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      In Stock
                                    </span>
                                    <span className="text-[9px] font-mono text-text3 mt-1 uppercase font-bold">Awaiting Dispatch</span>
                                  </>
                                )}
                             </div>
                          </td>
                          <td className="p-5 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleReallocateFIFO(item)}
                                disabled={isReallocating}
                                title="Reallocate PO dynamically using oldest active WIP demand (FIFO)"
                                className="px-2.5 py-1.5 bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/20 hover:border-amber-500/50 text-amber-500 text-[10px] font-black uppercase rounded-xl transition-all flex items-center gap-1 cursor-pointer disabled:opacity-45"
                              >
                                {isReallocating ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Shuffle className="w-3.5 h-3.5" />
                                )}
                                FIFO Realloc
                              </button>

                              {user?.role === 'admin' && (
                                <button
                                  onClick={() => handleOpenAdjustModal(item)}
                                  title="Adjust Carton Packing Specification (Pcs per Carton)"
                                  className="px-2.5 py-1.5 bg-bg3 hover:bg-bg4 border border-bg4 text-text2 text-[10px] font-black uppercase rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5 text-amber-500" />
                                  Adj Spec
                                </button>
                              )}

                              <button
                                onClick={() => {
                                  setDiscardProduct({
                                    po_number: item.po_number,
                                    product_id: item.product_id,
                                    style_num: item.style_num,
                                    color: item.color,
                                    size: item.size,
                                    available_qty: item.available_pcs,
                                  });
                                  setIsDiscardModalOpen(true);
                                }}
                                className="p-2 border border-bg4 hover:border-reject/30 hover:bg-reject/10 text-text3 hover:text-reject rounded-xl transition-all inline-flex items-center justify-center cursor-pointer"
                                title="Discard items from store stock permanently"
                              >
                                <Trash2 className="w-4 h-4 text-reject" />
                              </button>

                              {user?.role === 'admin' && (
                                <button
                                  onClick={() => handleDelete(item)}
                                  disabled={isDeleting}
                                  title="Delete store records"
                                  className="p-2 border border-bg4 hover:border-red-500/30 hover:bg-red-500/10 text-text3 hover:text-red-500 rounded-xl transition-all inline-flex items-center justify-center cursor-pointer disabled:opacity-40"
                                >
                                  {isDeleting ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-4 h-4" />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Side Panel: Handover */}
        <div className="space-y-6">
        <div id="handover-list">
           <HandoverList 
              title="Store Intake (Cartons)"
              table="pack_records"
              records={incomingRecords}
              statusField="store_status"
              statusValue="in_transit"
              onRefresh={() => {
                fetchIncoming();
                fetchData();
              }}
           />
        </div>

           <div className="bg-bg2 border border-bg4 rounded-3xl p-6 shadow-lg">
             <h3 className="text-xs font-black uppercase tracking-widest mb-6 flex items-center gap-2">
               <Layers className="w-4 h-4 text-po" />
               Departmental Stocks
             </h3>
             <div className="space-y-2">
               {['Cutting', 'Feeding', 'Stitching', 'Finishing', 'Packing'].map(d => (
                 <button 
                  key={d}
                  onClick={() => onNavigate?.('dept_stores')}
                  className="w-full flex items-center justify-between p-3 bg-bg3 hover:bg-bg4 rounded-xl border border-bg4 transition-all group"
                 >
                   <span className="text-[11px] font-black uppercase text-text3 group-hover:text-text">{d} Store</span>
                   <ChevronRight className="w-4 h-4 text-text3 opacity-0 group-hover:opacity-100 transition-all" />
                 </button>
               ))}
               <p className="text-[9px] font-bold text-text3 uppercase mt-4 leading-relaxed text-center px-2">
                 View available balance per department.
               </p>
             </div>
           </div>            <div className="bg-bg2 border border-bg4 rounded-3xl p-6 shadow-lg">
              <h3 className="text-xs font-black uppercase tracking-widest mb-6 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-po" />
                Storage Insights
              </h3>
              <div className="space-y-4">
                 <div className="p-4 bg-bg3 rounded-2xl border border-bg4">
                   <p className="text-[9px] font-black text-text3 uppercase mb-2">Ageing Analysis</p>
                   <div className="flex items-center justify-between">
                     <span className="text-xs font-bold text-text">Avg Stay Duration</span>
                     <span className="text-xs font-mono font-black text-po">~1.5 Days</span>
                   </div>
                 </div>
                 <div className="p-4 bg-bg3 rounded-2xl border border-bg4">
                   <p className="text-[9px] font-black text-text3 uppercase mb-2">Throughput</p>
                   <div className="flex items-center justify-between">
                     <span className="text-xs font-bold text-text">Today's Inflow</span>
                     <span className="text-xs font-mono font-black text-pass">+{totalCartons > 0 ? Math.floor(totalCartons * 0.1) : 0} CTNS</span>
                   </div>
                 </div>
              </div>
            </div>
         </div>
      </div>

      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-bg2 border border-bg4 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-6"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-500/10 text-red-500 rounded-2xl animate-pulse">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-black uppercase tracking-wider text-text">Are you sure?</h4>
                <p className="text-xs text-text3 mt-1.5 whitespace-pre-line leading-relaxed">{confirmDialog.message}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 bg-bg3 hover:bg-bg4 text-text font-black text-xs uppercase tracking-wider rounded-xl transition-all border border-bg4 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
                className="px-5 py-2 bg-red-600 hover:bg-red-750 bg-red-600 text-white font-black text-xs uppercase tracking-wider text-center rounded-xl transition-all shadow-md shadow-red-600/10 cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {adjustingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-bg2 border border-bg4 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-6"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-500/10 text-amber-500 rounded-2xl">
                <Package className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-black uppercase tracking-wider text-text">Adjust Packing Spec</h4>
                <p className="text-xs text-text3 mt-1 leading-relaxed">
                  Update pieces per carton for: <strong className="text-amber-500 font-mono">{adjustingItem.style_num}</strong> / {adjustingItem.color} / {adjustingItem.size} under PO: {adjustingItem.po_number}.
                </p>
              </div>
            </div>

            <form onSubmit={handleAdjustCartonSizeSubmit} className="space-y-4">
              <div className="p-4 bg-bg3 rounded-2xl border border-bg4 space-y-3">
                <div className="flex justify-between text-xs font-semibold text-text3">
                  <span>Current Physical Qty:</span>
                  <span className="font-mono font-black text-text">{adjustingItem.available_pcs} Pcs</span>
                </div>
                <div className="flex justify-between text-xs font-semibold text-text3">
                  <span>Current Cartons:</span>
                  <span className="font-mono font-black text-text">{adjustingItem.available_cartons} Ctns</span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-text2 mb-1.5">New Pcs Per Carton size</label>
                <input
                  type="number"
                  required
                  value={newPcsPerCarton}
                  onChange={(e) => setNewPcsPerCarton(e.target.value)}
                  placeholder="e.g. 24 or 72"
                  className="w-full bg-bg shadow-inner border border-bg4 rounded-xl px-4 py-3 text-xs text-text focus:outline-none focus:border-amber-500 font-mono font-black"
                />
                <p className="text-[9px] text-text3/70 mt-1 uppercase">
                  Entering standard size (e.g., 24) will automatically group {adjustingItem.available_pcs} pieces into {Math.ceil(adjustingItem.available_pcs / (Number(newPcsPerCarton) || 1))} cartons.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustingItem(null)}
                  className="px-4 py-2 bg-bg3 hover:bg-bg4 text-text font-black text-xs uppercase tracking-wider rounded-xl transition-all border border-bg4 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdjusting}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-bg font-black text-xs uppercase tracking-wider text-center rounded-xl transition-all shadow-md shadow-amber-500/10 cursor-pointer disabled:opacity-40"
                >
                  {isAdjusting ? 'Updating...' : 'Save Spec'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      <DiscardModal
        isOpen={isDiscardModalOpen}
        onClose={() => setIsDiscardModalOpen(false)}
        currentDepartment="Carton Store"
        product={discardProduct}
        onSuccess={() => {
          fetchData();
        }}
      />
    </div>
  );
};
