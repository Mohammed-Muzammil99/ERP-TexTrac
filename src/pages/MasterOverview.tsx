import React, { useEffect, useState, useMemo } from 'react';
import { 
  Scissors, 
  Send, 
  Activity, 
  CheckCircle2, 
  Package, 
  Truck,
  Download,
  Search,
  Building2,
  Layers,
  Monitor,
  TrendingUp,
  AlertCircle,
  Warehouse,
  Droplets,
  MapPin
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

// Import Departmental Reports
import { CuttingReport } from '../components/reports/CuttingReport';
import { FeedingReport } from '../components/reports/FeedingReport';
import { StitchingReport } from '../components/reports/StitchingReport';
import { FinishingReport } from '../components/reports/FinishingReport';
import { PackingReport } from '../components/reports/PackingReport';
import { ShippingReport } from '../components/reports/ShippingReport';
import { WIPReport } from '../components/reports/WIPReport';
import { StockStoreTable } from '../components/reports/StockStoreTable';
import { FabricReport } from '../components/reports/FabricReport';
import { ItemDeptReport } from '../components/reports/ItemDeptReport';
import { FabricRequirementStockReportTable } from '../components/FabricRequirementStockReportTable';
import { statusService, fabricService, cuttingService } from '../services/erpService';

type ViewTab = 'master' | 'item_dept' | 'factory_status' | 'wip' | 'dept_stores' | 'fabric' | 'fabric_stock_report' | 'cutting' | 'feeding' | 'stitching' | 'finishing' | 'packing' | 'shipping';

interface WIPRow {
  po_number: string;
  due_date: string;
  style_num: string;
  color: string;
  sizes: { [key: string]: number };
  total_wip: number;
}

export const MasterOverview: React.FC = () => {
  const [poStatus, setPOStatus] = useState<any[]>([]);
  const [detailedStatus, setDetailedStatus] = useState<any[]>([]);
  const [stitchingLines, setStitchingLines] = useState<any[]>([]);
  const [fabricRecords, setFabricRecords] = useState<any[]>([]);
  const [allCuttingPrograms, setAllCuttingPrograms] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBuyer, setFilterBuyer] = useState<'All' | string>('All');
  const [activeTab, setActiveTab] = useState<ViewTab>('master');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [status, sum, detailed, lines, fabrics, programs] = await Promise.all([
        statusService.getPOStatus(),
        statusService.getSummary(),
        statusService.getDetailedStatus(),
        statusService.getStitchingLines(),
        fabricService.list().catch(() => []),
        cuttingService.getAllCuttingPrograms().catch(() => [])
      ]);
      setPOStatus(status);
      setSummary(sum);
      setDetailedStatus(detailed || []);
      setStitchingLines(lines || []);
      setFabricRecords(fabrics || []);
      setAllCuttingPrograms(programs || []);
    } catch (error) {
      console.error('Failed to fetch master overview data', error);
    } finally {
      setIsLoading(false);
    }
  };

  const exportReport = () => {
    let exportData: any[] = [];
    let fileName = '';

    if (activeTab === 'master') {
      exportData = filteredPOs.map(po => ({
        'PO Number': po.po_number,
        'Buyer': po.buyer,
        'Total Qty': po.total_qty,
        'Cutting': po.cut || 0,
        'Stitching': po.stitched || 0,
        'Finishing': po.passed || 0,
        'Packing': po.packed || 0,
        'Shipped': po.shipped || 0,
        'Status': po.status
      }));
      fileName = 'Factory_Master_Report';
    } else if (activeTab === 'item_dept') {
      exportData = detailedStatus.map(item => ({
        'PO Number': item.po_number,
        'Style': item.style_num,
        'Color': item.color,
        'Size': item.size,
        'Buyer': item.buyer,
        'Order (WIP)': item.order_qty || 0,
        'Cutting Store': Math.max(0, (item.order_qty || 0) - (item.total_cut || 0)),
        'Feeding Store': Math.max(0, (item.cut_accepted || 0) - (item.total_sent || 0)),
        'Stitching Store': Math.max(0, (item.send_accepted || 0) - (item.total_stitched || 0)),
        'Finishing Store': Math.max(0, (item.stitch_accepted || 0) - (item.total_passed || 0) - (item.total_rejected || 0)),
        'Packing Store': Math.max(0, (item.loose_available || 0) + (item.blister_available || 0) + (item.store_available_pcs || 0))
      }));
      fileName = 'Item_Dept_Location_Report';
    } else if (activeTab === 'wip') {
      exportData = wipRows.map(r => ({ ...r, ...r.sizes }));
      fileName = 'WIP_Report';
    } else if (activeTab === 'factory_status') {
      exportData = filteredDetailed.map(item => ({
        'PO Number': item.po_number,
        'Style': item.style_num,
        'Color': item.color,
        'Size': item.size,
        'Order Qty': item.order_qty,
        'Cutting': item.total_cut || 0,
        'Feeding': item.total_sent || 0,
        'Stitching': item.total_stitched || 0,
        'Finishing': item.total_passed || 0,
        'Packing': item.total_packed || 0,
        'Shipped': item.total_shipped || 0
      }));
      fileName = 'Global_Factory_Status_Report';
    } else if (activeTab === 'fabric') {
      const normalizeFabric = (name: string) => {
        if (!name) return 'STANDARD';
        let n = name.trim().toUpperCase();
        if (n === 'S.JERSEY' || n === 'S/JERSEY' || n === 'JERSEY') return 'SINGLE JERSEY';
        if (n === 'F/TERRY' || n === 'F.TERRY') return 'FRENCH TERRY';
        return n;
      };

      const stats: Record<string, any> = {};
      fabricRecords.forEach(h => {
        const hColor = (h.color || 'Universal').trim().toUpperCase();
        const hFabric = normalizeFabric(h.fabric_name || 'Standard');
        const hGsm = Number(h.gsm) || 0;
        const key = `${hColor}-${hFabric}-${hGsm}`;
        if (!stats[key]) {
          stats[key] = {
            po_list: new Set(),
            style_list: new Set(),
            color: h.color || 'Universal',
            fabric_name: hFabric,
            gsm: hGsm,
            total_inhouse: 0,
            total_issued: 0,
            store_balance: 0,
            floor_balance: 0,
            total_consumed: 0
          };
        }
        const s = stats[key];
        if (h.po_number && h.po_number !== 'UNIVERSAL') s.po_list.add(h.po_number);
        if (h.style_num && h.style_num !== 'GENERAL') s.style_list.add(h.style_num);
        if (h.record_type === 'inhouse') { s.total_inhouse += h.quantity_kg; s.store_balance += h.quantity_kg; }
        else if (h.record_type === 'issue' && h.status !== 'rejected') { s.total_issued += h.quantity_kg; s.store_balance -= h.quantity_kg; if (h.status === 'accepted') s.floor_balance += h.quantity_kg; }
        else if (h.record_type === 'return' && h.status === 'accepted') { s.store_balance += h.quantity_kg; s.floor_balance -= h.quantity_kg; }
        else if (h.record_type === 'consumption') { s.total_consumed += h.quantity_kg; s.floor_balance -= h.quantity_kg; }
      });

      exportData = Object.values(stats).map(s => {
        const relevantPrograms = allCuttingPrograms.filter(cp => {
          const cpColorRaw = String(cp.color || '').trim().toUpperCase();
          const cpColors = cpColorRaw.split('/').map((str: string) => str.trim());
          return cpColors.includes(s.color.toUpperCase()) || cpColorRaw === s.color.toUpperCase();
        });
        const planned = relevantPrograms.reduce((sum: number, cp: any) => sum + (cp.planned_qty || 0), 0);
        return {
          'PO List': Array.from(s.po_list).join(', '),
          'Style List': Array.from(s.style_list).join(', '),
          'Color': s.color,
          'Fabric': s.fabric_name,
          'GSM': s.gsm,
          'Total In-House': s.total_inhouse,
          'Total Issued': s.total_issued,
          'Store Balance': s.store_balance,
          'Total Consumed': s.total_consumed,
          'Actual Cons': planned > 0 ? (s.total_consumed / planned).toFixed(3) : '0.000'
        };
      });
      fileName = 'Fabric_Inventory_Report';
    } else {
      const stage = stages.find(s => s.id === activeTab);
      if (stage && stage.key) {
        exportData = detailedStatus
          .filter(item => (item[stage.key!] || 0) > 0)
          .map(item => ({
            'PO Number': item.po_number,
            'Style': item.style_num,
            'Color': item.color,
            'Size': item.size,
            'Order Qty': item.order_qty,
            [stage.label]: item[stage.key!]
          }));
        fileName = `${stage.label}_Report`;
      } else {
        exportData = filteredDetailed;
        fileName = `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}_Detailed_Report`;
      }
    }

    if (exportData.length === 0) {
      exportData = [{ 'Message': 'No data identified for the selected filters' }];
    }

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const filteredPOs = poStatus.filter(po => {
    const matchSearch = (po.po_number || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                       (po.buyer || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchBuyer = filterBuyer === 'All' || (po.buyer || '').split(',').map(b => b.trim()).includes(filterBuyer);
    return matchSearch && matchBuyer;
  });

  const filteredDetailed = detailedStatus.filter(item => {
    const matchSearch = (item.po_number || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                       (item.style_num || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                       (item.color || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    const hasProductionData = (item.total_cut || 0) > 0 || 
                             (item.total_sent || 0) > 0 || 
                             (item.total_stitched || 0) > 0 || 
                             (item.total_passed || 0) > 0 || 
                             (item.total_packed || 0) > 0 || 
                             (item.total_shipped || 0) > 0;

    return matchSearch && hasProductionData;
  });

  const buyers = [...new Set(poStatus.flatMap(po => (po.buyer || '').split(',').map(b => b.trim()).filter(Boolean)))].sort();

    const stages = useMemo(() => [
    { id: 'master', label: 'Summary', icon: Monitor, color: 'text-text', bg: 'bg-text/10' },
    { id: 'item_dept', label: 'Item Dept Location', icon: MapPin, color: 'text-po', bg: 'bg-po/10' },
    { id: 'factory_status', label: 'Global Factory Status', icon: Activity, color: 'text-stitch', bg: 'bg-stitch/10' },
    { id: 'wip', label: 'WIP Report', icon: Layers, color: 'text-po', bg: 'bg-po/10', key: 'total_wip' },
    { id: 'dept_stores', label: 'Dept Stores', icon: Warehouse, color: 'text-po', bg: 'bg-po/10' },
    { id: 'fabric', label: 'Fabric Report', icon: Droplets, color: 'text-po', bg: 'bg-po/10' },
    { id: 'fabric_stock_report', label: 'Fabric Stock & Req', icon: Layers, color: 'text-amber-400', bg: 'bg-amber-400/10' },
    { id: 'cutting', label: 'Cutting', icon: Scissors, color: 'text-cut', bg: 'bg-cut/10', key: 'total_cut' },
    { id: 'feeding', label: 'Feeding', icon: Send, color: 'text-send', bg: 'bg-send/10', key: 'total_sent' },
    { id: 'stitching', label: 'Stitching', icon: Activity, color: 'text-stitch', bg: 'bg-stitch/10', key: 'total_stitched' },
    { id: 'finishing', label: 'Finishing', icon: CheckCircle2, color: 'text-pass', bg: 'bg-pass/10', key: 'total_passed' },
    { id: 'packing', label: 'Packing', icon: Package, color: 'text-pack', bg: 'bg-pack/10', key: 'total_packed' },
    { id: 'shipping', label: 'Shipped', icon: Truck, color: 'text-ship', bg: 'bg-ship/10', key: 'total_shipped' },
  ], []);

  // Dept Store Selection State (used only when activeTab === 'dept_stores')
  const [activeDeptStore, setActiveDeptStore] = useState<'cutting' | 'feeding' | 'stitching' | 'finishing' | 'packing'>('cutting');

  // WIP Logic inside MasterOverview for seamlessness
  const sizeHeaders = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];
  const wipRows = useMemo(() => {
    const grouped = detailedStatus.reduce((acc: { [key: string]: WIPRow }, curr) => {
      const key = `${curr.po_number}-${curr.style_num}-${curr.color}`;
      const wip = curr.order_qty || 0;
      
      if (!acc[key]) {
        acc[key] = {
          po_number: curr.po_number,
          due_date: curr.delivery_date || 'N/A',
          style_num: curr.style_num,
          color: curr.color,
          sizes: {},
          total_wip: 0
        };
        sizeHeaders.forEach(s => acc[key].sizes[s] = 0);
      }

      const currentSize = (curr.size || '').trim().toUpperCase();
      if (acc[key].sizes.hasOwnProperty(currentSize)) {
        acc[key].sizes[currentSize] += wip;
      }
      
      acc[key].total_wip += wip;
      return acc;
    }, {});

    return (Object.values(grouped) as WIPRow[]).filter(r => r.total_wip > 0);
  }, [detailedStatus]);

  const chartData = useMemo(() => [
    { name: 'Production Orders', value: summary?.total_po_qty || 0, color: 'var(--color-po)' },
    { name: 'Cutting Output', value: summary?.total_cut || 0, color: 'var(--color-cut)' },
    { name: 'Total Sent', value: summary?.total_sent || 0, color: 'var(--color-send)' },
    { name: 'Stitching', value: summary?.total_stitched || 0, color: 'var(--color-stitch)' },
    { name: 'QC Passed', value: summary?.total_passed || 0, color: 'var(--color-pass)' },
    { name: 'Returns', value: summary?.total_returns || 0, color: 'var(--color-po)' },
    { name: 'Packing', value: summary?.total_packed || 0, color: 'var(--color-pack)' },
    { name: 'Shipped', value: summary?.total_shipped || 0, color: 'var(--color-ship)' },
  ], [summary]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-bg4 border-t-po rounded-full animate-spin" />
          <p className="text-text3 font-mono text-[10px] uppercase tracking-widest animate-pulse">Syncing Factory Core...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Page Header */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 pb-8 border-b border-bg4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-po/10 text-po rounded-2xl ring-4 ring-po/5">
              <Building2 className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tighter text-text uppercase">Factory 360°</h1>
              <p className="text-text3 text-[10px] font-mono uppercase tracking-[0.3em] font-medium leading-tight mt-1">Unified Department Intelligence Report</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text3 group-focus-within:text-po transition-colors" />
            <input 
              type="text" 
              placeholder="Search data..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-bg2 border border-bg4 rounded-xl py-2.5 pl-10 pr-4 text-sm w-full md:w-64 focus:ring-2 focus:ring-po/10 outline-none transition-all h-12"
            />
          </div>

          <button 
            onClick={exportReport}
            className="flex items-center justify-center gap-2 bg-pass text-white px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-pass/20 hover:scale-105 active:scale-95 transition-all h-12"
          >
            <Download className="w-4 h-4" /> Export Excel
          </button>
        </div>
      </div>

      {/* View Selection Tabs */}
      <div className="flex flex-wrap items-center gap-2 bg-bg2 p-1.5 rounded-2xl border border-bg4 shadow-sm overflow-x-auto no-scrollbar">
        {stages.map((stage) => (
          <button
            key={stage.id}
            onClick={() => setActiveTab(stage.id as ViewTab)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
              activeTab === stage.id 
                ? "bg-text text-bg shadow-lg scale-[1.02]"
                : "text-text3 hover:bg-bg3 hover:text-text"
            )}
          >
            <stage.icon className={cn("w-3.5 h-3.5", activeTab === stage.id ? "text-inherit" : stage.color)} />
            {stage.label}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        {activeTab === 'master' && (
          <motion.div
            key="master"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
              <div className="bg-bg2 border border-bg4 p-6 rounded-3xl relative overflow-hidden group">
                <div className="absolute -right-4 -top-4 p-8 opacity-5">
                  <Layers className="w-16 h-16 text-po" />
                </div>
                <p className="text-[10px] font-black text-text3 uppercase tracking-widest mb-2 font-mono leading-none">Order Vol.</p>
                <h3 className="text-2xl font-black tracking-tighter text-text leading-none">
                  {(summary?.total_po_qty || 0).toLocaleString()}
                </h3>
              </div>

              {stages.slice(2).map((stage) => (
                <div
                  key={stage.label}
                  className="bg-bg2 border border-bg4 p-6 rounded-3xl relative overflow-hidden"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-black text-text3 uppercase tracking-widest font-mono leading-none">{stage.label}</p>
                    <stage.icon className={cn("w-4 h-4", stage.color)} />
                  </div>
                  <h3 className="text-2xl font-black tracking-tighter leading-none">
                    {(summary?.[stage.key!] || 0).toLocaleString()}
                  </h3>
                </div>
              ))}
            </div>

            {/* Master Table */}
            <div className="bg-bg2 border border-bg4 rounded-[2rem] overflow-hidden shadow-2xl">
              <div className="p-8 border-b border-bg4 bg-bg2/50 backdrop-blur-xl">
                <h2 className="text-xl font-black tracking-tight uppercase">Master Condition Table</h2>
                <p className="text-text3 text-[9px] font-mono uppercase tracking-widest mt-1">Global production order status dashboard</p>
              </div>

              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-separate border-spacing-0">
                  <thead>
                    <tr className="bg-bg3/20">
                      <th className="p-6 text-[11px] font-mono uppercase font-black text-text3 border-b border-bg4 tracking-widest sticky left-0 bg-bg2 z-10 w-[240px]">Production Order</th>
                      <th className="p-6 text-[11px] font-mono uppercase font-black text-text3 border-b border-bg4 text-center tracking-widest w-32 bg-bg2">Order Volume</th>
                      {stages.slice(2).map((stage) => (
                        <th key={stage.label} className="p-6 text-[11px] font-mono uppercase font-black text-text3 border-b border-bg4 text-center border-l border-bg4/30 tracking-widest bg-bg2">
                          {stage.label}
                        </th>
                      ))}
                      <th className="p-6 text-[11px] font-mono uppercase font-black text-text3 border-b border-bg4 text-center border-l border-bg4 tracking-widest bg-bg2">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPOs.map((po, idx) => {
                      const globalProgress = po.total_qty > 0 ? Math.min(((po.total_shipped || 0) / po.total_qty) * 100, 100) : 0;
                      return (
                        <tr key={`${po.id}-${po.po_number}-${idx}`} className="group hover:bg-bg3/10 transition-all border-b border-bg4 last:border-0 font-sans">
                          <td className="p-6 sticky left-0 bg-bg2 group-hover:bg-bg/80 transition-all z-10">
                            <div>
                               <p className="font-black text-sm text-text">{po.po_number}</p>
                               <p className="text-[9px] font-mono text-text3 uppercase mt-1">{po.buyer}</p>
                            </div>
                          </td>
                          <td className="p-6 text-center text-sm font-black">{(po.total_qty || 0).toLocaleString()}</td>
                          {stages.slice(2).map((stage) => {
                             const val = stage.key ? (po[stage.key.replace('total_', '')] || po[stage.key] || 0) : 0;
                             return (
                               <td key={stage.label} className="p-6 text-center border-l border-bg4/30">
                                 <span className={cn("text-sm font-black", val > 0 ? stage.color : "text-text3/20")}>{val || '—'}</span>
                               </td>
                             );
                          })}
                          <td className="p-6 text-center border-l border-bg4">
                            <span className={cn("text-xs font-black px-3 py-1 rounded-full", globalProgress >= 100 ? "bg-pass/10 text-pass" : "bg-ship/10 text-ship")}>
                              {Math.round(globalProgress)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'item_dept' && (
          <motion.div
            key="item_dept"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            <ItemDeptReport detailedStatus={detailedStatus} isLoading={isLoading} />
          </motion.div>
        )}

        {activeTab === 'factory_status' && (
          <motion.div
            key="factory_status"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            <div className="bg-bg2 border border-bg4 rounded-[2rem] overflow-hidden shadow-2xl relative">
              <div className="p-8 border-b border-bg4 bg-bg2/50 backdrop-blur-xl flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-black tracking-tight uppercase">Comprehensive Global Factory Report</h2>
                  <p className="text-text3 text-[10px] font-mono uppercase tracking-[0.3em] mt-1">PO, Style & Color-Wise Departmental Production Status</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase text-text3">
                    <div className="w-2 h-2 rounded-full bg-pass animate-pulse" />
                    LIVE OPS SYNC
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-separate border-spacing-0">
                  <thead>
                    <tr className="bg-bg3 text-text">
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest border-b border-bg4 sticky left-0 bg-bg3 z-10 border-r border-bg4/30">PO Number</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest border-b border-bg4 border-r border-bg4/30">Style</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest border-b border-bg4 border-r border-bg4/30">Color</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest border-b border-bg4 text-center bg-cut/5 text-cut border-r border-bg4/30">Cutting</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest border-b border-bg4 text-center bg-send/5 text-send border-r border-bg4/30">Feeding</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest border-b border-bg4 text-center bg-stitch/5 text-stitch border-r border-bg4/30">Stitching</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest border-b border-bg4 text-center bg-pass/5 text-pass border-r border-bg4/30">Finishing</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest border-b border-bg4 text-center bg-pack/5 text-pack border-r border-bg4/30">Packing</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest border-b border-bg4 text-center bg-ship/5 text-ship">Shipped</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bg4">
                    {filteredDetailed.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-24 text-center text-text3 font-black uppercase tracking-widest">
                           <div className="flex flex-col items-center gap-4">
                             <TrendingUp className="w-12 h-12 opacity-10" />
                             No granular production data identified
                           </div>
                        </td>
                      </tr>
                    ) : (
                      filteredDetailed.map((item, idx) => (
                        <tr key={idx} className="hover:bg-bg3/30 transition-colors group">
                          <td className="p-4 font-black text-sm text-text sticky left-0 bg-bg2 group-hover:bg-bg3 transition-colors border-r border-bg4/30">{item.po_number}</td>
                          <td className="p-4 font-black text-sm border-r border-bg4/30">{item.style_num}</td>
                          <td className="p-4 font-bold uppercase text-[11px] text-text2 border-r border-bg4/30">{item.color}</td>
                          <td className="p-4 text-center font-black text-sm bg-cut/5 text-cut border-r border-bg4/30">{item.total_cut || '—'}</td>
                          <td className="p-4 text-center font-black text-sm bg-send/5 text-send border-r border-bg4/30">{item.total_sent || '—'}</td>
                          <td className="p-4 text-center font-black text-sm bg-stitch/5 text-stitch border-r border-bg4/30">{item.total_stitched || '—'}</td>
                          <td className="p-4 text-center font-black text-sm bg-pass/5 text-pass border-r border-bg4/30">{item.total_passed || '—'}</td>
                          <td className="p-4 text-center font-black text-sm bg-pack/5 text-pack border-r border-bg4/30">{item.total_packed || '—'}</td>
                          <td className="p-4 text-center font-black text-sm bg-ship/5 text-ship">{item.total_shipped || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'wip' && (
          <motion.div
            key="wip"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            <div className="bg-bg2 border border-bg4 rounded-[2rem] p-8 shadow-2xl relative">
               <WIPReport embedded />
            </div>
          </motion.div>
        )}

        {activeTab === 'dept_stores' && (
          <motion.div
            key="dept_stores"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            <div className="flex flex-wrap items-center gap-4">
              {(['cutting', 'feeding', 'stitching', 'finishing', 'packing'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setActiveDeptStore(d)}
                  className={cn(
                    "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                    activeDeptStore === d 
                      ? "bg-text text-bg border-text shadow-lg"
                      : "bg-bg2 text-text3 border-bg4 hover:bg-bg3"
                  )}
                >
                  {d} Store
                </button>
              ))}
            </div>
            <div className="bg-bg2 border border-bg4 rounded-[2rem] p-8 shadow-2xl relative">
              <StockStoreTable 
                data={detailedStatus} 
                dept={activeDeptStore} 
                title={`Live ${activeDeptStore.toUpperCase()} Inventory Management`} 
              />
            </div>
          </motion.div>
        )}

        {activeTab === 'fabric' && (
          <motion.div
            key="fabric"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            <div className="bg-bg2 border border-bg4 rounded-[2rem] p-8 shadow-2xl relative">
               <FabricReport embedded />
            </div>
          </motion.div>
        )}

        {activeTab === 'fabric_stock_report' && (
          <motion.div
            key="fabric_stock_report"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            <FabricRequirementStockReportTable />
          </motion.div>
        )}

        {activeTab === 'cutting' && (
          <motion.div
            key="cutting"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="space-y-8"
          >
            <div className="bg-bg2 border border-bg4 rounded-[2rem] p-8 shadow-2xl relative">
               <CuttingReport embedded />
            </div>
          </motion.div>
        )}

        {activeTab === 'feeding' && (
          <motion.div
            key="feeding"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="space-y-8"
          >
            <div className="bg-bg2 border border-bg4 rounded-[2rem] p-8 shadow-2xl relative">
               <FeedingReport embedded />
            </div>
          </motion.div>
        )}

        {activeTab === 'stitching' && (
          <motion.div
            key="stitching"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="space-y-8"
          >
            <div className="bg-bg2 border border-bg4 rounded-[2rem] p-8 shadow-2xl relative">
               <StitchingReport embedded />
            </div>
          </motion.div>
        )}

        {activeTab === 'finishing' && (
          <motion.div
            key="finishing"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="space-y-8"
          >
            <div className="bg-bg2 border border-bg4 rounded-[2rem] p-8 shadow-2xl relative">
               <FinishingReport embedded />
            </div>
          </motion.div>
        )}

        {activeTab === 'packing' && (
          <motion.div
            key="packing"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="space-y-8"
          >
            <div className="bg-bg2 border border-bg4 rounded-[2rem] p-8 shadow-2xl relative">
               <PackingReport embedded />
            </div>
          </motion.div>
        )}

        {activeTab === 'shipping' && (
          <motion.div
            key="shipping"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="space-y-8"
          >
            <div className="bg-bg2 border border-bg4 rounded-[2rem] p-8 shadow-2xl relative">
               <ShippingReport embedded />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="h-px bg-bg4 w-full my-12" />

      {/* Integrated Dashboard Components */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Production Pipeline Chart */}
        <div className="lg:col-span-2 bg-bg2 border border-bg4 rounded-[2rem] p-8 shadow-2xl">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold tracking-tight text-text uppercase">Production Pipeline</h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs font-mono text-text3">
                <div className="w-2 h-2 rounded-full bg-pass animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                REAL-TIME MONITORING
              </div>
            </div>
          </div>

          {/* Stitching Lines Detailed */}
          <div className="mb-10">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-po" />
                <h4 className="text-sm font-black uppercase tracking-widest text-text">Line-Wise Production Status</h4>
              </div>
              <div className="h-px bg-bg4 flex-1 mx-4" />
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {stitchingLines.length > 0 ? (
                stitchingLines.map((line, idx) => (
                  <motion.div 
                    key={line.line_number}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + idx * 0.03 }}
                    className="bg-bg p-4 rounded-2xl border border-bg4 hover:border-po/30 transition-all group shadow-sm"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-text3 uppercase">Line</span>
                      <div className="w-1.5 h-1.5 rounded-full bg-po animate-pulse" />
                    </div>
                    <p className="text-2xl font-black tracking-tighter group-hover:text-po transition-colors">#{line.line_number}</p>
                    <div className="mt-4">
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black leading-none">{line.total_stitched.toLocaleString()}</span>
                        <span className="text-xs font-bold text-text3 uppercase leading-none">Pcs</span>
                      </div>
                      <p className="text-[10px] font-bold text-text2 uppercase mt-2">{line.po_count} active orders</p>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="col-span-full py-8 text-center border border-dashed border-bg4 rounded-2xl">
                  <p className="text-xs font-bold text-text3 uppercase">No line-wise activity recorded in system</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="h-[350px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-bg4)" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="var(--color-text3)" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  dy={10}
                />
                <YAxis 
                  stroke="var(--color-text3)" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(val) => val.toLocaleString()}
                />
                <Tooltip 
                  cursor={{ fill: 'var(--color-bg3)' }}
                  contentStyle={{ 
                    backgroundColor: 'var(--color-bg2)', 
                    borderColor: 'var(--color-bg4)',
                    borderRadius: '16px',
                    color: 'var(--color-text)',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    border: '1px solid var(--color-bg4)',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={45}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* System Notifications / Alerts */}
        <div className="bg-bg2 border border-bg4 rounded-[2rem] p-8 flex flex-col shadow-2xl">
          <h3 className="text-xl font-bold tracking-tight text-text uppercase mb-8">System Activity</h3>
          <div className="flex-1 space-y-8">
            {[
              { msg: 'New Production Order PO-2024-001 created', time: '2 mins ago', type: 'info' },
              { msg: 'Cutting completed for Style #8829', time: '15 mins ago', type: 'success' },
              { msg: 'QC Rejection rate high on Line 3', time: '1 hour ago', type: 'warning' },
              { msg: 'Shipment SH-992 dispatched', time: '3 hours ago', type: 'success' },
            ].map((log, i) => (
              <div key={i} className="flex gap-4 group">
                <div className={cn(
                  "w-1.5 h-12 rounded-full shrink-0",
                  log.type === 'success' ? 'bg-pass' : log.type === 'warning' ? 'bg-reject' : 'bg-po'
                )} />
                <div className="flex-1">
                  <p className="text-base text-text font-bold leading-tight mb-1 group-hover:text-po transition-colors cursor-default">
                    {log.msg}
                  </p>
                  <p className="text-xs font-bold text-text2 uppercase tracking-wide">{log.time}</p>
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-8 p-5 bg-bg3 rounded-2xl border border-bg4 flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-po shrink-0" />
            <p className="text-sm text-text2 leading-relaxed font-medium">
              System performing optimally. All production lines reporting active status.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
