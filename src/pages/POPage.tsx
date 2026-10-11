import React, { useState, useEffect, useMemo } from 'react';
import { poService } from '../services/erpService';
import { ProductionOrder, POProduct, CustomColumn } from '../types';
import { useAuth } from '../context/AuthContext';
import { 
  Plus, 
  FileUp, 
  Search, 
  Trash2, 
  Eye, 
  Download,
  X,
  Check,
  AlertTriangle,
  Settings2,
  Edit,
  Layers
} from 'lucide-react';
import { cn, fmtDate } from '../lib/utils';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';

import { toast } from 'sonner';

const COLOR_MAPPING: { [key: string]: string } = {
  // Direct mappings
  'BLACK': 'BLACK',
  'WHITE': 'WHITE',
  'GREY': 'GREY',
  'RED': 'RED',
  'BLUE': 'BLUE',
  'GREEN': 'GREEN',
  'YELLOW': 'YELLOW',
  'ORANGE': 'ORANGE',
  'BROWN': 'BROWN',
  'OXFORD': 'OXFORD',
  'ROYAL': 'ROYAL',
  'NAVY': 'NAVY',
  'CHARCOAL': 'CHARCOAL',
  'PINK': 'PINK',
  'TURQUOISE': 'TURQUOISE',
  'BURGUNDY': 'BURGUNDY',
  'GRAPHITE': 'GRAPHITE',
  'OLIVE': 'OLIVE',
  'LIME': 'LIME',
  'MAROON': 'MAROON',
  'HEATHER': 'HEATHER',
  'FOREST': 'FOREST',
  'BURNT ORANGE': 'BURNT ORANGE',
  'COLUMBIA BLUE': 'COLUMBIA BLUE',
  'KELLY GREEN': 'KELLY GREEN',
  'SAFETY YELLOW': 'SAFETY YELLOW',
  'VEGAS GOLD': 'VEGAS GOLD',
  'GOLD': 'GOLD',
  'MILITARY': 'MILITARY',

  // Abbreviation & Custom mappings
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
  
  // Remove FSG prefix if it exists
  if (processed.startsWith('FSG ')) {
    processed = processed.substring(4).trim();
  }

  // Handle compound colors linked by / or + or just spaces
  // First split by delimiters
  const parts = processed.split(/[\/\+\s]+/).filter(Boolean);
  const mappedParts = parts.map(p => {
    const code = p.trim();
    return COLOR_MAPPING[code] || code;
  });

  return mappedParts.join('/');
};

const determineBuyerFromStyle = (styleNum: string): string | null => {
  if (!styleNum) return null;
  const s = styleNum.trim();
  
  // Rule: series of 5000: e.g. 5000, 5100, 5200...
  // Matches any number in 5000-5999 or starts with 5 and has 4 or more digits
  const numericVal = parseInt(s, 10);
  const is5000Series = (!isNaN(numericVal) && numericVal >= 5000 && numericVal <= 5999) || 
                       (/^\s*5\d{3,}\s*$/.test(s));

  if (is5000Series) {
    return 'C2';
  }
  
  // Rule: "if style number any it should consider buyer=badger"
  // For any other style number, buyer is badger
  return 'badger';
};

const determineBuyersFromProducts = (products: any[], explicitBuyer?: string): string => {
  if (explicitBuyer && explicitBuyer.trim()) return explicitBuyer.trim();
  if (!products || products.length === 0) return '';
  const buyersSet = new Set<string>();
  products.forEach((p: any) => {
    if (p.buyer && String(p.buyer).trim()) {
      buyersSet.add(String(p.buyer).trim());
    } else {
      const style = String(p.style_num || '').trim();
      if (style) {
        const buyer = determineBuyerFromStyle(style);
        if (buyer) buyersSet.add(buyer);
      }
    }
  });
  if (buyersSet.size === 0) return '';
  return Array.from(buyersSet).sort().join(', ');
};

