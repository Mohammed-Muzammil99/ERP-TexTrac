import React, { useState, useEffect, useMemo } from 'react';
import { shippingService, poService, cuttingService, packingService, storeService, statusService } from '../services/erpService';
import { ProductionOrder, POProduct } from '../types';
import { Truck, FileUp, History, Search, Trash2, CheckCircle2, Handshake, BarChart3, Package, Calendar as CalendarIcon, X, Warehouse, Download } from 'lucide-react';
import { cn, fmtDate, compareSizes } from '../lib/utils';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { HandoverList } from '../components/HandoverList';

export const ShippingPage: React.FC = () => {
  const [history, setHistory] = useState<any[]>([]);
  const [incomingPacking, setIncomingPacking] = useState<any[]>([]);
  const [storeStock, setStoreStock] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  
  const [selectedPONum, setSelectedPONum] = useState('');
  const [pos, setPos] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [quantities, setQuantities] = useState<Record<number, { qty: number; cartons: number; sscc: string }>>({});
  
  const [filterStyle, setFilterStyle] = useState('All');
  const [filterColor, setFilterColor] = useState('All');
  const [filterSize, setFilterSize] = useState('All');
  const [activeTab, setActiveTab] = useState<'form' | 'reports'>('form');

  // Report filters
  const [startDate, setStartDate] = useState(new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportSearch, setReportSearch] = useState('');

  const reportData = useMemo(() => {
    return history.filter(rec => {
      const recDate = rec.created_at ? rec.created_at.substring(0, 10) : '';
      const matchesSearch = reportSearch === '' || 
        rec.po_number.toLowerCase().includes(reportSearch.toLowerCase()) ||
        rec.style_num.toLowerCase().includes(reportSearch.toLowerCase()) ||
        rec.sscc?.toLowerCase().includes(reportSearch.toLowerCase());
      const withinRange = (!startDate || recDate >= startDate) && (!endDate || recDate <= endDate);
      return matchesSearch && withinRange;
    });
  }, [history, reportSearch, startDate, endDate]);

  const shippingStats = useMemo(() => {
    const stats: Record<string, any> = {};
    reportData.forEach(rec => {
      const key = `${rec.style_num}-${rec.color}`;
      if (!stats[key]) {
        stats[key] = {
          style: rec.style_num,
          color: rec.color,
          totalQty: 0,
          totalCartons: 0,
          pos: new Set()
        };
      }
      stats[key].totalQty += rec.quantity;
      stats[key].totalCartons += (rec.cartons || 0);
      stats[key].pos.add(rec.po_number);
    });
    return Object.values(stats);
  }, [reportData]);

  useEffect(() => {
    fetchHistory();
    fetchIncoming();
    fetchStoreStock();
    fetchFeedablePOs();
  }, []);

  const fetchFeedablePOs = async () => {
    try {
      const statusData = await statusService.getPOStatus();
      // Show POs that have some quantity packed (ready for shipping)
      const shippablePOs = statusData.filter(po => (po.any_packed || 0) > 0);
      
      const uniqueMap = new Map();
      shippablePOs.forEach(po => {
        if (po.po_number && !uniqueMap.has(po.po_number)) {
          uniqueMap.set(po.po_number, po);
        }
      });
      setPos(Array.from(uniqueMap.values()));
    } catch (error) {
      console.error('Failed to fetch shippable POs', error);
      const data = await poService.list();
      
      const uniqueMap = new Map();
      data.filter(po => po.status === 'Active').forEach(po => {
        if (po.po_number && !uniqueMap.has(po.po_number)) {
          uniqueMap.set(po.po_number, po);
        }
      });
      setPos(Array.from(uniqueMap.values()));
    }
  };

  const fetchHistory = async () => {
    const data = await shippingService.list();
    setHistory(data);
  };

  const fetchIncoming = async () => {
    const data = await packingService.list();
    setIncomingPacking(data.filter((r: any) => r.store_status === 'in_transit' && r.packing_type === 'carton'));
  };

  const fetchStoreStock = async () => {
    const data = await storeService.getStock();
    setStoreStock(data);
  };

  const handlePOChange = async (poNum: string) => {
    setSelectedPONum(poNum);
    if (!poNum) {
      setProducts([]);
      return;
    }
    setIsLoading(true);
    try {
      await Promise.all([
        fetchIncoming(),
        fetchStoreStock()
      ]);
      const data = await cuttingService.getPOProducts(poNum);
      const priorityOrder: Record<string, number> = { 'Urgent': 0, 'Normal': 1, 'Low': 2 };
      const sortedProducts = [...data.products].sort((a, b) => {
        const pA = priorityOrder[a.priority || 'Normal'] ?? 1;
        const pB = priorityOrder[b.priority || 'Normal'] ?? 1;
        if (pA !== pB) return pA - pB;

        const sA = String(a.style_num || '');
        const sB = String(b.style_num || '');
        const styleComp = sA.localeCompare(sB);
        if (styleComp !== 0) return styleComp;

        const cA = String(a.color || '');
        const cB = String(b.color || '');
        const colorComp = cA.localeCompare(cB);
        if (colorComp !== 0) return colorComp;

        return compareSizes(a.size || '', b.size || '');
      });
      setProducts(sortedProducts);
      
      const initialQtys: Record<number, { qty: number; cartons: number; sscc: string }> = {};
      sortedProducts.forEach((p: any) => initialQtys[p.id] = { qty: 0, cartons: 0, sscc: '' });
      setQuantities(initialQtys);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const [shortfallPrompt, setShortfallPrompt] = useState<{
    payloads: any[];
    shortfalls: any[];
    onSuccess: () => void;
  } | null>(null);

  const handleExportShortfall = () => {
    if (!shortfallPrompt || !shortfallPrompt.shortfalls) return;

    // Group shortfalls by PO #, STYLE #, COLOR
    const grouped: Record<string, {
      po: string;
      style: string;
      color: string;
      sizes: Record<string, number>;
    }> = {};

    shortfallPrompt.shortfalls.forEach((sf: any) => {
      const po = sf.po_number || '';
      const style = sf.style_num || '';
      const color = sf.color || '';
      const key = `${po}|${style}|${color}`;

      if (!grouped[key]) {
        grouped[key] = {
          po,
          style,
          color,
          sizes: {
            'XS': 0, 'S': 0, 'M': 0, 'L': 0, 'XL': 0, '2XL': 0, '3XL': 0, '4XL': 0
          }
        };
      }

      const sizeUpper = String(sf.size || '').toUpperCase().trim();
      if (grouped[key].sizes[sizeUpper] !== undefined) {
        grouped[key].sizes[sizeUpper] += sf.shortfall_qty;
      } else {
        grouped[key].sizes[sizeUpper] = sf.shortfall_qty;
      }
    });

    const headers = ['PO #', 'STYLE #', 'COLOR', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'Total'];
    const dataRows = Object.values(grouped).map(item => {
      const row: any = {
        'PO #': item.po,
        'STYLE #': item.style,
        'COLOR': item.color,
        'XS': item.sizes['XS'] || 0,
        'S': item.sizes['S'] || 0,
        'M': item.sizes['M'] || 0,
        'L': item.sizes['L'] || 0,
        'XL': item.sizes['XL'] || 0,
        '2XL': item.sizes['2XL'] || 0,
        '3XL': item.sizes['3XL'] || 0,
        '4XL': item.sizes['4XL'] || 0,
      };

      const total = (row['XS'] || 0) + (row['S'] || 0) + (row['M'] || 0) + (row['L'] || 0) + 
                    (row['XL'] || 0) + (row['2XL'] || 0) + (row['3XL'] || 0) + (row['4XL'] || 0);
      row['Total'] = total;
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataRows, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Shortfall Export');
    XLSX.writeFile(workbook, `Shortfall_Export_Carton_Store.xlsx`);
    toast.success('Shortfall export file downloaded successfully');
  };

  const verifyAndExecuteShipping = async (payloads: any[], onSuccess: () => void) => {
    setIsLoading(true);
    try {
      const checkRes = await shippingService.createBulk({
        items: payloads,
        dry_run: true
      });

      if (checkRes.success && checkRes.has_shortfall) {
        setShortfallPrompt({
          payloads,
          shortfalls: checkRes.shortfalls,
          onSuccess
        });
      } else {
        await executeBulkShipping(payloads, false, onSuccess);
      }
    } catch (error: any) {
      alert(error.message || 'Validation failed');
    } finally {
      setIsLoading(false);
    }
  };

  const executeBulkShipping = async (payloads: any[], importFromOldStock: boolean, onSuccess: () => void) => {
    setIsLoading(true);
    try {
      const res = await shippingService.createBulk({
        items: payloads,
        import_from_old_stock: importFromOldStock,
        dry_run: false
      });
      if (res.success) {
        alert(importFromOldStock 
          ? `Successfully imported shortfalls and completed shipment!`
          : 'Shipment recorded successfully'
        );
        onSuccess();
        fetchStoreStock();
        if (selectedPONum) {
          handlePOChange(selectedPONum);
        }
        fetchHistory();
      } else {
        alert('Shipment failed');
      }
    } catch (error: any) {
      alert(error.message || 'Shipment failed');
    } finally {
      setIsLoading(false);
      setShortfallPrompt(null);
    }
  };

  const handleSubmitManual = async () => {
    const payloads = Object.entries(quantities)
      .filter(([_, data]) => (data as any).qty > 0)
      .map(([id, data]) => {
        const product = products.find(p => p.id === (parseInt(id) || 0));
        const qData = data as { qty: number; cartons: number; sscc: string };
        return {
          po_number: selectedPONum,
          product_id: parseInt(id) || 0,
          style_num: product?.style_num || '',
          quantity: qData.qty,
          cartons: qData.cartons,
          sscc: qData.sscc,
          item_num: product?.item_num || '',
          line_num: product?.line_num || '',
          color: product?.color || '',
          size: product?.size || ''
        };
      });

    if (payloads.length === 0) return;
    
    await verifyAndExecuteShipping(payloads, () => {
      setQuantities({});
    });
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws);
      setImportPreview(data);
    };
    reader.readAsBinaryString(file);
  };

  const downloadTemplate = () => {
    const headers = [
      {
        'sscc': '003700012345678901',
        'item_code': '123456',
        'case_pack': 24,
        'po_number': 'PO-98765',
        'line_num': '1',
        'Shipment': 'SHIP-1001',
        'color_size': 'NAVY/M',
        'source': 'WAREHOUSE'
      },
      {
        'sscc': '003700012345678902',
        'item_code': '123456',
        'case_pack': 24,
        'po_number': 'PO-98765',
        'line_num': '1',
        'Shipment': 'SHIP-1001',
        'color_size': 'NAVY/M',
        'source': 'WAREHOUSE'
      }
    ];
    const ws = XLSX.utils.json_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Shipment Template');
    XLSX.writeFile(wb, 'shipment_template.xlsx');
  };

  const processImport = async () => {
    setIsLoading(true);
    let successCount = 0;
    const errors: { row: number; msg: string; po: string; line: string }[] = [];
    const allPayloads: any[] = [];

    const poCache: Record<string, any> = {};
    const COLOR_MAPPING: Record<string, string> = {
      'BK': 'BLACK',
      'WH': 'WHITE',
      'GY': 'GREY',
      'RD': 'RED',
      'BL': 'BLUE',
      'GN': 'GREEN',
      'YL': 'YELLOW',
      'OR': 'ORANGE',
      'PR': 'PURPLE',
      'BN': 'BROWN',
      'OX': 'OXFORD',
      'RY': 'ROYAL',
      'NV': 'NAVY',
      'CR': 'CHARCOAL',
      'CH': 'CHARCOAL',
      'PK': 'PINK',
      'TQ': 'TURQUOISE',
      'BG': 'BURGUNDY',
      'GR': 'GRAPHITE',
      'OL': 'OLIVE',
      'LM': 'LIME',
      'MA': 'MAROON',
      'HTR': 'HEATHER',
      'PU': 'PURPLE',
      'FS': 'FOREST',
      'BO': 'BURNT ORANGE',
      'NY': 'NAVY',
      'KY': 'KELLY GREEN',
      'SFYW': 'SAFETY YELLOW',
      'VG': 'VEGAS GOLD',
      'GD': 'GOLD',
      'CB': 'COLUMBIA BLUE',
      'BR': 'BROWN',
      'MI': 'MILITARY',
      'ASH': 'ASH',
      'CARDINAL': 'CARDINAL'
    };

    const mapColorName = (color: string): string => {
      if (!color) return '';
      let processed = color.toUpperCase().trim();
      if (processed.startsWith('FSG ')) {
        processed = processed.substring(4).trim();
      }
      const parts = processed.split(/[\/\+\s]+/).filter(Boolean);
      const mappedParts = parts.map(p => {
        const code = p.trim();
        return COLOR_MAPPING[code] || code;
      });
      return mappedParts.join('/');
    };

    const norm = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    for (let i = 0; i < importPreview.length; i++) {
      const row = importPreview[i];
      const rowIdx = i + 1;
      let currentPONum = '';
      let currentLine = '';

      try {
        const getVal = (keys: string[]) => {
          const foundKey = Object.keys(row).find(k => 
            keys.some(target => k.toLowerCase().replace(/[^a-z0-9]/g, '') === target.toLowerCase().replace(/[^a-z0-9]/g, ''))
          );
          return foundKey ? row[foundKey] : undefined;
        };

        const poNumRaw = getVal(['po_number', 'po_num', 'ponumber', 'po', 'po#']);
        if (!poNumRaw) throw new Error('Missing PO Number in row');
        currentPONum = String(poNumRaw).trim();
        
        let poData = poCache[currentPONum];
        if (!poData) {
          try {
            poData = await poService.get(currentPONum);
          } catch (e) {
            const allPOs = await poService.list();
            const flexibleMatch = allPOs.find((p: any) => 
              norm(p.po_number) === norm(currentPONum) || 
              norm(p.po_number).includes(norm(currentPONum)) ||
              norm(currentPONum).includes(norm(p.po_number))
            );
            if (flexibleMatch) {
              poData = await poService.get(flexibleMatch.po_number);
            } else {
              poData = {
                po_number: currentPONum,
                products: []
              };
            }
          }
          poCache[currentPONum] = poData;
        }

        const excelStyleRaw = String(getVal(['style', 'styleno', 'style#']) || '');
        const excelItemRaw = String(getVal(['item_code', 'itemcode', 'item', 'itemno', 'item#']) || '');
        
        let excelColor = String(getVal(['color', 'colour']) || '');
        let excelSize = String(getVal(['size']) || '');
        const excelColorSize = String(getVal(['color_size', 'colorsize']) || '');

        if (excelColorSize && (!excelColor || !excelSize)) {
          const trimmed = excelColorSize.trim();
          if (/[\/\-_]/.test(trimmed)) {
            const parts = trimmed.split(/[\/\-_]/);
            if (parts.length >= 2) {
              if (!excelSize) excelSize = parts[parts.length - 1].trim();
              if (!excelColor) excelColor = parts.slice(0, parts.length - 1).join(' ').trim();
            }
          } else {
            const spaceIndex = trimmed.lastIndexOf(' ');
            if (spaceIndex !== -1) {
              if (!excelSize) excelSize = trimmed.substring(spaceIndex + 1).trim();
              if (!excelColor) excelColor = trimmed.substring(0, spaceIndex).trim();
            } else {
              if (!excelColor) excelColor = trimmed;
            }
          }
        }

        if (!excelSize && excelItemRaw && excelItemRaw.includes('.')) {
          let suffix = excelItemRaw.split('.').pop()?.trim().toUpperCase() || '';
          if (suffix === '2X') suffix = '2XL';
          if (suffix === '3X') suffix = '3XL';
          if (suffix === '4X') suffix = '4XL';
          if (['XS','S','M','L','XL','2XL','3XL','4XL','5XL'].includes(suffix)) {
            excelSize = suffix;
          }
        }

        const excelLineRaw = getVal(['line_num', 'lineno', 'line#', 'l#', 'ln#', 'line', 'linenum']);
        const excelLine = excelLineRaw !== undefined ? String(excelLineRaw).trim() : '';
        currentLine = excelLine;

        let product = undefined;
        if (excelItemRaw) {
          const exClean = excelItemRaw.trim();
          product = poData.products.find((p: any) => p.item_num === exClean || p.item_num === exClean + 'L' || p.item_num === exClean.replace('.2X', '.2XL').replace('.3X', '.3XL').replace('.4X', '.4XL'));
        }

        if (!product) {
          product = poData.products.find((p: any) => {
            const pLineNorm = norm(p.line_num);
            const pStyleNorm = norm(p.style_num);
            const pItemNorm = norm(p.item_num);
            const pColorNorm = norm(mapColorName(p.color));
            const pSizeNorm = norm(p.size);

            const exLineNorm = norm(excelLine);
            let exStyleNorm = norm(excelStyleRaw);
            const exItemNorm = norm(excelItemRaw);
            const exColorNorm = norm(mapColorName(excelColor));
            const exSizeNorm = norm(excelSize);

            if (exStyleNorm === '' && exItemNorm !== '' && exItemNorm.length >= 4) {
              exStyleNorm = exItemNorm.substring(0, 4);
            }

            if (exLineNorm !== '' && pLineNorm !== '') {
               const lineMatches = (pLineNorm === exLineNorm || parseInt(pLineNorm) === parseInt(exLineNorm));
               if (!lineMatches) return false;
            }
            
            const styleOrItemMatch = 
              (exStyleNorm !== '' && (pStyleNorm === exStyleNorm || pStyleNorm.includes(exStyleNorm) || exStyleNorm.includes(pStyleNorm) || pItemNorm.includes(exStyleNorm) || exStyleNorm.includes(pItemNorm))) ||
              (exItemNorm !== '' && (pItemNorm === exItemNorm || pItemNorm.includes(exItemNorm) || exItemNorm.includes(pItemNorm) || pStyleNorm.includes(exItemNorm) || exItemNorm.includes(pStyleNorm)));
            
            const identityMatch = (exStyleNorm === '' && exItemNorm === '') ? false : styleOrItemMatch;

            const colorMatch = exColorNorm === '' || pColorNorm === exColorNorm || pColorNorm.includes(exColorNorm) || exColorNorm.includes(pColorNorm);
            const sizeMatch = exSizeNorm === '' || pSizeNorm === exSizeNorm;
            
            return identityMatch && colorMatch && sizeMatch;
          });
        }

        if (!product) {
          // Fallback: match by Style, Color, Size only
          product = poData.products.find((p: any) => {
            const pStyleNorm = norm(p.style_num);
            const pItemNorm = norm(p.item_num);
            const pColorNorm = norm(mapColorName(p.color));
            const pSizeNorm = norm(p.size);

            let exStyleNorm = norm(excelStyleRaw);
            const exItemNorm = norm(excelItemRaw);
            const exColorNorm = norm(mapColorName(excelColor));
            const exSizeNorm = norm(excelSize);

            if (exStyleNorm === '' && exItemNorm !== '' && exItemNorm.length >= 4) {
              exStyleNorm = exItemNorm.substring(0, 4);
            }

            const styleOrItemMatch = 
              (exStyleNorm !== '' && (pStyleNorm === exStyleNorm || pStyleNorm.includes(exStyleNorm) || exStyleNorm.includes(pStyleNorm) || pItemNorm.includes(exStyleNorm) || exStyleNorm.includes(pItemNorm))) ||
              (exItemNorm !== '' && (pItemNorm === exItemNorm || pItemNorm.includes(exItemNorm) || exItemNorm.includes(pItemNorm) || pStyleNorm.includes(exItemNorm) || exItemNorm.includes(pStyleNorm)));
            
            const identityMatch = (exStyleNorm === '' && exItemNorm === '') ? false : styleOrItemMatch;

            const colorMatch = exColorNorm === '' || pColorNorm === exColorNorm || pColorNorm.includes(exColorNorm) || exColorNorm.includes(pColorNorm);
            const sizeMatch = exSizeNorm === '' || pSizeNorm === exSizeNorm;
            
            return identityMatch && colorMatch && sizeMatch;
          });
        }

        if (!product) {
          const stMatch = storeStock.find((s: any) => {
            const sStyleNorm = norm(s.style_num);
            const sItemNorm = norm(s.item_num);
            const sColorNorm = norm(mapColorName(s.color));
            const sSizeNorm = norm(s.size);

            let exStyleNorm = norm(excelStyleRaw);
            const exItemNorm = norm(excelItemRaw);
            const exColorNorm = norm(mapColorName(excelColor));
            const exSizeNorm = norm(excelSize);

            if (exStyleNorm === '' && exItemNorm !== '' && exItemNorm.length >= 4) {
              exStyleNorm = exItemNorm.substring(0, 4);
            }

            const identityMatch = (exStyleNorm !== '' && (sStyleNorm === exStyleNorm || sStyleNorm.includes(exStyleNorm) || exStyleNorm.includes(sStyleNorm))) ||
                                  (exItemNorm !== '' && (sItemNorm === exItemNorm || sItemNorm.includes(exItemNorm) || exItemNorm.includes(sItemNorm)));
            const colorMatch = exColorNorm === '' || sColorNorm === exColorNorm || sColorNorm.includes(exColorNorm) || exColorNorm.includes(sColorNorm);
            const sizeMatch = exSizeNorm === '' || sSizeNorm === exSizeNorm;

            return identityMatch && colorMatch && sizeMatch;
          });

          if (stMatch) {
            product = {
              id: stMatch.product_id,
              style_num: stMatch.style_num,
              item_num: stMatch.item_num,
              line_num: stMatch.line_num || excelLine || '1',
              color: stMatch.color,
              size: stMatch.size
            };
          } else {
            product = {
              id: 0,
              style_num: excelStyleRaw || excelItemRaw || 'UNSPECIFIED',
              item_num: excelItemRaw || '',
              line_num: excelLine || '1',
              color: excelColor || '',
              size: excelSize || ''
            };
          }
        }

        const sscc = String(getVal(['sscc']) || '');
        const piecesPerCarton = parseInt(String(getVal(['case_pack', 'casepack', 'casepacksize', 'case_pack_size', 'piecespercarton', 'pcspercarton', 'pcspctn', 'ppc', 'pcs/ctn', 'pcs/carton', 'pieces_per_carton']) || '0')) || 0;
        const cartonsRaw = getVal(['cartons', 'ctns', 'ctn', 'noofcartons']);
        const cartons = cartonsRaw !== undefined ? (parseInt(String(cartonsRaw)) || 1) : 1;
        const itemNum = String(getVal(['item_code', 'itemcode', 'item', 'itemno', 'item#']) || product.item_num || '');

        let qty = parseInt(String(getVal(['qty', 'quantity', 'quantity#', 'qtypcs', 'pcs', 'totalqty', 'totalpcs', 'quantitypcs', 'pcsqty', 'orderqty']) || '0')) || 0;
        if (qty === 0 && piecesPerCarton > 0) {
          qty = cartons * piecesPerCarton;
        }
        if (qty === 0 && (piecesPerCarton === 0 || isNaN(piecesPerCarton))) {
          qty = 1;
        }

        if (qty <= 0) throw new Error('Calculated quantity is 0 or negative');

        allPayloads.push({
          po_number: poData.po_number,
          product_id: product.id,
          style_num: product.style_num || excelStyleRaw || excelItemRaw || '',
          quantity: qty,
          sscc: sscc,
          item_num: itemNum,
          line_num: product.line_num || '',
          color: product.color,
          size: product.size,
          pieces_per_carton: piecesPerCarton || 0,
          cartons: cartons
        });
        successCount++;
      } catch (err: any) {
        errors.push({ 
          row: rowIdx, 
          msg: err.message || 'Row processing error',
          po: currentPONum,
          line: currentLine 
        });
      }
    }

    if (errors.length > 0) {
      const errorSummary = errors.map(e => `Row ${e.row} [PO: ${e.po}, Line: ${e.line}]: ${e.msg}`).join('\n');
      console.error('Import Errors:', errorSummary);
      alert(`Parsing failed for some rows. Please fix these issues:\n\n${errors.slice(0, 5).map(e => `Row ${e.row}: ${e.msg}`).join('\n')}`);
      setIsLoading(false);
      return;
    }

    if (allPayloads.length === 0) {
      alert('No valid records found to import.');
      setIsLoading(false);
      return;
    }

    await verifyAndExecuteShipping(allPayloads, () => {
      setImportPreview([]);
    });
  };

  const deleteShipment = async (id: number) => {
    if (!confirm('Delete shipment record?')) return;
    try {
      await shippingService.delete(id);
      fetchHistory();
    } catch (error: any) {
      alert(error.message);
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-4 pt-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tighter flex items-center gap-3 uppercase">
            <Truck className="w-8 h-8 text-ship shrink-0" />
            Dispatch & Shipped
          </h2>
          <p className="text-text3 text-[10px] font-mono uppercase tracking-[0.2em] mt-1">Global logistics & shipment manifest management</p>
        </div>

        <div className="flex gap-2">
           <div className="bg-bg2 border border-bg4 px-4 py-2 rounded-2xl flex items-center gap-3 shadow-sm">
              <Warehouse className="w-4 h-4 text-po" />
              <div className="flex flex-col">
                <span className="text-[8px] font-black text-text3 uppercase leading-none">In-Store Stock</span>
                <span className="text-xs font-black text-po">{storeStock.reduce((acc, curr) => acc + curr.available_pcs, 0).toLocaleString()} <span className="opacity-50 font-mono">PCS</span></span>
              </div>
           </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex bg-bg2 p-1 rounded-xl border border-bg4 self-start lg:self-auto overflow-x-auto max-w-full gap-1">
        <button 
          onClick={() => setActiveTab('form')}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap",
            activeTab === 'form' ? "bg-ship text-white shadow-lg shadow-ship/20" : "text-text3 hover:bg-bg3"
          )}
        >
          <Truck className="w-4 h-4" /> Ship Registry
        </button>
        <button 
          onClick={() => setActiveTab('reports')}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap",
            activeTab === 'reports' ? "bg-ship text-white shadow-lg shadow-ship/20" : "text-text3 hover:bg-bg3"
          )}
        >
          <BarChart3 className="w-4 h-4" /> Ship Analytics
        </button>
      </div>

      {activeTab === 'form' ? (
        <>
          {/* Manual Selection Section */}
      <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-6 border-b border-bg4 bg-bg3/30">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <h3 className="text-lg font-bold tracking-tight">Dispatch Registry</h3>
              <p className="text-text3 text-[10px] font-mono uppercase tracking-widest">Select PO to initiate manual shipment</p>
            </div>
            <div className="flex-1 max-w-md relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text3 group-focus-within:text-ship transition-colors" />
              <select 
                value={selectedPONum}
                onChange={(e) => handlePOChange(e.target.value)}
                className="w-full bg-bg3 border border-bg4 rounded-xl py-3 pl-12 pr-4 text-sm font-black focus:ring-1 focus:ring-ship/20 outline-none transition-all appearance-none"
              >
                <option value="">-- SELECT PO TO SHIP --</option>
                {pos.map((po, idx) => <option key={`${po.po_number || po.id}-${idx}`} value={po.po_number}>{po.po_number}</option>)}
              </select>
            </div>
          </div>
        </div>

        {selectedPONum && (
          <div className="p-8 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-bg3/20 p-4 rounded-xl border border-bg4">
              <div className="flex items-center justify-center border-r border-bg4 pr-4">
                <button 
                  onClick={() => setShowCompleted(!showCompleted)}
                  className={cn(
                    "w-full text-[10px] font-black uppercase px-4 py-2 rounded-lg transition-colors border shadow-sm",
                    showCompleted 
                      ? "bg-bg4 border-bg4 text-text hover:bg-bg3" 
                      : "bg-ship/10 border-ship/30 text-ship hover:bg-ship/20"
                  )}
                >
                  {showCompleted ? 'Hide Shipped' : 'Show All'}
                </button>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-text3 uppercase px-1">Style Filter</label>
                <select 
                  value={filterStyle} 
                  onChange={e => setFilterStyle(e.target.value)}
                  className="w-full bg-bg3 border border-bg4 rounded-lg p-2 text-xs"
                >
                  <option value="All">All Styles</option>
                  {[...new Set(products.map(p => p.style_num))].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-text3 uppercase px-1">Color Filter</label>
                <select 
                  value={filterColor} 
                  onChange={e => setFilterColor(e.target.value)}
                  className="w-full bg-bg3 border border-bg4 rounded-lg p-2 text-xs"
                >
                  <option value="All">All Colors</option>
                  {[...new Set(products.map(p => p.color))].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-text3 uppercase px-1">Size Filter</label>
                <select 
                  value={filterSize} 
                  onChange={e => setFilterSize(e.target.value)}
                  className="w-full bg-bg3 border border-bg4 rounded-lg p-2 text-xs"
                >
                  <option value="All">All Sizes</option>
                  {Array.from(new Set(products.map(p => p.size))).sort(compareSizes).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="flex items-end">
                <button 
                  onClick={() => {
                    const newQtys = { ...quantities };
                    products
                      .filter(p => {
                        const isCompleted = (p.total_shipped || 0) >= (p.total_accepted_packed_qty || 0);
                        const passStatus = showCompleted || !isCompleted;
                        return passStatus &&
                          (filterStyle === 'All' || p.style_num === filterStyle) &&
                          (filterColor === 'All' || p.color === filterColor) &&
                          (filterSize === 'All' || p.size === filterSize);
                      })
                      .forEach(p => {
                        const available = (p.total_accepted_packed_qty || 0) - (p.total_shipped || 0);
                        newQtys[p.id] = { ...newQtys[p.id], qty: available > 0 ? available : 0 };
                      });
                    setQuantities(newQtys);
                  }}
                  className="w-full bg-bg text-[10px] font-black text-ship hover:text-white hover:bg-ship uppercase py-2 rounded-lg transition-all border border-ship/30 shadow-sm"
                >
                  Fill (Shipped)
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-bg3/50 border-b border-bg4 text-text font-black">
                    <th className="p-4 text-xs font-mono uppercase font-black text-text">Product Detail</th>
                    <th className="p-4 text-xs font-mono uppercase font-black text-center text-text">Order Qty</th>
                    <th className="p-4 text-xs font-mono uppercase font-black text-center text-text">Store Cartons</th>
                    <th className="p-4 text-xs font-mono uppercase font-black text-center text-text">Store Pcs</th>
                    <th className="p-4 text-xs font-mono uppercase font-black text-center text-text">Shipped Total</th>
                    <th className="p-4 text-xs font-mono uppercase font-black w-32 text-text">Qty to Ship</th>
                    <th className="p-4 text-xs font-mono uppercase font-black w-24 text-text">Cartons</th>
                    <th className="p-4 text-xs font-mono uppercase font-black w-40 text-text">SSCC Label</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg4 text-text">
                  {products
                    .filter(p => {
                      const isCompleted = (p.total_shipped || 0) >= (p.total_accepted_packed_qty || 0);
                      const passStatus = showCompleted || !isCompleted;
                      
                      return passStatus &&
                        (filterStyle === 'All' || p.style_num === filterStyle) &&
                        (filterColor === 'All' || p.color === filterColor) &&
                        (filterSize === 'All' || p.size === filterSize);
                    })
                    .map((p) => {
                      const packed = p.total_accepted_packed_qty || 0;
                      const shipped = p.total_shipped || 0;
                      const available = packed - shipped;
                      
                      return (
                        <tr key={p.id} className="hover:bg-bg3/20 transition-colors">
                          <td className="p-4">
                            <p className="font-black text-sm tracking-tight">{p.style_num}</p>
                            <p className="text-[10px] font-mono text-text3 uppercase mt-0.5">
                              {p.line_num ? `L# ${p.line_num} • ` : ''}{p.color} • {p.size}
                            </p>
                          </td>
                          <td className="p-4 text-center font-mono text-sm font-bold text-text">{p.qty || 0}</td>
                          <td className="p-4 text-center font-mono text-sm font-black text-pack">{p.total_accepted_cartons || 0} CTN</td>
                          <td className="p-4 text-center font-mono text-sm font-black text-ship bg-ship/5">{available} PCS</td>
                          <td className="p-4 text-center font-mono text-sm font-black text-ship">{shipped}</td>
                          <td className="p-4">
                            <input 
                              type="number" min="0" max={available}
                              value={quantities[p.id]?.qty || 0}
                              onChange={(e) => setQuantities({...quantities, [p.id]: { ...quantities[p.id], qty: parseInt(e.target.value) || 0 }})}
                              className={cn(
                                "w-full bg-bg3 border border-bg4 rounded-xl p-2.5 text-sm font-black text-center focus:ring-1 outline-none",
                                (quantities[p.id]?.qty || 0) > available ? "border-reject text-reject focus:ring-reject/20" : "focus:border-ship focus:ring-ship/20"
                              )}
                            />
                            <p className="text-[8px] text-center mt-1 text-text3 uppercase font-mono font-bold">{available} available</p>
                          </td>
                          <td className="p-4">
                            <input 
                              type="number" min="0"
                              value={quantities[p.id]?.cartons || 0}
                              onChange={(e) => setQuantities({...quantities, [p.id]: { ...quantities[p.id], cartons: parseInt(e.target.value) || 0 }})}
                              className="w-full bg-bg3 border border-bg4 rounded-xl p-2.5 text-sm font-black text-center"
                            />
                          </td>
                          <td className="p-4 text-center text-text">
                            <input 
                              type="text"
                              placeholder="SSCC#"
                              value={quantities[p.id]?.sscc || ''}
                              onChange={(e) => setQuantities({...quantities, [p.id]: { ...quantities[p.id], sscc: e.target.value.toUpperCase() }})}
                              className="w-full bg-bg3 border border-bg4 rounded-xl p-2.5 text-[10px] font-mono text-center uppercase font-black"
                            />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-4">
              <button 
                onClick={handleSubmitManual}
                disabled={isLoading}
                className="bg-ship text-white font-black px-12 py-4 rounded-xl shadow-xl shadow-ship/30 flex items-center gap-2 hover:scale-105 hover:bg-blue-600 transition-all uppercase tracking-widest text-xs"
              >
                <Truck className="w-5 h-5" />
                {isLoading ? 'PROCESSING...' : 'CONFIRM SHIPMENT'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Import Section */}
      <div className="bg-bg2 border border-bg4 rounded-2xl p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h3 className="text-lg font-bold tracking-tight">Shipment Manifest Import</h3>
            <p className="text-text3 text-xs font-mono uppercase tracking-widest mt-1">Excel Integration Engine</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button 
              onClick={downloadTemplate}
              className="bg-bg3 border border-bg4 hover:bg-bg4 hover:border-text3 text-text font-black px-6 py-3 rounded-xl transition-all flex items-center gap-2 uppercase tracking-widest text-xs"
            >
              <Download className="w-4 h-4" /> Download Template
            </button>
            <label className="bg-ship text-white font-black px-8 py-3 rounded-xl cursor-pointer shadow-xl shadow-ship/30 hover:scale-105 hover:bg-blue-600 transition-all flex items-center gap-2 uppercase tracking-widest text-xs">
              <FileUp className="w-5 h-5" /> Upload Manifest
              <input type="file" accept=".xlsx, .xls" onChange={handleExcelImport} className="hidden" />
            </label>
          </div>
        </div>

        {importPreview.length > 0 && (
          <div className="space-y-6">
            <div className="border border-bg4 rounded-xl overflow-hidden max-h-[400px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-bg3/50 sticky top-0">
                  <tr className="border-b border-bg4">
                    {Object.keys(importPreview[0]).map(k => (
                      <th key={k} className="p-3 text-[10px] font-black font-mono text-text uppercase">{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg4 text-text">
                  {importPreview.map((row, i) => (
                    <tr key={i} className="hover:bg-bg3/20 transition-colors">
                      {Object.values(row).map((v: any, j) => (
                        <td key={j} className="p-3 text-xs font-bold">{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-4">
              <button onClick={() => setImportPreview([])} className="px-6 py-3 text-text3 font-black uppercase text-xs hover:text-text transition-colors">Cancel Import</button>
              <button 
                onClick={processImport}
                disabled={isLoading}
                className="bg-pass text-white font-black px-10 py-3 rounded-xl shadow-xl shadow-pass/30 flex items-center gap-2 hover:bg-emerald-600 transition-all uppercase tracking-widest text-xs"
              >
                {isLoading ? 'Processing...' : 'Confirm & Process Shipment'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Handover Section */}
      <div className="max-w-2xl bg-bg2 border border-bg4 rounded-2xl p-8 shadow-sm">
        <HandoverList 
          title="Store Intake (Cartons)"
          table="pack_records"
          records={incomingPacking}
          statusField="store_status"
          statusValue="in_transit"
          onRefresh={() => {
            fetchIncoming();
            if (selectedPONum) handlePOChange(selectedPONum);
          }}
        />
      </div>

      {/* Recent Dispatches Section */}
      <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-sm mt-8">
        <div className="p-6 border-b border-bg4 bg-bg3/30 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-tight">Recent Dispatch Activity</h3>
          <div className="flex items-center gap-2 text-xs font-mono text-text3 font-black">
            <Truck className="w-4 h-4" /> RECENT DISPATCHES
          </div>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-bg3/50 border-b border-bg4">
              <th className="p-4 text-xs font-mono uppercase font-black text-text">PO / Style</th>
              <th className="p-4 text-xs font-mono uppercase font-black text-center text-text font-black">Qty</th>
              <th className="p-4 text-xs font-mono uppercase font-black text-center text-text font-black">Cartons</th>
              <th className="p-4 text-xs font-mono uppercase font-black text-text font-black">SSCC</th>
              <th className="p-4 text-xs font-mono uppercase font-black text-right text-text font-black">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bg4 text-text">
            {history.slice(0, 10).map((rec, i) => (
              <tr key={i} className="hover:bg-bg3/20 transition-colors group">
                <td className="p-4">
                  <p className="font-black text-xs text-po leading-none mb-1">{rec.po_number}</p>
                  <p className="text-sm font-black text-text">{rec.style_num}</p>
                </td>
                <td className="p-4 text-center font-black text-ship">{rec.quantity}</td>
                <td className="p-4 text-center font-mono text-sm text-text font-black">{rec.cartons || '-'}</td>
                <td className="p-4 font-mono text-[10px] text-text3 uppercase font-bold">{rec.sscc || '-'}</td>
                <td className="p-4 text-right">
                  <button onClick={() => deleteShipment(rec.id)} className="p-2 text-text3 hover:text-reject transition-colors"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  ) : (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-bg2 border border-bg4 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-mono text-text3 uppercase font-black">Gross Dispatched</p>
            <div className="p-2 bg-ship/10 rounded-lg text-ship"><Package className="w-4 h-4" /></div>
          </div>
          <p className="text-3xl font-black tracking-tight text-text">
            {reportData.reduce((acc, curr) => acc + curr.quantity, 0).toLocaleString()}
          </p>
          <p className="text-[10px] font-mono text-text3 mt-1 uppercase font-bold tracking-widest">PCS SHIPPED</p>
        </div>
        <div className="bg-bg2 border border-bg4 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-mono text-text3 uppercase font-black">Carton Throughput</p>
            <div className="p-2 bg-po/10 rounded-lg text-po"><Truck className="w-4 h-4" /></div>
          </div>
          <p className="text-3xl font-black tracking-tight text-text">
            {reportData.reduce((acc, curr) => acc + (curr.cartons || 0), 0).toLocaleString()}
          </p>
          <p className="text-[10px] font-mono text-text3 mt-1 uppercase font-bold tracking-widest">TOTAL CARTONS</p>
        </div>
        <div className="bg-bg2 border border-bg4 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-mono text-text3 uppercase font-black">Active PO Coverage</p>
            <div className="p-2 bg-pass/10 rounded-lg text-pass"><CheckCircle2 className="w-4 h-4" /></div>
          </div>
          <p className="text-3xl font-black tracking-tight text-text">
            {new Set(reportData.map(r => r.po_number)).size}
          </p>
          <p className="text-[10px] font-mono text-text3 mt-1 uppercase font-bold tracking-widest">UNIQUE ORDERS</p>
        </div>
      </div>

      <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-bg4 bg-bg3/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-tight">Shipment Analytics</h3>
            <p className="text-xs font-mono text-text3 uppercase font-bold tracking-widest">Historical Dispatch Performance</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-bg3 border border-bg4 rounded-lg px-3 py-1.5">
              <CalendarIcon className="w-3.5 h-3.5 text-text3" />
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent border-none text-[10px] font-black outline-none uppercase" />
              <span className="text-text3 text-[10px] font-black">TO</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent border-none text-[10px] font-black outline-none uppercase" />
            </div>
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text3 group-focus-within:text-ship transition-colors" />
              <input 
                type="text" 
                placeholder="Search PO/Style/SSCC..."
                value={reportSearch}
                onChange={e => setReportSearch(e.target.value)}
                className="bg-bg3 border border-bg4 rounded-lg py-1.5 pl-9 pr-4 text-xs font-black w-48 focus:ring-1 focus:ring-ship/20 outline-none transition-all placeholder:font-bold"
              />
            </div>
          </div>
        </div>

        <div className="p-6">
          <h4 className="text-[10px] font-black uppercase text-text3 mb-4 tracking-widest">Aggregated Statistics</h4>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="overflow-hidden border border-bg4 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-bg3/50 border-b border-bg4">
                    <th className="p-4 text-xs font-mono uppercase font-black text-text">Style Number</th>
                    <th className="p-4 text-xs font-mono uppercase font-black text-text">Color</th>
                    <th className="p-4 text-xs font-mono uppercase font-black text-center text-text font-black bg-ship/5">Units</th>
                    <th className="p-4 text-xs font-mono uppercase font-black text-center text-text font-black">Cartons</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg4 text-text">
                  {shippingStats.slice(0, 5).map((stat, i) => (
                    <tr key={i} className="hover:bg-bg3/10 transition-colors">
                      <td className="p-4 font-black text-sm text-text">{stat.style}</td>
                      <td className="p-4 text-xs font-black uppercase">{stat.color}</td>
                      <td className="p-4 text-center font-black text-sm text-ship">{stat.totalQty.toLocaleString()}</td>
                      <td className="p-4 text-center text-xs font-black">{stat.totalCartons || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-hidden border border-bg4 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-bg3/50 border-b border-bg4">
                    <th className="p-4 text-xs font-mono uppercase font-black text-text">Dispatch Timeline</th>
                    <th className="p-4 text-xs font-mono uppercase font-black text-text">Metadata</th>
                    <th className="p-4 text-xs font-mono uppercase font-black text-center text-text font-black bg-bg4/30">Total Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg4 text-text">
                  {reportData.slice(0, 10).map((rec, i) => (
                    <tr key={i} className="hover:bg-bg3/10 transition-colors">
                      <td className="p-4">
                        <p className="font-black text-[10px] text-text font-mono uppercase">{fmtDate(rec.created_at)}</p>
                        <p className="text-[10px] font-black text-po font-mono uppercase leading-none mt-1">{rec.po_number}</p>
                      </td>
                      <td className="p-4">
                        <p className="font-black text-sm text-text tracking-tight leading-none mb-1">{rec.style_num}</p>
                        <p className="text-[10px] font-mono text-text3 uppercase font-bold mb-1">{rec.color} • {rec.size}</p>
                        {rec.sscc && <span className="text-[9px] bg-bg4 px-1.5 py-0.5 rounded font-mono font-black text-text">SSCC: {rec.sscc}</span>}
                      </td>
                      <td className="p-4 text-center font-black text-sm text-ship bg-bg4/10">{(rec.quantity || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reportData.length > 10 && (
                <div className="p-3 bg-bg3/30 text-center text-[10px] font-mono text-text3 uppercase font-black border-t border-bg4">
                  + {reportData.length - 10} More Dispatch Records
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )}

  {shortfallPrompt && (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-bg2 border-2 border-ship rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="bg-ship p-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Truck className="w-6 h-6 animate-bounce" />
            <h3 className="font-black tracking-tight uppercase text-lg">Shortfall Detected</h3>
          </div>
          <button 
            onClick={() => setShortfallPrompt(null)}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-left">
          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 p-4 rounded-lg flex gap-3 items-start">
            <Warehouse className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-sm uppercase text-amber-600">Shortage in Stock Store</h4>
              <p className="text-xs text-text2 mt-1">
                Some items in this shipment are not fully available in the Stock Store. Would you like to import them from the **Old Stock Store** directly to complete the shipping?
              </p>
            </div>
          </div>

          <div className="border border-bg4 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-bg3 text-[10px] font-mono text-text3 uppercase border-b border-bg4 font-black">
                  <th className="p-3">Item Details</th>
                  <th className="p-3 text-center">Shortfall Qty</th>
                  <th className="p-3 text-center">Available Old Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bg4 text-text font-medium text-xs">
                {shortfallPrompt.shortfalls.map((sf, index) => (
                  <tr key={index} className="hover:bg-bg3/10">
                    <td className="p-3">
                      <p className="font-bold">{sf.style_num}</p>
                      <p className="text-[10px] text-text3 font-mono uppercase">{sf.color} • {sf.size}</p>
                    </td>
                    <td className="p-3 text-center text-red-500 font-bold font-mono">
                      {sf.shortfall_qty.toLocaleString()}
                    </td>
                    <td className={`p-3 text-center font-bold font-mono ${sf.old_stock_qty >= sf.shortfall_qty ? 'text-green-500' : 'text-amber-500'}`}>
                      {sf.old_stock_qty.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 bg-bg3/30 border-t border-bg4 flex flex-col sm:flex-row items-center justify-end gap-3">
          <button
            onClick={handleExportShortfall}
            className="sm:mr-auto w-full sm:w-auto px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-mono uppercase font-black tracking-wider transition-colors rounded-md shadow-md flex items-center justify-center gap-2 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export Shortfall
          </button>
          <button
            onClick={() => setShortfallPrompt(null)}
            className="w-full sm:w-auto px-4 py-2 border border-bg4 hover:bg-bg3 text-xs font-mono uppercase font-black tracking-wider transition-colors text-text rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={() => executeBulkShipping(shortfallPrompt.payloads, false, shortfallPrompt.onSuccess)}
            className="w-full sm:w-auto px-4 py-2 bg-bg4 hover:bg-bg3 text-xs font-mono uppercase font-black tracking-wider transition-colors text-text rounded-md"
          >
            Proceed without Old Stock
          </button>
          <button
            onClick={() => executeBulkShipping(shortfallPrompt.payloads, true, shortfallPrompt.onSuccess)}
            className="w-full sm:w-auto px-4 py-2 bg-ship hover:bg-ship/90 text-white text-xs font-mono uppercase font-black tracking-wider transition-colors rounded-md shadow-md"
          >
            Yes, Import & Ship
          </button>
        </div>
      </div>
    </div>
  )}
</div>
);
};
