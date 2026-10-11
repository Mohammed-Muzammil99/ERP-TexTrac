import React, { useState, useEffect, useMemo } from 'react';
import { returnService, poService, cuttingService } from '../services/erpService';
import { ReturnRecord, ProductionOrder, POProduct, Department } from '../types';
import { 
  RotateCcw, 
  Plus, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  FileText, 
  User, 
  Building2,
  Calendar,
  ChevronRight,
  ClipboardList,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { cn, fmtDate } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { ConfirmModal } from '../components/ConfirmModal';

const DEPARTMENTS: Department[] = ['Cutting', 'Stitching', 'Finishing', 'Packing', 'Shipping', 'Quality'];

export const ReturnsPage: React.FC = () => {
  const [allPOs, setAllPOs] = useState<ProductionOrder[]>([]);
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  
  // Create Return Form State
  const [selectedPO, setSelectedPO] = useState('');
  const [poSearch, setPoSearch] = useState('');
  const [products, setProducts] = useState<POProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number | ''>('');
  const [fromDept, setFromDept] = useState<Department | ''>('');
  const [toDept, setToDept] = useState<Department | ''>('');
  const [quantity, setQuantity] = useState<number>(0);
  const [reason, setReason] = useState('');
  
  // Filters
  const [filterPO, setFilterPO] = useState<string>('All');
  const [filterFrom, setFilterFrom] = useState<string>('All');
  const [filterTo, setFilterTo] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchReturns();
    fetchPOs();
  }, []);

  const fetchPOs = async () => {
    try {
      const data = await poService.list();
      setAllPOs(data);
    } catch (error) {
      console.error('Failed to fetch POs:', error);
    }
  };

  const fetchReturns = async () => {
    setIsLoading(true);
    try {
      const data = await returnService.list();
      setReturns(data);
    } catch (error) {
      console.error('Failed to fetch returns:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePOSelect = async (poNum: string) => {
    setSelectedPO(poNum);
    setPoSearch(poNum);
    
    try {
      const data = await cuttingService.getPOProducts(poNum);
      setProducts(data.products);
    } catch (error) {
      console.error('Failed to fetch products for PO:', error);
      setProducts([]);
    }
  };

  const filteredPOs = useMemo(() => {
    if (!poSearch) return [];
    return allPOs.filter(po => 
      po.po_number.toLowerCase().includes(poSearch.toLowerCase()) ||
      (po.buyer && po.buyer.toLowerCase().includes(poSearch.toLowerCase()))
    ).slice(0, 5); // Limit for UI
  }, [allPOs, poSearch]);

  // Confirm Modal State
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    confirmText?: string;
    type?: 'success' | 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: null,
    onConfirm: () => {},
  });

  const handleSubmitReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPO || !selectedProductId || !fromDept || !toDept || quantity <= 0) {
      alert('Please fill all required fields');
      return;
    }

    const selectedProduct = products.find(p => p.id === Number(selectedProductId));

    setConfirmModalConfig({
      isOpen: true,
      title: 'Confirm Return Request',
      type: 'warning',
      confirmText: 'Submit Return Request',
      message: (
        <div className="space-y-2">
          <p>Are you sure you want to submit this return request?</p>
          <div className="p-3 bg-bg3/60 rounded-xl border border-bg4 space-y-1 text-xs font-mono">
            <div><strong>PO #:</strong> {selectedPO}</div>
            {selectedProduct && <div><strong>Product:</strong> Style {selectedProduct.style_num} ({selectedProduct.color} / {selectedProduct.size})</div>}
            <div><strong>Route:</strong> {fromDept} &rarr; {toDept}</div>
            <div><strong>Quantity:</strong> <span className="text-po font-black">{quantity} pcs</span></div>
            {reason && <div><strong>Reason:</strong> {reason}</div>}
          </div>
        </div>
      ),
      onConfirm: async () => {
        setConfirmModalConfig(prev => ({ ...prev, isOpen: false }));
        setIsLoading(true);
        try {
          await returnService.create({
            po_number: selectedPO,
            product_id: Number(selectedProductId),
            from_department: fromDept as Department,
            to_department: toDept as Department,
            quantity,
            reason
          });
          setShowAddModal(false);
          resetForm();
          fetchReturns();
          alert('Return request created successfully');
        } catch (error: any) {
          alert(error.message || 'Failed to create return request');
        } finally {
          setIsLoading(false);
        }
      }
    });
  };

  const handleUpdateStatus = (id: number, status: 'accepted' | 'rejected') => {
    const targetReturn = returns.find(r => r.id === id);

    setConfirmModalConfig({
      isOpen: true,
      title: `Confirm Return ${status.toUpperCase()}`,
      type: status === 'accepted' ? 'success' : 'danger',
      confirmText: `Confirm ${status.toUpperCase()}`,
      message: (
        <div className="space-y-2">
          <p>Are you sure you want to <strong>{status}</strong> this return record?</p>
          {targetReturn && (
            <div className="p-3 bg-bg3/60 rounded-xl border border-bg4 space-y-1 text-xs font-mono">
              <div><strong>PO #:</strong> {targetReturn.po_number}</div>
              <div><strong>Style/Color:</strong> {targetReturn.style_num} ({targetReturn.color})</div>
              <div><strong>Route:</strong> {targetReturn.from_department} &rarr; {targetReturn.to_department}</div>
              <div><strong>Quantity:</strong> <span className="font-bold">{targetReturn.quantity} pcs</span></div>
            </div>
          )}
        </div>
      ),
      onConfirm: async () => {
        setConfirmModalConfig(prev => ({ ...prev, isOpen: false }));
        setIsLoading(true);
        try {
          await returnService.updateStatus(id, status);
          fetchReturns();
        } catch (error: any) {
          alert(error.message || `Failed to ${status} return`);
        } finally {
          setIsLoading(false);
        }
      }
    });
  };

  const resetForm = () => {
    setSelectedPO('');
    setPoSearch('');
    setProducts([]);
    setSelectedProductId('');
    setFromDept('');
    setToDept('');
    setQuantity(0);
    setReason('');
  };

  const uniquePOs = useMemo(() => {
    const pos = new Set(returns.map(r => r.po_number));
    return Array.from(pos).sort();
  }, [returns]);

  const filteredReturns = useMemo(() => {
    return returns.filter(ret => {
      const matchesSearch = searchTerm === '' || 
        ret.po_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ret.style_num.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ret.reason?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesPO = filterPO === 'All' || ret.po_number === filterPO;
      const matchesFrom = filterFrom === 'All' || ret.from_department === filterFrom;
      const matchesTo = filterTo === 'All' || ret.to_department === filterTo;
      const matchesStatus = filterStatus === 'All' || ret.status === filterStatus;
      
      return matchesSearch && matchesPO && matchesFrom && matchesTo && matchesStatus;
    });
  }, [returns, searchTerm, filterPO, filterFrom, filterTo, filterStatus]);

  const stats = useMemo(() => {
    return {
      total: returns.length,
      pending: returns.filter(r => r.status === 'pending').length,
      accepted: returns.filter(r => r.status === 'accepted').length,
      rejected: returns.filter(r => r.status === 'rejected').length,
      totalQty: returns.reduce((acc, curr) => acc + curr.quantity, 0)
    };
  }, [returns]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header section with Stats */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-black tracking-tight text-text">Return Management</h2>
          <p className="text-text3 text-xs font-mono uppercase tracking-[0.2em]">Inter-departmental material reversals</p>
        </div>
        
        <div className="flex flex-wrap gap-4">
          <button 
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-po text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-po/20 hover:scale-105 transition-all"
          >
            <Plus className="w-5 h-5" /> Initiate Return
          </button>
          <button 
            onClick={fetchReturns}
            className="p-3 bg-bg2 border border-bg4 rounded-xl text-text2 hover:text-text transition-colors"
          >
            <RefreshCw className={cn("w-5 h-5", isLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-bg2 border border-bg4 p-5 rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black text-text3 uppercase font-mono tracking-widest">Active Requests</span>
            <div className="p-2 bg-po/10 rounded-lg text-po"><Clock className="w-4 h-4" /></div>
          </div>
          <div className="text-2xl font-black text-text">{stats.pending}</div>
          <div className="text-[9px] text-text3 font-bold mt-1 uppercase">Awaiting verification</div>
        </div>
        <div className="bg-bg2 border border-bg4 p-5 rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black text-text3 uppercase font-mono tracking-widest">Total Resolved</span>
            <div className="p-2 bg-pass/10 rounded-lg text-pass"><CheckCircle2 className="w-4 h-4" /></div>
          </div>
          <div className="text-2xl font-black text-text">{stats.accepted}</div>
          <div className="text-[9px] text-text3 font-bold mt-1 uppercase">Completed transfers</div>
        </div>
        <div className="bg-bg2 border border-bg4 p-5 rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black text-text3 uppercase font-mono tracking-widest">Denied Entry</span>
            <div className="p-2 bg-reject/10 rounded-lg text-reject"><XCircle className="w-4 h-4" /></div>
          </div>
          <div className="text-2xl font-black text-text">{stats.rejected}</div>
          <div className="text-[9px] text-text3 font-bold mt-1 uppercase">Disputed returns</div>
        </div>
        <div className="bg-bg2 border border-bg4 p-5 rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black text-text3 uppercase font-mono tracking-widest">Volume Reversal</span>
            <div className="p-2 bg-text/10 rounded-lg text-text"><ClipboardList className="w-4 h-4" /></div>
          </div>
          <div className="text-2xl font-black text-text">{stats.totalQty.toLocaleString()}</div>
          <div className="text-[9px] text-text3 font-bold mt-1 uppercase">Total units returned</div>
        </div>
      </div>

      {/* Filters and Table */}
      <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-6 border-b border-bg4 bg-bg3/30">
          <div className="flex flex-col lg:flex-row gap-6 lg:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text3" />
              <input 
                type="text" 
                placeholder="SEARCH BY PO, STYLE, OR REASON..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-bg3 border border-bg4 rounded-xl py-3 pl-12 pr-4 text-xs font-black focus:ring-1 focus:ring-po/20 outline-none transition-all"
              />
            </div>
            
            <div className="flex flex-wrap gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono font-black text-text3 uppercase px-1">Filter PO</label>
                <select 
                  value={filterPO}
                  onChange={(e) => setFilterPO(e.target.value)}
                  className="bg-bg3 border border-bg4 rounded-lg px-3 py-2 text-xs font-bold outline-none min-w-[120px]"
                >
                  <option value="All">All POs</option>
                  {uniquePOs.map(po => <option key={po} value={po}>{po}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono font-black text-text3 uppercase px-1">From Dept</label>
                <select 
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value)}
                  className="bg-bg3 border border-bg4 rounded-lg px-3 py-2 text-xs font-bold outline-none"
                >
                  <option value="All">All Origins</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono font-black text-text3 uppercase px-1">To Dept</label>
                <select 
                  value={filterTo}
                  onChange={(e) => setFilterTo(e.target.value)}
                  className="bg-bg3 border border-bg4 rounded-lg px-3 py-2 text-xs font-bold outline-none"
                >
                  <option value="All">All Dest.</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono font-black text-text3 uppercase px-1">Status</label>
                <select 
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-bg3 border border-bg4 rounded-lg px-3 py-2 text-xs font-bold outline-none"
                >
                  <option value="All">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-bg3/50 border-b border-bg4">
                <th className="p-4 text-left text-[10px] font-mono uppercase font-black text-text3">Entity Detail</th>
                <th className="p-4 text-left text-[10px] font-mono uppercase font-black text-text3">Transfer Path</th>
                <th className="p-4 text-center text-[10px] font-mono uppercase font-black text-text3">Quantity</th>
                <th className="p-4 text-left text-[10px] font-mono uppercase font-black text-text3">Reason / Context</th>
                <th className="p-4 text-center text-[10px] font-mono uppercase font-black text-text3">Status</th>
                <th className="p-4 text-right text-[10px] font-mono uppercase font-black text-text3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bg4">
              {filteredReturns.length > 0 ? (
                filteredReturns.map((ret) => (
                  <tr key={ret.id} className="hover:bg-bg3/20 transition-colors group">
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-po">{ret.po_number}</span>
                        <span className="text-sm font-black text-text tracking-tight mt-0.5">{ret.style_num}</span>
                        <span className="text-[10px] font-mono text-text3 uppercase mt-0.5">{ret.color} / {ret.size}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] font-black text-text uppercase">{ret.from_department}</span>
                        </div>
                        <ChevronRight className="w-3 h-3 text-text3" />
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] font-black text-po uppercase">{ret.to_department}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <User className="w-3 h-3 text-text3" />
                        <span className="text-[9px] font-mono font-bold text-text2 uppercase">{ret.creator_name || 'System'}</span>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <span className="text-sm font-black text-po bg-po/5 px-3 py-1 rounded-lg border border-po/10">
                        {ret.quantity}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="max-w-xs">
                        <p className="text-xs font-bold text-text leading-snug">{ret.reason || 'No reason provided'}</p>
                        <div className="flex items-center gap-2 mt-2 text-[9px] font-mono text-text3 font-bold uppercase">
                          <Calendar className="w-3 h-3" />
                          {fmtDate(ret.created_at)}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <span className={cn(
                        "text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border",
                        ret.status === 'pending' ? "bg-orange-500/10 text-orange-500 border-orange-500/20" :
                        ret.status === 'accepted' ? "bg-pass/10 text-pass border-pass/20" :
                        "bg-reject/10 text-reject border-reject/20"
                      )}>
                        {ret.status}
                      </span>
                      {ret.status !== 'pending' && (
                        <div className="mt-2 flex flex-col items-center gap-1">
                           <span className="text-[8px] font-mono text-text3 uppercase">BY {ret.receiver_name}</span>
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      {ret.status === 'pending' ? (
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => handleUpdateStatus(ret.id, 'accepted')}
                            disabled={isLoading}
                            className="p-2 bg-pass/10 text-pass hover:bg-pass hover:text-white rounded-lg border border-pass/20 transition-all"
                            title="Accept Return"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleUpdateStatus(ret.id, 'rejected')}
                            disabled={isLoading}
                            className="p-2 bg-reject/10 text-reject hover:bg-reject hover:text-white rounded-lg border border-reject/20 transition-all"
                            title="Reject Return"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-text3 italic text-[10px] font-mono">RESOLVED</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-12 text-center">
                    <div className="flex flex-col items-center justify-center space-y-4">
                      <div className="w-16 h-16 bg-bg3 rounded-full flex items-center justify-center text-text3">
                         <RotateCcw className="w-8 h-8 opacity-20" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-black text-text3 uppercase tracking-widest">No Returns Found</p>
                        <p className="text-[10px] text-text3 font-mono">ADJUST FILTERS OR INITIATE NEW MANIFEST</p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Initiation Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-xl bg-bg2 border border-bg4 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-bg4 bg-bg/50">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black tracking-tight text-text">INITIATE RETURN FLOW</h3>
                    <p className="text-[10px] text-text3 font-mono uppercase tracking-widest mt-1">Cross-department material reversal engine</p>
                  </div>
                  <button 
                    onClick={() => setShowAddModal(false)}
                    className="p-2 hover:bg-bg3 rounded-xl transition-colors text-text3"
                  >
                    <XCircle className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmitReturn} className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2 relative">
                    <label className="text-[10px] font-black text-text3 uppercase font-mono px-1">PO Number*</label>
                    <div className="relative group">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text3" />
                      <input 
                        type="text"
                        required
                        placeholder="SEARCH OR TYPE PO..."
                        value={poSearch}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase();
                          setPoSearch(val);
                          
                          // Auto-select if exact match found
                          const exactMatch = allPOs.find(p => p.po_number.toUpperCase() === val);
                          if (exactMatch) {
                            handlePOSelect(exactMatch.po_number);
                          } else if (selectedPO) {
                            setSelectedPO('');
                            setProducts([]);
                          }
                        }}
                        className="w-full bg-bg3 border border-bg4 rounded-xl py-3 pl-10 pr-4 text-xs font-black focus:ring-1 focus:ring-po/20 outline-none transition-all placeholder:text-text3/50"
                      />
                    </div>
                    
                    {/* PO Suggestions */}
                    {poSearch && !selectedPO && filteredPOs.length > 0 && (
                      <div className="absolute z-50 left-0 right-0 top-full mt-2 bg-bg2 border border-bg4 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-top-2 duration-200">
                        {filteredPOs.map((po, idx) => (
                          <button
                            key={`${po.po_number}-${po.buyer || idx}`}
                            type="button"
                            onClick={() => handlePOSelect(po.po_number)}
                            className="w-full flex items-center justify-between p-3 hover:bg-bg3 text-left transition-colors border-b border-bg4 last:border-0"
                          >
                            <div className="flex flex-col">
                              <span className="text-xs font-black text-text">{po.po_number}</span>
                              <span className="text-[9px] font-mono text-text3 uppercase">{po.buyer || 'No Buyer'}</span>
                            </div>
                            <Plus className="w-3 h-3 text-po opacity-0 group-hover:opacity-100" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-text3 uppercase font-mono px-1">Style / Product*</label>
                    <select
                      required
                      value={selectedProductId}
                      onChange={(e) => setSelectedProductId(Number(e.target.value))}
                      disabled={!products.length}
                      className="w-full bg-bg3 border border-bg4 rounded-xl py-3 px-4 text-xs font-black focus:ring-1 focus:ring-po/20 outline-none transition-all appearance-none disabled:opacity-50"
                    >
                      <option value="">{products.length ? 'SELECT PRODUCT' : 'SELECT PO FIRST'}</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.style_num} - {p.color} - {p.size}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-text3 uppercase font-mono px-1">From Department*</label>
                    <select
                      required
                      value={fromDept}
                      onChange={(e) => {
                        const val = e.target.value as Department;
                        setFromDept(val);
                        const promptMap: Record<string, string> = {
                          'Packing': 'Finishing',
                          'Finishing': 'Stitching',
                          'Stitching': 'Feeding',
                          'Feeding': 'Cutting'
                        };
                        setToDept(promptMap[val] || '');
                      }}
                      className="w-full bg-bg3 border border-bg4 rounded-xl py-3 px-4 text-xs font-black focus:ring-1 focus:ring-po/20 outline-none transition-all appearance-none"
                    >
                      <option value="">SELECT ORIGIN</option>
                      {['Cutting', 'Feeding', 'Stitching', 'Finishing', 'Packing'].map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-text3 uppercase font-mono px-1">To Department*</label>
                    <select
                      required
                      value={toDept}
                      onChange={(e) => setToDept(e.target.value as Department)}
                      disabled={true}
                      className="w-full bg-bg3 border border-bg4 rounded-xl py-3 px-4 text-xs font-black focus:ring-1 focus:ring-po/20 outline-none transition-all appearance-none disabled:opacity-75 cursor-not-allowed"
                    >
                      {toDept ? (
                        <option value={toDept}>{toDept} (Immediate Previous)</option>
                      ) : (
                        <option value="">N/A</option>
                      )}
                    </select>
                    {toDept && (
                      <p className="text-[10px] text-text3/70 px-1 italic">
                        Return is locked to the immediate previous department.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-text3 uppercase font-mono px-1">Return Quantity*</label>
                    <input 
                      type="number"
                      required
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      placeholder="0"
                      className="w-full bg-bg3 border border-bg4 rounded-xl py-3 px-4 text-xs font-black focus:ring-1 focus:ring-po/20 outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <label className="text-[10px] font-black text-text3 uppercase font-mono px-1">Reason / Context*</label>
                    <textarea 
                      required
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="DESCRIBE THE ISSUE (QC REJECTION, BUNDLE SHORTAGE, ETC)..."
                      className="w-full bg-bg3 border border-bg4 rounded-xl py-3 px-4 text-xs font-black focus:ring-1 focus:ring-po/20 outline-none transition-all resize-none placeholder:text-text3/50"
                    />
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-6 py-4 rounded-xl border border-bg4 text-xs font-black uppercase text-text3 hover:bg-bg3 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 bg-po text-white px-6 py-4 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-po/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    {isLoading ? 'Processing...' : 'CONFIRM RETURN'}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={confirmModalConfig.isOpen}
        title={confirmModalConfig.title}
        message={confirmModalConfig.message}
        type={confirmModalConfig.type}
        confirmText={confirmModalConfig.confirmText}
        isLoading={isLoading}
        onConfirm={confirmModalConfig.onConfirm}
        onCancel={() => setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
