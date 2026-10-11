import React, { useMemo, useState, useEffect } from 'react';
import { cn } from '../../lib/utils';
import { Package, Upload, FileSpreadsheet, AlertTriangle, Check, Loader2, X, Download, Info, Trash2, Tag, Palette } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { storeService } from '../../services/erpService';
import { useAuth } from '../../context/AuthContext';
import { motion } from 'motion/react';
import { MultiSelectFilter, ActiveFilterBar } from '../MultiSelectFilter';

interface StockStoreTableProps {
  data: any[];
  dept: 'cutting' | 'feeding' | 'stitching' | 'finishing' | 'packing';
  title?: string;
  onRefresh?: () => void;
}

const SIZES_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', 'FREE'];

export const StockStoreTable: React.FC<StockStoreTableProps> = ({ data, dept, title, onRefresh }) => {
  const { user } = useAuth();
  const [subTab, setSubTab] = useState<string>('available');
  const [stitchingLineTab, setStitchingLineTab] = useState<string>('line-1');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [parsedRecords, setParsedRecords] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Filter states
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);

  // Clear selections & filters when tab or dept or records change
  useEffect(() => {
    setSelectedKeys([]);
    setSelectedStyles([]);
    setSelectedColors([]);
  }, [dept, subTab, stitchingLineTab, data]);

  const toggleSelectRow = (key: string) => {
    setSelectedKeys(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const getVisibleKeys = () => {
    if (dept === 'packing') {
      return displayPackingData.map(row => `${row.po || ''}|${row.style}|${row.color}|${row.size || ''}`);
    } else {
      return displayStockData.map(row => `${row.po || ''}|${row.style}|${row.color}`);
    }
  };

  const toggleSelectAll = () => {
    const visibleKeys = getVisibleKeys();
    const allSelected = visibleKeys.length > 0 && visibleKeys.every(k => selectedKeys.includes(k));
    if (allSelected) {
      setSelectedKeys(prev => prev.filter(k => !visibleKeys.includes(k)));
    } else {
      setSelectedKeys(prev => {
        const union = new Set([...prev, ...visibleKeys]);
        return Array.from(union);
      });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedKeys.length === 0) return;

    const message = dept === 'packing'
      ? `Are you sure you want to delete ${selectedKeys.length} selected Packing store records?`
      : `Are you sure you want to delete ${selectedKeys.length} selected records from ${dept} store? This will delete all sizes for the selected items and cannot be undone.`;

    setConfirmDialog({
      message,
      onConfirm: async () => {
        setIsBulkDeleting(true);
        try {
          const itemsToDelete = selectedKeys.map(key => {
            const [po, style, color, size] = key.split('|');
            return {
              po_number: po || undefined,
              style_num: style,
              color,
              size: size || undefined
            };
          });

          await storeService.deleteStoreDataBulk({
            department: dept,
            items: itemsToDelete
          });

          toast.success(`Successfully bulk deleted ${itemsToDelete.length} records.`);
          setSelectedKeys([]);
          if (onRefresh) onRefresh();
        } catch (err: any) {
          console.error(err);
          toast.error(err.message || 'Failed to bulk delete store records.');
        } finally {
          setIsBulkDeleting(false);
        }
      }
    });
  };

  const handleDeleteStoreRow = async (row: any) => {
    const isPacking = dept === 'packing';
    const key = isPacking 
      ? `${row.po}-${row.style}-${row.color}-${row.size}`
      : `${row.po}-${row.style}-${row.color}`;
      
    const message = isPacking
      ? `Are you sure you want to delete ALL Packing records for PO: "${row.po}", Style: "${row.style}", Color: "${row.color}", Size: "${row.size}" from current store?`
      : `Are you sure you want to delete ALL ${dept} records for PO: "${row.po}", Style: "${row.style}", Color: "${row.color}" (All Sizes) from current store?`;

    setConfirmDialog({
      message,
      onConfirm: async () => {
        setDeletingKey(key);
        try {
          await storeService.deleteStoreData({
            department: dept,
            po_number: row.po,
            style_num: row.style,
            color: row.color,
            size: isPacking ? row.size : undefined
          });
          toast.success(`Successfully deleted store records for style "${row.style}".`);
          if (onRefresh) onRefresh();
        } catch (err: any) {
          console.error(err);
          toast.error(err.message || 'Failed to delete store records.');
        } finally {
          setDeletingKey(null);
        }
      }
    });
  };

  useEffect(() => {
    setSubTab('available');
    setStitchingLineTab('line-1');
  }, [dept]);

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
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const downloadTemplate = () => {
    // Generate a beautiful, native bulk update template formatted exactly like the user request
    const isStitchingOrFeeding = ['feeding', 'stitching'].includes(dept);
    const headers = isStitchingOrFeeding
      ? ['PO #', 'STYLE #', 'COLOR', 'LINE', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'Total']
      : ['PO #', 'STYLE #', 'COLOR', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'Total'];

    const sampleRows = [
      {
        'PO #': 'PO-2026-001',
        'STYLE #': 'ST-4022',
        'COLOR': 'BLACK',
        ...(isStitchingOrFeeding ? { 'LINE': 'LINE 1' } : {}),
        'XS': 50,
        'S': 100,
        'M': 150,
        'L': 150,
        'XL': 100,
        '2XL': 50,
        '3XL': 0,
        '4XL': 0,
        'Total': 600
      },
      {
        'PO #': 'PO-2026-002',
        'STYLE #': 'ST-5099',
        'COLOR': 'WHITE',
        ...(isStitchingOrFeeding ? { 'LINE': 'LINE 2' } : {}),
        'XS': 0,
        'S': 100,
        'M': 100,
        'L': 100,
        'XL': 0,
        '2XL': 0,
        '3XL': 0,
        '4XL': 0,
        'Total': 300
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleRows, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Store Bulk Update Temp');
    XLSX.writeFile(workbook, `${dept}_store_update_template.xlsx`);
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const d = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(d, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);

        if (jsonData.length === 0) {
          toast.error("The uploaded file is empty.");
          return;
        }

        const mapped: any[] = [];
        const errors: string[] = [];

        jsonData.forEach((row, i) => {
          const keys = Object.keys(row);
          const findVal = (possibleHeaders: string[]) => {
            const key = keys.find(k => possibleHeaders.some(ph => k.toLowerCase().trim() === ph.toLowerCase()));
            return key ? row[key] : undefined;
          };

          const po = findVal(['po', 'po_number', 'po number', 'purchase order', 'order', 'po#', 'po #']);
          const style = findVal(['style', 'style_num', 'style_number', 'style num', 'style#', 'style #', 'style_#', 'style #']);
          const color = findVal(['color', 'colour', 'shade']);

          if (!style || !color) {
            errors.push(`Row ${i + 1}: Missing core info. Required columns: Style, Color.`);
            return;
          }

          // Optional parameters if appended at the end of the sheet
          const line_number = findVal(['line', 'line_number', 'line number', 'stitching line', 'workline']);
          const packing_type = findVal(['packing_type', 'packing type', 'package', 'pkg', 'type']);
          const result = findVal(['result', 'quality', 'status', 'passes', 'outcome']);

          let sizesFoundCount = 0;

          // For each size in SIZES_ORDER, check if there is a corresponding column in the row
          SIZES_ORDER.forEach(sizeName => {
            // Find if there is a column key matching the sizeName (case-insensitive, trimmed)
            const matchedKey = keys.find(k => k.toUpperCase().trim() === sizeName.toUpperCase());
            if (matchedKey) {
              const rawQty = row[matchedKey];
              if (rawQty !== undefined && rawQty !== null && rawQty !== '') {
                const qtyNum = parseInt(String(rawQty));
                if (!isNaN(qtyNum) && qtyNum > 0) {
                  sizesFoundCount++;
                  mapped.push({
                    po: po ? String(po).trim() : 'AUTO-ALLOCATED',
                    style: String(style).trim(),
                    color: String(color).trim(),
                    size: sizeName.toUpperCase(),
                    quantity: qtyNum,
                    line_number: line_number ? String(line_number).trim() : 'Line 1',
                    packing_type: packing_type ? String(packing_type).trim().toLowerCase() : 'carton',
                    result: result ? String(result).trim().toLowerCase() : 'pass'
                  });
                }
              }
            }
          });

          if (sizesFoundCount === 0) {
            errors.push(`Row ${i + 1}: No valid sizes ('XS', 'S', 'M', 'L', etc.) with positive quantities were found.`);
          }
        });

        setParsedRecords(mapped);
        setImportErrors(errors);

        if (mapped.length > 0) {
          toast.success(`Successfully parsed ${mapped.length} item configurations!`);
        } else {
          toast.error("Could not parse any valid rows from the sheet.");
        }
      } catch (err: any) {
        console.error(err);
        toast.error("Failed to read file. Please ensure it is a valid format.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const { stockData, allSizes, packingData } = useMemo(() => {
    const grouped: Record<string, any> = {};
    const sizeSet = new Set<string>();
    const packingList: any[] = [];

    data.forEach(item => {
      if (dept === 'packing') {
        const loose = item.loose_available || 0;
        const blister = item.blister_available || 0;
        const carton = item.store_available_pcs || 0;
        const cartonsCount = Math.max(0, item.store_available_cartons || 0);
        
        if (loose > 0 || blister > 0 || carton > 0) {
          packingList.push({
            po: item.po_number,
            style: item.style_num,
            color: item.color,
            size: (item.size || 'UNKN').toUpperCase(),
            loose,
            blister,
            carton,
            cartonsCount,
          });
        }
      } else {
        const key = `${item.po_number}-${item.style_num}-${item.color}`;
        
        let available = 0;
        switch (dept) {
          case 'cutting':
            available = (item.order_qty || 0) - (item.total_cut || 0);
            break;
          case 'feeding':
            available = (item.cut_accepted || 0) - (item.total_sent || 0);
            break;
          case 'stitching': {
            let sendVal = 0;
            let stitchVal = 0;
            if (stitchingLineTab === 'line-1') {
              sendVal = item.line_1_send_accepted ?? 0;
              stitchVal = item.line_1_total_stitched ?? 0;
            } else if (stitchingLineTab === 'line-2') {
              sendVal = item.line_2_send_accepted ?? 0;
              stitchVal = item.line_2_total_stitched ?? 0;
            } else if (stitchingLineTab === 'line-3') {
              sendVal = item.line_3_send_accepted ?? 0;
              stitchVal = item.line_3_total_stitched ?? 0;
            } else if (stitchingLineTab === 'line-4') {
              sendVal = item.line_4_send_accepted ?? 0;
              stitchVal = item.line_4_total_stitched ?? 0;
            } else if (stitchingLineTab === 'line-5') {
              sendVal = item.line_5_send_accepted ?? 0;
              stitchVal = item.line_5_total_stitched ?? 0;
            } else {
              sendVal = item.send_accepted || 0;
              stitchVal = item.total_stitched || 0;
            }
            available = sendVal > 0 ? Math.max(0, sendVal - stitchVal) : 0;
            break;
          }
          case 'finishing':
            if (subTab === 'rejection') {
              available = item.total_rejected || 0;
            } else {
              available = (item.stitch_accepted || 0) - (item.total_passed || 0) - (item.total_rejected || 0);
            }
            break;
        }

        if (available > 0) {
          if (!grouped[key]) {
            grouped[key] = {
              po: item.po_number,
              style: item.style_num,
              color: item.color,
              sizes: {}
            };
          }
          const sizeKey = (item.size || 'UNKN').toUpperCase();
          grouped[key].sizes[sizeKey] = (grouped[key].sizes[sizeKey] || 0) + available;
          sizeSet.add(sizeKey);
        }
      }
    });

    const sortedSizes = Array.from(sizeSet).sort((a, b) => {
      const indexA = SIZES_ORDER.indexOf(a);
      const indexB = SIZES_ORDER.indexOf(b);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return a.localeCompare(b);
    });

    if (dept === 'packing') {
      packingList.sort((a, b) => {
        const poComp = a.po.localeCompare(b.po);
        if (poComp !== 0) return poComp;
        const styleComp = a.style.localeCompare(b.style);
        if (styleComp !== 0) return styleComp;
        const colorComp = a.color.localeCompare(b.color);
        if (colorComp !== 0) return colorComp;
        
        const indexA = SIZES_ORDER.indexOf(a.size);
        const indexB = SIZES_ORDER.indexOf(b.size);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a.size.localeCompare(b.size);
      });
    }

    return {
      stockData: Object.values(grouped),
      allSizes: sortedSizes,
      packingData: packingList
    };
  }, [data, dept, subTab, stitchingLineTab]);

  // Compute available styles & colors options for multi-select dropdowns
  const availableStyleOptions = useMemo(() => {
    const styleCounts: Record<string, number> = {};
    if (dept === 'packing') {
      packingData.forEach(item => {
        if (item.style) styleCounts[item.style] = (styleCounts[item.style] || 0) + 1;
      });
    } else {
      stockData.forEach(item => {
        if (item.style) styleCounts[item.style] = (styleCounts[item.style] || 0) + 1;
      });
    }
    return Object.keys(styleCounts).sort().map(s => ({ value: s, count: styleCounts[s] }));
  }, [dept, packingData, stockData]);

  const availableColorOptions = useMemo(() => {
    const colorCounts: Record<string, number> = {};
    if (dept === 'packing') {
      packingData.forEach(item => {
        if (item.color) colorCounts[item.color] = (colorCounts[item.color] || 0) + 1;
      });
    } else {
      stockData.forEach(item => {
        if (item.color) colorCounts[item.color] = (colorCounts[item.color] || 0) + 1;
      });
    }
    return Object.keys(colorCounts).sort().map(c => ({ value: c, count: colorCounts[c] }));
  }, [dept, packingData, stockData]);

  // Apply style and color filters
  const displayStockData = useMemo(() => {
    return stockData.filter(item => {
      if (selectedStyles.length > 0 && !selectedStyles.includes(item.style)) return false;
      if (selectedColors.length > 0 && !selectedColors.includes(item.color)) return false;
      return true;
    });
  }, [stockData, selectedStyles, selectedColors]);

  const displayPackingData = useMemo(() => {
    return packingData.filter(item => {
      if (selectedStyles.length > 0 && !selectedStyles.includes(item.style)) return false;
      if (selectedColors.length > 0 && !selectedColors.includes(item.color)) return false;
      return true;
    });
  }, [packingData, selectedStyles, selectedColors]);

  // Sum of items currently displayed after applying filters
  const filteredTotalSum = useMemo(() => {
    if (dept === 'packing') {
      return displayPackingData.reduce((acc, row) => {
        return acc + (Number(row.loose) || 0) + (Number(row.blister) || 0) + (Number(row.carton) || 0);
      }, 0);
    } else {
      return displayStockData.reduce((acc, row) => {
        let rowSum = 0;
        if (row.sizes) {
          Object.values(row.sizes).forEach((q: any) => {
            rowSum += (Number(q) || 0);
          });
        }
        return acc + rowSum;
      }, 0);
    }
  }, [dept, displayPackingData, displayStockData]);

  // Sum of items explicitly checked via checkboxes
  const selectedCheckedTotalSum = useMemo(() => {
    if (selectedKeys.length === 0) return 0;
    if (dept === 'packing') {
      return displayPackingData
        .filter(row => selectedKeys.includes(`${row.po || ''}|${row.style}|${row.color}|${row.size || ''}`))
        .reduce((acc, row) => acc + (Number(row.loose) || 0) + (Number(row.blister) || 0) + (Number(row.carton) || 0), 0);
    } else {
      return displayStockData
        .filter(row => selectedKeys.includes(`${row.po || ''}|${row.style}|${row.color}`))
        .reduce((acc, row) => {
          let rowSum = 0;
          if (row.sizes) {
            Object.values(row.sizes).forEach((q: any) => {
              rowSum += (Number(q) || 0);
            });
          }
          return acc + rowSum;
        }, 0);
    }
  }, [dept, displayPackingData, displayStockData, selectedKeys]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-po/10 flex items-center justify-center text-po">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-black uppercase tracking-tight text-text">
              {dept === 'packing' ? 'Packing Store' : dept === 'finishing' && subTab === 'rejection' ? 'Rejection Store' : dept === 'stitching' ? (stitchingLineTab === 'all' ? 'Stitching Store - All Lines' : `Line ${stitchingLineTab.split('-')[1]} Store`) : 'Stock Store'}
            </h3>
            <p className="text-[10px] font-bold text-text3 uppercase tracking-widest">
              {dept === 'packing' 
                ? 'All physical finished inventory in Loose, Blister, and Carton packaging'
                : dept === 'finishing' && subTab === 'rejection'
                  ? 'Rejected products pending correction/re-work in finishing dept'
                  : dept === 'stitching'
                    ? `Available balance in Stitching Store (Accepted Fed - Stitched Output)`
                    : `Available balance ready for ${dept}`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {dept === 'stitching' && (
            <div className="flex items-center gap-1.5 bg-bg3 p-1 rounded-xl border border-bg4 w-fit overflow-x-auto">
              {['line-1', 'line-2', 'line-3', 'line-4', 'line-5', 'all'].map(lineKey => {
                const label = lineKey === 'all' ? 'All Lines' : `Line ${lineKey.split('-')[1]} Store`;
                const isActive = stitchingLineTab === lineKey;
                return (
                  <button
                    key={lineKey}
                    onClick={() => setStitchingLineTab(lineKey)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer",
                      isActive
                        ? "bg-bg text-po shadow-sm border border-bg4"
                        : "bg-transparent text-text3 hover:text-text"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {dept === 'finishing' && (
            <div className="flex items-center gap-1.5 bg-bg3 p-1 rounded-xl border border-bg4 w-fit">
              <button
                onClick={() => setSubTab('available')}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                  subTab === 'available'
                    ? "bg-bg text-pass shadow-sm border border-bg4"
                    : "bg-transparent text-text3 hover:text-text"
                )}
              >
                Available Stock
              </button>
              <button
                onClick={() => setSubTab('rejection')}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                  subTab === 'rejection'
                    ? "bg-bg text-red-500 shadow-sm border border-bg4"
                    : "bg-transparent text-text3 hover:text-text"
                )}
              >
                Rejection Store
              </button>
            </div>
          )}

          {user?.role === 'admin' && (
            <button
              onClick={() => setIsUploadOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-po hover:bg-po/90 active:scale-95 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-po/10 cursor-pointer"
            >
              <Upload className="w-4 h-4 text-white" />
              Upload Excel
            </button>
          )}
        </div>
      </div>

      <div className="bg-bg2 border border-bg4 rounded-[2rem] overflow-hidden shadow-xl">
        <div className="p-6 bg-bg3/30 border-b border-bg4 font-bold text-xs uppercase tracking-widest text-text2 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <span>
              {dept === 'packing' 
                ? 'Unified Stock Status - PACKING DEPT' 
                : dept === 'finishing' && subTab === 'rejection'
                  ? 'Rejections - FINISHING DEPT'
                  : dept === 'stitching'
                    ? (stitchingLineTab === 'all' ? 'All Lines Store' : `Line ${stitchingLineTab.split('-')[1]} store`)
                    : (title || `Current Availability - ${dept.toUpperCase()}`)}
            </span>
            {user?.role === 'admin' && selectedKeys.length > 0 && (
              <button
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black rounded-lg uppercase tracking-wider transition-all shadow-md shadow-red-600/10 cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {isBulkDeleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Delete Selected ({selectedKeys.length})
              </button>
            )}
          </div>

          {/* Multi-Select Filters for Style & Color */}
          <div className="flex flex-wrap items-center gap-2.5">
            <MultiSelectFilter
              title="Style"
              options={availableStyleOptions}
              selectedValues={selectedStyles}
              onChange={setSelectedStyles}
              icon={Tag}
              placeholder="Filter by styles..."
            />
            <MultiSelectFilter
              title="Color"
              options={availableColorOptions}
              selectedValues={selectedColors}
              onChange={setSelectedColors}
              icon={Palette}
              placeholder="Filter by colors..."
            />
            <span className="bg-po/10 text-po px-3 py-1.5 rounded-xl text-[10px] font-black font-mono flex items-center gap-2 border border-po/20">
              <span>{dept === 'packing' ? displayPackingData.length : displayStockData.length} Styles/Items</span>
              <span className="text-po/40">|</span>
              <span className="text-po font-extrabold">{filteredTotalSum.toLocaleString()} Pcs Total</span>
            </span>
            {selectedKeys.length > 0 && (
              <span className="bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-xl text-[10px] font-black font-mono border border-emerald-500/20">
                Checked ({selectedKeys.length}): {selectedCheckedTotalSum.toLocaleString()} Pcs
              </span>
            )}
          </div>
        </div>

        {/* Active Filter Chips Bar */}
        {(selectedStyles.length > 0 || selectedColors.length > 0) && (
          <div className="px-6 py-2.5 border-b border-bg4 bg-bg3/10">
            <ActiveFilterBar
              selectedStyles={selectedStyles}
              selectedColors={selectedColors}
              totalSum={filteredTotalSum}
              onRemoveStyle={(s) => setSelectedStyles(prev => prev.filter(v => v !== s))}
              onRemoveColor={(c) => setSelectedColors(prev => prev.filter(v => v !== c))}
              onClearAll={() => {
                setSelectedStyles([]);
                setSelectedColors([]);
              }}
            />
          </div>
        )}
        
        <div className="overflow-auto max-h-[500px]">
          {dept === 'packing' ? (
            <table className="w-full text-left text-xs border-collapse font-sans">
              <thead>
                <tr className="bg-bg3 text-text border-b border-bg4 sticky top-0 z-20 shadow-sm">
                  {user?.role === 'admin' && (
                    <th className="p-4 w-12 text-center border-r border-bg4 select-none">
                      <input
                        type="checkbox"
                        checked={displayPackingData.length > 0 && displayPackingData.every(row => selectedKeys.includes(`${row.po || ''}|${row.style}|${row.color}|${row.size || ''}`))}
                        onChange={toggleSelectAll}
                        className="rounded border-bg4 text-po focus:ring-po/20 cursor-pointer w-4 h-4 accent-po"
                      />
                    </th>
                  )}
                  <th className="p-4 font-black uppercase tracking-tighter border-r border-bg4 sticky top-0 left-0 bg-bg3 z-30 w-40">PO#</th>
                  <th className="p-4 font-black uppercase tracking-tighter border-r border-bg4 w-40 sticky top-0 bg-bg3 z-20">Style</th>
                  <th className="p-4 font-black uppercase tracking-tighter border-r border-bg4 sticky top-0 bg-bg3 z-20">Color</th>
                  <th className="p-4 font-black uppercase tracking-tighter text-center border-r border-bg4 sticky top-0 bg-bg3 z-20 w-24">Size</th>
                  <th className="p-4 font-black uppercase tracking-tighter text-right border-r border-bg4 bg-pass/5 text-pass sticky top-0 bg-bg3 z-20 w-32">Loose (Pcs)</th>
                  <th className="p-4 font-black uppercase tracking-tighter text-right border-r border-bg4 bg-pack/5 text-pack sticky top-0 bg-bg3 z-20 w-44">Blister (Blisters / Pcs)</th>
                  <th className="p-4 font-black uppercase tracking-tighter text-right bg-po/5 text-po border-r border-bg4 sticky top-0 bg-bg3 z-20 w-44">Carton (Cartons / Pcs)</th>
                  {user?.role === 'admin' && <th className="p-4 font-black uppercase tracking-tighter text-center sticky top-0 right-0 bg-bg3 z-30 w-24">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-bg4">
                {displayPackingData.length === 0 ? (
                  <tr>
                    <td colSpan={user?.role === 'admin' ? 9 : 7} className="p-16 text-center text-text3 font-black uppercase tracking-widest bg-bg/20">
                      <div className="flex flex-col items-center gap-4">
                        <Package className="w-12 h-12 opacity-10" />
                        <div>No matching items found in Packing Store</div>
                        <p className="text-[9px] normal-case opacity-60 font-medium max-w-sm mx-auto">
                          Once products are processed or packaged in Packing floor, they will show here.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayPackingData.map((row: any, i) => {
                    const rowKey = `${row.po || ''}|${row.style}|${row.color}|${row.size || ''}`;
                    const isDeletingRow = deletingKey === rowKey;
                    const isSelected = selectedKeys.includes(rowKey);
                    
                    return (
                      <tr key={i} className={cn(
                        "hover:bg-bg3/50 transition-colors group",
                        isSelected && "bg-po/5 hover:bg-po/10"
                      )}>
                        {user?.role === 'admin' && (
                          <td className="p-4 text-center border-r border-bg4 select-none">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectRow(rowKey)}
                              className="rounded border-bg4 text-po focus:ring-po/20 cursor-pointer w-4 h-4 accent-po"
                            />
                          </td>
                        )}
                        <td className="p-4 border-r border-bg4 font-black text-sm text-text sticky left-0 bg-bg2 group-hover:bg-bg3 transition-colors">{row.po}</td>
                        <td className="p-4 border-r border-bg4 font-black text-sm">{row.style}</td>
                        <td className="p-4 border-r border-bg4 font-bold uppercase text-text2 text-[11px] min-w-[120px]">{row.color}</td>
                        <td className="p-4 border-r border-bg4 font-black text-center text-sm bg-bg3/10">{row.size}</td>
                        
                        <td className={cn(
                          "p-4 border-r border-bg4 font-mono font-black text-right text-sm transition-all",
                          row.loose > 0 ? "text-pass bg-pass/5" : "text-text3/20"
                        )}>
                          {row.loose > 0 ? row.loose.toLocaleString() : '—'}
                        </td>
                        
                        <td className={cn(
                          "p-4 border-r border-bg4 font-mono font-black text-right text-sm transition-all",
                          row.blister > 0 ? "text-pack bg-pack/5" : "text-text3/20"
                        )}>
                          {row.blister > 0 
                            ? `${(row.blister / 12).toLocaleString(undefined, { maximumFractionDigits: 1 })} / ${row.blister.toLocaleString()}` 
                            : '—'}
                        </td>
                        
                        <td className={cn(
                          "p-4 text-right font-mono font-black text-sm border-r border-bg4 transition-all",
                          row.carton > 0 ? "text-po bg-po/5" : "text-text3/20"
                        )}>
                          {row.carton > 0 
                            ? `${row.cartonsCount.toLocaleString()} / ${row.carton.toLocaleString()}` 
                            : '—'}
                        </td>

                        {user?.role === 'admin' && (
                          <td className="p-4 text-center sticky right-0 bg-bg2 group-hover:bg-bg3 z-10 transition-colors shadow-[-4px_0_8px_rgba(0,0,0,0.02)]">
                            <button
                              onClick={() => handleDeleteStoreRow(row)}
                              disabled={isDeletingRow}
                              title="Delete packing store records"
                              className="p-1.5 border border-bg4 hover:border-red-500/30 hover:bg-red-500/10 text-text3 hover:text-red-500 rounded-lg transition-all inline-flex items-center justify-center cursor-pointer disabled:opacity-40"
                            >
                              {isDeletingRow ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-xs border-collapse font-sans">
              <thead>
                <tr className="bg-bg3 text-text border-b border-bg4 sticky top-0 z-20 shadow-sm">
                  {user?.role === 'admin' && (
                    <th className="p-4 w-12 text-center border-r border-bg4 select-none bg-bg3 z-30">
                      <input
                        type="checkbox"
                        checked={displayStockData.length > 0 && displayStockData.every(row => selectedKeys.includes(`${row.po || ''}|${row.style}|${row.color}`))}
                        onChange={toggleSelectAll}
                        className="rounded border-bg4 text-po focus:ring-po/20 cursor-pointer w-4 h-4 accent-po"
                      />
                    </th>
                  )}
                  <th className="p-4 font-black uppercase tracking-tighter border-r border-bg4 sticky top-0 left-0 bg-bg3 z-30 w-40">PO Number</th>
                  <th className="p-4 font-black uppercase tracking-tighter border-r border-bg4 w-40 sticky top-0 bg-bg3 z-20">Style</th>
                  <th className="p-4 font-black uppercase tracking-tighter border-r border-bg4 sticky top-0 bg-bg3 z-20">Color</th>
                  {allSizes.map(s => (
                    <th key={s} className="p-4 font-black uppercase tracking-tighter text-center border-r border-bg4 min-w-[60px] sticky top-0 bg-bg3 z-20">{s}</th>
                  ))}
                  <th className={cn(
                    "p-4 font-black uppercase tracking-tighter text-right bg-po/5 text-po sticky top-0 z-20",
                    user?.role === 'admin' ? "border-r border-bg4" : "right-0 z-30 shadow-[-4px_0_8px_rgba(0,0,0,0.02)]"
                  )}>Total</th>
                  {user?.role === 'admin' && <th className="p-4 font-black uppercase tracking-tighter text-center sticky top-0 right-0 bg-bg3 z-30 w-24">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-bg4">
                {displayStockData.length === 0 ? (
                  <tr>
                    <td colSpan={allSizes.length + (user?.role === 'admin' ? 6 : 4)} className="p-16 text-center text-text3 font-black uppercase tracking-widest bg-bg/20">
                      <div className="flex flex-col items-center gap-4">
                        <Package className="w-12 h-12 opacity-10" />
                        <div>
                          {dept === 'finishing' && subTab === 'rejection'
                            ? "No rejected products found in Finishing"
                            : `No available stock found in system for ${dept}`}
                        </div>
                        <p className="text-[9px] normal-case opacity-60 font-medium max-w-sm mx-auto">
                          {dept === 'finishing' && subTab === 'rejection'
                            ? "Items only show in this store when they fail inspection with result 'reject' during finishing process."
                            : "Items only show here if they have been processed by the previous department and accepted by the current one."}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayStockData.map((row: any, i) => {
                    let rowTotal = 0;
                    Object.values(row.sizes).forEach((q: any) => rowTotal += q);
                    const rowKey = `${row.po || ''}|${row.style}|${row.color}`;
                    const isDeletingRow = deletingKey === rowKey;
                    const isSelected = selectedKeys.includes(rowKey);
                    
                    return (
                      <tr key={i} className={cn(
                        "hover:bg-bg3/50 transition-colors group",
                        isSelected && "bg-po/5 hover:bg-po/10"
                      )}>
                        {user?.role === 'admin' && (
                          <td className="p-4 text-center border-r border-bg4 select-none">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectRow(rowKey)}
                              className="rounded border-bg4 text-po focus:ring-po/20 cursor-pointer w-4 h-4 accent-po"
                            />
                          </td>
                        )}
                        <td className="p-4 border-r border-bg4 font-black text-sm text-text sticky left-0 bg-bg2 group-hover:bg-bg3 transition-colors">{row.po}</td>
                        <td className="p-4 border-r border-bg4 font-black text-sm">{row.style}</td>
                        <td className="p-4 border-r border-bg4 font-bold uppercase text-text2 text-[11px] min-w-[120px]">{row.color}</td>
                        {allSizes.map(s => {
                          const qty = row.sizes[s] || 0;
                          const isRejection = dept === 'finishing' && subTab === 'rejection';
                          return (
                            <td key={s} className={cn(
                              "p-4 border-r border-bg4 font-mono font-black text-center text-sm transition-all",
                              qty > 0 
                                ? isRejection 
                                  ? "text-red-500 bg-red-500/5 font-bold" 
                                  : "text-text bg-po/5" 
                                : "text-text3/20"
                            )}>
                              {qty > 0 ? qty.toLocaleString() : '—'}
                            </td>
                          );
                        })}
                        <td className={cn(
                          "p-4 text-right font-black text-base transition-all shadow-[-4px_0_8px_rgba(0,0,0,0.02)]",
                          dept === 'finishing' && subTab === 'rejection' ? "text-red-500 bg-red-500/5" : "text-po bg-po/5",
                          user?.role === 'admin' ? "border-r border-bg4" : "sticky right-0 z-10"
                        )}>
                          {rowTotal.toLocaleString()}
                        </td>
                        {user?.role === 'admin' && (
                          <td className="p-4 text-center sticky right-0 bg-bg2 group-hover:bg-bg3 z-10 transition-colors shadow-[-4px_0_8px_rgba(0,0,0,0.02)]">
                            <button
                              onClick={() => handleDeleteStoreRow(row)}
                              disabled={isDeletingRow}
                              title={`Delete ${dept} store records for this style`}
                              className="p-1.5 border border-bg4 hover:border-red-500/30 hover:bg-red-500/10 text-text3 hover:text-red-500 rounded-lg transition-all inline-flex items-center justify-center cursor-pointer disabled:opacity-40"
                            >
                              {isDeletingRow ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Excel Upload Modal */}
      {user?.role === 'admin' && isUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            onClick={() => {
              if (!isImporting) {
                setIsUploadOpen(false);
                setParsedRecords([]);
                setImportErrors([]);
              }
            }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
          />
          
          <div className="relative bg-bg border border-bg4 rounded-[2rem] w-full max-w-2xl overflow-hidden shadow-2xl card-shadow flex flex-col max-h-[85vh] animate-in fade-in-50 zoom-in-95 duration-150">
            <div className="p-6 border-b border-bg4 bg-bg2/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-po/10 flex items-center justify-center text-po">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-black text-sm uppercase tracking-wider text-text">Excel Store Bulk Update</h4>
                  <p className="text-[10px] font-bold text-text3 uppercase tracking-widest">{dept.toUpperCase()} Store Intake</p>
                </div>
              </div>
              <button
                disabled={isImporting}
                onClick={() => {
                  setIsUploadOpen(false);
                  setParsedRecords([]);
                  setImportErrors([]);
                }}
                className="w-8 h-8 rounded-full border border-bg4 hover:bg-bg3 flex items-center justify-center text-text3 hover:text-text cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              <div className="bg-bg2/50 border border-bg4 rounded-2xl p-4 flex gap-3 text-xs leading-relaxed text-text2">
                <Info className="w-4 h-4 text-po shrink-0 mt-0.5" />
                <div>
                  <p className="font-black uppercase tracking-tight text-[10px] mb-1">Sheet Format Requirements</p>
                  <p className="text-text3 text-[11px]">
                    Ensure your Excel/CSV has columns for <span className="font-black text-text font-mono text-[10px]">PO #</span>, <span className="font-black text-text font-mono text-[10px]">STYLE #</span>, and <span className="font-black text-text font-mono text-[10px]">COLOR</span>{['feeding', 'stitching'].includes(dept) && <>, and <span className="font-black text-text font-mono text-[10px]">LINE</span></>}, followed by size columns (e.g. <span className="font-black text-text font-mono text-[10px]">XS</span>, <span className="font-black text-text font-mono text-[10px]">S</span>, <span className="font-black text-text font-mono text-[10px]">M</span>, <span className="font-black text-text font-mono text-[10px]">L</span>, <span className="font-black text-text font-mono text-[10px]">XL</span>, etc.) with quantities filled in the rows.
                  </p>
                </div>
              </div>

              {parsedRecords.length === 0 ? (
                <div 
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={cn(
                    "border-2 border-dashed rounded-[1.5rem] p-10 flex flex-col items-center justify-center gap-4 text-center transition-all cursor-pointer",
                    dragActive 
                      ? "border-po bg-po/5 translate-y-0.5 scale-[0.99]" 
                      : "border-bg4 hover:border-text3/50 hover:bg-bg2/10"
                  )}
                  onClick={() => document.getElementById('excel-file-input')?.click()}
                >
                  <input 
                    type="file" 
                    id="excel-file-input" 
                    accept=".xlsx,.xls,.csv" 
                    onChange={handleFileInputChange}
                    className="hidden" 
                  />
                  <div className="w-14 h-14 rounded-2xl bg-bg3 flex items-center justify-center border border-bg4 shadow-sm text-text3">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-black uppercase text-text mb-1">Drag & Drop Your Excel File</p>
                    <p className="text-xs text-text3 font-medium">Supports xlsx, xls, csv sheets</p>
                  </div>
                  <span className="text-[10px] font-black text-po uppercase bg-po/5 border border-po/10 px-4 py-1.5 rounded-full mt-2 font-mono">
                    Or Browse Files
                  </span>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-wider text-text3">Parsed Records Summary</p>
                    <button
                      onClick={() => {
                        setParsedRecords([]);
                        setImportErrors([]);
                      }}
                      className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:underline"
                    >
                      Clear File
                    </button>
                  </div>

                  <div className="border border-bg4 rounded-2xl overflow-hidden max-h-[220px] overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-bg3/60 text-text font-black border-b border-bg4 uppercase text-[10px] tracking-wider">
                          <th className="p-3 sticky top-0 bg-bg2">PO</th>
                          <th className="p-3 sticky top-0 bg-bg2">Style</th>
                          <th className="p-3 sticky top-0 bg-bg2">Color</th>
                          <th className="p-3 sticky top-0 bg-bg2 text-center">Size</th>
                          <th className="p-3 sticky top-0 bg-bg2 text-right">Qty</th>
                          {['feeding', 'stitching'].includes(dept) && <th className="p-3 sticky top-0 bg-bg2">Line</th>}
                          {dept === 'packing' && <th className="p-3 sticky top-0 bg-bg2">Type</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-bg3">
                        {parsedRecords.map((row, i) => (
                          <tr key={i} className="hover:bg-bg3/20 font-sans">
                            <td className="p-3 font-mono font-bold text-text">{row.po}</td>
                            <td className="p-3 font-bold">{row.style}</td>
                            <td className="p-3 uppercase text-text2">{row.color}</td>
                            <td className="p-3 text-center text-text2 font-bold">{row.size}</td>
                            <td className="p-3 text-right font-mono font-bold text-po">{row.quantity.toLocaleString()}</td>
                            {['feeding', 'stitching'].includes(dept) && <td className="p-3 text-text3">{row.line_number}</td>}
                            {dept === 'packing' && <td className="p-3 text-[10px] font-bold text-text3 uppercase">{row.packing_type}</td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {importErrors.length > 0 && (
                    <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 text-xs font-bold font-sans space-y-1.5 text-red-500 overflow-y-auto max-h-[120px]">
                      <span className="uppercase text-[10px] font-black tracking-wider flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" />
                        Skipped {importErrors.length} lines due to formatting:
                      </span>
                      {importErrors.map((err, i) => (
                        <p key={i} className="font-normal">{err}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-bg4 bg-bg2/40 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={downloadTemplate}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-bg4 hover:bg-bg3 text-[10px] font-black uppercase tracking-wider text-text2 hover:text-text cursor-pointer transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                Template
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isImporting}
                  onClick={() => {
                    setIsUploadOpen(false);
                    setParsedRecords([]);
                    setImportErrors([]);
                  }}
                  className="px-5 py-2.5 rounded-xl border border-bg4 hover:bg-bg3 text-[10px] font-black uppercase tracking-wider text-text3 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={parsedRecords.length === 0 || isImporting}
                  onClick={async () => {
                    setIsImporting(true);
                    try {
                      const res = await storeService.bulkUpdate(dept, parsedRecords);
                      toast.success(res.message || `Store update completed with ${parsedRecords.length} records!`);
                      setIsUploadOpen(false);
                      setParsedRecords([]);
                      setImportErrors([]);
                      onRefresh?.();
                    } catch (err: any) {
                      console.error(err);
                      toast.error(err.message || "Failed to update store records.");
                    } finally {
                      setIsImporting(false);
                    }
                  }}
                  className="flex items-center gap-2 px-6 py-2.5 bg-po text-white text-[10px] font-black uppercase tracking-wider rounded-xl hover:bg-po/95 active:scale-95 transition-all shadow-lg shadow-po/10 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 animate-none"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Confirm Import ({parsedRecords.length})
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-bg2 border border-bg4 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-6 text-left"
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
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-wider text-center rounded-xl transition-all shadow-md shadow-red-600/10 cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
