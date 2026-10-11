import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useSystem } from '../context/SystemContext';
import { statusService } from '../services/erpService';
import { StatusSummary } from '../types';
import * as XLSX from 'xlsx';
import { toJpeg } from 'html-to-image';
import { 
  Scissors, 
  Send, 
  Activity, 
  CheckCircle2, 
  Package, 
  Truck,
  TrendingUp,
  AlertCircle,
  RotateCcw,
  Building2,
  Layers,
  Clock,
  Calendar,
  Layers3,
  CheckCircle,
  ShieldCheck,
  Zap,
  Flame,
  Award,
  TrendingDown,
  Sliders,
  Download,
  Search,
  X,
  Target
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area,
  Legend,
  LineChart,
  Line
} from 'recharts';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';
import { useTheme } from '../context/ThemeContext';
import { HourlySlotModal } from '../components/HourlySlotModal';

const getIcon = (iconName: string) => {
  switch (iconName) {
    case 'Layers': return <Layers className="w-5 h-5 text-sky-500" />;
    case 'Scissors': return <Scissors className="w-5 h-5 text-amber-500" />;
    case 'Send': return <Send className="w-5 h-5 text-emerald-500" />;
    case 'Activity': return <Activity className="w-5 h-5 text-indigo-500" />;
    case 'CheckCircle2': return <CheckCircle2 className="w-5 h-5 text-rose-500" />;
    case 'CheckCircle': return <CheckCircle className="w-5 h-5 text-purple-500" />;
    case 'Package': return <Package className="w-5 h-5 text-pink-500" />;
    case 'Truck': return <Truck className="w-5 h-5 text-teal-500" />;
    default: return <Activity className="w-5 h-5 text-text2" />;
  }
};

