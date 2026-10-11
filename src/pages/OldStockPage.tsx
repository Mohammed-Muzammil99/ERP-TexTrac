import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { 
  PlusCircle, 
  Trash2, 
  Layers, 
  FileSpreadsheet, 
  ArrowUpRight, 
  CornerDownRight, 
  Search, 
  RefreshCcw, 
  Download, 
  Upload, 
  CheckCircle2, 
  Clock, 
  Activity, 
  Package, 
  Scissors, 
  Send,
  Tag,
  Palette,
  Smartphone
} from 'lucide-react';
import { oldStockService, customFormService } from '../services/erpService';
import { RequestAccessModal } from '../components/RequestAccessModal';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { MultiSelectFilter, ActiveFilterBar } from '../components/MultiSelectFilter';

const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];

export const OldStockPage: React.FC = () => {
  // Navigation / Tabs inside Page
  const [activeTab, setActiveTab] = useState<'manual' | 'bulk'>('manual');
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  
  // Database Autocomplete Helpers
  const [fetchableSources, setFetchableSources] = useState<{
    styles: string[];
    colors: string[];
    pos: { po_number: string; buyer: string }[];
  }>({ styles: [], colors: [], pos: [] });

  // Form states
  const [formData, setFormData] = useState({
    po_number: '',
    style_num: '',
    color: '',
    size: 'M',
    quantity: '',
    target_department: 'finishing' as 'feeding' | 'stitching' | 'finishing' | 'packing' | 'carton',
    line_number: 'LINE 1',
    cartons: '',
    pcs_per_carton: ''
  });

  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [loggingQuery, setLoggingQuery] = useState('');
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);

  // Excel Bulk Upload States
  const [bulkTargetDept, setBulkTargetDept] = useState<'feeding' | 'stitching' | 'finishing' | 'packing' | 'carton'>('finishing');
  const [bulkLineNumber, setBulkLineNumber] = useState('LINE 1');
  const [dragActive, setDragActive] = useState(false);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [parsingErrors, setParsingErrors] = useState<string[]>([]);
  const [isUploadingBulk, setIsUploadingBulk] = useState(false);

  // Fetch log records and autocompletes
  const fetchLogs = async () => {
    setIsLogsLoading(true);
    try {
      const data = await oldStockService.list();
      setLogs(data);
    } catch (err: any) {
      console.error('Failed to loading old stock logs:', err);
      toast.error('Failed to load old stock transaction log');
    } finally {
      setIsLogsLoading(false);
    }
  };

  const loadSources = async () => {
    try {
      const data = await customFormService.getFetchableSources();
      setFetchableSources({
        styles: data.styles || [],
        colors: data.colors || [],
        pos: data.pos || []
      });
    } catch (err) {
      console.error('Failed to fetch autocomplete sources', err);
    }
  };

  useEffect(() => {
    fetchLogs();
    loadSources();
  }, []);

  // Handle single manual insertion
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.style_num.trim() || !formData.color.trim() || !formData.quantity || !formData.size) {
      toast.error('Please complete all required fields.');
      return;
    }

    const qty = parseInt(formData.quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      toast.error('Please enter a valid positive quantity.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await oldStockService.create({
        po_number: formData.po_number || undefined,
        style_num: formData.style_num.trim(),
        color: formData.color.trim(),
        size: formData.size,
        quantity: qty,
        target_department: formData.target_department,
        line_number: ['stitching', 'finishing'].includes(formData.target_department) ? formData.line_number : undefined,
        cartons: formData.target_department === 'carton' && formData.cartons ? parseInt(formData.cartons) : undefined,
        pcs_per_carton: formData.target_department === 'carton' && formData.pcs_per_carton ? parseInt(formData.pcs_per_carton) : undefined,
      } as any);
      
      toast.success(response.message || 'Direct stock injection successful!');
      
      // Reset form quantity, preserve style details for subsequent quick fills
      setFormData(prev => ({
        ...prev,
        quantity: ''
      }));

      fetchLogs();
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.message || 'Error injecting stock';
      toast.error(`Stock Injection Failed: ${errMsg}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Delete transaction
  const handleDeleteLog = async (dept: string, id: number) => {
    if (!window.confirm('Are you sure you want to delete this old stock injection? It will reduce available stock levels accordingly.')) {
      return;
    }

    try {
      const res = await oldStockService.delete(dept, id);
      toast.success(res.message || 'Injection record deleted successfully');
      fetchLogs();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to remove record');
    }
  };

  // Bulk Excel download template
  const downloadTemplate = () => {
    const isStitchingOrFinishing = ['stitching', 'finishing'].includes(bulkTargetDept);
    const headers = isStitchingOrFinishing
      ? ['PO #', 'STYLE #', 'COLOR', 'LINE', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'Total']
      : ['PO #', 'STYLE #', 'COLOR', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'Total'];

    const sampleRows = [
      {
        'PO #': 'PO-2026-OLDSTK',
        'STYLE #': formData.style_num || 'ST-ALPHA',
        'COLOR': formData.color || 'NAVY',
        ...(isStitchingOrFinishing ? { 'LINE': bulkLineNumber } : {}),
        'XS': 12,
        'S': 24,
        'M': 56,
        'L': 56,
        'XL': 24,
        '2XL': 12,
        '3XL': 0,
        '4XL': 0,
        'Total': 184
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleRows, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Old Stock Template');
    XLSX.writeFile(workbook, `OldStock_Injection_${bulkTargetDept}.xlsx`);
    toast.success('Template downloaded successfully');
  };

  // Bulk Excel drag handler
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      parseExcelFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      parseExcelFile(e.target.files[0]);
    }
  };

  // Parse excel logic
  const parseExcelFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const d = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(d, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<any>(sheet);

        if (rows.length === 0) {
          toast.error('The uploaded sheet is empty.');
          return;
        }

        const mapped: any[] = [];
        const errors: string[] = [];

        rows.forEach((row, idx) => {
          const keys = Object.keys(row);
          const findVal = (possibleHeaders: string[]) => {
            const matched = keys.find(k => possibleHeaders.some(ph => k.toLowerCase().trim() === ph.toLowerCase()));
            return matched ? row[matched] : undefined;
          };

          const po = findVal(['po', 'po_number', 'po number', 'purchase order', 'po#', 'po #']);
          const style = findVal(['style', 'style_num', 'style_number', 'style num', 'style#', 'style #']);
          const color = findVal(['color', 'colour', 'shade']);
          const xlsLine = findVal(['line', 'line_number', 'line number', 'stitching line', 'workline']);

          if (!style || !color) {
            errors.push(`Row ${idx + 1}: Missing Style or Color.`);
            return;
          }

          // Sizes mapping
          let hasQty = false;
          SIZES.forEach(sizeName => {
            const sizeVal = keys.find(k => k.toUpperCase().trim() === sizeName.toUpperCase());
            if (sizeVal) {
              const qty = parseInt(String(row[sizeVal] || 0), 10);
              if (qty > 0) {
                hasQty = true;
                mapped.push({
                  po_number: po ? String(po).trim() : '',
                  style_num: String(style).trim(),
                  color: String(color).trim(),
                  size: sizeName,
                  quantity: qty,
                  line_number: xlsLine ? String(xlsLine).trim() : bulkLineNumber
                });
              }
            }
          });

          if (!hasQty) {
            errors.push(`Row ${idx + 1} (${style} / ${color}): No positive sizes (XS, S, M, L etc.) were filled.`);
          }
        });

        setParsedRows(mapped);
        setParsingErrors(errors);

        if (mapped.length > 0) {
          toast.success(`Successfully parsed ${mapped.length} size-level stock allocations!`);
        } else {
          toast.error('Failed to parse any valid size rows from the sheet.');
        }
      } catch (err: any) {
        console.error(err);
        toast.error('Error reading file. Ensure it is a valid format.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Upload parsed series
  const uploadBulkParsed = async () => {
    if (parsedRows.length === 0) return;
    setIsUploadingBulk(true);
    let successCount = 0;
    
    try {
      for (const row of parsedRows) {
        try {
          await oldStockService.create({
            po_number: row.po_number || undefined,
            style_num: row.style_num,
            color: row.color,
            size: row.size,
            quantity: row.quantity,
            target_department: bulkTargetDept,
            line_number: ['stitching', 'finishing'].includes(bulkTargetDept) ? row.line_number : undefined
          });
          successCount++;
        } catch (err) {
          console.error(`Row fail:`, row, err);
        }
      }

      toast.success(`Succesfully uploaded ${successCount} of ${parsedRows.length} stock updates!`);
      setParsedRows([]);
      setParsingErrors([]);
      fetchLogs();
    } catch (err: any) {
      toast.error('An error occurred during bulk old stock updates.');
    } finally {
      setIsUploadingBulk(false);
    }
  };

  const availableStyleOptions = useMemo(() => {
    const styleCounts: Record<string, number> = {};
    logs.forEach(item => {
      if (item.style_num) {
        styleCounts[item.style_num] = (styleCounts[item.style_num] || 0) + 1;
      }
    });
    return Object.keys(styleCounts).sort().map(s => ({ value: s, count: styleCounts[s] }));
  }, [logs]);

  const availableColorOptions = useMemo(() => {
    const colorCounts: Record<string, number> = {};
    logs.forEach(item => {
      if (item.color) {
        colorCounts[item.color] = (colorCounts[item.color] || 0) + 1;
      }
    });
    return Object.keys(colorCounts).sort().map(c => ({ value: c, count: colorCounts[c] }));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      if (selectedStyles.length > 0 && !selectedStyles.includes(l.style_num)) {
        return false;
      }
      if (selectedColors.length > 0 && !selectedColors.includes(l.color)) {
        return false;
      }

      if (loggingQuery.trim()) {
        const q = loggingQuery.toLowerCase();
        return (
          String(l.style_num).toLowerCase().includes(q) ||
          String(l.color).toLowerCase().includes(q) ||
          String(l.po_number).toLowerCase().includes(q) ||
          String(l.size).toLowerCase().includes(q) ||
          String(l.department).toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [logs, loggingQuery, selectedStyles, selectedColors]);

  const filteredTotalQty = useMemo(() => {
    return filteredLogs.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0);
  }, [filteredLogs]);

  const departmentIcons: Record<string, any> = {
    feeding: Send,
    stitching: Activity,
    finishing: CheckCircle2,
    packing: Package,
    carton: Package
  };

  const getDeptColorClass = (d: string) => {
    switch (d) {
      case 'feeding': return 'text-cut bg-cut/10 border-cut/20';
      case 'stitching': return 'text-send bg-send/10 border-send/20';
      case 'finishing': return 'text-stitch bg-stitch/10 border-stitch/20';
      case 'packing': return 'text-pass bg-pass/10 border-pass/20';
      case 'carton': return 'text-po bg-po/10 border-po/20';
      default: return 'text-text3 bg-bg3/10 border-bg4';
    }
  };

  return (
    <div className="space-y-10 pb-24">
      {/* Visual Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center border border-amber-500/20">
              <Layers className="w-6 h-6" />
            </div>
            <h2 className="text-3xl font-black uppercase tracking-tighter text-text">Old Stock Store</h2>
          </div>
          <p className="text-text3 text-[11px] font-bold uppercase tracking-[0.2em] ml-1">
            Manual injection reservoir to balance negative deficits and backlog imbalances
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setIsRequestModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-bold uppercase tracking-wider shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <Smartphone className="w-4 h-4" />
            <span>Request via WhatsApp</span>
          </button>

          <div className="flex gap-2 bg-bg3 p-1.5 rounded-2xl border border-bg4 shadow-inner max-w-xs">
            <button
              onClick={() => setActiveTab('manual')}
              className={cn(
                "flex-1 px-4 py-2 rounded-xl text-center font-black uppercase text-[10px] tracking-wide transition-all",
                activeTab === 'manual' 
                  ? "bg-bg text-text shadow-sm border border-bg4" 
                  : "text-text3 hover:text-text"
              )}
            >
              Direct Entry
            </button>
            <button
              onClick={() => setActiveTab('bulk')}
              className={cn(
                "flex-1 px-4 py-2 rounded-xl text-center font-black uppercase text-[10px] tracking-wide transition-all",
                activeTab === 'bulk' 
                  ? "bg-bg text-text shadow-sm border border-bg4" 
                  : "text-text3 hover:text-text"
              )}
            >
              Bulk Excel
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* Form Container (Left Pane) */}
        <div className="lg:col-span-4 space-y-8">
          <div className="p-8 bg-bg2 border border-bg4 rounded-[2rem] shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-bg4 pb-4">
              <PlusCircle className="w-5 h-5 text-amber-500" />
              <h3 className="font-black uppercase text-sm tracking-tight text-text">
                {activeTab === 'manual' ? 'Stock Injection Form' : 'Bulk Upload Setup'}
              </h3>
            </div>

            {activeTab === 'manual' ? (
              <form onSubmit={handleManualSubmit} className="space-y-5">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-text2 mb-1.5">Target Department Store</label>
                  <select
                    value={formData.target_department}
                    onChange={(e) => setFormData(prev => ({ ...prev, target_department: e.target.value as any }))}
                    className="w-full bg-bg shadow-inner border border-bg4 rounded-xl px-4 py-3 text-xs text-text focus:outline-none focus:border-amber-500 font-bold"
                  >
                    <option value="feeding">Feeding Store (Cut Inventory, ready for Feeding)</option>
                    <option value="stitching">Stitching Store (Fed Inventory, ready for Stitching)</option>
                    <option value="finishing">Finishing Store (Stitched Inventory, ready for Finishing)</option>
                    <option value="packing">Packing Store (Finished Inventory, ready for Packing)</option>
                    <option value="carton">Carton Store / Warehouse (Packed Inventory, ready for Shipping)</option>
                  </select>
                </div>

                {['stitching', 'finishing'].includes(formData.target_department) && (
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-text2 mb-1.5">Line Allocation</label>
                    <select
                      value={formData.line_number}
                      onChange={(e) => setFormData(prev => ({ ...prev, line_number: e.target.value }))}
                      className="w-full bg-bg shadow-inner border border-bg4 rounded-xl px-4 py-3 text-xs text-text focus:outline-none focus:border-amber-500 font-bold"
                    >
                      <option value="LINE 1">LINE 1</option>
                      <option value="LINE 2">LINE 2</option>
                      <option value="LINE 3">LINE 3</option>
                      <option value="LINE 4">LINE 4</option>
                      <option value="LINE 5">LINE 5</option>
                      <option value="OLD_STOCK_LINE">OLD_STOCK_LINE</option>
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-text2 mb-1.5">Style #</label>
                    <input
                      type="text"
                      list="autocomplete-styles"
                      value={formData.style_num}
                      onChange={(e) => setFormData(prev => ({ ...prev, style_num: e.target.value.toUpperCase() }))}
                      placeholder="e.g. ST-404"
                      className="w-full bg-bg shadow-inner border border-bg4 rounded-xl px-4 py-3 text-xs text-text focus:outline-none focus:border-amber-500 font-black uppercase"
                      required
                    />
                    <datalist id="autocomplete-styles">
                      {fetchableSources.styles.map(s => <option key={s} value={s} />)}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-text2 mb-1.5">Color</label>
                    <input
                      type="text"
                      list="autocomplete-colors"
                      value={formData.color}
                      onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value.toUpperCase() }))}
                      placeholder="e.g. BLACK"
                      className="w-full bg-bg shadow-inner border border-bg4 rounded-xl px-4 py-3 text-xs text-text focus:outline-none focus:border-amber-500 font-black uppercase"
                      required
                    />
                    <datalist id="autocomplete-colors">
                      {fetchableSources.colors.map(c => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-text2 mb-1.5">Size Name</label>
                    <select
                      value={formData.size}
                      onChange={(e) => setFormData(prev => ({ ...prev, size: e.target.value }))}
                      className="w-full bg-bg shadow-inner border border-bg4 rounded-xl px-4 py-3 text-xs text-text focus:outline-none focus:border-amber-500 font-bold"
                    >
                      {SIZES.map(sz => <option key={sz} value={sz}>{sz}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-text2 mb-1.5">PCS / Quantity</label>
                    <input
                      type="number"
                      value={formData.quantity}
                      onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))}
                      placeholder="e.g. 100"
                      className="w-full bg-bg shadow-inner border border-bg4 rounded-xl px-4 py-3 text-xs text-text focus:outline-none focus:border-amber-500 font-black text-amber-500"
                      required
                    />
                  </div>
                </div>

                {formData.target_department === 'carton' && (
                  <div className="grid grid-cols-2 gap-4 animate-fade-in p-4 bg-bg3/50 rounded-2xl border border-bg4 border-dashed">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-text2 mb-1.5">Pcs per Carton <span className="text-text3 text-[9px] font-normal normal-case">(optional, default: quantity)</span></label>
                      <input
                        type="number"
                        value={formData.pcs_per_carton}
                        onChange={(e) => setFormData(prev => ({ ...prev, pcs_per_carton: e.target.value }))}
                        placeholder="e.g. 24"
                        className="w-full bg-bg shadow-inner border border-bg4 rounded-xl px-4 py-3 text-xs text-text focus:outline-none focus:border-amber-500 font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-text2 mb-1.5">Carton Units <span className="text-text3 text-[9px] font-normal normal-case">(optional, default: 1)</span></label>
                      <input
                        type="number"
                        value={formData.cartons}
                        onChange={(e) => setFormData(prev => ({ ...prev, cartons: e.target.value }))}
                        placeholder="e.g. 3"
                        className="w-full bg-bg shadow-inner border border-bg4 rounded-xl px-4 py-3 text-xs text-text focus:outline-none focus:border-amber-500 font-mono font-bold"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-text3 mb-1.5">
                    PO # <span className="text-text3/60 italic font-medium font-sans">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    list="autocomplete-pos"
                    value={formData.po_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, po_number: e.target.value.toUpperCase() }))}
                    placeholder="Defaults to UNALLOCATED"
                    className="w-full bg-bg shadow-inner border border-bg4 rounded-xl px-4 py-3 text-xs text-text focus:outline-none focus:border-amber-500 font-bold uppercase"
                  />
                  <datalist id="autocomplete-pos">
                    {fetchableSources.pos.map(p => <option key={p.po_number} value={p.po_number} />)}
                  </datalist>
                  <p className="text-[9px] text-text3 mt-1.5 leading-relaxed uppercase tracking-normal">
                    Leave blank to store in unallocated buyer pool, or select an active Purchase Order to balance details.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-amber-500 hover:bg-amber-600 active:scale-95 text-white py-3 rounded-2xl font-black uppercase text-xs tracking-wider transition-all shadow-md shadow-amber-500/10 flex items-center justify-center gap-2 mt-4 cursor-pointer"
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <ArrowUpRight className="w-4 h-4" />
                      Inject Into Store
                    </>
                  )}
                </button>
              </form>
            ) : (
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-text2 mb-1.5">Select Target Dept</label>
                  <select
                    value={bulkTargetDept}
                    onChange={(e) => {
                      setBulkTargetDept(e.target.value as any);
                      setParsedRows([]);
                    }}
                    className="w-full bg-bg shadow-inner border border-bg4 rounded-xl px-4 py-3 text-xs text-text focus:outline-none focus:border-amber-500 font-bold border-dashed"
                  >
                    <option value="feeding">Feeding Store</option>
                    <option value="stitching">Stitching Store</option>
                    <option value="finishing">Finishing Store</option>
                    <option value="packing">Packing Store</option>
                    <option value="carton">Carton Store / Warehouse</option>
                  </select>
                </div>

                {['stitching', 'finishing'].includes(bulkTargetDept) && (
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-text2 mb-1.5">Line Allocation</label>
                    <select
                      value={bulkLineNumber}
                      onChange={(e) => setBulkLineNumber(e.target.value)}
                      className="w-full bg-bg shadow-inner border border-bg4 rounded-xl px-4 py-3 text-xs text-text focus:outline-none focus:border-amber-500 font-bold"
                    >
                      <option value="LINE 1">LINE 1</option>
                      <option value="LINE 2">LINE 2</option>
                      <option value="LINE 3">LINE 3</option>
                      <option value="LINE 4">LINE 4</option>
                      <option value="LINE 5">LINE 5</option>
                    </select>
                  </div>
                )}

                <div className="space-y-4">
                  <button
                    onClick={downloadTemplate}
                    className="w-full bg-bg3 border border-bg4 hover:bg-bg4 active:scale-95 text-text py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-amber-500" />
                    Download Bulk Template
                  </button>
                  <p className="text-[9px] text-text3 text-center uppercase">
                    Get a beautiful format configured perfectly for {bulkTargetDept.toUpperCase()}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Logic Summary Cards */}
          <div className="p-6 bg-bg3 border border-bg4 rounded-[2rem] space-y-4">
            <h4 className="font-black uppercase text-[10px] tracking-widest text-text3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" /> System Integration Note
            </h4>
            <p className="text-[10px] text-text3 leading-relaxed">
              Direct Old Stock entries bypass departmental queues. They inject immediately as fully-accepted inputs of your selected workstation, acting as a surplus credit that instantly repairs deficit imbalances and aligns the historical audit logs.
            </p>
          </div>
        </div>

        {/* Action Table (Right Pane) */}
        <div className="lg:col-span-8 space-y-8">
          {activeTab === 'bulk' && parsedRows.length > 0 && (
            <div className="p-8 bg-amber-500/5 border border-amber-500/10 rounded-[2rem] space-y-4 animate-fade-in shadow-sm">
              <div className="flex justify-between items-center border-b border-bg4 pb-3">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-amber-500" />
                  <h3 className="font-bold text-xs uppercase tracking-tight text-text">Parsed Sheet Data</h3>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setParsedRows([])} 
                    className="px-3 py-1 bg-bg3 hover:bg-bg4 border border-bg4 text-[9px] font-black uppercase text-text3 rounded-lg"
                  >
                    Clear File
                  </button>
                  <button 
                    onClick={uploadBulkParsed}
                    disabled={isUploadingBulk}
                    className="px-4 py-1 bg-amber-500 hover:bg-amber-600 text-white text-[9px] font-black uppercase rounded-lg flex items-center gap-1"
                  >
                    {isUploadingBulk ? <span className="animate-pulse">Uploading...</span> : 'Upload Into Dept'}
                  </button>
                </div>
              </div>

              {parsingErrors.length > 0 && (
                <div className="p-3 bg-red-500/5 border border-red-500/10 text-red-500 rounded-lg text-[10px] font-bold uppercase space-y-1 max-h-24 overflow-y-auto">
                  {parsingErrors.map((err, i) => <div key={i}>• {err}</div>)}
                </div>
              )}               <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] font-bold border-collapse">
                  <thead>
                    <tr className="border-b border-bg4 text-[9px] font-black uppercase text-text3">
                      <th className="py-2">PO #</th>
                      <th className="py-2">Style #</th>
                      <th className="py-2">Color</th>
                      <th className="py-2">Size</th>
                      <th className="py-2">Qty</th>
                      {['stitching', 'finishing'].includes(bulkTargetDept) && <th className="py-2">Line</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bg4">
                    {parsedRows.slice(0, 15).map((r, i) => (
                      <tr key={i} className="text-text">
                        <td className="py-2 font-mono text-[10px]">{r.po_number || 'UNALLOCATED'}</td>
                        <td className="py-2">{r.style_num}</td>
                        <td className="py-2 font-mono text-[10px] text-text2">{r.color}</td>
                        <td className="py-2 font-mono text-[10px]">{r.size}</td>
                        <td className="py-2 text-amber-500 font-black">{r.quantity} pcs</td>
                        {['stitching', 'finishing'].includes(bulkTargetDept) && <td className="py-2 font-mono text-[10px] text-text3">{r.line_number}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedRows.length > 15 && (
                  <p className="text-[9px] font-bold text-text3 text-center pt-3 uppercase">... and {parsedRows.length - 15} more rows parsed successfully</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'bulk' && parsedRows.length === 0 && (
            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={cn(
                "p-12 border-2 border-dashed rounded-[2rem] flex flex-col items-center justify-center gap-4 transition-all min-h-[220px] bg-bg2",
                dragActive ? "border-amber-500 bg-amber-500/5 shadow-inner scale-98" : "border-bg4 hover:border-amber-500/40"
              )}
            >
              <div className="w-16 h-16 rounded-full bg-bg3 flex items-center justify-center text-text3 shadow-sm">
                <Upload className="w-7 h-7" />
              </div>
              <div className="text-center space-y-1">
                <p className="font-black text-xs uppercase tracking-tight text-text">Drag and drop your spreadsheet here</p>
                <p className="text-[10px] text-text3 font-medium">Excel (.xlsx, .xls) files only</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black text-text3 uppercase">Or</span>
                <label className="px-4 py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-xl font-black text-[10px] uppercase tracking-wider cursor-pointer shadow-sm transition-all">
                  Browse Files
                  <input type="file" onChange={handleFileInputChange} accept=".xlsx, .xls" className="hidden" />
                </label>
              </div>
            </div>
          )}

          {/* Logs & History Card */}
          <div className="p-8 bg-bg2 border border-bg4 rounded-[2.5rem] shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-bg4 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-bg4 flex items-center justify-center text-text2">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black uppercase text-xs tracking-wider text-text">Direct Stock Logs</h3>
                  <p className="text-[9px] text-text3 uppercase">Transactions injected as Old Stock</p>
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-text3 pointer-events-none">
                    <Search className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="text"
                    value={loggingQuery}
                    onChange={(e) => setLoggingQuery(e.target.value)}
                    placeholder="Search Logs..."
                    className="bg-bg border border-bg4 rounded-xl pl-9 pr-4 py-1.5 text-xs text-text focus:outline-none focus:border-amber-500 w-full sm:w-44 font-bold"
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
                  <span>{filteredLogs.length} Records</span>
                  <span className="text-po/40">|</span>
                  <span className="text-po font-extrabold">{filteredTotalQty.toLocaleString()} Pcs Total</span>
                </span>
                <button
                  onClick={fetchLogs}
                  disabled={isLogsLoading}
                  className="p-2 bg-bg hover:bg-bg3 border border-bg4 rounded-xl text-text hover:text-amber-500 active:scale-95 transition-all text-sm cursor-pointer"
                  title="Reload Logs"
                >
                  <RefreshCcw className={cn("w-4 h-4", isLogsLoading && "animate-spin")} />
                </button>
              </div>
            </div>

            {/* Active Filter Chips Bar */}
            {(selectedStyles.length > 0 || selectedColors.length > 0) && (
              <div className="pb-2">
                <ActiveFilterBar
                  selectedStyles={selectedStyles}
                  selectedColors={selectedColors}
                  totalSum={filteredTotalQty}
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
              {filteredLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="w-12 h-12 bg-bg3 rounded-full flex items-center justify-center text-text3">
                    <Clock className="w-5 h-5 opacity-40" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="font-bold text-[11px] uppercase tracking-wider text-text3">No injections recorded</p>
                    <p className="text-[9px] text-text3 leading-normal max-w-xs uppercase">Choose a department and trigger an injection to balance registers</p>
                  </div>
                </div>
              ) : (
                <table className="w-full text-left text-[11px] font-bold border-collapse">
                  <thead>
                    <tr className="border-b border-bg4 text-[9px] font-black uppercase text-text3">
                      <th className="py-2.5">Date</th>
                      <th className="py-2.5">PO #</th>
                      <th className="py-2.5">Style #</th>
                      <th className="py-2.5">Color</th>
                      <th className="py-2.5">Size/Qty</th>
                      <th className="py-2.5">Department</th>
                      <th className="py-2.5">Alloc/Line</th>
                      <th className="py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bg4">
                    {filteredLogs.map((l, idx) => {
                      const Icon = departmentIcons[l.department] || Clock;
                      return (
                        <tr key={idx} className="group hover:bg-bg/40 text-text transition-all">
                          <td className="py-3 text-text3 font-mono text-[9px]">
                            {new Date(l.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-3 font-mono text-[10px] text-text2 max-w-[80px] truncate">{l.po_number || 'UNALLOCATED'}</td>
                          <td className="py-3 pr-2 font-black tracking-tight">{l.style_num}</td>
                          <td className="py-3 font-mono text-[10px] text-text2">{l.color}</td>
                          <td className="py-3">
                            <span className="font-mono bg-bg rounded px-1.5 py-0.5 border border-bg4 text-[10px] mr-1.5">{l.size}</span>
                            <span className="text-amber-500 font-extrabold">{l.quantity} pcs</span>
                          </td>
                          <td className="py-3">
                            <span className={cn("px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border flex items-center gap-1 w-max", getDeptColorClass(l.department))}>
                              <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                              {l.department === 'feeding' ? 'Feeding Store' : l.department === 'stitching' ? 'Stitching Store' : l.department === 'finishing' ? 'Finishing Store' : l.department === 'packing' ? 'Packing Store' : l.department === 'carton' ? 'Carton Store' : l.department}
                            </span>
                          </td>
                          <td className="py-3 font-mono text-[10px] text-text3">
                            {['stitching', 'finishing'].includes(l.department) ? (l.line_number || 'LINE 1') : '-'}
                          </td>
                          <td className="py-3 text-right">
                            <button
                              onClick={() => handleDeleteLog(l.department, l.id)}
                              className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/10 hover:text-red-500 text-text3 rounded-lg transition-all active:scale-90 cursor-pointer"
                              title="Delete injection & deduct quantity"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
				</table>
              )}
            </div>
          </div>
        </div>

      </div>

      <RequestAccessModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        initialType="old_stock_requisition"
        onSubmitted={() => {
          fetchLogs();
        }}
      />
    </div>
  );
};
