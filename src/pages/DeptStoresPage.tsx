import React, { useState, useEffect } from 'react';
import { statusService, storeService } from '../services/erpService';
import { StockStoreTable } from '../components/reports/StockStoreTable';
import { UnallocatedHoldingPool } from '../components/UnallocatedHoldingPool';
import { ProductMasterSearch } from '../components/ProductMasterSearch';
import { Layers, Scissors, Send, Activity, CheckCircle2, Package, HelpCircle, Calendar, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';

export const DeptStoresPage: React.FC = () => {
    const { user } = useAuth();
    const [viewMode, setViewMode] = useState<'current_stock' | 'date_filtered'>('current_stock');
    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });
    const [detailedStatus, setDetailedStatus] = useState<any[]>([]);
    const [unallocated, setUnallocated] = useState<any[]>([]);
    const [activeDept, setActiveDept] = useState<'cutting' | 'feeding' | 'stitching' | 'finishing' | 'packing' | 'unallocated'>('cutting');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (user?.role === 'viewer' && activeDept === 'unallocated') {
            setActiveDept('cutting');
        }
    }, [user, activeDept]);

    const fetchData = async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            const startDate = viewMode === 'date_filtered' ? dateRange.start : undefined;
            const endDate = viewMode === 'date_filtered' ? dateRange.end : undefined;
            const [data, unallocatedRes] = await Promise.all([
                statusService.getDetailedStatus(undefined, startDate, endDate),
                storeService.getUnallocated()
            ]);
            setDetailedStatus(data);
            setUnallocated(unallocatedRes.unallocated || []);
        } catch (err) {
            console.error('Failed to fetch store stocks', err);
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [dateRange, viewMode]);

    const depts = [
        { id: 'cutting', label: 'Cutting Store', icon: Scissors, color: 'text-cut', bg: 'bg-cut/5 border-cut/10' },
        { id: 'feeding', label: 'Feeding Store', icon: Send, color: 'text-send', bg: 'bg-send/5 border-send/10' },
        { id: 'stitching', label: 'Stitching Store', icon: Activity, color: 'text-stitch', bg: 'bg-stitch/5 border-stitch/10' },
        { id: 'finishing', label: 'Finishing Store', icon: CheckCircle2, color: 'text-pass', bg: 'bg-pass/5 border-pass/10' },
        { id: 'packing', label: 'Packing Store', icon: Package, color: 'text-po', bg: 'bg-po/5 border-po/10' },
        { id: 'unallocated', label: 'Holding Pool', icon: HelpCircle, color: 'text-amber-500', bg: 'bg-amber-500/5 border-amber-500/10' },
    ] as const;

    const visibleDepts = depts.filter(d => {
        if (d.id === 'unallocated' && user?.role === 'viewer') {
            return false;
        }
        return true;
    });

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <div className="w-12 h-12 border-4 border-bg4 border-t-po rounded-full animate-spin" />
                <div className="text-text3 font-black uppercase tracking-[0.3em] text-xs">Loading Department Stocks...</div>
            </div>
        );
    }

    return (
        <div className="space-y-10 pb-24">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-po/10 flex items-center justify-center text-po">
                            <Layers className="w-7 h-7" />
                        </div>
                        <h2 className="text-3xl font-black uppercase tracking-tighter">Dept Stores</h2>
                    </div>
                    <p className="text-text3 text-[11px] font-bold uppercase tracking-[0.2em] ml-1">Live visibility of input-output balance per department</p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex flex-col items-start gap-1">
                        <span className="text-[10px] font-black text-text3 uppercase tracking-widest font-mono">Stock Calculation Mode</span>
                        <div className="flex items-center gap-1.5 bg-bg3 p-1.5 rounded-2xl border border-bg4 shadow-inner">
                            <button
                                onClick={() => setViewMode('current_stock')}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer",
                                    viewMode === 'current_stock'
                                        ? "bg-po text-white shadow-md"
                                        : "text-text3 hover:text-text bg-transparent"
                                )}
                            >
                                <Package className="w-3.5 h-3.5" />
                                <span>Current Stock (No Date Filter)</span>
                            </button>
                            <button
                                onClick={() => setViewMode('date_filtered')}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer",
                                    viewMode === 'date_filtered'
                                        ? "bg-po text-white shadow-md"
                                        : "text-text3 hover:text-text bg-transparent"
                                )}
                            >
                                <Calendar className="w-3.5 h-3.5" />
                                <span>Date Range Filter</span>
                            </button>
                        </div>
                    </div>

                    {viewMode === 'date_filtered' && (
                        <motion.div 
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex flex-col items-start gap-1"
                        >
                            <span className="text-[10px] font-black text-text3 uppercase tracking-widest font-mono">Select Range</span>
                            <div className="flex items-center gap-2 bg-bg3 p-2 rounded-2xl border border-bg4 shadow-inner">
                                <input 
                                    type="date" 
                                    value={dateRange.start} 
                                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))} 
                                    className="bg-transparent text-xs font-black outline-none px-2 text-text cursor-pointer" 
                                />
                                <span className="text-[10px] font-black text-text3 uppercase tracking-widest">To</span>
                                <input 
                                    type="date" 
                                    value={dateRange.end} 
                                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))} 
                                    className="bg-transparent text-xs font-black outline-none px-2 text-text cursor-pointer" 
                                />
                            </div>
                        </motion.div>
                    )}

                    <div className="flex flex-col items-end hidden lg:flex">
                        <span className="text-[10px] font-black text-text3 uppercase tracking-widest mb-1 font-mono">Monitored Stores</span>
                        <span className="px-4 py-1 bg-bg3 border border-bg4 rounded-lg font-black text-xs uppercase tracking-tighter">
                            {visibleDepts.length} Active Departments
                        </span>
                    </div>
                </div>
            </header>

            <ProductMasterSearch allocatedData={detailedStatus} unallocatedData={unallocated} />

            <nav className={cn(
                "grid grid-cols-2 md:grid-cols-3 gap-4",
                visibleDepts.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-6"
            )}>
                {visibleDepts.map((d) => (
                    <button
                        key={d.id}
                        onClick={() => setActiveDept(d.id)}
                        className={cn(
                            "group relative px-6 py-6 rounded-3xl font-black uppercase text-xs tracking-widest transition-all flex flex-col items-center gap-4 border shadow-sm",
                            activeDept === d.id 
                                ? cn("bg-bg shadow-xl scale-105 z-10 border-bg4 ring-4 ring-bg3", d.color) 
                                : "bg-bg2 border-bg4 text-text3 hover:bg-bg3 hover:text-text hover:border-bg4"
                        )}
                    >
                        <div className={cn(
                            "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
                            activeDept === d.id ? d.bg : "bg-bg4/30 group-hover:bg-bg3"
                        )}>
                            <d.icon className={cn("w-6 h-6", activeDept === d.id ? "scale-110" : "opacity-40")} />
                        </div>
                        <span className="text-center leading-tight">{d.label}</span>
                        {activeDept === d.id && (
                            <motion.div 
                                layoutId="active-pill"
                                className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-1.5 bg-current rounded-full" 
                            />
                        )}
                    </button>
                ))}
            </nav>

            <AnimatePresence mode="wait">
                <motion.div
                    key={activeDept}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                >
                    {activeDept === 'unallocated' ? (
                        <UnallocatedHoldingPool onRefreshParent={() => fetchData(true)} />
                    ) : (
                        <StockStoreTable 
                            data={detailedStatus} 
                            dept={activeDept} 
                            title={viewMode === 'current_stock' 
                                ? `Live ${activeDept.toUpperCase()} Inventory Management (Current Stock)`
                                : `Live ${activeDept.toUpperCase()} Inventory Management (${dateRange.start} to ${dateRange.end})`
                            } 
                            onRefresh={() => fetchData(true)}
                        />
                    )}
                </motion.div>
            </AnimatePresence>

            <footer className="p-8 bg-bg2 border border-bg4 rounded-[2.5rem] mt-12">
                <div className="flex flex-col md:flex-row items-center gap-8 text-center md:text-left">
                    <div className="w-16 h-16 rounded-3xl bg-bg3 flex items-center justify-center text-text3">
                         <div className="w-8 h-8 rounded-full border-2 border-current border-t-transparent animate-spin opacity-20" />
                    </div>
                    <div>
                        <h4 className="font-black uppercase text-sm tracking-tight mb-2">Automated Inventory Logic</h4>
                        <p className="text-xs text-text3 max-w-2xl leading-relaxed">
                            Departmental stock levels are calculated based on <span className="font-bold text-text">Accepted Quantity</span> from the previous department minus the 
                            <span className="font-bold text-text"> Total Dispatched</span> (including rejects) from the current department.
                            Rejected loads are automatically deducted from available balance to prevent over-dispatching.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
};