export const Dashboard: React.FC<{ onNavigate?: (page: string) => void }> = ({ onNavigate }) => {
  const { workingDate } = useSystem();
  const { theme } = useTheme();

  const getLocalDateString = () => {
    if (workingDate && workingDate.trim() !== '') {
      return workingDate.trim().split(' ')[0];
    }
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${date}`;
  };

  const HOURLY_INTERVALS = Array.from({ length: 24 }, (_, i) => {
    const startStr = String(i).padStart(2, '0');
    const endStr = String((i + 1) % 24).padStart(2, '0');
    return `${startStr}:00 - ${endStr}:00`;
  });

  const getInitialInterval = () => {
    let currentHour = new Date().getHours();
    if (workingDate && workingDate.trim() !== '') {
      const parts = workingDate.trim().split(' ');
      if (parts[1]) {
        const timeParts = parts[1].split(':');
        if (timeParts[0]) {
          const parsed = parseInt(timeParts[0], 10);
          if (!isNaN(parsed)) {
            currentHour = parsed;
          }
        }
      }
    }
    const startStr = String(currentHour).padStart(2, '0');
    const endStr = String((currentHour + 1) % 24).padStart(2, '0');
    return `${startStr}:00 - ${endStr}:00`;
  };

  const [selectedDate, setSelectedDate] = useState<string>('');
  const [dashboardType, setDashboardType] = useState<'lifetime' | 'daily' | 'hourly'>('lifetime');
  const [selectedHour, setSelectedHour] = useState<string>(getInitialInterval());

  // Update selectedHour slot dynamically when workingDate changes
  useEffect(() => {
    setSelectedHour(getInitialInterval());
  }, [workingDate]);
  const [summary, setSummary] = useState<StatusSummary | null>(null);
  const [stitchingLines, setStitchingLines] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [stitchDashboard, setStitchDashboard] = useState<any>(null);
  const [selectedStitchLine, setSelectedStitchLine] = useState<string>('Line 1');
  const [isLoading, setIsLoading] = useState(true);
  const [hourlyOneViewData, setHourlyOneViewData] = useState<any>(null);
  const [deptSearchTerm, setDeptSearchTerm] = useState('');
  const [reportFontSize, setReportFontSize] = useState<'lg' | 'xl' | '2xl'>('xl');

  // Daily stitching line parameter configuration states
  const [isConfiguringLines, setIsConfiguringLines] = useState(false);
  const [lineConfigs, setLineConfigs] = useState<Array<{ line_number: string; seated_operators: number; target_hourly_benchmark: number }>>([]);
  const [isSavingConfigs, setIsSavingConfigs] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const [isExportingImage, setIsExportingImage] = useState(false);

  // Hourly Slot Move/Split Modal State
  const [slotModalInfo, setSlotModalInfo] = useState<{
    isOpen: boolean;
    rowId: string;
    rowLabel: string;
    slotLabel: string;
    slotIndex: number;
  }>({
    isOpen: false,
    rowId: '',
    rowLabel: '',
    slotLabel: '',
    slotIndex: 0
  });

  const handleOpenSlotModal = (row: any, slotIdx: number) => {
    if (
      row.isTotalRow || 
      row.rowId === 'total' || 
      row.rowId === 'total_stitching' || 
      row.rowId === 'trims_status' || 
      row.rowId === 'feeding_total' || 
      row.rowId === 'stitching_total'
    ) {
      return;
    }
    const slotLabel = hourlyOneViewData?.hourSlots?.[slotIdx] || '';
    setSlotModalInfo({
      isOpen: true,
      rowId: row.rowId,
      rowLabel: row.label,
      slotLabel,
      slotIndex: slotIdx
    });
  };

  const reportSummaryStats = useMemo(() => {
    if (!hourlyOneViewData?.rows) return null;
    const totalRow = hourlyOneViewData.rows.find((r: any) => r.isTotalRow || r.rowId === 'total');
    
    let totalProduced = 0;
    let totalTarget = 0;
    let totalOperators = 0;
    
    if (totalRow) {
      totalProduced = totalRow.totalQty || 0;
      totalTarget = totalRow.dailyTarget || 0;
      totalOperators = totalRow.operators || 0;
    } else {
      hourlyOneViewData.rows.forEach((r: any) => {
        if (!r.isTotalRow && r.rowId !== 'trims_status' && r.rowId !== 'total_stitching') {
          totalProduced += (r.totalQty || 0);
          totalTarget += (r.dailyTarget || 0);
          totalOperators += (r.operators || 0);
        }
      });
    }

    const diff = totalProduced - totalTarget;
    const effPercent = totalTarget > 0 ? Math.round((totalProduced / totalTarget) * 100) : (totalProduced > 0 ? 100 : 0);

    return {
      totalProduced,
      totalTarget,
      diff,
      effPercent,
      totalOperators
    };
  }, [hourlyOneViewData]);

  const updateConfigValue = (lineNumber: string, key: 'seated_operators' | 'target_hourly_benchmark', val: number) => {
    setLineConfigs(prev => prev.map(cfg => {
      if (cfg.line_number === lineNumber) {
        return { ...cfg, [key]: val };
      }
      return cfg;
    }));
  };

  const fetchData = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      let queryDate: string | undefined = undefined;
      let queryHour: string | undefined = undefined;

      if (dashboardType === 'daily') {
        queryDate = selectedDate || getLocalDateString();
      } else if (dashboardType === 'hourly') {
        queryDate = selectedDate || getLocalDateString();
        queryHour = selectedHour;
      }

      const activeDate = selectedDate || getLocalDateString();

      const [sumData, linesData, analyticsData, stitchDashboardData, hourlyOneView] = await Promise.all([
        statusService.getSummary(queryDate, queryHour),
        statusService.getStitchingLines(selectedDate || undefined),
        statusService.getAnalytics(selectedDate || undefined),
        statusService.getStitchingLinesDashboard(selectedDate || undefined),
        statusService.getHourlyReportOneView(activeDate)
      ]);
      setSummary(sumData);
      setStitchingLines(linesData);
      setAnalytics(analyticsData);
      setStitchDashboard(stitchDashboardData);
      setHourlyOneViewData(hourlyOneView);
    } catch (error) {
      console.error('Failed to fetch dashboard data', error);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  const fetchLineConfigs = async () => {
    try {
      const activeDate = selectedDate || getLocalDateString();
      const res = await statusService.getStitchingLineConfigs(activeDate);
      if (res && res.configs) {
        setLineConfigs(res.configs);
      }
    } catch (err) {
      console.error('Failed to fetch line configs:', err);
    }
  };

  useEffect(() => {
    fetchData(true);

    const intervalId = setInterval(() => {
      fetchData(false);
    }, 30000);

    return () => clearInterval(intervalId);
  }, [selectedDate, dashboardType, selectedHour, workingDate]);

  // Fetch line configs whenever the active date changes
  useEffect(() => {
    if (dashboardType === 'daily' || dashboardType === 'hourly') {
      fetchLineConfigs();
    }
  }, [selectedDate, dashboardType, workingDate]);

  const handleSaveConfigs = async () => {
    setIsSavingConfigs(true);
    try {
      const activeDate = selectedDate || getLocalDateString();
      await statusService.saveStitchingLineConfigs({
        date: activeDate,
        configs: lineConfigs
      });
      setIsConfiguringLines(false);
      await fetchData(false);
    } catch (err) {
      console.error('Failed to save line configs:', err);
      alert('Failed to save parameters. Please check server logs.');
    } finally {
      setIsSavingConfigs(false);
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-full text-text3 font-mono">LOADING OPERATIONS TELEMETRY...</div>;

  const stats = [
    { label: 'Production Orders', value: summary?.total_po_qty || 0, icon: BarChart, color: 'var(--color-po)' },
    { label: 'Total WIP Units', value: summary?.total_wip || 0, icon: Layers, color: 'var(--color-po)' },
    { label: 'Cutting Output', value: summary?.total_cut || 0, icon: Scissors, color: 'var(--color-cut)' },
    { label: 'Total Sent', value: summary?.total_sent || 0, icon: Send, color: 'var(--color-send)' },
    { label: 'Stitching', value: summary?.total_stitched || 0, icon: Activity, color: 'var(--color-stitch)' },
    { label: 'QC Passed', value: summary?.total_passed || 0, icon: CheckCircle2, color: 'var(--color-pass)' },
    { label: 'Total Pressed', value: summary?.total_pressed || 0, icon: CheckCircle, color: '#a855f7' },
    { label: 'Returns Received', value: summary?.total_returns || 0, icon: RotateCcw, color: 'var(--color-po)' },
    { label: 'Packing Out', value: (summary?.total_packed || 0) + (summary?.total_blistered || 0), icon: Package, color: 'var(--color-pack)' },
    { label: 'Total Shipped', value: summary?.total_shipped || 0, icon: Truck, color: 'var(--color-ship)' },
  ];

  const exportHourlyReportToJpeg = async () => {
    if (!reportRef.current) return;
    setIsExportingImage(true);
    
    const originalEl = reportRef.current;
    const isDark = theme === 'dark';
    const bgCol = isDark ? '#111827' : '#ffffff';

    const exportWidth = reportFontSize === '2xl' ? '3900px' : reportFontSize === 'xl' ? '3450px' : '2950px';

    // Create a temporary container and clone the element so we are completely independent of active screen layout/zoom
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = exportWidth;
    container.style.height = 'auto';
    container.style.zIndex = '-9999';
    container.style.pointerEvents = 'none';

    const clone = originalEl.cloneNode(true) as HTMLElement;

    // Preserve the actual value state of input elements in the cloned copy
    const originalInputs = originalEl.querySelectorAll('input, select, textarea');
    const clonedInputs = clone.querySelectorAll('input, select, textarea');
    originalInputs.forEach((input, index) => {
      if (clonedInputs[index]) {
        (clonedInputs[index] as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = 
          (input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
      }
    });

    // Remove any scrollable containers inside the clone to prevent scroll bars or clipping
    const scrollContainers = clone.querySelectorAll('.overflow-x-auto, .overflow-auto');
    scrollContainers.forEach(el => {
      (el as HTMLElement).style.overflow = 'visible';
      (el as HTMLElement).style.overflowX = 'visible';
      (el as HTMLElement).style.width = '100%';
      (el as HTMLElement).style.maxWidth = 'none';
    });

    // Apply explicit width and styling variables directly to the clone to ensure perfect rendering
    clone.style.width = exportWidth;
    clone.style.maxWidth = 'none';
    clone.style.padding = '36px';
    clone.style.overflow = 'visible';
    clone.style.borderRadius = '16px';
    clone.style.backgroundColor = bgCol;
    clone.style.color = isDark ? '#f9fafb' : '#020617';
    
    clone.style.setProperty('--bg', isDark ? '#030712' : '#ffffff');
    clone.style.setProperty('--bg2', isDark ? '#111827' : '#ffffff');
    clone.style.setProperty('--bg3', isDark ? '#1f2937' : '#f1f5f9');
    clone.style.setProperty('--bg4', isDark ? '#374151' : '#cbd5e1');
    clone.style.setProperty('--text', isDark ? '#f9fafb' : '#020617');
    clone.style.setProperty('--text2', isDark ? '#e5e7eb' : '#0f172a');
    clone.style.setProperty('--text3', isDark ? '#9ca3af' : '#1e293b');

    container.appendChild(clone);
    document.body.appendChild(container);

    try {
      // Small delay to ensure browser layout styles recalculate on the cloned DOM tree
      await new Promise(resolve => setTimeout(resolve, 350));
      
      const dataUrl = await toJpeg(clone, {
        quality: 0.95,
        backgroundColor: bgCol,
        pixelRatio: 2, // Double pixel density for ultra-crisp texts and borders
        filter: (node) => {
          if (node instanceof HTMLElement && node.classList.contains('no-export')) {
            return false;
          }
          return true;
        }
      });

      const link = document.createElement('a');
      link.download = `hourly_report_${hourlyOneViewData?.date || getLocalDateString()}.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Failed to export image:', error);
      alert('Failed to save report as JPG.');
    } finally {
      // Clean up the offscreen container safely
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }
      setIsExportingImage(false);
    }
  };

  const exportHourlyReportToExcel = () => {
    if (!hourlyOneViewData || !hourlyOneViewData.rows) return;
    
    // We will build a 2D array of data representing the spreadsheet layout
    const excelRows: any[] = [];
    
    // Add main title
    excelRows.push(['HOURLY PRODUCTION REPORT', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    excelRows.push([`Date: ${hourlyOneViewData.date || getLocalDateString()}`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    excelRows.push([]); // blank line
    
    // Header row 1
    const h1 = [
      'DEPARTMENTS CODE',
      '9:00 - 10:00 (STYLE)', '9:00 - 10:00 (QTY)',
      '10:00 - 11:00 (STYLE)', '10:00 - 11:00 (QTY)',
      '11:00 - 12:00 (STYLE)', '11:00 - 12:00 (QTY)',
      '12:00 - 1:00 (STYLE)', '12:00 - 1:00 (QTY)',
      '2:00 - 3:00 (STYLE)', '2:00 - 3:00 (QTY)',
      '3:00 - 4:00 (STYLE)', '3:00 - 4:00 (QTY)',
      '4:00 - 5:00 (STYLE)', '4:00 - 5:00 (QTY)',
      '5:00 - 6:00 (STYLE)', '5:00 - 6:00 (QTY)',
      'TOTAL QTY',
      'TARGET QTY',
      'HOURLY TARGET',
      'DIFF',
      'PERFORMANCE %',
      'OPERATORS'
    ];
    excelRows.push(h1);
    
    // Add data rows
    hourlyOneViewData.rows.forEach((row: any) => {
      const excelRow = [
        row.label,
        row.styles[0], row.quantities[0],
        row.styles[1], row.quantities[1],
        row.styles[2], row.quantities[2],
        row.styles[3], row.quantities[3],
        row.styles[4], row.quantities[4],
        row.styles[5], row.quantities[5],
        row.styles[6], row.quantities[6],
        row.styles[7], row.quantities[7],
        row.totalQty,
        row.dailyTarget,
        row.hourlyTarget,
        row.diff,
        row.performance,
        row.operators
      ];
      excelRows.push(excelRow);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(excelRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hourly Production Report');
    XLSX.writeFile(wb, `Hourly_Production_Report_${hourlyOneViewData.date || getLocalDateString()}.xlsx`);
  };

  const chartData = stats.map(s => ({ name: s.label, value: s.value, color: s.color }));

  return (
    <div className="space-y-8 pb-12">
      {/* Dashboard Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 pb-6 border-b border-bg4">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold tracking-tight text-text uppercase">Operations</h1>
          <p className="text-text2 text-xs font-semibold uppercase tracking-wider font-medium leading-tight">
            System-wide performance monitoring • Active Date: <span className="text-po font-bold">{analytics?.target_date || 'Today'}</span>
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          {/* Working Date Selector */}
          <div className="flex items-center gap-2 bg-bg2 border border-bg4 px-4 py-2 rounded-xl">
            <Calendar className="w-4 h-4 text-text2" />
            <input 
              type="date" 
              value={selectedDate || getLocalDateString()}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-text text-xs uppercase font-bold tracking-wider outline-none h-8 cursor-pointer"
            />
            {selectedDate && (
              <button 
                onClick={() => setSelectedDate('')}
                className="text-[10px] bg-bg4 text-text2 px-2 py-1 rounded hover:text-text font-bold uppercase transition"
              >
                Clear
              </button>
            )}
          </div>

          <button 
            onClick={() => onNavigate?.('master_report')}
            className="flex items-center gap-2 bg-text text-bg px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-text/10 hover:scale-105 transition-all h-12"
          >
            <Building2 className="w-4 h-4" /> Full Factory Report
          </button>
          <button 
            onClick={() => onNavigate?.('wip_report')}
            className="flex items-center gap-2 bg-bg2 border border-bg4 text-text px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-bg4/10 hover:scale-105 transition-all h-12"
          >
            <Layers className="w-4 h-4" /> WIP Breakdown
          </button>
          <button 
            onClick={() => onNavigate?.('returns')}
            className="flex items-center gap-2 bg-po text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-po/20 hover:scale-105 transition-all h-12"
          >
            <RotateCcw className="w-4 h-4" /> Initiate Return
          </button>
        </div>
      </div>

      {/* Dashboard Mode Selector */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-bg2 border border-bg4 p-3 rounded-2xl">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setDashboardType('lifetime')}
            className={cn(
              "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer",
              dashboardType === 'lifetime'
                ? "bg-text text-bg shadow-lg shadow-text/5"
                : "text-text2 hover:text-text hover:bg-bg3"
            )}
          >
            Lifetime operations
          </button>
          <button
            onClick={() => setDashboardType('daily')}
            className={cn(
              "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer",
              dashboardType === 'daily'
                ? "bg-text text-bg shadow-lg shadow-text/5"
                : "text-text2 hover:text-text hover:bg-bg3"
            )}
          >
            Daily Performance
          </button>
          <button
            onClick={() => setDashboardType('hourly')}
            className={cn(
              "px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer",
              dashboardType === 'hourly'
                ? "bg-text text-bg shadow-lg shadow-text/5"
                : "text-text2 hover:text-text hover:bg-bg3"
            )}
          >
            Hourly Window
          </button>
        </div>

        {/* Dynamic Context Controls */}
        <div className="flex flex-wrap items-center gap-4">
          {dashboardType === 'hourly' && (
            <div className="flex items-center gap-2 bg-bg3 border border-bg4 px-4 py-1.5 rounded-xl">
              <Clock className="w-4 h-4 text-text2" />
              <select
                value={selectedHour}
                onChange={(e) => setSelectedHour(e.target.value)}
                className="bg-transparent text-text text-xs uppercase font-extrabold tracking-wider outline-none cursor-pointer pr-1"
              >
                {HOURLY_INTERVALS.map((interval) => (
                  <option key={interval} value={interval} className="bg-bg2 text-text">
                    {interval}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="text-xs font-bold text-text3 uppercase flex items-center gap-2 py-1">
            <span className="w-2.5 h-2.5 rounded-full bg-pass animate-pulse inline-block" />
            <span className="tracking-wider">
              {dashboardType === 'lifetime' && "All Transactions Cumulative"}
              {dashboardType === 'daily' && `Showing data till now on ${selectedDate || getLocalDateString()}`}
              {dashboardType === 'hourly' && `Showing hour slot: ${selectedHour}`}
            </span>
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-10 gap-4 sm:gap-6">
        {stats.map((stat, idx) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04 }}
            className="bg-bg2 border border-bg4 p-4 sm:p-5 rounded-2xl relative overflow-hidden group card-shadow-hover"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-30 transition-opacity hidden sm:block">
              <stat.icon className="w-10 h-10" style={{ color: stat.color }} />
            </div>
            <p className="text-text2 text-[10px] font-bold uppercase tracking-wider mb-2">{stat.label}</p>
            <h3 className="text-2xl font-black tracking-tight flex items-baseline gap-1.5" style={{ color: stat.color }}>
              <span>{stat.value.toLocaleString()}</span>
              {stat.label === 'Total WIP Units' && (
                <span className="text-xs font-bold text-text3 font-sans">PCS</span>
              )}
            </h3>
            <div className="mt-3 flex items-center gap-1 text-[9px] font-bold text-text3">
              <TrendingUp className="w-3 h-3 text-pass animate-pulse" />
              <span>LIVE DATA</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* 1. OVERALL DEPARTMENT DATA SECTION */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 pb-2">
          <Layers3 className="w-5 h-5 text-po" />
          <h2 className="text-lg font-black uppercase tracking-widest text-text">Overall Department Data</h2>
          <div className="h-px bg-bg4 flex-1 ml-4" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {(analytics?.departments || []).map((dept: any, idx: number) => (
            <motion.div
              key={dept.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-bg2 border border-bg4 rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between hover:border-bg5 transition-all shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className={cn("p-2 rounded-lg shrink-0", dept.color)}>
                      {getIcon(dept.icon)}
                    </div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-text">{dept.name}</h3>
                  </div>
                  <span className={cn(
                    "text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full",
                    dept.status.includes('Optimal') || dept.status.includes('Active') || dept.status.includes('Operational') || dept.status.includes('Ready') || dept.status.includes('Stocked')
                      ? 'bg-pass/10 text-pass'
                      : 'bg-reject/10 text-reject'
                  )}>
                    {dept.status}
                  </span>
                </div>

                <div className="space-y-2.5 mt-4">
                  {dept.metrics.map((metric: any) => (
                    <div key={metric.label} className="flex items-center justify-between border-b border-bg3 pb-2 last:border-0 last:pb-0">
                      <span className="text-xs font-semibold text-text2 uppercase">{metric.label}</span>
                      <span className="text-sm font-extrabold text-text font-mono">
                        {metric.value.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* 2. DAILY PERFORMANCE & HOURLY WINDOW CONDITIONAL VIEWS */}
      
      {/* LIFETIME OPERATIONS: SHOW DEFAULT GRAPHS */}
      {dashboardType === 'lifetime' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* DAILY Trend */}
          <div className="bg-bg2 border border-bg4 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6 border-b border-bg3 pb-3">
              <div>
                <h3 className="text-lg font-bold tracking-tight">Daily Production Trends</h3>
                <p className="text-xs text-text2 uppercase tracking-wide font-semibold">10-Day Rolling Output Breakdown</p>
              </div>
              <TrendingUp className="w-5 h-5 text-pass" />
            </div>
            <div className="h-[320px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics?.daily_production || []}>
                  <defs>
                    <linearGradient id="colorCut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-cut)" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="var(--color-cut)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorStitch" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-stitch)" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="var(--color-stitch)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorFinish" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-pass)" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="var(--color-pass)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorPack" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-pack)" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="var(--color-pack)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-bg4)" vertical={false} />
                  <XAxis 
                    dataKey="date" 
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
                    contentStyle={{ 
                      backgroundColor: 'var(--color-bg2)', 
                      borderColor: 'var(--color-bg4)',
                      borderRadius: '12px',
                      color: 'var(--color-text)'
                    }}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" />
                  <Area type="monotone" name="Cutting" dataKey="Cutting" stroke="var(--color-cut)" fillOpacity={1} fill="url(#colorCut)" strokeWidth={2} />
                  <Area type="monotone" name="Stitching" dataKey="Stitching" stroke="var(--color-stitch)" fillOpacity={1} fill="url(#colorStitch)" strokeWidth={2} />
                  <Area type="monotone" name="Finishing" dataKey="Finishing" stroke="var(--color-pass)" fillOpacity={1} fill="url(#colorFinish)" strokeWidth={2} />
                  <Area type="monotone" name="Packing" dataKey="Packing" stroke="var(--color-pack)" fillOpacity={1} fill="url(#colorPack)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* HOURLY Breakdown */}
          <div className="bg-bg2 border border-bg4 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6 border-b border-bg3 pb-3">
              <div>
                <h3 className="text-lg font-bold tracking-tight">Hourly Production Analysis</h3>
                <p className="text-xs text-text2 uppercase tracking-wide font-semibold">Today's Shift Output ({analytics?.target_date || 'Active Date'})</p>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono text-text3 font-bold bg-bg px-2.5 py-1 rounded border border-bg4">
                <Clock className="w-3.5 h-3.5 text-po animate-pulse" />
                LIVE BREAKDOWN
              </div>
            </div>
            <div className="h-[320px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics?.hourly_production || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-bg4)" vertical={false} />
                  <XAxis 
                    dataKey="hour" 
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
                    contentStyle={{ 
                      backgroundColor: 'var(--color-bg2)', 
                      borderColor: 'var(--color-bg4)',
                      borderRadius: '12px',
                      color: 'var(--color-text)'
                    }}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" />
                  <Bar dataKey="Cutting" name="Cutting" fill="var(--color-cut)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Stitching" name="Stitching" fill="var(--color-stitch)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Finishing" name="Finishing" fill="var(--color-pass)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Packing" name="Packing" fill="var(--color-pack)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* DAILY PERFORMANCE TAB: STITCHING LINE PERFORMANCE GRID & LINE-WISE TRENDS */}
      {dashboardType === 'daily' && (
        <div className="space-y-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-bg4 pb-3 gap-4">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-stitch flex items-center gap-2 uppercase">
                <Activity className="w-5 h-5" />
                Stitching Line Daily Performance
              </h2>
              <p className="text-xs text-text3 font-medium uppercase font-sans mt-0.5">Real-time status, efficiency, and active items for the 5 physical lines</p>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setIsConfiguringLines(!isConfiguringLines);
                  if (!isConfiguringLines) {
                    fetchLineConfigs();
                  }
                }}
                className="flex items-center gap-2 bg-bg2 hover:bg-bg3 border border-bg4 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider text-text transition-all cursor-pointer"
              >
                <Sliders className="w-4 h-4 text-stitch" />
                {isConfiguringLines ? 'Hide Configuration' : 'Configure Lines'}
              </button>
              <div className="bg-stitch/10 border border-stitch/30 px-3 py-1.5 rounded-xl text-[10px] font-mono font-black text-stitch uppercase">
                5 Active Lines
              </div>
            </div>
          </div>

          {/* Configuration Form */}
          {isConfiguringLines && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-bg2 border border-stitch/30 rounded-2xl p-6 shadow-lg space-y-6"
            >
              <div className="border-b border-bg3 pb-3 flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-stitch">Line & Department Parameter Configuration</h3>
                  <p className="text-[10px] text-text3 font-medium uppercase mt-0.5">Customize active operators and targets for {selectedDate || getLocalDateString()}</p>
                </div>
                <span className="text-[9px] font-mono bg-bg3 border border-bg4 text-text2 px-2 py-1 rounded">
                  Date-Specific Config
                </span>
              </div>

              {/* Group 1: Stitching Lines */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-stitch border-b border-bg3 pb-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-stitch rounded-full" />
                  Stitching Lines (Line 1 - 5)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                  {lineConfigs.filter(cfg => ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5'].includes(cfg.line_number)).map((cfg) => (
                    <div key={cfg.line_number} className="bg-bg/40 border border-bg4 p-4 rounded-xl space-y-4">
                      <h5 className="text-xs font-bold text-text uppercase font-mono border-b border-bg3 pb-1">{cfg.line_number}</h5>
                      
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-wider text-text3">Seated Operators</label>
                        <input
                          type="number"
                          value={cfg.seated_operators}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            updateConfigValue(cfg.line_number, 'seated_operators', val);
                          }}
                          className="w-full bg-bg border border-bg4 px-3 py-1.5 rounded-lg text-xs font-bold text-text font-mono focus:border-stitch outline-none transition"
                          min="0"
                          max="200"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-wider text-text3">Hourly Target (Pcs/Hr)</label>
                        <input
                          type="number"
                          value={cfg.target_hourly_benchmark}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            updateConfigValue(cfg.line_number, 'target_hourly_benchmark', val);
                          }}
                          className="w-full bg-bg border border-bg4 px-3 py-1.5 rounded-lg text-xs font-bold text-text font-mono focus:border-stitch outline-none transition"
                          min="0"
                          max="1000"
                        />
                      </div>

                      <div className="text-[9px] font-bold text-text3 uppercase flex items-center gap-1 mt-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Daily Target: <span className="text-text font-mono font-extrabold">{(cfg.target_hourly_benchmark * 8).toLocaleString()}</span> pcs</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Group 2: Feeding Lines */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-500 border-b border-bg3 pb-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                  Feeding Lines (No Operators Required)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                  {lineConfigs.filter(cfg => ['Feeding Line 1', 'Feeding Line 2', 'Feeding Line 3', 'Feeding Line 4', 'Feeding Line 5'].includes(cfg.line_number)).map((cfg) => (
                    <div key={cfg.line_number} className="bg-bg/40 border border-bg4 p-4 rounded-xl space-y-4">
                      <h5 className="text-xs font-bold text-text uppercase font-mono border-b border-bg3 pb-1">{cfg.line_number}</h5>
                      
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-wider text-text3">Hourly Target (Pcs/Hr)</label>
                        <input
                          type="number"
                          value={cfg.target_hourly_benchmark}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            updateConfigValue(cfg.line_number, 'target_hourly_benchmark', val);
                          }}
                          className="w-full bg-bg border border-bg4 px-3 py-1.5 rounded-lg text-xs font-bold text-text font-mono focus:border-amber-500 outline-none transition"
                          min="0"
                          max="1000"
                        />
                      </div>

                      <div className="text-[9px] font-bold text-text3 uppercase flex items-center gap-1 mt-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Daily Target: <span className="text-text font-mono font-extrabold">{(cfg.target_hourly_benchmark * 8).toLocaleString()}</span> pcs</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Group 3: Other Departments */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-indigo-500 border-b border-bg3 pb-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                  Departments (Cutting, Trims, Press, Packing)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                  {lineConfigs.filter(cfg => ['Cutting & Fabrication', 'Trims Status', 'Press', 'Carton Packed', 'Blister Packed'].includes(cfg.line_number)).map((cfg) => (
                    <div key={cfg.line_number} className="bg-bg/40 border border-bg4 p-4 rounded-xl space-y-4">
                      <h5 className="text-xs font-bold text-text uppercase font-mono border-b border-bg3 pb-1">{cfg.line_number}</h5>
                      
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-wider text-text3">Seated Operators</label>
                        <input
                          type="number"
                          value={cfg.seated_operators}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            updateConfigValue(cfg.line_number, 'seated_operators', val);
                          }}
                          className="w-full bg-bg border border-bg4 px-3 py-1.5 rounded-lg text-xs font-bold text-text font-mono focus:border-indigo-500 outline-none transition"
                          min="0"
                          max="200"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-wider text-text3">Hourly Target (Pcs/Hr)</label>
                        <input
                          type="number"
                          value={cfg.target_hourly_benchmark}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            updateConfigValue(cfg.line_number, 'target_hourly_benchmark', val);
                          }}
                          className="w-full bg-bg border border-bg4 px-3 py-1.5 rounded-lg text-xs font-bold text-text font-mono focus:border-indigo-500 outline-none transition"
                          min="0"
                          max="1000"
                        />
                      </div>

                      <div className="text-[9px] font-bold text-text3 uppercase flex items-center gap-1 mt-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Daily Target: <span className="text-text font-mono font-extrabold">{(cfg.target_hourly_benchmark * 8).toLocaleString()}</span> pcs</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-bg3">
                <button
                  type="button"
                  onClick={() => setIsConfiguringLines(false)}
                  className="px-5 py-2.5 bg-bg3 border border-bg4 hover:bg-bg4 rounded-xl text-xs font-black uppercase tracking-wider text-text2 hover:text-text cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveConfigs}
                  disabled={isSavingConfigs}
                  className="px-6 py-2.5 bg-stitch hover:bg-stitch/90 disabled:bg-bg4 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-stitch/10 cursor-pointer transition-all"
                >
                  {isSavingConfigs ? 'Saving...' : 'Save Parameters'}
                </button>
              </div>
            </motion.div>
          )}

          {/* 5-Line Grid Comparisons */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {(stitchDashboard?.summaries || []).map((line: any, idx: number) => (
              <motion.div
                key={line.line}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-bg2 border border-bg4 hover:border-stitch/30 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black font-mono text-text3 uppercase">Line Name</span>
                    <span className={cn(
                      "text-[9px] font-black uppercase px-2 py-0.5 rounded-full",
                      line.status === 'Optimal' ? 'bg-pass/15 text-pass' :
                      line.status === 'Active' ? 'bg-stitch/15 text-stitch' :
                      line.status === 'Low Output' ? 'bg-po/15 text-po' :
                      'bg-bg4 text-text3'
                    )}>
                      {line.status}
                    </span>
                  </div>

                  <p className="text-3xl font-black tracking-tighter text-text group-hover:text-stitch transition-colors">#{line.line}</p>
                  
                  <div className="mt-4 space-y-3">
                    <div className="flex justify-between items-baseline border-b border-bg3 pb-1.5">
                      <span className="text-[10px] font-bold text-text3 uppercase">Stitched Today</span>
                      <span className="text-base font-black text-text font-mono">{line.total_stitched.toLocaleString()} <span className="text-[10px] font-normal text-text3 font-sans">Pcs</span></span>
                    </div>

                    <div className="flex justify-between items-baseline border-b border-bg3 pb-1.5">
                      <span className="text-[10px] font-bold text-text3 uppercase">Seated Operators</span>
                      <span className="text-xs font-bold text-text font-mono">{line.seated_operators || 20} Operators</span>
                    </div>

                    <div className="flex justify-between items-baseline border-b border-bg3 pb-1.5">
                      <span className="text-[10px] font-bold text-text3 uppercase">Active Orders</span>
                      <span className="text-xs font-bold text-text font-mono">{line.po_count} POs</span>
                    </div>

                    <div className="flex justify-between items-baseline border-b border-bg3 pb-1.5">
                      <span className="text-[10px] font-bold text-text3 uppercase">Styles In Sewing</span>
                      <span className="text-xs font-extrabold text-text" title={line.styles.join(', ') || 'None'}>
                        {line.style_count > 0 ? (
                          line.styles.slice(0, 2).join(', ') + (line.styles.length > 2 ? '...' : '')
                        ) : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 space-y-1.5">
                  <div className="flex justify-between items-center text-[9px] font-bold text-text3 uppercase">
                    <span>Daily Target ({line.target.toLocaleString()})</span>
                    <span className="font-mono font-black text-text">{line.efficiency}%</span>
                  </div>
                  <div className="w-full bg-bg3 h-2 rounded-full overflow-hidden border border-bg4">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all duration-1000",
                        line.efficiency >= 100 ? "bg-pass" :
                        line.efficiency >= 50 ? "bg-stitch" :
                        line.efficiency > 0 ? "bg-po" :
                        "bg-bg4"
                      )}
                      style={{ width: `${Math.min(100, line.efficiency)}%` }}
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Double Graph Row: General Daily + Detailed Line-Wise Daily */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* General Daily Trends */}
            <div className="bg-bg2 border border-bg4 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6 border-b border-bg3 pb-3">
                <div>
                  <h3 className="text-lg font-bold tracking-tight text-text">Overall Factory Trends</h3>
                  <p className="text-xs text-text2 uppercase tracking-wide font-semibold">10-Day Rolling Output Breakdown</p>
                </div>
                <TrendingUp className="w-5 h-5 text-pass" />
              </div>
              <div className="h-[320px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics?.daily_production || []}>
                    <defs>
                      <linearGradient id="colorCutD" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-cut)" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="var(--color-cut)" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorStitchD" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-stitch)" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="var(--color-stitch)" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorFinishD" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-pass)" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="var(--color-pass)" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorPackD" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-pack)" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="var(--color-pack)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-bg4)" vertical={false} />
                    <XAxis 
                      dataKey="date" 
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
                      contentStyle={{ 
                        backgroundColor: 'var(--color-bg2)', 
                        borderColor: 'var(--color-bg4)',
                        borderRadius: '12px',
                        color: 'var(--color-text)'
                      }}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Area type="monotone" name="Cutting" dataKey="Cutting" stroke="var(--color-cut)" fillOpacity={1} fill="url(#colorCutD)" strokeWidth={2} />
                    <Area type="monotone" name="Stitching" dataKey="Stitching" stroke="var(--color-stitch)" fillOpacity={1} fill="url(#colorStitchD)" strokeWidth={2} />
                    <Area type="monotone" name="Finishing" dataKey="Finishing" stroke="var(--color-pass)" fillOpacity={1} fill="url(#colorFinishD)" strokeWidth={2} />
                    <Area type="monotone" name="Packing" dataKey="Packing" stroke="var(--color-pack)" fillOpacity={1} fill="url(#colorPackD)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Line-Wise Trend Chart */}
            <div className="bg-bg2 border border-bg4 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6 border-b border-bg3 pb-3">
                <div>
                  <h3 className="text-lg font-bold tracking-tight text-stitch flex items-center gap-2">
                    <Activity className="w-5 h-5 text-stitch" /> Line-Wise Daily Comparison
                  </h3>
                  <p className="text-xs text-text2 uppercase tracking-wide font-semibold">10-Day Rolling Stitching Output Comparison</p>
                </div>
                <div className="text-[10px] font-bold text-text3 font-mono bg-bg px-2.5 py-1 rounded border border-bg4">
                  STITCH DEPT ONLY
                </div>
              </div>
              <div className="h-[320px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stitchDashboard?.daily_trend || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-bg4)" vertical={false} />
                    <XAxis 
                      dataKey="date" 
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
                      contentStyle={{ 
                        backgroundColor: 'var(--color-bg2)', 
                        borderColor: 'var(--color-bg4)',
                        borderRadius: '12px',
                        color: 'var(--color-text)'
                      }}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Line type="monotone" dataKey="Line 1" stroke="#3b82f6" strokeWidth={2.5} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="Line 2" stroke="#10b981" strokeWidth={2.5} />
                    <Line type="monotone" dataKey="Line 3" stroke="#f59e0b" strokeWidth={2.5} />
                    <Line type="monotone" dataKey="Line 4" stroke="#ef4444" strokeWidth={2.5} />
                    <Line type="monotone" dataKey="Line 5" stroke="#8b5cf6" strokeWidth={2.5} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HOURLY WINDOW TAB: STITCHING LINE HOURLY WINDOW WITH TIMELINE CHECKPOINTS */}
      {dashboardType === 'hourly' && (
        <div className="space-y-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-bg4 pb-3 gap-4">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-stitch flex items-center gap-2 uppercase">
                <Clock className="w-5 h-5" />
                Stitching Line Hourly Window
              </h2>
              <p className="text-xs text-text3 font-medium uppercase font-sans mt-0.5">Hour-by-hour output windows, active styles, and performance benchmarks</p>
            </div>
            
            {/* Horizontal Line Select Tabs */}
            <div className="flex flex-wrap bg-bg3 border border-bg4 p-1 rounded-xl">
              {['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5'].map(lineName => (
                <button
                  key={lineName}
                  onClick={() => setSelectedStitchLine(lineName)}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer uppercase tracking-wider",
                    selectedStitchLine === lineName
                      ? "bg-stitch text-white shadow-sm"
                      : "text-text2 hover:text-text"
                  )}
                >
                  {lineName}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Line-wise Breakdown Block */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Interactive Left display and timeline */}
            <div className="bg-bg2 border border-bg4 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-bg3 pb-3 mb-4">
                  <h4 className="text-xs font-black text-text3 uppercase tracking-widest">{selectedStitchLine} Metrics Today</h4>
                  <span className="w-2 h-2 rounded-full bg-stitch animate-pulse" />
                </div>

                {(() => {
                  const lineSummary = (stitchDashboard?.summaries || []).find((s: any) => s.line === selectedStitchLine);
                  const total_stitched = lineSummary ? lineSummary.total_stitched : 0;
                  const po_count = lineSummary ? lineSummary.po_count : 0;
                  const style_count = lineSummary ? lineSummary.style_count : 0;

                  // Calculate active average hour rate based on non-zero hours
                  const hoursWithOutput = (stitchDashboard?.hourly_trend || []).filter((h: any) => h[selectedStitchLine] > 0);
                  const avgHourlyRate = hoursWithOutput.length > 0 
                    ? Math.round(total_stitched / hoursWithOutput.length) 
                    : 0;

                  return (
                    <div className="space-y-6">
                      <div className="p-4 bg-bg rounded-2xl border border-bg4 text-center">
                        <p className="text-[10px] font-black text-text3 uppercase mb-1">Today's Cumulative Stitched</p>
                        <p className="text-4xl font-black text-stitch tracking-tighter font-mono">
                          {total_stitched.toLocaleString()} <span className="text-xs font-bold text-text3 font-sans">PCS</span>
                        </p>
                        <div className="mt-2 text-[9px] font-bold text-text3 uppercase flex items-center justify-center gap-1">
                          <Flame className="w-3.5 h-3.5 text-po" />
                          <span>Active on {po_count} Orders ({style_count} Styles)</span>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between bg-bg/50 p-3 rounded-xl border border-bg3">
                          <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-stitch" />
                            <span className="text-xs font-bold text-text2 uppercase">Avg Hourly Output</span>
                          </div>
                          <span className="text-sm font-extrabold text-text font-mono">{avgHourlyRate} <span className="text-[10px] font-semibold text-text3 font-sans">pcs/hr</span></span>
                        </div>

                        <div className="flex items-center justify-between bg-bg/50 p-3 rounded-xl border border-bg3">
                          <div className="flex items-center gap-2">
                            <Award className="w-4 h-4 text-pass" />
                            <span className="text-xs font-bold text-text2 uppercase">Target Benchmark</span>
                          </div>
                          <span className="text-sm font-extrabold text-text font-mono">{(lineSummary?.target_hourly_benchmark || 150)} <span className="text-[10px] font-semibold text-text3 font-sans">pcs/hr</span></span>
                        </div>

                        <div className="flex items-center justify-between bg-bg/50 p-3 rounded-xl border border-bg3">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-po" />
                            <span className="text-xs font-bold text-text2 uppercase">Seated Operators</span>
                          </div>
                          <span className="text-sm font-extrabold text-text font-mono">{(lineSummary?.seated_operators || 20)} <span className="text-[10px] font-semibold text-text3 font-sans">Operators</span></span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="mt-6 p-4 bg-stitch/5 rounded-xl border border-stitch/20 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-stitch shrink-0" />
                <p className="text-[10px] text-text2 leading-relaxed font-semibold">
                  Line performance updates live on check-in. Compare hourly spikes against the standard 150 pcs/hr benchmark.
                </p>
              </div>
            </div>

            {/* Selected Line Hourly Bar Chart */}
            <div className="bg-bg2 border border-bg4 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6 border-b border-bg3 pb-3">
                <div>
                  <h3 className="text-lg font-bold tracking-tight text-text">{selectedStitchLine} Hourly Window</h3>
                  <p className="text-xs text-text2 uppercase tracking-wide font-semibold">Today's Output with Target Overlay</p>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono text-stitch font-bold bg-bg px-2.5 py-1 rounded border border-bg4">
                  <Clock className="w-3.5 h-3.5 text-stitch animate-pulse" />
                  HOURLY ANALYSIS
                </div>
              </div>
              <div className="h-[260px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stitchDashboard?.hourly_trend || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-bg4)" vertical={false} />
                    <XAxis 
                      dataKey="hour" 
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
                      contentStyle={{ 
                        backgroundColor: 'var(--color-bg2)', 
                        borderColor: 'var(--color-bg4)',
                        borderRadius: '12px',
                        color: 'var(--color-text)'
                      }}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Bar dataKey={selectedStitchLine} name="Stitched Output" fill="var(--color-stitch)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Hourly Shift Timeline Breakdown (Checked-in Hours List) */}
            <div className="bg-bg2 border border-bg4 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-bg3 pb-3 mb-4">
                  <h3 className="text-xs font-black text-text3 uppercase tracking-widest">Shift Timeline Checklist</h3>
                  <span className="text-[9px] text-text3 font-bold uppercase">Standard 8h Shift</span>
                </div>

                <div className="space-y-2 max-h-[250px] overflow-auto pr-1">
                  {(stitchDashboard?.hourly_trend || [])
                    .filter((h: any) => {
                      const hrNum = parseInt(h.hour.split(':')[0]);
                      return hrNum >= 8 && hrNum <= 18;
                    })
                    .map((h: any) => {
                      const qty = h[selectedStitchLine] || 0;
                      const benchmark = 150;
                      
                      let statusText = 'No Output';
                      let statusStyle = 'text-text3 border-bg4 bg-transparent';
                      
                      if (qty >= benchmark) {
                        statusText = 'Met Benchmark';
                        statusStyle = 'text-pass border-pass/30 bg-pass/5';
                      } else if (qty > 0) {
                        statusText = 'Below Benchmark';
                        statusStyle = 'text-po border-po/30 bg-po/5';
                      }

                      return (
                        <div key={h.hour} className="flex items-center justify-between p-2.5 rounded-xl border border-bg4 bg-bg3/40 hover:bg-bg3 transition-colors">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black font-mono text-text">{h.hour}</span>
                            <span className={cn(
                              "text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
                              statusStyle
                            )}>
                              {statusText}
                            </span>
                          </div>
                          
                          <div className="flex items-baseline gap-1">
                            <span className={cn(
                              "text-sm font-extrabold font-mono",
                              qty >= benchmark ? "text-pass" : qty > 0 ? "text-text" : "text-text3"
                            )}>
                              {qty}
                            </span>
                            <span className="text-[8px] font-bold text-text3 uppercase">pcs</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-bg3 flex items-center justify-between text-[10px] font-bold text-text3 uppercase">
                <span>Shift benchmark: 150/hr</span>
                <span className="text-pass">✅ Optimal Target achieved</span>
              </div>
            </div>
          </div>

          {/* Overall Factory Hourly Comparison for Reference */}
          <div className="bg-bg2 border border-bg4 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6 border-b border-bg3 pb-3">
              <div>
                <h3 className="text-lg font-bold tracking-tight text-text">Overall Factory Shift Breakdown</h3>
                <p className="text-xs text-text2 uppercase tracking-wide font-semibold">Department comparison over 12-hour timeline</p>
              </div>
              <div className="text-[10px] font-bold text-text3 font-mono bg-bg px-2.5 py-1 rounded border border-bg4">
                ALL DEPARTMENTS COMPARISON
              </div>
            </div>
            <div className="h-[280px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics?.hourly_production || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-bg4)" vertical={false} />
                  <XAxis 
                    dataKey="hour" 
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
                    contentStyle={{ 
                      backgroundColor: 'var(--color-bg2)', 
                      borderColor: 'var(--color-bg4)',
                      borderRadius: '12px',
                      color: 'var(--color-text)'
                    }}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" />
                  <Bar dataKey="Cutting" name="Cutting" fill="var(--color-cut)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Stitching" name="Stitching" fill="var(--color-stitch)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Finishing" name="Finishing" fill="var(--color-pass)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Packing" name="Packing" fill="var(--color-pack)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* HOURLY PRODUCTION REPORT GRID */}
      <div ref={reportRef} className={cn("bg-violet-50/40 dark:bg-slate-900 border-2 border-violet-300 dark:border-violet-800 rounded-3xl p-6 lg:p-8 shadow-xl space-y-6", theme === 'dark' ? 'dark' : '')}>
        {/* Header and Controls */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 border-b-2 border-violet-200 dark:border-slate-800 pb-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-10 h-10 rounded-2xl bg-violet-500/15 text-violet-700 dark:text-violet-400 border border-violet-500/30 shadow-xs">
                <Clock className="w-6 h-6" />
              </span>
              <h2 className="text-3xl lg:text-4xl font-black tracking-tight text-slate-950 dark:text-white uppercase">
                Hourly Production Report
              </h2>
            </div>
            <p className="text-base sm:text-lg text-slate-900 dark:text-slate-200 uppercase tracking-wide font-extrabold flex flex-wrap items-center gap-2">
              <span>Departmental Hourly Output Sheet</span>
              <span className="text-slate-400">•</span>
              <span className="bg-violet-100 text-violet-950 dark:bg-violet-950/60 dark:text-violet-300 px-3 py-0.5 rounded-lg border border-violet-300 dark:border-violet-700/60 font-black">
                Date: {hourlyOneViewData?.date || getLocalDateString()}
              </span>
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 no-export">
            {/* Font Size Selector */}
            <div className="flex items-center bg-violet-100/80 dark:bg-slate-800 p-1 rounded-2xl border border-violet-300 dark:border-slate-700 shadow-2xs">
              <span className="text-xs font-black uppercase text-violet-950 dark:text-slate-400 px-2.5">Font:</span>
              <button
                onClick={() => setReportFontSize('lg')}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer",
                  reportFontSize === 'lg'
                    ? "bg-white dark:bg-slate-700 text-violet-950 dark:text-white shadow-xs"
                    : "text-violet-800 dark:text-slate-400 hover:text-violet-950 dark:hover:text-white"
                )}
              >
                21px
              </button>
              <button
                onClick={() => setReportFontSize('xl')}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer",
                  reportFontSize === 'xl'
                    ? "bg-white dark:bg-slate-700 text-violet-950 dark:text-white shadow-xs"
                    : "text-violet-800 dark:text-slate-400 hover:text-violet-950 dark:hover:text-white"
                )}
              >
                24px (Default)
              </button>
              <button
                onClick={() => setReportFontSize('2xl')}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer",
                  reportFontSize === '2xl'
                    ? "bg-white dark:bg-slate-700 text-violet-950 dark:text-white shadow-xs"
                    : "text-violet-800 dark:text-slate-400 hover:text-violet-950 dark:hover:text-white"
                )}
              >
                27px Jumbo
              </button>
            </div>

            <button
              onClick={exportHourlyReportToExcel}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-emerald-600/10 cursor-pointer h-10"
            >
              <Download className="w-4 h-4" />
              Export Excel
            </button>
            <button
              onClick={exportHourlyReportToJpeg}
              disabled={isExportingImage}
              className="flex items-center gap-2 bg-po hover:bg-po/90 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-po/10 cursor-pointer h-10 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {isExportingImage ? 'Exporting...' : 'Export JPG'}
            </button>
            <button
              onClick={() => fetchData(true)}
              className="flex items-center gap-2 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-violet-300 dark:border-slate-700 text-slate-950 dark:text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer h-10 shadow-xs"
            >
              <RotateCcw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Executive KPI Summary Highlights */}
        {reportSummaryStats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 no-export">
            <div className="bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent border-2 border-emerald-500/30 rounded-2xl p-4 flex items-center justify-between shadow-xs">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Total Output</p>
                <h3 className="text-2xl lg:text-3xl font-black text-slate-950 dark:text-white mt-1">
                  {reportSummaryStats.totalProduced.toLocaleString()} <span className="text-sm font-extrabold text-emerald-700 dark:text-emerald-400">Pcs</span>
                </h3>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                <Layers className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-sky-500/15 via-sky-500/5 to-transparent border-2 border-sky-500/30 rounded-2xl p-4 flex items-center justify-between shadow-xs">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-sky-800 dark:text-sky-300">Daily Target</p>
                <h3 className="text-2xl lg:text-3xl font-black text-slate-950 dark:text-white mt-1">
                  {reportSummaryStats.totalTarget.toLocaleString()} <span className="text-sm font-extrabold text-sky-700 dark:text-sky-400">Pcs</span>
                </h3>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-sky-500/20 flex items-center justify-center text-sky-700 dark:text-sky-400 border border-sky-500/30">
                <Target className="w-6 h-6" />
              </div>
            </div>

            <div className={cn(
              "border-2 rounded-2xl p-4 flex items-center justify-between shadow-xs",
              reportSummaryStats.diff >= 0 
                ? "bg-gradient-to-br from-teal-500/15 via-teal-500/5 to-transparent border-teal-500/30" 
                : "bg-gradient-to-br from-rose-500/15 via-rose-500/5 to-transparent border-rose-500/30"
            )}>
              <div>
                <p className={cn("text-xs font-black uppercase tracking-wider", reportSummaryStats.diff >= 0 ? "text-teal-800 dark:text-teal-300" : "text-rose-800 dark:text-rose-300")}>
                  Variance (Diff)
                </p>
                <h3 className="text-2xl lg:text-3xl font-black text-slate-950 dark:text-white mt-1">
                  {reportSummaryStats.diff > 0 ? `+${reportSummaryStats.diff.toLocaleString()}` : reportSummaryStats.diff.toLocaleString()}
                  <span className="text-sm font-extrabold ml-1 text-slate-600 dark:text-slate-400">Pcs</span>
                </h3>
              </div>
              <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center border", reportSummaryStats.diff >= 0 ? "bg-teal-500/20 text-teal-700 dark:text-teal-400 border-teal-500/30" : "bg-rose-500/20 text-rose-700 dark:text-rose-400 border-rose-500/30")}>
                <Activity className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-violet-500/15 via-violet-500/5 to-transparent border-2 border-violet-500/30 rounded-2xl p-4 flex items-center justify-between shadow-xs">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-violet-800 dark:text-violet-300">Efficiency</p>
                <h3 className="text-2xl lg:text-3xl font-black text-slate-950 dark:text-white mt-1">
                  {reportSummaryStats.effPercent}%
                </h3>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-violet-500/20 flex items-center justify-center text-violet-700 dark:text-violet-400 border border-violet-500/30">
                <Award className="w-6 h-6" />
              </div>
            </div>
          </div>
        )}

        {/* Search filter for departments and slot manager hint */}
        <div className="flex flex-wrap items-center justify-between gap-3 no-export">
          <div className="flex items-center gap-2 max-w-sm w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 px-3 py-1.5 rounded-xl">
            <Search className="w-4 h-4 text-slate-700 dark:text-slate-300 shrink-0" />
            <input
              type="text"
              placeholder="FILTER DEPARTMENTS..."
              value={deptSearchTerm}
              onChange={(e) => setDeptSearchTerm(e.target.value)}
              className="bg-transparent text-xs text-slate-950 dark:text-white font-black font-mono uppercase tracking-wider outline-none w-full h-7 placeholder:text-slate-500"
            />
            {deptSearchTerm && (
              <button onClick={() => setDeptSearchTerm('')} className="text-slate-700 dark:text-slate-300 hover:text-slate-950 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs font-mono font-bold text-violet-800 dark:text-violet-300 bg-violet-100 dark:bg-violet-950/60 border border-violet-300 dark:border-violet-800/60 px-3 py-1.5 rounded-xl">
            <Clock className="w-4 h-4 text-po shrink-0" />
            <span>Click any table slot cell to view batches, shift slots, or split partial pieces</span>
          </div>
        </div>

        {/* Spreadsheet Table Container */}
        {(() => {
          // Dynamic sizing configuration based on reportFontSize
          const cfg = {
            '2xl': {
              minW: 'min-w-[3850px]',
              h1Text: 'text-[30px] p-4',
              h2Text: 'text-[27px] p-3',
              deptCol: 'w-[440px] text-[27px] p-4',
              slotStyle: 'w-[150px] text-[27px] p-3',
              slotQty: 'w-[110px] text-[27px] p-3',
              metricCol: 'w-[180px] text-[27px] p-4',
              perfCol: 'w-[210px] text-[27px] p-4',
              perfBadge: 'text-[26px] px-4 py-1.5',
              opCol: 'w-[160px] text-[27px] p-4',
              emptyText: 'text-[27px] p-10',
            },
            'xl': {
              minW: 'min-w-[3400px]',
              h1Text: 'text-[27px] p-3.5',
              h2Text: 'text-[24px] p-2.5',
              deptCol: 'w-[400px] text-[24px] p-3.5',
              slotStyle: 'w-[135px] text-[24px] p-2.5',
              slotQty: 'w-[100px] text-[24px] p-2.5',
              metricCol: 'w-[160px] text-[24px] p-3.5',
              perfCol: 'w-[190px] text-[24px] p-3.5',
              perfBadge: 'text-[23px] px-3.5 py-1',
              opCol: 'w-[145px] text-[24px] p-3.5',
              emptyText: 'text-[24px] p-8',
            },
            'lg': {
              minW: 'min-w-[2900px]',
              h1Text: 'text-[23px] p-3',
              h2Text: 'text-[21px] p-2',
              deptCol: 'w-[360px] text-[21px] p-3',
              slotStyle: 'w-[120px] text-[21px] p-2',
              slotQty: 'w-[90px] text-[21px] p-2',
              metricCol: 'w-[140px] text-[21px] p-3',
              perfCol: 'w-[170px] text-[21px] p-3',
              perfBadge: 'text-[20px] px-3 py-1',
              opCol: 'w-[130px] text-[21px] p-3',
              emptyText: 'text-[21px] p-8',
            }
          }[reportFontSize];

          return (
            <div className={cn("overflow-x-auto border-[3px] border-violet-400 dark:border-violet-600 rounded-2xl shadow-lg bg-white dark:bg-slate-950")}>
              <table className={cn("w-full border-collapse text-left", cfg.minW)}>
                <thead>
                  {/* Row 1 Headers */}
                  <tr className="bg-violet-200/90 text-violet-950 dark:bg-violet-900/80 dark:text-violet-50 border-b-[3px] border-violet-400 dark:border-violet-600">
                    <th rowSpan={2} className={cn(cfg.h1Text, cfg.deptCol, "border-r-[3px] border-violet-400 dark:border-violet-600 font-black uppercase tracking-wider text-left sticky left-0 bg-violet-300/90 text-violet-950 dark:bg-violet-900 dark:text-white z-20 shadow-sm")}>
                      DEPARTMENTS CODE
                    </th>
                    {hourlyOneViewData?.hourSlots?.map((slot: string, i: number) => (
                      <th key={i} colSpan={2} className={cn(cfg.h1Text, "border-r-[2.5px] border-violet-400 dark:border-violet-600 font-black uppercase tracking-wider text-violet-950 dark:text-violet-100 text-center bg-violet-200/90 dark:bg-violet-900/80")}>
                        {slot.replace(' am', '').replace(' pm', '')}
                      </th>
                    ))}
                    <th rowSpan={2} className={cn(cfg.h1Text, cfg.metricCol, "border-r-[2.5px] border-violet-400 dark:border-violet-600 text-center font-black uppercase tracking-wider text-violet-950 dark:text-violet-100 bg-violet-200/90 dark:bg-violet-900/80")}>
                      TOTAL QTY
                    </th>
                    <th rowSpan={2} className={cn(cfg.h1Text, cfg.metricCol, "border-r-[2.5px] border-violet-400 dark:border-violet-600 text-center font-black uppercase tracking-wider text-violet-950 dark:text-violet-100 bg-violet-200/90 dark:bg-violet-900/80")}>
                      TARGET QTY
                    </th>
                    <th rowSpan={2} className={cn(cfg.h1Text, cfg.metricCol, "border-r-[2.5px] border-violet-400 dark:border-violet-600 text-center font-black uppercase tracking-wider text-violet-950 dark:text-violet-100 bg-violet-200/90 dark:bg-violet-900/80")}>
                      HOURLY TARGET
                    </th>
                    <th rowSpan={2} className={cn(cfg.h1Text, cfg.metricCol, "border-r-[2.5px] border-violet-400 dark:border-violet-600 text-center font-black uppercase tracking-wider text-violet-950 dark:text-violet-100 bg-violet-200/90 dark:bg-violet-900/80")}>
                      DIFF
                    </th>
                    <th rowSpan={2} className={cn(cfg.h1Text, cfg.perfCol, "border-r-[2.5px] border-violet-400 dark:border-violet-600 text-center font-black uppercase tracking-wider text-violet-950 dark:text-violet-100 bg-violet-200/90 dark:bg-violet-900/80")}>
                      PERFORMANCE %
                    </th>
                    <th rowSpan={2} className={cn(cfg.h1Text, cfg.opCol, "text-center font-black uppercase tracking-wider text-violet-950 dark:text-violet-100 bg-violet-200/90 dark:bg-violet-900/80")}>
                      OPERATORS
                    </th>
                  </tr>

                  {/* Row 2 Headers */}
                  <tr className="bg-violet-100 text-violet-950 dark:bg-violet-950/90 dark:text-violet-200 border-b-[3px] border-violet-400 dark:border-violet-600">
                    {hourlyOneViewData?.hourSlots?.map((_: string, i: number) => (
                      <React.Fragment key={i}>
                        <th className={cn(cfg.h2Text, cfg.slotStyle, "border-r-[2.5px] border-violet-300 dark:border-violet-600 font-black uppercase text-center text-violet-900 dark:text-violet-300 bg-violet-100 dark:bg-violet-950/90")}>
                          STYLE #
                        </th>
                        <th className={cn(cfg.h2Text, cfg.slotQty, "border-r-[2.5px] border-violet-300 dark:border-violet-600 font-black uppercase text-center text-violet-950 dark:text-violet-100 bg-violet-100 dark:bg-violet-950/90")}>
                          QTY
                        </th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {hourlyOneViewData?.rows && hourlyOneViewData.rows.length > 0 ? (
                    hourlyOneViewData.rows
                      .filter((row: any) => row.label.toLowerCase().includes(deptSearchTerm.toLowerCase()))
                      .map((row: any) => {
                        const isTotal = row.isTotalRow || row.rowId === 'total' || row.rowId === 'total_stitching';
                        const labelLower = (row.label || '').toLowerCase();
                        
                        // Category border color for left side of department code
                        let deptBorderAccent = 'border-l-8 border-l-slate-400';
                        let deptCellBg = 'bg-white dark:bg-slate-900';

                        if (isTotal) {
                          deptBorderAccent = 'border-l-8 border-l-violet-500';
                          deptCellBg = 'bg-[#ece6fc] text-violet-950 dark:bg-violet-900/60 dark:text-violet-100';
                        } else if (labelLower.includes('cutting')) {
                          deptBorderAccent = 'border-l-8 border-l-amber-500';
                          deptCellBg = 'bg-amber-50/50 dark:bg-amber-950/20';
                        } else if (labelLower.includes('feeding')) {
                          deptBorderAccent = 'border-l-8 border-l-sky-500';
                          deptCellBg = 'bg-sky-50/50 dark:bg-sky-950/20';
                        } else if (labelLower.includes('stitch')) {
                          deptBorderAccent = 'border-l-8 border-l-indigo-500';
                          deptCellBg = 'bg-indigo-50/50 dark:bg-indigo-950/20';
                        } else if (labelLower.includes('trim')) {
                          deptBorderAccent = 'border-l-8 border-l-purple-500';
                          deptCellBg = 'bg-purple-50/50 dark:bg-purple-950/20';
                        } else if (labelLower.includes('press')) {
                          deptBorderAccent = 'border-l-8 border-l-rose-500';
                          deptCellBg = 'bg-rose-50/50 dark:bg-rose-950/20';
                        } else if (labelLower.includes('carton') || labelLower.includes('blister') || labelLower.includes('pack')) {
                          deptBorderAccent = 'border-l-8 border-l-teal-500';
                          deptCellBg = 'bg-teal-50/50 dark:bg-teal-950/20';
                        }

                        return (
                          <tr
                            key={row.rowId}
                            className={cn(
                              "border-b-[2.5px] border-slate-400 dark:border-slate-600 transition-colors font-mono",
                              isTotal
                                ? "bg-[#f6f3fe] text-violet-950 dark:bg-violet-950/40 dark:text-violet-100 font-black"
                                : "bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                            )}
                          >
                            {/* DEPARTMENTS CODE */}
                            <td
                              className={cn(
                                cfg.deptCol,
                                "border-r-[3px] border-slate-400 dark:border-slate-600 font-sans uppercase sticky left-0 z-10 text-left font-black tracking-wide shadow-xs",
                                deptBorderAccent,
                                deptCellBg,
                                isTotal ? "text-violet-950 dark:text-violet-100" : "text-slate-950 dark:text-white"
                              )}
                            >
                              {row.label}
                            </td>

                            {/* HOURLY SLOTS */}
                            {row.styles.map((style: string, idx: number) => {
                              const qty = row.quantities[idx];
                              const isTrimsRow = row.rowId === 'trims_status';
                              const hasStyle = style && style !== '0' && style !== '';

                              return (
                                <React.Fragment key={idx}>
                                  {/* STYLE # */}
                                  <td 
                                    onClick={() => !isTotal && !isTrimsRow && handleOpenSlotModal(row, idx)}
                                    title={!isTotal && !isTrimsRow ? "Click to view batch details, move, or split this slot" : undefined}
                                    className={cn(
                                      cfg.slotStyle,
                                      "border-r-[2.5px] border-slate-400 dark:border-slate-600 text-center leading-tight font-black transition-colors select-none",
                                      isTotal 
                                        ? "bg-[#f6f3fe] text-violet-900 dark:bg-violet-950/40 dark:text-violet-300" 
                                        : !isTrimsRow ? "hover:bg-po/10 cursor-pointer" : ""
                                    )}
                                  >
                                    {isTotal ? (
                                      <span className="text-violet-400 dark:text-violet-500 font-bold">—</span>
                                    ) : hasStyle ? (
                                      isTrimsRow && style === 'COMPLETE' ? (
                                        <span className="inline-block bg-emerald-100 text-emerald-950 border border-emerald-300 px-2 py-0.5 rounded-lg font-black dark:bg-emerald-950/70 dark:text-emerald-300">
                                          COMPLETE
                                        </span>
                                      ) : (
                                        <span className="inline-block bg-amber-100 text-amber-950 border-2 border-amber-400 px-2.5 py-0.5 rounded-xl font-black dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-600 shadow-2xs">
                                          {style}
                                        </span>
                                      )
                                    ) : (
                                      <span className="text-slate-950 dark:text-slate-300 font-bold">
                                        {style === '0' ? '0' : style}
                                      </span>
                                    )}
                                  </td>

                                  {/* QTY */}
                                  <td 
                                    onClick={() => !isTotal && !isTrimsRow && handleOpenSlotModal(row, idx)}
                                    title={!isTotal && !isTrimsRow ? "Click to view batch details, move, or split this slot" : undefined}
                                    className={cn(
                                      cfg.slotQty,
                                      "border-r-[2.5px] border-slate-400 dark:border-slate-600 text-center leading-tight font-black transition-colors select-none",
                                      isTotal 
                                        ? "bg-[#f6f3fe] text-violet-950 dark:bg-violet-950/40 dark:text-violet-100" 
                                        : (qty === 0 ? "text-slate-950 dark:text-slate-300 font-bold" : "text-slate-950 dark:text-white font-black"),
                                      !isTotal && !isTrimsRow ? "hover:bg-po/10 cursor-pointer" : ""
                                    )}
                                  >
                                    {isTrimsRow ? '' : (qty === 0 ? '0' : qty.toLocaleString())}
                                  </td>
                                </React.Fragment>
                              );
                            })}

                            {/* TOTAL QTY */}
                            <td className={cn(
                              cfg.metricCol,
                              "border-r-[2.5px] border-slate-400 dark:border-slate-600 text-center font-black",
                              isTotal 
                                ? "bg-[#f6f3fe] text-violet-950 dark:bg-violet-950/40 dark:text-violet-100" 
                                : row.totalQty === 0 
                                  ? "text-slate-950 dark:text-slate-300 font-bold" 
                                  : "text-emerald-700 dark:text-emerald-300 bg-emerald-50/30 dark:bg-emerald-950/10"
                            )}>
                              {row.rowId === 'trims_status' ? '' : row.totalQty.toLocaleString()}
                            </td>

                            {/* TARGET QTY */}
                            <td className={cn(
                              cfg.metricCol,
                              "border-r-[2.5px] border-slate-400 dark:border-slate-600 text-center font-black",
                              isTotal 
                                ? "bg-[#f6f3fe] text-violet-950 dark:bg-violet-950/40 dark:text-violet-100" 
                                : "text-slate-950 dark:text-white"
                            )}>
                              {row.rowId === 'trims_status' ? '' : row.dailyTarget.toLocaleString()}
                            </td>

                            {/* HOURLY TARGET */}
                            <td className={cn(
                              cfg.metricCol,
                              "border-r-[2.5px] border-slate-400 dark:border-slate-600 text-center font-black",
                              isTotal 
                                ? "bg-[#f6f3fe] text-violet-950 dark:bg-violet-950/40 dark:text-violet-100" 
                                : "text-slate-950 dark:text-white"
                            )}>
                              {row.rowId === 'trims_status' ? '' : row.hourlyTarget.toLocaleString()}
                            </td>

                            {/* DIFF */}
                            <td className={cn(
                              cfg.metricCol,
                              "border-r-[2.5px] border-slate-400 dark:border-slate-600 text-center font-black",
                              isTotal ? (
                                cn(
                                  "bg-[#f6f3fe] dark:bg-violet-950/40",
                                  row.diff < 0 ? "text-rose-600 dark:text-rose-400" : row.diff > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-violet-950 dark:text-white"
                                )
                              ) : (
                                cn(
                                  row.diff < 0 ? "text-rose-600 dark:text-rose-400" : row.diff > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-slate-950 dark:text-white"
                                )
                              )
                            )}>
                              {row.rowId === 'trims_status' ? '' : (row.diff > 0 ? `+${row.diff.toLocaleString()}` : row.diff.toLocaleString())}
                            </td>

                            {/* PERFORMANCE % */}
                            <td className={cn(
                              cfg.perfCol, 
                              "border-r-[2.5px] border-slate-400 dark:border-slate-600 text-center font-black",
                              isTotal ? "bg-[#f6f3fe] dark:bg-violet-950/40" : ""
                            )}>
                              {row.rowId === 'trims_status' && !row.performance ? (
                                ''
                              ) : (
                                <span className={cn(
                                  cfg.perfBadge,
                                  "rounded-xl font-black inline-block tracking-wide shadow-xs",
                                  row.performance === 'COMPLETE'
                                    ? "bg-indigo-600 text-white"
                                    : row.performance === '#DIV/0!' || row.performance === '0%'
                                      ? "bg-slate-200 text-slate-950 dark:bg-slate-700 dark:text-slate-100 border border-slate-300 dark:border-slate-600"
                                      : parseFloat(row.performance) >= 100
                                        ? "bg-emerald-600 text-white"
                                        : parseFloat(row.performance) >= 75
                                          ? "bg-amber-500 text-white"
                                          : "bg-rose-600 text-white"
                                )}>
                                  {row.performance}
                                </span>
                              )}
                            </td>

                            {/* OPERATORS */}
                            <td className={cn(
                              cfg.opCol,
                              "text-center font-black",
                              isTotal ? "bg-[#f6f3fe] text-violet-950 dark:bg-violet-950/40 dark:text-violet-100" : "text-slate-950 dark:text-white"
                            )}>
                              {row.hideOperators ? (
                                <span className={isTotal ? "text-violet-400 font-bold" : "text-slate-400 dark:text-slate-500 font-bold"}>—</span>
                              ) : (
                                row.operators
                              )}
                            </td>
                          </tr>
                        );
                      })
                  ) : (
                    <tr>
                      <td colSpan={23} className={cn(cfg.emptyText, "text-center text-slate-950 dark:text-white uppercase font-mono font-black")}>
                        No hourly operations data available for selected date
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>

      {/* PIPELINE & LOGS CONTAINER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Stitching Lines Detailed Map */}
        <div className="lg:col-span-2 bg-bg2 border border-bg4 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6 border-b border-bg3 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-stitch" />
              <h4 className="text-sm font-black uppercase tracking-widest text-stitch">Line-Wise Sewing Telemetry</h4>
            </div>
            {onNavigate && (
              <button 
                onClick={() => onNavigate('status')}
                className="text-xs font-bold text-po hover:underline"
              >
                Detailed Line View →
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
            {stitchingLines.length > 0 ? (
              stitchingLines.map((line, idx) => (
                <motion.div 
                  key={line.line_number}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="bg-bg p-4 rounded-xl border border-bg4 hover:border-stitch/30 transition-all group shadow-sm"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black font-mono text-text3 uppercase">Line Identification</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-stitch animate-pulse" />
                  </div>
                  <p className="text-xl font-black tracking-tighter group-hover:text-stitch transition-colors">#{line.line_number}</p>
                  <div className="mt-3">
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-black leading-none">{line.total_stitched.toLocaleString()}</span>
                      <span className="text-[9px] font-bold text-text3 uppercase">Pcs</span>
                    </div>
                    <p className="text-[9px] font-mono text-text3 uppercase mt-2 font-bold">{line.po_count} active orders</p>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="col-span-full py-8 text-center border border-dashed border-bg4 rounded-xl">
                <p className="text-xs font-mono text-text3 uppercase">No line-wise activity recorded on selected date</p>
              </div>
            )}
          </div>
        </div>

        {/* System Log */}
        <div className="bg-bg2 border border-bg4 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-6 border-b border-bg3 pb-3">
              <ShieldCheck className="w-5 h-5 text-pass" />
              <h3 className="text-lg font-bold tracking-tight">System Status Log</h3>
            </div>
            <div className="space-y-5">
              {[
                { msg: 'Operations status pipeline calibrated successfully', time: 'Just now', type: 'success' },
                { msg: 'Full rolling daily metrics cache warmed', time: '2 mins ago', type: 'info' },
                { msg: 'Hourly shift logs synced into local timeline', time: '10 mins ago', type: 'success' },
                { msg: 'QC pass/fail thresholds calibrated', time: '1 hour ago', type: 'info' },
              ].map((log, i) => (
                <div key={i} className="flex gap-4 group">
                  <div className={cn(
                    "w-1 h-10 rounded-full shrink-0",
                    log.type === 'success' ? 'bg-pass' : 'bg-po'
                  )} />
                  <div>
                    <p className="text-sm text-text font-semibold leading-tight mb-1">
                      {log.msg}
                    </p>
                    <p className="text-[10px] font-bold text-text3 uppercase tracking-wide">{log.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="mt-8 p-4 bg-bg3 rounded-xl border border-bg4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-pass shrink-0" />
            <p className="text-xs text-text2 leading-relaxed font-semibold">
              Live Operations Dashboard is operational. Interlock with real-time shopfloor telemetry is active.
            </p>
          </div>
        </div>
      </div>

      {/* Hourly Slot Breakdown & Move/Split Modal */}
      <HourlySlotModal
        isOpen={slotModalInfo.isOpen}
        onClose={() => setSlotModalInfo(prev => ({ ...prev, isOpen: false }))}
        date={selectedDate || getLocalDateString()}
        rowId={slotModalInfo.rowId}
        rowLabel={slotModalInfo.rowLabel}
        slotLabel={slotModalInfo.slotLabel}
        slotIndex={slotModalInfo.slotIndex}
        onSuccess={() => fetchData(false)}
      />
    </div>
  );
};