const parseExcelDueDate = (val: any): string => {
  if (val === undefined || val === null || val === '') return '';
  let str = String(val).trim();
  if (!str) return '';

  // 1. If it's already a standard YYYY-MM-DD date string
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // 1b. If it's formatted like MM/DD/YYYY or M/D/YY or similar
  if (str.includes('/') || str.includes('-')) {
    const parts = str.split(/[/\-]/);
    if (parts.length === 3) {
      let month = parts[0].trim();
      let day = parts[1].trim();
      let year = parts[2].trim();
      
      if (month.length === 1) month = '0' + month;
      if (day.length === 1) day = '0' + day;
      if (year.length === 2) year = '20' + year;
      
      if (month.length === 2 && day.length === 2 && year.length === 4) {
        return `${year}-${month}-${day}`;
      }
    }
  }

  // Remove decimal fraction if present
  if (str.includes('.')) {
    str = str.split('.')[0];
  }

  // 2. Clear any non-digit chars
  const digits = str.replace(/\D/g, '');
  
  if (digits.length >= 4 && digits.length <= 6) {
    let month = '';
    let day = '';
    let year = '';

    if (digits.length === 4) {
      month = '0' + digits.substring(0, 1);
      day = '0' + digits.substring(1, 2);
      year = '20' + digits.substring(2, 4);
    } else if (digits.length === 5) {
      month = '0' + digits.substring(0, 1);
      day = digits.substring(1, 3);
      year = '20' + digits.substring(3, 5);
    } else if (digits.length === 6) {
      month = digits.substring(0, 2);
      day = digits.substring(2, 4);
      year = '20' + digits.substring(4, 6);
    }

    const mNum = parseInt(month, 10);
    const dNum = parseInt(day, 10);
    const yNum = parseInt(year, 10);

    if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31 && yNum >= 2000 && yNum <= 2100) {
      return `${year}-${month}-${day}`;
    }
  }

  // 3. What if it's an Excel Serial Date?
  const numCheck = Number(str);
  if (!isNaN(numCheck) && numCheck > 30000 && numCheck < 60000) {
    const excelEpoch = new Date(1899, 11, 30);
    const dateObj = new Date(excelEpoch.getTime() + numCheck * 24 * 60 * 60 * 1000);
    if (!isNaN(dateObj.getTime())) {
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  // 4. Fallback to native Date parsing if possible
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return str;
};


export const POPage: React.FC = () => {
  const { user } = useAuth();
  const isAdminOrSupervisor = user?.role === 'Admin' || user?.role === 'supervisor';

  const [activeTab, setActiveTab] = useState<'list' | 'create' | 'import' | 'debug'>('list');
  const [debugSearchTerm, setDebugSearchTerm] = useState('');
  const [testStyleInput, setTestStyleInput] = useState('');

  // Admin Style-Buyer Correction State
  const [correctingStyleItem, setCorrectingStyleItem] = useState<{ style: string; buyer: string; poNumbers: string[] } | null>(null);
  const [targetBuyerInput, setTargetBuyerInput] = useState('');
  const [isSavingBuyerCorrection, setIsSavingBuyerCorrection] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editingPONumber, setEditingPONumber] = useState<string | null>(null);
  const [pos, setPos] = useState<ProductionOrder[]>([]);
  const [customCols, setCustomCols] = useState<CustomColumn[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [styleSearch, setStyleSearch] = useState('');
  const [colorSearch, setColorSearch] = useState('');
  const [sizeSearch, setSizeSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [buyerFilter, setBuyerFilter] = useState('All');
  const [seasonFilter, setSeasonFilter] = useState('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof ProductionOrder | 'total_qty', direction: 'asc' | 'desc' } | null>(null);
  const [selectedPO, setSelectedPO] = useState<any>(null);
  const [poListToDelete, setPoListToDelete] = useState<string[] | null>(null);
  const [selectedPoNumbers, setSelectedPoNumbers] = useState<string[]>([]);
  const [multipleSelectedPOsDetails, setMultipleSelectedPOsDetails] = useState<any[] | null>(null);
  const [activeMultiPOViewTab, setActiveMultiPOViewTab] = useState<string>('combined');
  const [activeIndividualPoView, setActiveIndividualPoView] = useState<string>('');

  const handleApplyBuyerCorrection = async () => {
    if (!correctingStyleItem || !targetBuyerInput.trim()) return;
    setIsSavingBuyerCorrection(true);
    try {
      const res = await poService.updateStyleBuyer(
        correctingStyleItem.style,
        targetBuyerInput.trim(),
        correctingStyleItem.poNumbers
      );
      if (res && res.success) {
        toast.success(`Buyer for Style #${correctingStyleItem.style} updated to "${targetBuyerInput.trim().toUpperCase()}" across ${res.updatedCount} PO(s).`);
        setCorrectingStyleItem(null);
        setTargetBuyerInput('');
        await fetchData();
      }
    } catch (err: any) {
      toast.error(`Failed to update buyer: ${err.response?.data?.error || err.message}`);
    } finally {
      setIsSavingBuyerCorrection(false);
    }
  };

  // Create Form State
  const [newPO, setNewPO] = useState({
    po_number: '',
    buyer: '',
    season: '',
    floor: '',
    delivery_date: '',
    priority: 'Normal',
    status: 'Active',
    remarks: '',
    products: [] as any[]
  });

  useEffect(() => {
    fetchData();
  }, []);

  // Auto-fill buyer based on style number rules ONLY if buyer is not explicitly specified
  useEffect(() => {
    if (!newPO.buyer && newPO.products && newPO.products.length > 0) {
      const derivedBuyer = determineBuyersFromProducts(newPO.products);
      if (derivedBuyer) {
        setNewPO(prev => ({ ...prev, buyer: derivedBuyer }));
      }
    }
  }, [newPO.products, newPO.buyer]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [poData, colData] = await Promise.all([
        poService.list(),
        poService.getCustomColumns()
      ]);
      setPos(poData);
      setCustomCols(colData);
    } catch (error: any) {
      console.error('Fetch failed', error);
      alert(`Failed to load data: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws);
      
      if (data.length === 0) {
        toast.error('Excel file is empty');
        return;
      }

      // Group rows by PO Number
      const poGroups: { [key: string]: any[] } = {};

      data.forEach((row: any) => {
        // Helper to find value by multiple possible keys (case-insensitive and symbols removed)
        const getVal = (keys: string[]) => {
          const foundKey = Object.keys(row).find(k => 
            keys.some(target => {
              const kNorm = k.toLowerCase().replace(/[^a-z0-9/]/g, '');
              const tNorm = target.toLowerCase().replace(/[^a-z0-9/]/g, '');
              return kNorm === tNorm;
            })
          );
          return foundKey ? row[foundKey] : undefined;
        };

        const poNum = String(getVal(['po', 'po#', 'ponum', 'purchaseorder']) || 'UNKNOWN').trim();
        
        let color = String(getVal(['color', 'colour']) || '').trim();
        let size = String(getVal(['size']) || '').trim();
        const colSize = getVal(['colsize', 'columnsize', 'color/size', 'col/size', 'col-size']);

        if (colSize && (!color || !size)) {
          const sColSize = String(colSize).trim();
          const lastSlashIndex = sColSize.lastIndexOf('/');
          if (lastSlashIndex !== -1) {
            color = sColSize.substring(0, lastSlashIndex).trim();
            size = sColSize.substring(lastSlashIndex + 1).trim();
          } else {
            color = color || sColSize;
          }
        }

        // Apply Color Mapping
        color = mapColorName(color);

        const itemNum = String(getVal(['item', 'itemno', 'item#']) || '').trim();
        let styleNum = String(getVal(['style', 'styleno', 'style#']) || '').trim();
        
        // User rule: if style is missing, first 4 digits of item# is style#
        if (!styleNum && itemNum.length >= 4) {
          styleNum = itemNum.substring(0, 4);
        }

        const qty = parseInt(String(getVal(['qty', 'quantity', 'quantity#', 'qtypcs', 'pcs', 'totalqty', 'totalpcs', 'quantitypcs', 'pcsqty', 'orderqty', 'total']) || '0'));
        const price = parseFloat(String(getVal(['price', 'unitprice', 'rate', 'cost']) || '0').replace('$', ''));
        const rawDeliveryDate = getVal(['delivery', 'deliverydate', 'duedate', 'shipdate']);
        const deliveryDate = parseExcelDueDate(rawDeliveryDate);

        const product = {
          line_num: String(getVal(['line', 'lineno', 'line#', 'l#']) || ''),
          style_num: styleNum,
          item_num: itemNum,
          description: String(getVal(['description', 'desc', 'articlename']) || ''),
          color,
          size,
          qty,
          unit_price: price,
          fabric_type: String(getVal(['fabric', 'fabrictype', 'quality', 'material']) || ''),
          gsm: String(getVal(['gsm']) || ''),
          country: String(getVal(['country', 'origin', 'dest']) || ''),
          ship_mode: String(getVal(['shipmode', 'shipping', 'mode']) || ''),
          delivery_date: deliveryDate, // store per product for now, will extract for PO
          buyer: determineBuyerFromStyle(styleNum) || String(getVal(['buyer', 'customer', 'brand']) || '').trim(), // store per product
          priority: 'Normal',
          custom_data: {}
        };

        if (!poGroups[poNum]) poGroups[poNum] = [];
        poGroups[poNum].push(product);
      });

      const poNumbers = Object.keys(poGroups);

      if (poNumbers.length === 1 && poNumbers[0] !== 'UNKNOWN') {
        // Simple case: One specific PO
        const firstPoNum = poNumbers[0];
        const products = poGroups[firstPoNum];
        const derivedBuyer = determineBuyersFromProducts(products);
        setNewPO({
          po_number: firstPoNum,
          buyer: derivedBuyer,
          season: '',
          floor: '',
          delivery_date: products[0].delivery_date || '',
          priority: 'Normal',
          status: 'Active',
          remarks: 'Imported from Excel',
          products
        });
        setIsEditing(false);
        setEditingPONumber(null);
        setActiveTab('create');
        toast.info(`Imported PO ${firstPoNum} with ${products.length} items`);
      } else if (poNumbers.length > 1) {
        // Multi PO case: Automatic Bulk Create
        let successCount = 0;
        let failCount = 0;

        setIsLoading(true);
        toast.info(`Importing ${poNumbers.length} POs from file...`);

        for (const poNum of poNumbers) {
          const products = poGroups[poNum];
          const derivedBuyer = determineBuyersFromProducts(products);
          try {
            await poService.create({
              po_number: poNum,
              buyer: derivedBuyer,
              season: '',
              floor: '',
              delivery_date: products[0].delivery_date || '',
              priority: 'Normal',
              status: 'Active',
              remarks: 'Bulk Imported',
              products
            });
            successCount++;
          } catch (err) {
            console.error(`Failed to import PO ${poNum}`, err);
            failCount++;
          }
        }
        setIsLoading(false);
        toast.success(`Successfully imported ${successCount} POs. ${failCount > 0 ? `${failCount} failed.` : ''}`);
        setActiveTab('list');
        fetchData();
      } else {
        // Unknown PO case
        setNewPO(prev => ({ ...prev, products: poGroups['UNKNOWN'] || [] }));
        setActiveTab('create');
        toast.info('PO Number not found in file. Please set manually.');
      }
    };
    reader.readAsBinaryString(file);
    // Clear input
    e.target.value = '';
  };

  const createPO = async () => {
    const action = async () => {
      const payload = {
        ...newPO,
        po_number: newPO.po_number.trim()
      };
      
      if (isEditing && editingPONumber) {
        await poService.update(editingPONumber, payload);
      } else {
        await poService.create(payload);
      }
      
      setActiveTab('list');
      fetchData();
      resetForm();
      return isEditing ? "Production Order updated successfully" : "Production Order created successfully";
    };

    toast.promise(action(), {
      loading: isEditing ? 'Updating PO...' : 'Creating PO...',
      success: (msg) => msg,
      error: (err) => err.message || 'Failed to process PO'
    });
  };

  const resetForm = () => {
    setNewPO({
      po_number: '', buyer: '', season: '', floor: '', delivery_date: '',
      priority: 'Normal', status: 'Active', remarks: '', products: []
    });
    setIsEditing(false);
    setEditingPONumber(null);
  };

  const handleStartEdit = async (po: ProductionOrder) => {
    try {
      const data = await poService.get(po.po_number, po.buyer);
      setNewPO({
        po_number: data.po_number,
        buyer: data.buyer || '',
        season: data.season || '',
        floor: data.floor || '',
        delivery_date: data.delivery_date || '',
        priority: data.priority || 'Normal',
        status: data.status || 'Active',
        remarks: data.remarks || '',
        products: data.products || []
      });
      setIsEditing(true);
      setEditingPONumber(data.po_number);
      setActiveTab('create');
    } catch (error: any) {
      toast.error(`Failed to load PO details: ${error.message}`);
    }
  };

  const deletePO = async (po_number: string) => {
    const upper = po_number.toUpperCase().trim();
    if (upper === 'UNIVERSAL' || upper.startsWith('UNALLOCATED')) {
      toast.error(`Deletion of virtual PO "${po_number}" is strictly restricted.`);
      return;
    }
    setPoListToDelete([po_number]);
  };

  const confirmDelete = async () => {
    if (!poListToDelete || poListToDelete.length === 0) return;
    const toDelete = poListToDelete.filter(num => {
      const u = num.toUpperCase().trim();
      return u !== 'UNIVERSAL' && !u.startsWith('UNALLOCATED');
    });
    setPoListToDelete(null);
    if (toDelete.length === 0) {
      toast.error("Virtual POs (UNIVERSAL / UNALLOCATED) cannot be deleted.");
      return;
    }
    setSelectedPoNumbers(prev => prev.filter(num => !toDelete.includes(num)));
    
    const action = async () => {
      await Promise.all(toDelete.map(num => poService.delete(num)));
      await fetchData();
      return `${toDelete.length} PO(s) deleted successfully`;
    };

    toast.promise(action(), {
      loading: `Deleting ${toDelete.length} PO(s)...`,
      success: (msg) => msg,
      error: (err) => err.message || 'Failed to delete POs'
    });
  };

  const handleSort = (key: keyof ProductionOrder | 'total_qty') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const viewDetail = async (po_number: string, buyer?: string) => {
    try {
      const data = await poService.get(po_number, buyer);
      setSelectedPO(data);
    } catch (error: any) {
      alert(error.message);
    }
  };

  const filteredPOs = React.useMemo(() => {
    let filtered = pos.filter(po => 
      (po.po_number.toLowerCase().includes(searchTerm.toLowerCase()) || (po.buyer || '').toLowerCase().includes(searchTerm.toLowerCase())) &&
      (statusFilter === 'All' || po.status === statusFilter) &&
      (buyerFilter === 'All' || (po.buyer || '').split(',').map((b: string) => b.trim()).includes(buyerFilter)) &&
      (seasonFilter === 'All' || (po.season || 'Other') === seasonFilter) &&
      (!styleSearch || (po.styles || '').toLowerCase().includes(styleSearch.toLowerCase())) &&
      (!colorSearch || (po.colors || '').toLowerCase().includes(colorSearch.toLowerCase())) &&
      (!sizeSearch || (po.sizes || '').toLowerCase().includes(sizeSearch.toLowerCase())) &&
      (!startDate || po.delivery_date >= startDate) &&
      (!endDate || po.delivery_date <= endDate)
    );

    if (sortConfig) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortConfig.key] || '';
        const bVal = b[sortConfig.key] || '';
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [pos, searchTerm, statusFilter, buyerFilter, seasonFilter, styleSearch, colorSearch, sizeSearch, startDate, endDate, sortConfig]);

  const toggleSelectPO = (po_number: string) => {
    const upper = po_number.toUpperCase().trim();
    if (upper === 'UNIVERSAL' || upper.startsWith('UNALLOCATED')) return;
    setSelectedPoNumbers(prev => 
      prev.includes(po_number) 
        ? prev.filter(num => num !== po_number) 
        : [...prev, po_number]
    );
  };

  const isAllFilteredSelected = filteredPOs.length > 0 && filteredPOs.filter(po => {
    const u = po.po_number.toUpperCase().trim();
    return u !== 'UNIVERSAL' && !u.startsWith('UNALLOCATED');
  }).every(po => selectedPoNumbers.includes(po.po_number));
  
  const toggleSelectAllFiltered = () => {
    const filteredNums = filteredPOs
      .map(po => po.po_number)
      .filter(num => {
        const u = num.toUpperCase().trim();
        return u !== 'UNIVERSAL' && !u.startsWith('UNALLOCATED');
      });

    if (isAllFilteredSelected) {
      setSelectedPoNumbers(prev => prev.filter(num => !filteredNums.includes(num)));
    } else {
      setSelectedPoNumbers(prev => {
        const next = [...prev];
        filteredNums.forEach(num => {
          if (!next.includes(num)) next.push(num);
        });
        return next;
      });
    }
  };

  const handleFetchAndOpenMultipleView = async () => {
    if (selectedPoNumbers.length === 0) return;
    
    const action = async () => {
      const details = await Promise.all(
        selectedPoNumbers.map(num => poService.get(num))
      );
      setMultipleSelectedPOsDetails(details);
      setActiveMultiPOViewTab('combined');
      if (details.length > 0) {
        setActiveIndividualPoView(details[0].po_number);
      }
      return `Loaded details for ${selectedPoNumbers.length} PO(s)`;
    };

    toast.promise(action(), {
      loading: 'Fetching PO details...',
      success: (msg) => msg,
      error: 'Failed to fetch details for some POs'
    });
  };

  const consolidatedProducts = React.useMemo(() => {
    if (!multipleSelectedPOsDetails) return [];
    const grouped: Record<string, any> = {};
    multipleSelectedPOsDetails.forEach(po => {
      (po.products || []).forEach((p: any) => {
        const key = `${p.style_num}-${p.color}-${p.size}`;
        if (!grouped[key]) {
          grouped[key] = {
            style_num: p.style_num,
            description: p.description,
            fabric_type: p.fabric_type,
            gsm: p.gsm,
            color: p.color,
            size: p.size,
            qty: 0,
            po_sources: new Set<string>()
          };
        }
        grouped[key].qty += (p.qty || 0);
        grouped[key].po_sources.add(po.po_number);
      });
    });
    return Object.values(grouped).map((item: any) => ({
      ...item,
      po_sources: Array.from(item.po_sources).join(', ')
    }));
  }, [multipleSelectedPOsDetails]);

  const styleToBuyerMap = useMemo(() => {
    const map: { [style: string]: { style: string; buyer: string; sourceType: 'explicit' | 'rule'; poNumbers: string[] } } = {};

    pos.forEach(po => {
      const stylesInPO = (po.styles || '').split(',').map(s => s.trim()).filter(Boolean);
      const rawBuyer = po.buyer && po.buyer.trim() && po.buyer.trim().toUpperCase() !== 'UNIVERSAL' && po.buyer.trim().toUpperCase() !== 'GLOBAL' ? po.buyer.trim() : null;

      stylesInPO.forEach(style => {
        const ruleBuyer = determineBuyerFromStyle(style);
        let resolvedBuyer = rawBuyer || ruleBuyer || 'badger';

        // Handle composite buyer values like "C2, BADGER"
        if (rawBuyer && rawBuyer.includes(',')) {
          const parts = rawBuyer.split(',').map(b => b.trim()).filter(Boolean);
          if (ruleBuyer && parts.map(p => p.toLowerCase()).includes(ruleBuyer.toLowerCase())) {
            resolvedBuyer = ruleBuyer;
          } else {
            resolvedBuyer = parts[0] || ruleBuyer || 'badger';
          }
        }

        if (!map[style]) {
          map[style] = {
            style,
            buyer: resolvedBuyer,
            sourceType: rawBuyer && !rawBuyer.includes(',') ? 'explicit' : 'rule',
            poNumbers: [po.po_number]
          };
        } else {
          if (!map[style].poNumbers.includes(po.po_number)) {
            map[style].poNumbers.push(po.po_number);
          }
          if (rawBuyer && map[style].sourceType === 'rule') {
            map[style].buyer = resolvedBuyer;
            map[style].sourceType = 'explicit';
          }
        }
      });
    });

    return Object.values(map).sort((a, b) => a.style.localeCompare(b.style, undefined, { numeric: true }));
  }, [pos]);

  const filteredStyleMap = useMemo(() => {
    if (!debugSearchTerm.trim()) return styleToBuyerMap;
    const term = debugSearchTerm.toLowerCase().trim();
    return styleToBuyerMap.filter(item => 
      item.style.toLowerCase().includes(term) ||
      item.buyer.toLowerCase().includes(term) ||
      item.poNumbers.some(p => p.toLowerCase().includes(term))
    );
  }, [styleToBuyerMap, debugSearchTerm]);

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-between sm:justify-start bg-bg2 p-1.5 rounded-xl border border-bg4 w-full sm:w-fit shadow-inner gap-1">
        <button 
          onClick={() => { setActiveTab('list'); resetForm(); }}
          className={cn("flex-1 sm:flex-none px-4 sm:px-6 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all", activeTab === 'list' ? "bg-bg text-text shadow-sm border border-bg4" : "text-text3 hover:text-text")}
        >
          PO List
        </button>
        <button 
          onClick={() => { setActiveTab('create'); resetForm(); }}
          className={cn("flex-1 sm:flex-none px-4 sm:px-6 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all", activeTab === 'create' ? "bg-bg text-text shadow-sm border border-bg4" : "text-text3 hover:text-text")}
        >
          {isEditing ? 'Edit PO' : 'Create New'}
        </button>
        <button 
          onClick={() => { setActiveTab('import'); resetForm(); }}
          className={cn("flex-1 sm:flex-none px-4 sm:px-6 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all", activeTab === 'import' ? "bg-bg text-text shadow-sm border border-bg4" : "text-text3 hover:text-text")}
        >
          Import Excel
        </button>
        <button 
          onClick={() => { setActiveTab('debug'); resetForm(); }}
          className={cn("flex-1 sm:flex-none px-4 sm:px-6 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all flex items-center gap-1.5", activeTab === 'debug' ? "bg-bg text-po shadow-sm border border-bg4" : "text-text3 hover:text-text")}
        >
          <Layers className="w-3.5 h-3.5" />
          Style-Buyer Map (Debug)
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'list' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Stats Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-bg2 border border-bg4 p-6 rounded-2xl card-shadow">
                <p className="text-xs font-mono text-text3 uppercase mb-1 font-bold">Total Orders</p>
                <p className="text-2xl font-black">{pos.length}</p>
              </div>
              <div className="bg-bg2 border border-bg4 p-6 rounded-2xl card-shadow">
                <p className="text-xs font-mono text-text3 uppercase mb-1 font-bold">Active Orders</p>
                <p className="text-2xl font-black text-pass">{pos.filter(p => p.status === 'Active').length}</p>
              </div>
              <div className="bg-bg2 border border-bg4 p-6 rounded-2xl card-shadow">
                <p className="text-xs font-mono text-text3 uppercase mb-1 font-bold">Total Pieces</p>
                <p className="text-2xl font-black text-po">{(pos.reduce((acc, p) => acc + (p.total_qty || 0), 0) || 0).toLocaleString()}</p>
              </div>
              <div className="bg-bg2 border border-bg4 p-6 rounded-2xl text-center flex items-center justify-center">
                <button 
                  onClick={() => { setActiveTab('import'); resetForm(); }}
                  className="bg-bg4 hover:bg-bg3 p-4 rounded-xl transition-colors border border-bg4"
                >
                  <FileUp className="w-5 h-5 text-po" />
                </button>
              </div>
            </div>

            <div className="bg-bg2 p-4 rounded-2xl border border-bg4 space-y-4">
              <div className="flex items-center gap-4 bg-bg3/50 p-3 rounded-xl border border-bg4">
                <Search className="w-5 h-5 text-text3" />
                <input 
                  type="text" 
                  placeholder="Search POs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-transparent border-none focus:ring-0 text-sm w-full font-medium"
                />
              </div>
              
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 bg-bg3 p-2 rounded-xl border border-bg4 min-w-[200px]">
                  <span className="text-[10px] font-mono text-text3 uppercase">Delivery Range</span>
                  <div className="flex items-center gap-1">
                    <input 
                      type="date" 
                      value={startDate} 
                      onChange={e => setStartDate(e.target.value)}
                      className="bg-transparent border-none text-[10px] font-bold outline-none w-24"
                    />
                    <span className="text-text3">-</span>
                    <input 
                      type="date" 
                      value={endDate} 
                      onChange={e => setEndDate(e.target.value)}
                      className="bg-transparent border-none text-[10px] font-bold outline-none w-24"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-bg3 p-2 rounded-xl border border-bg4 min-w-[140px]">
                  <span className="text-[10px] font-mono text-text3 uppercase">Buyer</span>
                  <select value={buyerFilter} onChange={e => setBuyerFilter(e.target.value)} className="bg-transparent border-none text-xs font-bold outline-none flex-1">
                    {['All', ...new Set(pos.flatMap(p => (p.buyer || '').split(',').map(b => b.trim()).filter(Boolean)))].map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                <div className="flex items-center gap-2 bg-bg3 p-2 rounded-xl border border-bg4 min-w-[140px]">
                  <span className="text-[10px] font-mono text-text3 uppercase">Status</span>
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-transparent border-none text-xs font-bold outline-none flex-1">
                    <option value="All">All Items</option>
                    <option value="Active">Active</option>
                    <option value="On Review">On Review</option>
                    <option value="On Hold">On Hold</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
                
                <div className="flex items-center gap-2 bg-bg3 p-2 rounded-xl border border-bg4 min-w-[140px]">
                  <span className="text-[10px] font-mono text-text3 uppercase">Style</span>
                  <input 
                    type="text" 
                    placeholder="Search Style..."
                    value={styleSearch}
                    onChange={e => setStyleSearch(e.target.value)}
                    className="bg-transparent border-none text-xs font-bold outline-none flex-1 placeholder:font-normal"
                  />
                </div>

                <div className="flex items-center gap-2 bg-bg3 p-2 rounded-xl border border-bg4 min-w-[140px]">
                  <span className="text-[10px] font-mono text-text3 uppercase">Color</span>
                  <input 
                    type="text" 
                    placeholder="Search Color..."
                    value={colorSearch}
                    onChange={e => setColorSearch(e.target.value)}
                    className="bg-transparent border-none text-xs font-bold outline-none flex-1 placeholder:font-normal"
                  />
                </div>

                <div className="flex items-center gap-2 bg-bg3 p-2 rounded-xl border border-bg4 min-w-[140px]">
                  <span className="text-[10px] font-mono text-text3 uppercase">Size</span>
                  <input 
                    type="text" 
                    placeholder="Search Size..."
                    value={sizeSearch}
                    onChange={e => setSizeSearch(e.target.value)}
                    className="bg-transparent border-none text-xs font-bold outline-none flex-1 placeholder:font-normal"
                  />
                </div>

                <div className="flex items-center gap-2 bg-bg3 p-2 rounded-xl border border-bg4 min-w-[140px]">
                  <span className="text-[10px] font-mono text-text3 uppercase">Status</span>
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-transparent border-none text-xs font-bold outline-none flex-1">
                    <option value="All">All Status</option>
                    <option value="Active">Active</option>
                    <option value="On Review">On Review</option>
                    <option value="On Hold">On Hold</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
                
                <button 
                  onClick={() => {
                    setSearchTerm('');
                    setStyleSearch('');
                    setColorSearch('');
                    setSizeSearch('');
                    setBuyerFilter('All');
                    setSeasonFilter('All');
                    setStatusFilter('All');
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="text-[10px] font-mono text-text3 uppercase hover:text-text transition-colors ml-auto"
                >
                  Clear Filters
                </button>
              </div>
            </div>

            {/* Batch Action Bar */}
            <AnimatePresence>
              {selectedPoNumbers.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: -10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.98 }}
                  className="bg-po/5 border border-po/20 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-po text-white text-xs font-black min-w-6 h-6 px-1.5 rounded-full flex items-center justify-center shadow-sm">
                      {selectedPoNumbers.length}
                    </div>
                    <div>
                      <span className="text-xs font-black uppercase tracking-wider text-text">Orders Selected</span>
                      <p className="text-[10px] font-mono text-text3 font-bold truncate max-w-sm sm:max-w-md">
                        {selectedPoNumbers.join(', ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleFetchAndOpenMultipleView}
                      className="flex items-center gap-1.5 bg-bg border border-bg4 hover:bg-bg3 text-po text-[10px] sm:text-xs font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all shadow-sm"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      View Together
                    </button>
                    <button 
                      onClick={() => setPoListToDelete(selectedPoNumbers)}
                      className="flex items-center gap-1.5 bg-reject hover:bg-red-600 text-white text-[10px] sm:text-xs font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all shadow-md shadow-reject/15"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Selected
                    </button>
                    <button 
                      onClick={() => setSelectedPoNumbers([])}
                      className="text-text3 hover:text-text text-[10px] font-mono uppercase tracking-widest ml-2"
                    >
                      Clear
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-auto max-h-[600px]">
                <table className="w-full text-left border-collapse min-w-[950px]">
                  <thead>
                  <tr className="bg-bg3/50 border-b border-bg4 sticky top-0 z-20 backdrop-blur-sm bg-bg2 shadow-sm">
                  <th className="p-4 w-12 text-center sticky top-0 bg-bg2 z-20 border-b border-bg4">
                    <input 
                      type="checkbox" 
                      checked={isAllFilteredSelected} 
                      onChange={toggleSelectAllFiltered}
                      className="rounded border-bg4 text-po focus:ring-po/50 focus:ring-opacity-50 h-4 w-4 bg-bg cursor-pointer transition-all"
                    />
                  </th>
                  <th className="p-4 text-xs font-mono text-text uppercase tracking-widest whitespace-nowrap font-black sticky top-0 bg-bg2 z-20 border-b border-bg4">
                    <button onClick={() => handleSort('po_number')} className="flex items-center gap-1 hover:text-po">
                      PO Number
                      {sortConfig?.key === 'po_number' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </button>
                  </th>
                  <th className="p-4 text-xs font-mono text-text uppercase tracking-widest whitespace-nowrap font-black sticky top-0 bg-bg2 z-20 border-b border-bg4">
                    <button onClick={() => handleSort('buyer')} className="flex items-center gap-1 hover:text-po">
                      Buyer / Season
                      {sortConfig?.key === 'buyer' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </button>
                  </th>
                  <th className="p-4 text-xs font-mono text-text uppercase tracking-widest whitespace-nowrap text-center font-black sticky top-0 bg-bg2 z-20 border-b border-bg4">
                    <button onClick={() => handleSort('priority')} className="flex items-center gap-1 mx-auto hover:text-po">
                      Priority
                      {sortConfig?.key === 'priority' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </button>
                  </th>
                  <th className="p-4 text-xs font-mono text-text uppercase tracking-widest whitespace-nowrap text-center font-black sticky top-0 bg-bg2 z-20 border-b border-bg4">
                    <button onClick={() => handleSort('delivery_date')} className="flex items-center gap-1 mx-auto hover:text-po">
                      Delivery
                      {sortConfig?.key === 'delivery_date' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </button>
                  </th>
                  <th className="p-4 text-xs font-mono text-text uppercase tracking-widest whitespace-nowrap text-center font-black sticky top-0 bg-bg2 z-20 border-b border-bg4">
                    <button onClick={() => handleSort('total_qty')} className="flex items-center gap-1 mx-auto hover:text-po">
                      Total Qty
                      {sortConfig?.key === 'total_qty' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </button>
                  </th>
                  <th className="p-4 text-xs font-mono text-text uppercase tracking-widest whitespace-nowrap text-center font-black sticky top-0 bg-bg2 z-20 border-b border-bg4">
                    <button onClick={() => handleSort('status')} className="flex items-center gap-1 mx-auto hover:text-po">
                      Status
                      {sortConfig?.key === 'status' && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                    </button>
                  </th>
                  <th className="p-4 text-xs font-mono text-text uppercase tracking-widest text-right font-black sticky top-0 bg-bg2 z-20 border-b border-bg4">Actions</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-bg4">
                  {filteredPOs.map((po, idx) => (
                    <tr key={`${po.id}-${po.buyer || idx}`} className="hover:bg-bg3/30 transition-colors group">
                      <td className="p-4 text-center">
                        {po.po_number.toUpperCase() === 'UNIVERSAL' || po.po_number.toUpperCase().startsWith('UNALLOCATED') ? (
                          <div className="flex items-center justify-center text-text3" title="Virtual PO - Deletion Restricted">
                            <span className="text-[10px] uppercase font-mono tracking-wider font-bold bg-bg4 px-1.5 py-0.5 rounded text-[9px] text-text3/70">Locked</span>
                          </div>
                        ) : (
                          <input 
                            type="checkbox" 
                            checked={selectedPoNumbers.includes(po.po_number)} 
                            onChange={() => toggleSelectPO(po.po_number)}
                            className="rounded border-bg4 text-po focus:ring-po/50 focus:ring-opacity-50 h-4 w-4 bg-bg cursor-pointer transition-all"
                          />
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-po tracking-tight text-sm">{po.po_number}</span>
                          {po.priority === 'Urgent' && <span className="px-2 py-0.5 rounded bg-reject/10 text-reject text-[10px] font-black uppercase animate-pulse">Urgent</span>}
                        </div>
                      </td>
                      <td className="p-4">
                        <p className="text-sm font-bold text-text2 uppercase tracking-wide">{po.buyer}</p>
                        <p className="text-[10px] font-mono text-text3 uppercase">{po.season || '---'}</p>
                      </td>
                      <td className="p-4 text-center">
                        <select 
                          value={po.priority || 'Normal'}
                          onChange={async (e) => {
                            const newPriority = e.target.value;
                            try {
                              await poService.updatePOPriority(po.po_number, newPriority);
                              setPos(prev => prev.map(p => p.po_number === po.po_number ? { ...p, priority: newPriority as any } : p));
                            } catch (error: any) {
                              console.error('Failed to update PO priority', error);
                              alert(`Failed to update priority: ${error.message || 'Unauthorized or server error'}`);
                            }
                          }}
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border outline-none cursor-pointer",
                            po.priority === 'Urgent' ? "bg-reject/10 text-reject border-reject/20" : 
                            po.priority === 'Low' ? "bg-bg4 text-text3 border-bg4" : "bg-po/5 text-po border-po/20"
                          )}
                        >
                          <option value="Normal">Normal</option>
                          <option value="Urgent">Urgent</option>
                          <option value="Low">Low</option>
                        </select>
                      </td>
                      <td className="p-4 text-center">
                        <p className="text-sm font-mono text-text2">{po.delivery_date}</p>
                      </td>
                      <td className="p-4 text-sm font-black text-center">{(po.total_qty || 0).toLocaleString()}</td>
                      <td className="p-4 text-center">
                        <select 
                          value={po.status || 'Active'}
                          onChange={async (e) => {
                            const newStatus = e.target.value;
                            try {
                              await poService.updatePOStatus(po.po_number, newStatus);
                              setPos(prev => prev.map(p => p.po_number === po.po_number ? { ...p, status: newStatus as any } : p));
                            } catch (error: any) {
                              console.error('Failed to update PO status', error);
                              alert(`Failed to update status: ${error.message || 'Unauthorized or server error'}`);
                            }
                          }}
                          className={cn(
                            "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest border outline-none cursor-pointer",
                            po.status === 'Active' ? "bg-pass/10 text-pass border-pass/20" : "bg-bg4 text-text3 border-bg4"
                          )}
                        >
                          <option value="Active">Active</option>
                          <option value="On Review">On Review</option>
                          <option value="On Hold">On Hold</option>
                          <option value="Closed">Closed</option>
                        </select>
                      </td>
                      <td className="p-4 text-right space-x-1">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartEdit(po);
                          }} 
                          className="p-2 text-text3 hover:text-po hover:bg-po/10 rounded-lg transition-all"
                          title="Edit PO"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            viewDetail(po.po_number, po.buyer);
                          }} 
                          className="p-2 text-text3 hover:text-po hover:bg-po/10 rounded-lg transition-all"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {po.po_number.toUpperCase() === 'UNIVERSAL' || po.po_number.toUpperCase().startsWith('UNALLOCATED') ? (
                          <button 
                            disabled
                            className="p-2 text-text3 opacity-40 cursor-not-allowed rounded-lg"
                            title="System Virtual PO cannot be deleted"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              deletePO(po.po_number);
                            }} 
                            className="p-2 text-text3 hover:text-reject hover:bg-reject/10 rounded-lg transition-all"
                            title="Delete PO"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {pos.length === 0 && !isLoading && (
                <div className="p-20 text-center space-y-4">
                  <div className="w-16 h-16 bg-bg3 rounded-full flex items-center justify-center mx-auto">
                    <AlertTriangle className="w-8 h-8 text-text3" />
                  </div>
                  <p className="text-text3 font-medium">No production orders found.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {activeTab === 'create' && (
        <div className="bg-bg2 border border-bg4 rounded-2xl p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-text3 uppercase tracking-wider">PO Number</label>
              <input 
                type="text" 
                value={newPO.po_number}
                onChange={e => setNewPO({...newPO, po_number: e.target.value})}
                disabled={isEditing}
                className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-text3 uppercase tracking-wider">Buyer</label>
              <input 
                type="text" 
                value={newPO.buyer}
                onChange={e => setNewPO({...newPO, buyer: e.target.value})}
                className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-text3 uppercase tracking-wider">Season</label>
              <input 
                type="text" 
                value={newPO.season}
                onChange={e => setNewPO({...newPO, season: e.target.value})}
                className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-text3 uppercase tracking-wider">Delivery Date</label>
              <input 
                type="date" 
                value={newPO.delivery_date}
                onChange={e => setNewPO({...newPO, delivery_date: e.target.value})}
                className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-text3 uppercase tracking-wider">Priority</label>
              <select 
                value={newPO.priority}
                onChange={e => setNewPO({...newPO, priority: e.target.value as any})}
                className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold uppercase"
              >
                <option value="Normal">Normal</option>
                <option value="Urgent">Urgent</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold uppercase tracking-widest text-text3">Products ({newPO.products.length})</h4>
              <button 
                onClick={() => setNewPO({...newPO, products: [...newPO.products, { line_num: '', style_num: '', color: '', size: '', qty: 0, unit_price: 0, priority: 'Normal' }]})}
                className="flex items-center gap-2 text-xs font-bold text-po hover:text-po/80"
              >
                <Plus className="w-4 h-4" /> Add Product
              </button>
            </div>

            <div className="border border-bg4 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-bg3/50">
                  <tr className="border-b border-bg4">
                    <th className="p-3 text-[10px] font-mono text-text3 uppercase">Line</th>
                    <th className="p-3 text-[10px] font-mono text-text3 uppercase">Style #</th>
                    <th className="p-3 text-[10px] font-mono text-text3 uppercase">Color</th>
                    <th className="p-3 text-[10px] font-mono text-text3 uppercase">Size</th>
                    <th className="p-3 text-[10px] font-mono text-text3 uppercase">Due Date</th>
                    <th className="p-3 text-[10px] font-mono text-text3 uppercase">Priority</th>
                    <th className="p-3 text-[10px] font-mono text-text3 uppercase">Qty</th>
                    <th className="p-3 text-[10px] font-mono text-text3 uppercase">Price</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {newPO.products.map((p, idx) => (
                    <tr key={idx} className="border-b border-bg4 last:border-0">
                      <td className="p-2"><input type="text" value={p.line_num} onChange={e => { const pr = [...newPO.products]; pr[idx].line_num = e.target.value; setNewPO({...newPO, products: pr}) }} className="w-full bg-transparent border-none text-sm p-1" /></td>
                      <td className="p-2"><input type="text" value={p.style_num} onChange={e => { const pr = [...newPO.products]; pr[idx].style_num = e.target.value; setNewPO({...newPO, products: pr}) }} className="w-full bg-transparent border-none text-sm p-1" /></td>
                      <td className="p-2"><input type="text" value={p.color} onChange={e => { const pr = [...newPO.products]; pr[idx].color = e.target.value; setNewPO({...newPO, products: pr}) }} className="w-full bg-transparent border-none text-sm p-1" /></td>
                      <td className="p-2"><input type="text" value={p.size} onChange={e => { const pr = [...newPO.products]; pr[idx].size = e.target.value; setNewPO({...newPO, products: pr}) }} className="w-full bg-transparent border-none text-sm p-1" /></td>
                      <td className="p-2"><input type="date" value={p.delivery_date} onChange={e => { const pr = [...newPO.products]; pr[idx].delivery_date = e.target.value; setNewPO({...newPO, products: pr}) }} className="w-full bg-transparent border-none text-sm p-1 font-mono" /></td>
                      <td className="p-2">
                        <select 
                          value={p.priority || 'Normal'} 
                          onChange={e => { 
                            const pr = [...newPO.products]; 
                            pr[idx].priority = e.target.value as any; 
                            setNewPO({...newPO, products: pr}) 
                          }} 
                          className="w-full bg-transparent border-none text-[10px] font-bold p-1 uppercase outline-none"
                        >
                          <option value="Normal">Normal</option>
                          <option value="Urgent">Urgent</option>
                          <option value="Low">Low</option>
                        </select>
                      </td>
                      <td className="p-2"><input type="number" value={p.qty} onChange={e => { const pr = [...newPO.products]; pr[idx].qty = parseInt(e.target.value) || 0; setNewPO({...newPO, products: pr}) }} className="w-full bg-transparent border-none text-sm p-1 font-bold" /></td>
                      <td className="p-2"><input type="number" value={p.unit_price} onChange={e => { const pr = [...newPO.products]; pr[idx].unit_price = parseFloat(e.target.value) || 0; setNewPO({...newPO, products: pr}) }} className="w-full bg-transparent border-none text-sm p-1" /></td>
                      <td className="p-2 text-right">
                        <button onClick={() => { const pr = newPO.products.filter((_, i) => i !== idx); setNewPO({...newPO, products: pr}) }} className="text-text3 hover:text-reject"><X className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end pt-6">
            <button 
              onClick={createPO}
              className="bg-po text-white font-black px-10 py-4 rounded-2xl shadow-xl shadow-po/30 hover:bg-orange-600 transition-all uppercase tracking-[0.2em] text-xs hover:scale-105 active:scale-95"
            >
              {isEditing ? 'Update Production Order' : 'Save Production Order'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'import' && (
        <div className="bg-bg2 border border-bg4 rounded-2xl p-12 flex flex-col items-center justify-center text-center space-y-6">
          <div className="w-20 h-20 bg-po/10 rounded-full flex items-center justify-center text-po mb-4">
            <FileUp className="w-10 h-10" />
          </div>
          <h3 className="text-xl font-bold">Import PO from Excel</h3>
          <p className="text-text3 max-w-md">
            Upload an Excel file (.xlsx or .xls) with columns for Style, Color, Size, Qty, and Price.
            The system will automatically map the data.
          </p>
          <label className="bg-po text-white font-black px-10 py-5 rounded-2xl cursor-pointer shadow-xl shadow-po/30 hover:bg-orange-600 transition-all hover:scale-105 active:scale-95 uppercase tracking-[0.2em] text-xs">
            Select Excel File
            <input type="file" accept=".xlsx, .xls" onChange={handleImport} className="hidden" />
          </label>
        </div>
      )}

      {activeTab === 'debug' && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="space-y-6"
        >
          {/* Header & Rule Summary */}
          <div className="bg-bg2 border border-bg4 rounded-2xl p-6 card-shadow space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-po/10 text-po text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider">Admin / Debug View</span>
                  <h3 className="text-lg font-black tracking-wide">Style-to-Buyer Mapping & Verification</h3>
                </div>
                <p className="text-xs text-text3 mt-1">
                  Verify how Style numbers map to parent Buyers across all orders or test specific Style series (e.g. 5520, 1277, 2345).
                </p>
              </div>
            </div>

            {/* Quick Live Tester Box */}
            <div className="bg-bg3/60 border border-bg4 p-4 rounded-xl space-y-3">
              <label className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-2">
                <Search className="w-4 h-4 text-po" />
                Live Style Buyer Lookup Tester
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input 
                  type="text" 
                  placeholder="Enter Style # (e.g. 5520, 1277, 2345)..."
                  value={testStyleInput}
                  onChange={e => setTestStyleInput(e.target.value)}
                  className="bg-bg border border-bg4 rounded-xl px-4 py-2 text-sm font-bold flex-1 min-w-[240px] focus:outline-none focus:border-po text-text"
                />
                {testStyleInput.trim() && (() => {
                  const query = testStyleInput.trim();
                  // Check if this style exists in any PO
                  const matchingPOs = pos.filter(po => (po.styles || '').split(',').map(s => s.trim()).includes(query));
                  const explicitPO = matchingPOs.find(po => po.buyer && po.buyer.trim() && po.buyer.trim().toUpperCase() !== 'UNIVERSAL' && po.buyer.trim().toUpperCase() !== 'GLOBAL');
                  const ruleBuyer = determineBuyerFromStyle(query);

                  if (explicitPO) {
                    return (
                      <div className="bg-pass/10 border border-pass/30 text-pass px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2">
                        <Check className="w-4 h-4" />
                        Buyer: <span className="font-black underline">{explicitPO.buyer}</span> (Explicitly set in PO #{explicitPO.po_number})
                      </div>
                    );
                  } else if (ruleBuyer) {
                    const is5000 = ruleBuyer === 'C2';
                    return (
                      <div className="bg-po/10 border border-po/30 text-po px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2">
                        <Check className="w-4 h-4" />
                        Buyer: <span className="font-black underline">{ruleBuyer}</span> ({is5000 ? 'Rule: 5000 Series -> C2' : 'Rule: Default -> badger'})
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              {/* Quick Preset Buttons for testing */}
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-text3 font-mono">
                <span className="font-bold uppercase">Quick Examples:</span>
                {['5520', '1277', '2345', '2568', '5100'].map(sample => (
                  <button 
                    key={sample} 
                    onClick={() => setTestStyleInput(sample)}
                    className="bg-bg border border-bg4 px-2 py-1 rounded hover:bg-bg4 hover:text-text font-bold transition-colors"
                  >
                    Style #{sample}
                  </button>
                ))}
              </div>
            </div>

            {/* Rule Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="bg-bg3 border border-bg4 p-3 rounded-xl">
                <p className="text-[10px] font-mono font-bold text-po uppercase">Rule 1: 5000 Series</p>
                <p className="text-xs font-bold text-text mt-0.5">Style 5000–5999 (e.g. 5520, 5100) → <span className="text-pass">C2</span></p>
              </div>
              <div className="bg-bg3 border border-bg4 p-3 rounded-xl">
                <p className="text-[10px] font-mono font-bold text-po uppercase">Rule 2: Default Series</p>
                <p className="text-xs font-bold text-text mt-0.5">All Other Styles (e.g. 1277, 2345) → <span className="text-pass">badger</span></p>
              </div>
              <div className="bg-bg3 border border-bg4 p-3 rounded-xl">
                <p className="text-[10px] font-mono font-bold text-po uppercase">Rule 3: Explicit PO Buyer</p>
                <p className="text-xs font-bold text-text mt-0.5">Explicit PO Buyer (e.g. PUD, KULL) → <span className="text-pass">Overrides Rule</span></p>
              </div>
            </div>
          </div>

          {/* Table of mapped styles */}
          <div className="bg-bg2 border border-bg4 rounded-2xl p-6 card-shadow space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h4 className="text-sm font-black uppercase tracking-wider text-text">
                Existing Styles Map ({filteredStyleMap.length} styles detected)
              </h4>
              <div className="flex items-center gap-2 bg-bg3/60 px-3 py-1.5 rounded-xl border border-bg4 w-64">
                <Search className="w-4 h-4 text-text3" />
                <input 
                  type="text" 
                  placeholder="Filter styles or buyers..."
                  value={debugSearchTerm}
                  onChange={e => setDebugSearchTerm(e.target.value)}
                  className="bg-transparent border-none text-xs font-bold outline-none w-full text-text"
                />
              </div>
            </div>

            <div className="overflow-x-auto border border-bg4 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead className="bg-bg3/80 text-[10px] font-mono uppercase text-text3">
                  <tr>
                    <th className="p-3">Style #</th>
                    <th className="p-3">Assigned Buyer</th>
                    <th className="p-3">Mapping Logic Source</th>
                    <th className="p-3">Associated PO(s)</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg4 text-xs">
                  {filteredStyleMap.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-text3 font-mono">
                        No styles found matching "{debugSearchTerm}"
                      </td>
                    </tr>
                  ) : (
                    filteredStyleMap.map(item => (
                      <tr key={item.style} className="hover:bg-bg3/40 transition-colors">
                        <td className="p-3 font-black text-text font-mono text-sm">
                          {item.style}
                        </td>
                        <td className="p-3">
                          <span className="whitespace-nowrap inline-flex max-w-max items-center font-black uppercase text-xs px-2.5 py-1 rounded-lg border border-po/20 bg-po/10 text-po shadow-xs">
                            {item.buyer}
                          </span>
                        </td>
                        <td className="p-3">
                          {item.sourceType === 'explicit' ? (
                            <span className="text-pass font-bold flex items-center gap-1 text-[11px]">
                              <Check className="w-3.5 h-3.5" /> Explicit PO Override
                            </span>
                          ) : (
                            <span className="text-text3 font-medium text-[11px]">
                              {determineBuyerFromStyle(item.style) === 'C2' ? 'Rule: 5000 Series (C2)' : 'Rule: Default (badger)'}
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-mono text-text2">
                          {item.poNumbers.join(', ')}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isAdminOrSupervisor && (
                              <button 
                                onClick={() => {
                                  setCorrectingStyleItem(item);
                                  setTargetBuyerInput(item.buyer);
                                }}
                                className="bg-po/10 hover:bg-po/20 text-po border border-po/30 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all shadow-xs"
                              >
                                <Edit className="w-3 h-3" />
                                Correct Buyer
                              </button>
                            )}
                            <button 
                              onClick={() => {
                                setTestStyleInput(item.style);
                              }}
                              className="bg-bg3 hover:bg-bg4 border border-bg4 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase text-text3 hover:text-text transition-colors"
                            >
                              Test
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}

      {/* Admin Correct Buyer Mapping Modal */}
      <AnimatePresence>
        {correctingStyleItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-bg2 border border-bg4 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-bg4 pb-3">
                <div className="flex items-center gap-2 text-po">
                  <Settings2 className="w-5 h-5" />
                  <h3 className="text-base font-black text-text uppercase tracking-wider">
                    Correct Buyer Mapping
                  </h3>
                </div>
                <button 
                  onClick={() => setCorrectingStyleItem(null)}
                  className="p-1 rounded-lg hover:bg-bg3 text-text3 hover:text-text transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-bg3/60 border border-bg4 p-3.5 rounded-xl space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-text3 font-medium">Style Number:</span>
                    <span className="font-mono font-black text-text text-sm">{correctingStyleItem.style}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text3 font-medium">Current Buyer:</span>
                    <span className="font-mono font-bold text-po uppercase">{correctingStyleItem.buyer}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text3 font-medium">Associated PO(s):</span>
                    <span className="font-mono text-text2 text-[11px] truncate max-w-[200px]">{correctingStyleItem.poNumbers.join(', ')}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-text block">
                    Select Correct Buyer:
                  </label>
                  
                  {/* Preset quick buttons */}
                  <div className="flex flex-wrap gap-2">
                    {['badger', 'C2', 'PUD', 'KULL', 'GLOBAL'].map(b => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setTargetBuyerInput(b)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all border",
                          targetBuyerInput.toLowerCase() === b.toLowerCase()
                            ? "bg-po text-white border-po shadow-sm"
                            : "bg-bg3 text-text3 border-bg4 hover:text-text hover:bg-bg4"
                        )}
                      >
                        {b}
                      </button>
                    ))}
                  </div>

                  <div className="pt-2">
                    <label className="text-[10px] font-mono text-text3 uppercase font-bold block mb-1">
                      Or type custom buyer name:
                    </label>
                    <input 
                      type="text"
                      value={targetBuyerInput}
                      onChange={e => setTargetBuyerInput(e.target.value)}
                      placeholder="e.g. BADGER, C2, PUD..."
                      className="w-full bg-bg border border-bg4 rounded-xl px-3 py-2 text-xs font-bold text-text focus:outline-none focus:border-po"
                    />
                  </div>
                </div>

                <p className="text-[11px] text-text3 italic">
                  Note: Saving this correction will update the Buyer field in the database for Style #{correctingStyleItem.style} across all associated POs ({correctingStyleItem.poNumbers.join(', ')}).
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-bg4 pt-4">
                <button
                  type="button"
                  onClick={() => setCorrectingStyleItem(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-text3 hover:text-text bg-bg3 hover:bg-bg4 border border-bg4 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingBuyerCorrection || !targetBuyerInput.trim()}
                  onClick={handleApplyBuyerCorrection}
                  className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-white bg-po hover:bg-po/90 disabled:opacity-50 transition-all shadow-md flex items-center gap-2"
                >
                  {isSavingBuyerCorrection ? 'Saving...' : 'Save Correction'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedPO && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-bg2 border border-bg4 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-bg4 flex items-center justify-between bg-bg3/30">
                <div>
                  <h3 className="text-xl font-bold text-po">{selectedPO.po_number}</h3>
                  <p className="text-xs font-mono text-text3 uppercase tracking-widest">Detail View • {selectedPO.buyer}</p>
                </div>
                <button onClick={() => setSelectedPO(null)} className="p-2 hover:bg-bg4 rounded-lg transition-colors"><X className="w-6 h-6" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                <div className="grid grid-cols-4 gap-8">
                  <div><p className="text-[10px] font-mono text-text3 uppercase mb-1">Season</p><p className="font-bold">{selectedPO.season || '-'}</p></div>
                  <div><p className="text-[10px] font-mono text-text3 uppercase mb-1">Floor</p><p className="font-bold">{selectedPO.floor || '-'}</p></div>
                  <div><p className="text-[10px] font-mono text-text3 uppercase mb-1">Delivery</p><p className="font-bold">{selectedPO.delivery_date || '-'}</p></div>
                  <div><p className="text-[10px] font-mono text-text3 uppercase mb-1">Priority</p><p className="font-bold text-po">{selectedPO.priority}</p></div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-widest text-text3">Product Breakdown</h4>
                  <div className="border border-bg4 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-bg3/50">
                        <tr className="border-b border-bg4">
                          <th className="p-3 text-xs font-mono text-text uppercase font-black">Line</th>
                          <th className="p-3 text-xs font-mono text-text uppercase font-black">Style #</th>
                          <th className="p-3 text-xs font-mono text-text uppercase font-black">Description</th>
                          <th className="p-3 text-xs font-mono text-text uppercase font-black">Fabric / GSM</th>
                          <th className="p-3 text-xs font-mono text-text uppercase font-black">Color</th>
                          <th className="p-3 text-xs font-mono text-text uppercase font-black">Size</th>
                          <th className="p-3 text-xs font-mono text-text uppercase text-center font-black">Due Date</th>
                          <th className="p-3 text-xs font-mono text-text uppercase text-center font-black">Priority</th>
                          <th className="p-3 text-xs font-mono text-text uppercase text-right font-black">Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-bg4">
                        {selectedPO.products.map((p: any) => (
                          <tr key={p.id} className="hover:bg-bg3/20 transition-colors">
                            <td className="p-3 text-sm font-mono">{p.line_num || '-'}</td>
                            <td className="p-3 text-sm font-bold">{p.style_num}</td>
                            <td className="p-3 text-xs text-text3 leading-tight max-w-[200px]">{p.description || '-'}</td>
                            <td className="p-3 text-xs">
                              <p className="font-bold text-text2">{p.fabric_type || '-'}</p>
                              <p className="text-[10px] text-text3">{p.gsm ? `GSM: ${p.gsm}` : ''}</p>
                            </td>
                            <td className="p-3 text-sm text-text2">{p.color}</td>
                            <td className="p-3 text-sm text-text2">{p.size}</td>
                            <td className="p-3 text-sm font-mono text-center text-text2">{p.delivery_date || selectedPO.delivery_date || '-'}</td>
                            <td className="p-3 text-center">
                              <select 
                                value={p.priority || 'Normal'}
                                onChange={async (e) => {
                                  const newPriority = e.target.value;
                                  try {
                                    await poService.updateProductPriority(p.id, newPriority);
                                    
                                    // Local update for immediate feedback in the modal
                                    setSelectedPO((prev: any) => {
                                      if (!prev) return null;
                                      return {
                                        ...prev,
                                        products: prev.products.map((prod: any) => 
                                          prod.id === p.id ? { ...prod, priority: newPriority as any } : prod
                                        )
                                      };
                                    });
                                  } catch (error: any) {
                                    console.error('Failed to update product priority', error);
                                    alert(`Failed to update priority: ${error.message || 'Unauthorized or server error'}`);
                                  }
                                }}
                                className={cn(
                                  "px-1.5 py-0.5 rounded text-[8px] font-black uppercase border-none outline-none cursor-pointer",
                                  p.priority === 'Urgent' ? "bg-reject/10 text-reject" : 
                                  p.priority === 'Low' ? "bg-bg4 text-text3" : "bg-po/10 text-po"
                                )}
                              >
                                <option value="Normal">Normal</option>
                                <option value="Urgent">Urgent</option>
                                <option value="Low">Low</option>
                              </select>
                            </td>
                            <td className="p-3 text-sm font-bold text-right">{(p.qty || 0).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Multiple Selected POs Detail Modal */}
      <AnimatePresence>
        {multipleSelectedPOsDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-bg2 border border-bg4 rounded-2xl w-full max-w-7xl h-[85vh] overflow-hidden flex flex-col shadow-2xl"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-bg4 flex items-center justify-between bg-bg3/30">
                <div>
                  <h3 className="text-xl font-bold text-po flex items-center gap-2">
                    <Layers className="w-5 h-5 text-po" />
                    Multi-PO View ({multipleSelectedPOsDetails.length} POs)
                  </h3>
                  <p className="text-xs font-mono text-text3 uppercase tracking-widest">
                    Viewing Selected Orders Together • Combined Production Quantities
                  </p>
                </div>
                <button 
                  onClick={() => setMultipleSelectedPOsDetails(null)} 
                  className="p-2 hover:bg-bg4 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Tabs selector */}
              <div className="flex border-b border-bg4 bg-bg3/10 px-6 py-2 gap-2">
                <button 
                  onClick={() => setActiveMultiPOViewTab('combined')}
                  className={cn(
                    "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all",
                    activeMultiPOViewTab === 'combined' 
                      ? "bg-po text-white shadow-sm" 
                      : "text-text3 hover:text-text hover:bg-bg4/40"
                  )}
                >
                  Consolidated Summary
                </button>
                <button 
                  onClick={() => setActiveMultiPOViewTab('individual')}
                  className={cn(
                    "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all",
                    activeMultiPOViewTab === 'individual' 
                      ? "bg-po text-white shadow-sm" 
                      : "text-text3 hover:text-text hover:bg-bg4/40"
                  )}
                >
                  Individual Breakdowns
                </button>
              </div>

              {/* Main Content Pane */}
              <div className="flex-1 overflow-hidden flex">
                {activeMultiPOViewTab === 'combined' ? (
                  /* CONSOLIDATED / COMBINED VIEW */
                  <div className="flex-1 overflow-y-auto p-8 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-bg3/30 border border-bg4 p-5 rounded-xl">
                        <p className="text-[10px] font-mono text-text3 uppercase mb-1 font-bold">Total Orders Selected</p>
                        <p className="text-xl font-black">{multipleSelectedPOsDetails.length}</p>
                        <p className="text-xs text-text3 mt-1 truncate">{multipleSelectedPOsDetails.map(p => p.po_number).join(', ')}</p>
                      </div>
                      <div className="bg-bg3/30 border border-bg4 p-5 rounded-xl">
                        <p className="text-[10px] font-mono text-text3 uppercase mb-1 font-bold">Combined Total Quantity</p>
                        <p className="text-xl font-black text-po">
                          {multipleSelectedPOsDetails.reduce((sum, po) => sum + (po.products?.reduce((acc: number, pr: any) => acc + (pr.qty || 0), 0) || 0), 0).toLocaleString()} pcs
                        </p>
                        <p className="text-xs text-text3 mt-1 font-serif italic">Sum of nested style components</p>
                      </div>
                      <div className="bg-bg3/30 border border-bg4 p-5 rounded-xl">
                        <p className="text-[10px] font-mono text-text3 uppercase mb-1 font-bold">Unique Styles</p>
                        <p className="text-xl font-black text-pass">
                          {new Set(multipleSelectedPOsDetails.flatMap(p => (p.products || []).map((prod: any) => prod.style_num))).size} styles
                        </p>
                        <p className="text-xs text-text3 mt-1">Across all selected items</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h4 className="text-sm font-bold uppercase tracking-widest text-text2">Merged Product Breakdown</h4>
                        <p className="text-xs text-text3 mt-1">Identical style number, color, and size lines are dynamically aggregated to show single consolidated totals across multiple PO sources.</p>
                      </div>
                      <div className="border border-bg4 rounded-xl overflow-hidden max-h-[45vh] overflow-y-auto shadow-inner">
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-bg3/50 sticky top-0 z-10 backdrop-blur-sm">
                            <tr className="border-b border-bg4">
                              <th className="p-3 text-xs font-mono text-text uppercase font-black">Style #</th>
                              <th className="p-3 text-xs font-mono text-text uppercase font-black">Description</th>
                              <th className="p-3 text-xs font-mono text-text uppercase font-black">Fabric / GSM</th>
                              <th className="p-3 text-xs font-mono text-text uppercase font-black">Color</th>
                              <th className="p-3 text-xs font-mono text-text uppercase font-black">Size</th>
                              <th className="p-3 text-xs font-mono text-text uppercase font-black">Source PO(s)</th>
                              <th className="p-3 text-xs font-mono text-text uppercase text-right font-black">Total Qty</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-bg4 bg-bg2">
                            {consolidatedProducts.map((p: any, idx: number) => (
                              <tr key={idx} className="hover:bg-bg3/20 transition-colors">
                                <td className="p-3 text-sm font-bold text-po">{p.style_num}</td>
                                <td className="p-3 text-xs text-text3 leading-tight max-w-[200px]">{p.description || '-'}</td>
                                <td className="p-3 text-xs">
                                  <p className="font-bold text-text2">{p.fabric_type || '-'}</p>
                                  <p className="text-[10px] text-text3">{p.gsm ? `GSM: ${p.gsm}` : ''}</p>
                                </td>
                                <td className="p-3 text-sm text-text2">{p.color}</td>
                                <td className="p-3 text-sm text-text2">{p.size}</td>
                                <td className="p-3 text-xs font-mono text-po-light font-medium max-w-[250px] truncate" title={p.po_sources}>{p.po_sources}</td>
                                <td className="p-3 text-sm font-bold text-right text-text">{(p.qty || 0).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* INDIVIDUAL TABS SIDEBAR VIEW */
                  <div className="flex-1 flex overflow-hidden">
                    {/* Left list of POs */}
                    <div className="w-1/4 border-r border-bg4 bg-bg3/10 overflow-y-auto p-4 space-y-2">
                      <p className="text-[10px] font-mono text-text3 uppercase font-bold px-2 mb-2">Select Production Order</p>
                      {multipleSelectedPOsDetails.map((po, idx) => (
                        <button
                          key={`${po.po_number}-${po.buyer || idx}`}
                          onClick={() => setActiveIndividualPoView(po.po_number)}
                          className={cn(
                            "w-full text-left p-4 rounded-xl border transition-all flex flex-col gap-1",
                            activeIndividualPoView === po.po_number
                              ? "bg-bg2 border-po shadow-md"
                              : "border-transparent hover:bg-bg4/40"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-text">{po.po_number}</span>
                            <span className={cn(
                              "text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider",
                              po.priority === 'Urgent' ? "bg-reject/10 text-reject animate-pulse" : "bg-po/10 text-po"
                            )}>
                              {po.priority}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-text3">
                            <span className="truncate max-w-[100px]">{po.buyer || 'No Buyer'}</span>
                            <span className="font-medium">{po.products?.reduce((acc: number, pr: any) => acc + (pr.qty || 0), 0)?.toLocaleString()} pcs</span>
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Right detail area */}
                    <div className="flex-1 overflow-y-auto p-8">
                      {(() => {
                        const activePo = multipleSelectedPOsDetails.find(p => p.po_number === activeIndividualPoView);
                        if (!activePo) {
                          return (
                            <div className="h-full flex flex-col items-center justify-center text-text3">
                              <AlertTriangle className="w-12 h-12 mb-2 opacity-50 text-text3" />
                              <p className="font-medium text-xs font-mono uppercase">No Individual Order Active</p>
                            </div>
                          );
                        }
                        return (
                          <div className="space-y-6">
                            <div className="border-b border-bg4 pb-4 flex justify-between items-start">
                              <div>
                                <h3 className="text-xl font-bold text-po">{activePo.po_number}</h3>
                                <p className="text-xs font-mono text-text3 uppercase tracking-widest">Buyer: {activePo.buyer}</p>
                              </div>
                              <div className="text-right">
                                <span className={cn(
                                  "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border",
                                  activePo.status === 'Active' ? "bg-pass/10 text-pass border-pass/20" : "bg-bg4 text-text3 border-bg4"
                                )}>
                                  {activePo.status || 'Active'}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-4 gap-6 bg-bg3/20 p-4 rounded-xl border border-bg4">
                              <div><p className="text-[10px] font-mono text-text3 uppercase mb-1">Season</p><p className="font-bold text-sm">{activePo.season || '-'}</p></div>
                              <div><p className="text-[10px] font-mono text-text3 uppercase mb-1">Floor</p><p className="font-bold text-sm">{activePo.floor || '-'}</p></div>
                              <div><p className="text-[10px] font-mono text-text3 uppercase mb-1">Delivery Date</p><p className="font-bold text-sm">{activePo.delivery_date || '-'}</p></div>
                              <div><p className="text-[10px] font-mono text-text3 uppercase mb-1">Remarks</p><p className="font-bold text-xs truncate" title={activePo.remarks}>{activePo.remarks || '-'}</p></div>
                            </div>

                            <div className="space-y-4">
                              <h4 className="text-xs font-mono uppercase tracking-widest text-text3 font-extrabold">Product Breakdown</h4>
                              <div className="border border-bg4 rounded-xl overflow-hidden">
                                <table className="w-full text-left border-collapse">
                                  <thead className="bg-bg3/50">
                                    <tr className="border-b border-bg4">
                                      <th className="p-3 text-xs font-mono text-text uppercase font-black">Line</th>
                                      <th className="p-3 text-xs font-mono text-text uppercase font-black">Style #</th>
                                      <th className="p-3 text-xs font-mono text-text uppercase font-black">Description</th>
                                      <th className="p-3 text-xs font-mono text-text uppercase font-black">Fabric / GSM</th>
                                      <th className="p-3 text-xs font-mono text-text uppercase font-black">Color</th>
                                      <th className="p-3 text-xs font-mono text-text uppercase font-black">Size</th>
                                      <th className="p-3 text-xs font-mono text-text uppercase text-right font-black">Qty</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-bg4 bg-bg2">
                                    {(activePo.products || []).map((p: any) => (
                                      <tr key={p.id} className="hover:bg-bg3/20 transition-colors">
                                        <td className="p-3 text-sm font-mono">{p.line_num || '-'}</td>
                                        <td className="p-3 text-sm font-bold">{p.style_num}</td>
                                        <td className="p-3 text-xs text-text3 leading-tight max-w-[200px]">{p.description || '-'}</td>
                                        <td className="p-3 text-xs">
                                          <p className="font-bold text-text2">{p.fabric_type || '-'}</p>
                                          <p className="text-[10px] text-text3">{p.gsm ? `GSM: ${p.gsm}` : ''}</p>
                                        </td>
                                        <td className="p-3 text-sm text-text2">{p.color}</td>
                                        <td className="p-3 text-sm text-text2">{p.size}</td>
                                        <td className="p-3 text-sm font-bold text-right text-text">{(p.qty || 0).toLocaleString()}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {poListToDelete && poListToDelete.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-bg2 border border-bg4 rounded-2xl w-full max-w-md overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-bg4 text-center">
                <div className="w-16 h-16 bg-reject/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-8 h-8 text-reject" />
                </div>
                <h3 className="text-xl font-bold text-text mb-2">Delete {poListToDelete.length > 1 ? `${poListToDelete.length} POs?` : 'PO?'}</h3>
                <p className="text-sm text-text3 leading-relaxed">
                  {poListToDelete.length > 1 ? (
                    <span>Are you sure you want to delete these POs: <span className="font-bold text-text">{poListToDelete.join(', ')}</span>?</span>
                  ) : (
                    <span>Are you sure you want to delete <span className="font-bold text-text">{poListToDelete[0]}</span>?</span>
                  )}
                  This action will permanently remove all associated records and cannot be undone.
                </p>
              </div>
              <div className="p-4 bg-bg3/50 flex gap-3">
                <button 
                  onClick={() => setPoListToDelete(null)}
                  className="flex-1 py-3 px-4 rounded-xl border border-bg4 text-xs font-black uppercase tracking-widest hover:bg-bg4 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDelete}
                  className="flex-1 py-3 px-4 rounded-xl bg-reject text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-reject/20 hover:bg-red-600 transition-all"
                >
                  Confirm Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
