import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { poService, fabricService, statusService, colorService, api } from '../services/erpService';
import { ProductionOrder, FabricRecord, FabricRecordPayload, POProduct, StyleConsumptionRate, FabricRequirementStockReportItem } from '../types';
import { Droplets, Send, RotateCcw, History, Calculator, Search, Plus, Handshake, PlusCircle, Trash2, Activity, Sliders, Sparkles, Layers, FileSpreadsheet, Upload, Download, FileText, Check, X, AlertTriangle } from 'lucide-react';
import { cn, fmtDate } from '../lib/utils';
import { useSystem } from '../context/SystemContext';
import { useAuth } from '../context/AuthContext';
import { HandoverList } from '../components/HandoverList';
import { FabricRequirementStockReportTable } from '../components/FabricRequirementStockReportTable';

// Fabric Name Normalizer to prevent grouping issues
const normalizeFabric = (name: string) => {
  if (!name) return 'STANDARD';
  let n = name.trim().toUpperCase();
  // Common variations
  if (n === 'S.JERSEY') return 'SINGLE JERSEY';
  if (n === 'S/JERSEY') return 'SINGLE JERSEY';
  if (n === 'JERSEY') return 'SINGLE JERSEY';
  if (n === 'F/TERRY') return 'FRENCH TERRY';
  if (n === 'F.TERRY') return 'FRENCH TERRY';
  return n;
};

export const FabricPage: React.FC = () => {
  const { workingDate } = useSystem();
  const { user } = useAuth();
  const [pos, setPos] = useState<ProductionOrder[]>([]);
  const [history, setHistory] = useState<FabricRecord[]>([]);
  const [colors, setColors] = useState<{ id: number; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bypassFabricCheck, setBypassFabricCheck] = useState(false);
  
  // Forms
  const [selectedPO, setSelectedPO] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('');
  const [selectedFabric, setSelectedFabric] = useState('');
  const [gsmValue, setGsmValue] = useState('');
  const [batchId, setBatchId] = useState('');
  const [inhouseQty, setInhouseQty] = useState('');
  const [issueQty, setIssueQty] = useState('');
  const [returnQty, setReturnQty] = useState('');
  const [consumptionQty, setConsumptionQty] = useState('');
  const [poProducts, setPoProducts] = useState<POProduct[]>([]);
  
  // Cutting Program State
  const [cuttingPrograms, setCuttingPrograms] = useState<any[]>([]);
  const [allCuttingPrograms, setAllCuttingPrograms] = useState<any[]>([]);
  const [plannedQuantities, setPlannedQuantities] = useState<Record<number, string>>({});
  const [extraPct, setExtraPct] = useState<number>(3);
  const [fabricIssues, setFabricIssues] = useState<Array<{
    fabric: string;
    gsm: string;
    availWeight: number;
    issueWeight: string;
    targetColor: string;
  }>>([{ fabric: '', gsm: '', availWeight: 0, issueWeight: '', targetColor: '' }]);
  
  // Rejection Shortfalls State
  const [shortfalls, setShortfalls] = useState<any[]>([]);
  const [colorsByStyle, setColorsByStyle] = useState<string[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);

  // Color picker state for Fabric Issue form
  const [addedColors, setAddedColors] = useState<string[]>([]);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [choosingIndex, setChoosingIndex] = useState<number | null>(null);
  const [colorSearchQuery, setColorSearchQuery] = useState('');
  
  // Efficiency Analysis
  const [dailyCutPcs, setDailyCutPcs] = useState(0);

  const [activeTab, setActiveTab] = useState<'entry' | 'reports' | 'types' | 'rules' | 'consumption' | 'stock-report'>('stock-report');

  const handleFillInhouseFromReport = useCallback((item: FabricRequirementStockReportItem) => {
    setActiveTab('entry');
    if (item.style) setSelectedStyle(item.style);
    if (item.color) setSelectedColor(item.color);
    if (item.fabric_type) setSelectedFabric(item.fabric_type);
    if (item.buyer) setInhouseBuyer(item.buyer);
    if (item.gsm_number) setGsmValue(item.gsm_number.toString());
    if (item.net_needed_kg > 0) setInhouseQty(item.net_needed_kg.toString());
    
    setTimeout(() => {
      const el = document.getElementById('fabric-inhouse-form');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  const [fabricTypes, setFabricTypes] = useState<{ id: number; name: string }[]>([]);
  const [newFabricName, setNewFabricName] = useState('');
  const [editingFabricId, setEditingFabricId] = useState<number | null>(null);
  const [editingFabricName, setEditingFabricName] = useState('');

  // GSM Rules State
  const [gsmRules, setGsmRules] = useState<{ id: number; buyer: string; fabric_type: string; gsm: number }[]>([]);
  const [newRuleBuyer, setNewRuleBuyer] = useState('');
  const [newRuleFabric, setNewRuleFabric] = useState('');
  const [newRuleGsm, setNewRuleGsm] = useState('');
  const [inhouseBuyer, setInhouseBuyer] = useState('');

  // Consumption Rates State
  const [consumptionRates, setConsumptionRates] = useState<StyleConsumptionRate[]>([]);
  const [newRateStyle, setNewRateStyle] = useState('');
  const [newRateFabric, setNewRateFabric] = useState('');
  const [newRateGreige, setNewRateGreige] = useState('');
  const [newRateLossPct, setNewRateLossPct] = useState('13');
  const [newRateExpected, setNewRateExpected] = useState('');
  const [consumptionSearch, setConsumptionSearch] = useState('');

  // Bulk Excel Consumption Upload State
  const [bulkExcelModalOpen, setBulkExcelModalOpen] = useState(false);
  const [bulkParsedRates, setBulkParsedRates] = useState<Array<{
    style_num: string;
    fabric_type: string;
    greige_consumption: number;
    process_loss_pct: number;
    expected_consumption: number;
    status: 'OK' | 'NEW_FABRIC';
  }>>([]);
  const [globalLossPct, setGlobalLossPct] = useState<number>(13);

  // Multi-Select & Batch Loss % State
  const [selectedRateIds, setSelectedRateIds] = useState<number[]>([]);
  const [batchLossPctInput, setBatchLossPctInput] = useState<string>('13');
  const [isUpdatingLossPct, setIsUpdatingLossPct] = useState<boolean>(false);

  // Requirement Summary State
  const [requirementSummary, setRequirementSummary] = useState<any>(null);
  const [targetCutQty, setTargetCutQty] = useState<number>(0);
  const [isSummaryLoading, setIsSummaryLoading] = useState<boolean>(false);

  useEffect(() => {
    fetchInitialData();
  }, [workingDate]);

  useEffect(() => {
    const fetchRequirement = async () => {
      if (!selectedStyle) {
        setRequirementSummary(null);
        setTargetCutQty(0);
        return;
      }
      setIsSummaryLoading(true);
      try {
        const summary = await fabricService.getStyleRequirementSummary(selectedStyle, selectedPO, selectedColor, extraPct);
        setRequirementSummary(summary);
        setTargetCutQty(summary.total_remaining_cut_qty);
      } catch (err) {
        console.error('Failed to load requirement summary:', err);
        setRequirementSummary(null);
      } finally {
        setIsSummaryLoading(false);
      }
    };
    fetchRequirement();
  }, [selectedStyle, selectedPO, selectedColor, extraPct, history, consumptionRates]);

  const fetchRules = async () => {
    try {
      const list = await fabricService.getRules();
      setGsmRules(list || []);
    } catch (e) {
      console.error('Failed to load rules:', e);
    }
  };

  const fetchConsumptionRates = async () => {
    try {
      const list = await fabricService.getConsumptionRates();
      setConsumptionRates(list || []);
    } catch (e) {
      console.error('Failed to load consumption rates:', e);
    }
  };

  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
      const [orderList, recordList, dailyStatus, colorList, allPrograms, typeList, shortfallList, rulesList, ratesList] = await Promise.all([
        poService.list(),
        fabricService.list(),
        statusService.getSummary(workingDate || undefined),
        colorService.list(),
        api.get<any[]>('/cutting-programs/all').catch(() => []),
        fabricService.getTypes().catch(() => []),
        api.get<any[]>('/cutting-programs/shortfalls').catch(() => []),
        fabricService.getRules().catch(() => []),
        fabricService.getConsumptionRates().catch(() => [])
      ]);
      setPos(orderList.filter(po => po.status === 'Active'));
      setHistory(recordList);
      setDailyCutPcs(dailyStatus.total_cut);
      setColors(colorList);
      // We also need a state for all cutting programs if we want to use them in reports
      setAllCuttingPrograms(allPrograms || []);
      setFabricTypes(typeList || []);
      setShortfalls(shortfallList || []);
      setGsmRules(rulesList || []);
      setConsumptionRates(ratesList || []);
    } catch (error) {
      console.error('Failed to fetch fabric data', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlanReworkShortfall = async (shortfall: any) => {
    try {
      setIsLoading(true);
      // 1. Select PO
      setSelectedPO(shortfall.po_number);
      setSelectedStyle(shortfall.style_num);
      setSelectedColor(shortfall.color);
      
      // 2. Load PO products
      const fullPO = await poService.get(shortfall.po_number);
      setPoProducts(fullPO.products || []);
      
      // 3. Load cutting programs for this PO
      const response = await fetch(`/api/po-products-for-cutting/${shortfall.po_number}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('erp_token')}` }
      });
      const data = await response.json();
      setCuttingPrograms(data);
      
      // Initialize fabric issues based on the style to guide fabric issuance
      const styleColors = (fullPO.products || [])
        .filter((p: any) => p.style_num === shortfall.style_num)
        .map((p: any) => p.color)
        .filter(Boolean);
      
      const tokens = new Set<string>();
      styleColors.forEach((c: string) => {
        c.split('/').forEach((t: string) => tokens.add(t.trim().toUpperCase()));
      });
      setFabricIssues(Array.from(tokens).sort().map(t => ({
        fabric: '',
        gsm: '',
        availWeight: 0,
        issueWeight: '',
        targetColor: t
      })));
      
      // 4. Prepopulate planned quantity for this product
      setPlannedQuantities({
        [shortfall.id]: shortfall.shortfall.toString()
      });
      
      // Scroll to the Cutting Program Planning section
      setTimeout(() => {
        const el = document.getElementById('cutting-program-section');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }, 150);
    } catch (error) {
      console.error('Failed to quick-plan shortfall', error);
      alert('Failed to load PO details for quick-planning.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadExcelSample = () => {
    const sampleData = [
      { "Style #": "5500", "Fleece": "0.862", "1x1 Rib": "0.258", "S.Jersey": "", "2x1 Rib": "", "Loss %": "13%" },
      { "Style #": "5501", "Fleece": "0.820", "1x1 Rib": "0.230", "S.Jersey": "0.180", "2x1 Rib": "", "Loss %": "13%" },
      { "Style #": "1215", "Fleece": "", "1x1 Rib": "0.120", "S.Jersey": "0.310", "2x1 Rib": "0.080", "Loss %": "10%" }
    ];
    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Consumption Rates");
    XLSX.writeFile(workbook, "style_consumption_rates_template.xlsx");
  };

  const handleExcelFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const data: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (!data || data.length < 2) {
          alert('The uploaded file appears to be empty or missing header row.');
          return;
        }

        const headers: string[] = data[0].map((h: any) => String(h || '').trim());
        const styleIdx = headers.findIndex(h => /style/i.test(h));
        const lossIdx = headers.findIndex(h => /loss|shrinkage/i.test(h));

        if (styleIdx === -1) {
          alert('Could not locate a "Style #" column in the Excel file.');
          return;
        }

        const knownFabricNames = fabricTypes.map(f => f.name.toUpperCase());
        const parsed: any[] = [];

        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (!row || row[styleIdx] === undefined || row[styleIdx] === null) continue;
          const styleNum = String(row[styleIdx]).trim().toUpperCase();
          if (!styleNum) continue;

          let rowLossPct = globalLossPct;
          if (lossIdx !== -1 && row[lossIdx] !== undefined && row[lossIdx] !== '') {
            const rawLoss = String(row[lossIdx]).replace('%', '').trim();
            if (!isNaN(parseFloat(rawLoss))) {
              rowLossPct = parseFloat(rawLoss);
            }
          }

          headers.forEach((h, colIdx) => {
            if (colIdx === styleIdx || colIdx === lossIdx) return;
            const valStr = String(row[colIdx] || '').trim();
            if (!valStr || isNaN(parseFloat(valStr))) return;

            const rawGreigeRate = parseFloat(valStr);
            if (rawGreigeRate <= 0) return;

            const fabricName = h.trim().toUpperCase();
            const readyToCutRate = parseFloat((rawGreigeRate * (1 - rowLossPct / 100)).toFixed(4));

            parsed.push({
              style_num: styleNum,
              fabric_type: fabricName,
              greige_consumption: rawGreigeRate,
              process_loss_pct: rowLossPct,
              expected_consumption: readyToCutRate,
              status: knownFabricNames.includes(fabricName) ? 'OK' : 'NEW_FABRIC'
            });
          });
        }

        if (parsed.length === 0) {
          alert('No valid fabric consumption rate entries were found in the file.');
          return;
        }

        setBulkParsedRates(parsed);
        setBulkExcelModalOpen(true);
      } catch (err: any) {
        console.error('Excel parse error', err);
        alert('Failed to parse Excel file: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleApplyGlobalLossToBulkModal = (pct: number) => {
    setGlobalLossPct(pct);
    setBulkParsedRates(prev => prev.map(r => ({
      ...r,
      process_loss_pct: pct,
      expected_consumption: parseFloat((r.greige_consumption * (1 - pct / 100)).toFixed(4))
    })));
  };

  const handleConfirmBulkSave = async () => {
    if (bulkParsedRates.length === 0) return;
    try {
      setIsSubmitting(true);
      await fabricService.createConsumptionRateBulk(bulkParsedRates);
      setBulkExcelModalOpen(false);
      setBulkParsedRates([]);
      await fetchConsumptionRates();
    } catch (err: any) {
      alert(err.message || 'Failed to save bulk consumption rates.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddConsumptionRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRateStyle || !newRateFabric) {
      alert('Please fill out Style # and Fabric Type.');
      return;
    }

    let greigeVal = parseFloat(newRateGreige);
    let lossVal = parseFloat(newRateLossPct) || 0;
    let expectedVal = parseFloat(newRateExpected);

    if (isNaN(greigeVal) || greigeVal <= 0) {
      if (!isNaN(expectedVal) && expectedVal > 0) {
        greigeVal = expectedVal;
      } else {
        alert('Please enter a valid positive Greige Rate or Expected Rate.');
        return;
      }
    }

    try {
      setIsSubmitting(true);
      await fabricService.createConsumptionRate({
        style_num: newRateStyle.trim().toUpperCase(),
        fabric_type: newRateFabric.trim().toUpperCase(),
        greige_consumption: greigeVal,
        process_loss_pct: lossVal,
        expected_consumption: !isNaN(expectedVal) && expectedVal > 0 ? expectedVal : undefined
      });
      setNewRateStyle('');
      setNewRateFabric('');
      setNewRateGreige('');
      setNewRateLossPct('13');
      setNewRateExpected('');
      await fetchConsumptionRates();
    } catch (err: any) {
      alert(err.message || 'Failed to add consumption rate.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConsumptionRate = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this consumption rate?')) return;
    try {
      await fabricService.deleteConsumptionRate(id);
      setSelectedRateIds(prev => prev.filter(i => i !== id));
      await fetchConsumptionRates();
    } catch (err: any) {
      alert(err.message || 'Failed to delete consumption rate.');
    }
  };

  const handleToggleSelectRate = (id: number) => {
    setSelectedRateIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAllRates = (filteredRates: StyleConsumptionRate[]) => {
    const filteredIds = filteredRates.map(r => r.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedRateIds.includes(id));
    if (allSelected) {
      setSelectedRateIds(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      setSelectedRateIds(prev => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const handleSelectByStyle = (styleNum: string) => {
    if (styleNum === 'ALL') {
      setSelectedRateIds(consumptionRates.map(r => r.id));
      return;
    }
    const styleRateIds = consumptionRates
      .filter(r => r.style_num.toUpperCase() === styleNum.toUpperCase())
      .map(r => r.id);
    const allStyleSelected = styleRateIds.length > 0 && styleRateIds.every(id => selectedRateIds.includes(id));
    if (allStyleSelected) {
      setSelectedRateIds(prev => prev.filter(id => !styleRateIds.includes(id)));
    } else {
      setSelectedRateIds(prev => Array.from(new Set([...prev, ...styleRateIds])));
    }
  };

  const handleApplyBatchLossPct = async (overridePct?: number) => {
    const targetPct = overridePct !== undefined ? overridePct : parseFloat(batchLossPctInput);
    if (isNaN(targetPct) || targetPct < 0 || targetPct > 50) {
      alert('Please enter a valid process loss percentage between 0% and 50%.');
      return;
    }

    if (selectedRateIds.length === 0) {
      alert('Please select at least one style consumption rate.');
      return;
    }

    try {
      setIsUpdatingLossPct(true);
      const isAllSelected = selectedRateIds.length === consumptionRates.length;
      await fabricService.updateConsumptionLossPct({
        ids: isAllSelected ? undefined : selectedRateIds,
        process_loss_pct: targetPct
      });
      setSelectedRateIds([]);
      await fetchConsumptionRates();
    } catch (err: any) {
      alert(err.message || 'Failed to update process loss percentage.');
    } finally {
      setIsUpdatingLossPct(false);
    }
  };

  const handleCreateRecord = async (type: 'inhouse' | 'issue' | 'return' | 'consumption') => {
    if (isSubmitting) return;
    
    if (type !== 'inhouse' && (!selectedPO || !selectedColor)) {
      alert('Please fill PO and Color');
      return;
    }

    if (type === 'inhouse' && !selectedColor) {
      alert('Please select a color');
      return;
    }

    if (type !== 'inhouse' && styleSuggestions.length > 0 && !selectedStyle) {
      alert('Please select a Style #');
      return;
    }

    let qty = 0;
    if (type === 'inhouse') qty = parseFloat(inhouseQty);
    else if (type === 'issue') qty = parseFloat(issueQty);
    else if (type === 'return') qty = parseFloat(returnQty);
    else if (type === 'consumption') qty = parseFloat(consumptionQty);

    if (isNaN(qty) || qty <= 0) {
      alert('Please enter a valid quantity');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: FabricRecordPayload = {
        po_number: type === 'inhouse' ? (selectedPO || 'UNIVERSAL') : selectedPO,
        style_num: type === 'inhouse' ? (selectedStyle || 'GENERAL') : (selectedStyle || undefined),
        record_type: type,
        color: selectedColor,
        batch_id: batchId || undefined,
        fabric_name: selectedFabric || undefined,
        gsm: gsmValue ? (parseInt(gsmValue) || 0) : undefined,
        quantity_kg: qty,
        bypass_fabric_check: bypassFabricCheck
      };

      await fabricService.create(payload);
      setInhouseQty('');
      setIssueQty('');
      setReturnQty('');
      setConsumptionQty('');
      setSelectedStyle('');
      setBatchId('');
      setGsmValue('');
      setSelectedFabric('');
      await fetchInitialData();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRecord = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this fabric ledger entry?')) return;
    try {
      await fabricService.delete(id);
      await fetchInitialData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete record');
    }
  };

  const handleUpdatePlannedQty = async (productId: number, qty: string) => {
    // This is now purely local state management until "Send" is clicked
    setPlannedQuantities(prev => ({ ...prev, [productId]: qty }));
  };

  const handleSendProgram = async () => {
    if (!selectedStyle || !selectedColor) return;
    
    const records = (Object.entries(plannedQuantities) as [string, string][])
      .filter(([_, qty]) => parseInt(qty) > 0)
      .map(([id, qty]) => {
        const prodId = parseInt(id);
        const prod = cuttingPrograms.find(p => (p.product_id || p.id) === prodId);
        return {
          product_id: prodId,
          planned_qty: parseInt(qty),
          po_number: prod?.po_number || selectedPO
        };
      });

    if (records.length === 0) {
      alert('Enter at least one planned quantity to send.');
      return;
    }

    // Double production checks for already packed stock (Initial Stock Mode)
    const warningItems: string[] = [];
    records.forEach(rec => {
      const prod = poProducts.find(p => (p.product_id || p.id) === rec.product_id) || 
                   cuttingPrograms.find(p => (p.product_id || p.id) === rec.product_id);
      if (prod) {
        const totalShipped = Number(prod.total_shipped || 0);
        const packed = Math.max(0, (Number(prod.total_accepted_packed_qty || 0) + Number(prod.total_accepted_blister_qty || 0)) - totalShipped);
        if (packed > 0) {
          warningItems.push(`- Style ${prod.style_num} (${prod.color}/${prod.size}): already has ${packed} pcs PACKED (remaining in store).`);
        }
      }
    });

    if (warningItems.length > 0) {
      const confirmMsg = `⚠️ DOUBLE PRODUCTION DETECTED!\n\nThe following items already have finished/packed stock (e.g. from Initial Stock Mode):\n\n${warningItems.join('\n')}\n\nPlanning a cutting program for these items will result in overproduction. Are you sure you want to proceed and issue this cutting program?`;
      if (!window.confirm(confirmMsg)) {
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const token = localStorage.getItem('erp_token') || '';
      await fetch('/api/cutting-programs/bulk', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          po_number: selectedPO || 'STYLE-WISE',
          records
        })
      });
      
      // Refresh data
      let programData: any[] = [];
      if (selectedPO) {
        programData = await fetch(`/api/po-products-for-cutting/${encodeURIComponent(selectedPO)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(res => res.json());
      } else {
        programData = await fetch(`/api/cutting/products-by-style?style_num=${encodeURIComponent(selectedStyle)}&color=${encodeURIComponent(selectedColor)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(res => res.json());
      }
      
      const shortfallList = await api.get<any[]>('/cutting-programs/shortfalls').catch(() => []);
      setCuttingPrograms(programData);
      setShortfalls(shortfallList || []);
      
      // Clear inputs
      setPlannedQuantities({});
      alert('Cutting program sent individually to Cutting Dept.');
    } catch (error) {
      console.error('Failed to send program', error);
      alert('Failed to send cutting program.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearProgram = async () => {
    if (!selectedStyle || !selectedColor) return;

    try {
      setIsSubmitting(true);
      const token = localStorage.getItem('erp_token') || '';
      const response = await fetch('/api/cutting-programs/clear', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          style_num: selectedStyle,
          color: selectedColor,
          po_number: selectedPO || undefined
        })
      });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'Failed to clear program');

      // Refresh data
      let programData: any[] = [];
      if (selectedPO) {
        programData = await fetch(`/api/po-products-for-cutting/${encodeURIComponent(selectedPO)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(res => res.json());
      } else {
        programData = await fetch(`/api/cutting/products-by-style?style_num=${encodeURIComponent(selectedStyle)}&color=${encodeURIComponent(selectedColor)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(res => res.json());
      }
      
      const shortfallList = await api.get<any[]>('/cutting-programs/shortfalls').catch(() => []);
      setCuttingPrograms(programData);
      setShortfalls(shortfallList || []);
      
      // Clear inputs
      setPlannedQuantities({});
      setConfirmClear(false);
      alert('Cutting program cleared successfully.');
    } catch (error: any) {
      console.error('Failed to clear program', error);
      alert(error.message || 'Failed to clear cutting program.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const [newColorName, setNewColorName] = useState('');

  const handleAddColor = async () => {
    if (!newColorName.trim()) return;
    try {
      await colorService.create(newColorName.trim());
      setNewColorName('');
      const list = await colorService.list();
      setColors(list);
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleAddFabricType = async () => {
    if (!newFabricName.trim()) return;
    try {
      await fabricService.createType(newFabricName.trim());
      setNewFabricName('');
      const list = await fabricService.getTypes();
      setFabricTypes(list);
    } catch (error: any) {
      alert(error.message || 'Failed to add fabric type');
    }
  };

  const handleUpdateFabricType = async (id: number) => {
    if (!editingFabricName.trim()) return;
    try {
      await fabricService.updateType(id, editingFabricName.trim());
      setEditingFabricId(null);
      setEditingFabricName('');
      const list = await fabricService.getTypes();
      setFabricTypes(list);
    } catch (error: any) {
      alert(error.message || 'Failed to update fabric type');
    }
  };

  const handleDeleteFabricType = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this fabric type?')) return;
    try {
      await fabricService.deleteType(id);
      const list = await fabricService.getTypes();
      setFabricTypes(list);
    } catch (error: any) {
      alert(error.message || 'Failed to delete fabric type');
    }
  };

  const handleAddRule = async () => {
    if (!newRuleBuyer.trim() || !newRuleFabric.trim() || !newRuleGsm.trim()) {
      alert('Please fill all fields for the rule');
      return;
    }
    try {
      setIsSubmitting(true);
      await fabricService.createRule({
        buyer: newRuleBuyer.trim().toUpperCase(),
        fabric_type: newRuleFabric.trim().toUpperCase(),
        gsm: parseInt(newRuleGsm.trim()) || 0
      });
      setNewRuleBuyer('');
      setNewRuleFabric('');
      setNewRuleGsm('');
      await fetchRules();
      alert('GSM Rule added successfully!');
    } catch (error: any) {
      alert(error.message || 'Failed to add rule');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRule = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this GSM rule?')) return;
    try {
      setIsSubmitting(true);
      await fabricService.deleteRule(id);
      await fetchRules();
    } catch (error: any) {
      alert(error.message || 'Failed to delete rule');
    } finally {
      setIsSubmitting(false);
    }
  };

  const knownBuyers = useMemo(() => {
    const buyers = new Set<string>();
    pos.forEach(po => {
      if (po.buyer) buyers.add(po.buyer.trim().toUpperCase());
    });
    gsmRules.forEach(rule => {
      if (rule.buyer) buyers.add(rule.buyer.trim().toUpperCase());
    });
    return Array.from(buyers).sort();
  }, [pos, gsmRules]);

  // Reactively auto-select GSM based on Buyer + Fabric Name rule
  useEffect(() => {
    if (inhouseBuyer && selectedFabric) {
      const match = gsmRules.find(r => 
        r.buyer.trim().toUpperCase() === inhouseBuyer.trim().toUpperCase() &&
        r.fabric_type.trim().toUpperCase() === selectedFabric.trim().toUpperCase()
      );
      if (match) {
        setGsmValue(match.gsm.toString());
      }
    }
  }, [inhouseBuyer, selectedFabric, gsmRules]);

  const handlePOSelect = async (poNumber: string) => {
    setSelectedPO(poNumber);
    setSelectedStyle('');
    setSelectedColor('');
    setAddedColors([]);
    if (!poNumber) {
      setPoProducts([]);
      setInhouseBuyer('');
      return;
    }
    try {
      const fullPO = await poService.get(poNumber);
      setPoProducts(fullPO.products || []);
      if (fullPO.buyer) {
        setInhouseBuyer(fullPO.buyer.toUpperCase());
      } else {
        setInhouseBuyer('');
      }
    } catch (error) {
      console.error('Failed to fetch PO products', error);
      setPoProducts([]);
    }
  };

  // Reactively fetch colors for select style when in Style-Wise mode (selectedPO is empty)
  useEffect(() => {
    const fetchColors = async () => {
      if (!selectedStyle || selectedPO) {
        setColorsByStyle([]);
        return;
      }
      try {
        const response = await fetch(`/api/cutting/colors-by-style?style_num=${encodeURIComponent(selectedStyle)}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('erp_token')}` }
        });
        const data = await response.json();
        setColorsByStyle(data || []);
      } catch (err) {
        console.error('Failed to fetch colors by style', err);
        setColorsByStyle([]);
      }
    };
    fetchColors();
  }, [selectedStyle, selectedPO]);

  // Reactively load cutting program / product rows whenever filters change
  useEffect(() => {
    const loadCuttingData = async () => {
      if (!selectedStyle || !selectedColor) {
        setCuttingPrograms([]);
        setPlannedQuantities({});
        return;
      }
      
      try {
        setIsLoading(true);
        let data: any[] = [];
        const token = localStorage.getItem('erp_token') || '';
        
        if (selectedPO) {
          // Load for single PO
          const response = await fetch(`/api/po-products-for-cutting/${encodeURIComponent(selectedPO)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          data = await response.json();
        } else {
          // Load style-wise across all active POs
          const response = await fetch(`/api/cutting/products-by-style?style_num=${encodeURIComponent(selectedStyle)}&color=${encodeURIComponent(selectedColor)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          data = await response.json();
        }
        
        setCuttingPrograms(data || []);
        
        const initialPlanned: Record<number, string> = {};
        data.forEach((p: any) => {
          initialPlanned[p.id || p.product_id] = (p.planned_qty || 0).toString();
        });
        setPlannedQuantities(initialPlanned);
      } catch (err) {
        console.error('Failed to load cutting data', err);
        setCuttingPrograms([]);
        setPlannedQuantities({});
      } finally {
        setIsLoading(false);
      }
    };
    
    loadCuttingData();
  }, [selectedPO, selectedStyle, selectedColor]);

  const currentDayStats = useMemo(() => {
    const todayStr = workingDate ? workingDate.split(' ')[0] : new Date().toISOString().split('T')[0];
    const todaysRecords = history.filter(r => r.created_at.startsWith(todayStr));
    
    const totalInhouse = todaysRecords
      .filter(r => r.record_type === 'inhouse')
      .reduce((sum, r) => sum + r.quantity_kg, 0);

    const totalIssued = todaysRecords
      .filter(r => r.record_type === 'issue' && r.status !== 'rejected')
      .reduce((sum, r) => sum + r.quantity_kg, 0);
      
    const totalReturned = todaysRecords
      .filter(r => r.record_type === 'return')
      .reduce((sum, r) => sum + r.quantity_kg, 0);

    const totalConsumed = todaysRecords
      .filter(r => r.record_type === 'consumption')
      .reduce((sum, r) => sum + r.quantity_kg, 0);
      
    const storeBalance = history.reduce((balance, r) => {
      if (r.record_type === 'inhouse') return balance + r.quantity_kg;
      if (r.record_type === 'issue' && r.status !== 'rejected') return balance - r.quantity_kg;
      if (r.record_type === 'return' && r.status === 'accepted') return balance + r.quantity_kg;
      return balance;
    }, 0);

    const floorBalance = history.reduce((balance, r) => {
      if (r.record_type === 'issue' && r.status === 'accepted') return balance + r.quantity_kg;
      if (r.record_type === 'return') return balance - r.quantity_kg;
      if (r.record_type === 'consumption') return balance - r.quantity_kg;
      return balance;
    }, 0);

    const efficiency = dailyCutPcs > 0 ? (totalConsumed / dailyCutPcs).toFixed(4) : '0.0000';
    
    return { totalInhouse, totalIssued, totalReturned, totalConsumed, storeBalance, floorBalance, efficiency };
  }, [history, workingDate, dailyCutPcs]);

  const filteredCuttingPrograms = useMemo(() => {
    if (!selectedStyle || !selectedColor) return [];
    return cuttingPrograms.filter(p => 
      p.style_num === selectedStyle && 
      p.color.toUpperCase() === selectedColor.toUpperCase() &&
      (!selectedPO || p.po_number === selectedPO)
    );
  }, [cuttingPrograms, selectedStyle, selectedColor, selectedPO]);

  const allStyleColorTokens = useMemo(() => {
    if (!selectedPO || !selectedStyle) return [];
    const tokens = new Set<string>();
    poProducts
      .filter(p => p.style_num === selectedStyle)
      .forEach(p => {
        if (p.color) {
          p.color.split('/').forEach(t => tokens.add(t.trim().toUpperCase()));
        }
      });
    return Array.from(tokens).sort();
  }, [selectedPO, selectedStyle, poProducts]);

  const colorPartChoices = useMemo(() => {
    const union = new Set([...allStyleColorTokens, ...addedColors]);
    return Array.from(union).sort();
  }, [allStyleColorTokens, addedColors]);

  const selectableActiveColors = useMemo(() => {
    const activeColors = colors.map(c => c.name.trim().toUpperCase());
    return Array.from(new Set(activeColors.filter(Boolean))).sort();
  }, [colors]);

  const filteredSelectableColors = useMemo(() => {
    const query = colorSearchQuery.trim().toUpperCase();
    if (!query) return selectableActiveColors;
    return selectableActiveColors.filter(c => c.includes(query));
  }, [selectableActiveColors, colorSearchQuery]);

  const handleIssueFabricBatch = async () => {
    if (isSubmitting) return;
    const validIssues = fabricIssues.filter(fi => fi.fabric && fi.gsm && parseFloat(fi.issueWeight) > 0);
    if (validIssues.length === 0) {
      alert('Please fill at least one fabric issue row with valid quantity');
      return;
    }

    setIsSubmitting(true);
    try {
      for (const fi of validIssues) {
        const payload: FabricRecordPayload = {
          po_number: selectedPO,
          style_num: selectedStyle,
          record_type: 'issue',
          color: fi.targetColor || selectedColor,
          fabric_name: fi.fabric,
          gsm: parseInt(fi.gsm) || 0,
          quantity_kg: parseFloat(fi.issueWeight) || 0,
          bypass_fabric_check: bypassFabricCheck
        };
        await fabricService.create(payload);
      }
      // Re-initialize with all color tokens for this style
      setFabricIssues(allStyleColorTokens.map(t => ({ 
        fabric: '', 
        gsm: '', 
        availWeight: 0, 
        issueWeight: '',
        targetColor: t
      })));
      await fetchInitialData();
      alert('Fabric issued successfully');
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const StoreBalancePool = useMemo(() => {
    const stock: Record<string, {
      color: string;
      fabric: string;
      gsm: number;
      balance: number;
    }> = {};
    
    history.forEach(h => {
      const hColor = (h.color || 'Universal').trim().toUpperCase();
      const hFabric = (h.fabric_name || 'Standard').trim().toUpperCase();
      const hGsm = h.gsm || 0;
      
      const key = `${hColor}|${hFabric}|${hGsm}`;
      if (!stock[key]) {
        stock[key] = {
          color: h.color || 'Universal',
          fabric: h.fabric_name || 'Standard',
          gsm: h.gsm || 0,
          balance: 0
        };
      }
      
      if (h.record_type === 'inhouse') {
        stock[key].balance += h.quantity_kg;
      }
      else if (h.record_type === 'issue') {
        if (h.status !== 'rejected') stock[key].balance -= h.quantity_kg;
      }
      else if (h.record_type === 'return') {
        if (h.status === 'accepted') stock[key].balance += h.quantity_kg;
      }
    });

    return Object.values(stock).filter(b => b.balance > 0.01).sort((a,b) => b.balance - a.balance);
  }, [history]);

  const determineBuyerFromStyle = useCallback((styleNum: string): string | null => {
    if (!styleNum) return null;
    const s = String(styleNum).trim();
    const numericVal = parseInt(s, 10);
    const is5000Series = (!isNaN(numericVal) && numericVal >= 5000 && numericVal <= 5999) || 
                         (/^\s*5\d{3,}\s*$/.test(s));
    return is5000Series ? 'C2' : 'badger';
  }, []);

  const normalizeBuyerName = useCallback((buyerName: string) => {
    const b = (buyerName || '').trim().toUpperCase();
    if (b.includes('C2')) return 'C2';
    if (b.includes('BADGER')) return 'BADGER';
    return b;
  }, []);

  const currentStyleBuyer = useMemo(() => {
    if (inhouseBuyer && inhouseBuyer.trim() && inhouseBuyer.trim().toUpperCase() !== 'UNIVERSAL' && inhouseBuyer.trim().toUpperCase() !== 'GLOBAL') {
      return inhouseBuyer.trim();
    }
    if (selectedPO) {
      const po = pos.find(p => p.po_number === selectedPO);
      if (po?.buyer && po.buyer.trim() && po.buyer.trim().toUpperCase() !== 'UNIVERSAL' && po.buyer.trim().toUpperCase() !== 'GLOBAL') {
        return po.buyer.trim();
      }
    }
    if (selectedStyle) {
      const po = pos.find(p => p.styles?.split(',').map(s => s.trim()).includes(selectedStyle));
      if (po?.buyer && po.buyer.trim() && po.buyer.trim().toUpperCase() !== 'UNIVERSAL' && po.buyer.trim().toUpperCase() !== 'GLOBAL') {
        return po.buyer.trim();
      }
      const prod = poProducts.find(p => p.style_num === selectedStyle);
      if (prod) {
        const matchPO = pos.find(p => p.po_number === prod.po_number);
        if (matchPO?.buyer && matchPO.buyer.trim() && matchPO.buyer.trim().toUpperCase() !== 'UNIVERSAL' && matchPO.buyer.trim().toUpperCase() !== 'GLOBAL') {
          return matchPO.buyer.trim();
        }
      }
      const derived = determineBuyerFromStyle(selectedStyle);
      if (derived) return derived;
    }
    return '';
  }, [selectedPO, selectedStyle, inhouseBuyer, pos, poProducts, determineBuyerFromStyle]);

  const getSuggestedGsmForFabric = useCallback((fabricName: string, buyerOverride?: string) => {
    if (!fabricName) return null;
    const normFabric = normalizeFabric(fabricName);
    const rawBuyer = buyerOverride || currentStyleBuyer || '';
    const buyerToUse = normalizeBuyerName(rawBuyer);

    if (buyerToUse) {
      const rule = gsmRules.find(r => 
        normalizeBuyerName(r.buyer || '') === buyerToUse &&
        normalizeFabric(r.fabric_type) === normFabric
      );
      if (rule) return rule.gsm.toString();
    }

    // Only fallback if NO buyer is specified at all
    if (!rawBuyer) {
      const fallbackRule = gsmRules.find(r => normalizeFabric(r.fabric_type) === normFabric);
      if (fallbackRule) return fallbackRule.gsm.toString();
    }

    return null;
  }, [currentStyleBuyer, gsmRules, normalizeBuyerName]);

  const getFabricOptionsForColor = useCallback((targetColor: string) => {
    const set = new Set<string>();
    const currentBuyerNorm = normalizeBuyerName(currentStyleBuyer);
    StoreBalancePool
      .filter(i => !targetColor || i.color.toUpperCase() === targetColor.toUpperCase())
      .forEach(i => set.add(i.fabric));
    fabricTypes.forEach(ft => set.add(ft.name));
    gsmRules.forEach(r => {
      const ruleBuyerNorm = normalizeBuyerName(r.buyer);
      if (!currentBuyerNorm || ruleBuyerNorm === currentBuyerNorm) {
        set.add(r.fabric_type);
      }
    });
    return Array.from(set).sort();
  }, [StoreBalancePool, fabricTypes, gsmRules, currentStyleBuyer, normalizeBuyerName]);

  const getGsmOptionsForRow = useCallback((targetColor: string, fabricName: string) => {
    const gsmSet = new Set<number>();
    
    StoreBalancePool
      .filter(i => 
        (!targetColor || i.color.toUpperCase() === targetColor.toUpperCase()) && 
        (!fabricName || i.fabric.toUpperCase() === fabricName.toUpperCase())
      )
      .forEach(i => {
        if (i.gsm) gsmSet.add(i.gsm);
      });

    const suggested = getSuggestedGsmForFabric(fabricName);
    if (suggested) {
      const num = parseInt(suggested);
      if (!isNaN(num) && num > 0) gsmSet.add(num);
    }

    gsmRules.forEach(r => {
      if (normalizeFabric(r.fabric_type) === normalizeFabric(fabricName)) {
        if (r.gsm) gsmSet.add(Number(r.gsm));
      }
    });

    return Array.from(gsmSet).sort((a, b) => b - a);
  }, [StoreBalancePool, getSuggestedGsmForFabric, gsmRules]);

  const updateFabricRow = (index: number, field: string, value: any) => {
    const newIssues = [...fabricIssues];
    const updatedRow = { ...newIssues[index], [field]: value };
    
    // Auto-suggest and set GSM when fabric is chosen or changed
    if (field === 'fabric' && value) {
      const suggested = getSuggestedGsmForFabric(value);
      if (suggested) {
        updatedRow.gsm = suggested;
      }
    }

    // Auto-update availability if fabric, gsm or targetColor changes
    if (field === 'fabric' || field === 'gsm' || field === 'targetColor') {
      const currentFabric = field === 'fabric' ? value : updatedRow.fabric;
      const currentGsm = field === 'gsm' ? value : updatedRow.gsm;
      const currentColor = field === 'targetColor' ? value : (updatedRow.targetColor || selectedColor);
      
      if (currentFabric && currentGsm && currentColor) {
        const item = StoreBalancePool.find(i => 
          i.color.toUpperCase() === currentColor.toUpperCase() && 
          i.fabric.toUpperCase() === currentFabric.toUpperCase() && 
          i.gsm === (parseInt(currentGsm || '0') || 0)
        );
        updatedRow.availWeight = item ? item.balance : 0;
      } else {
        updatedRow.availWeight = 0;
      }
    }
    
    newIssues[index] = updatedRow;
    setFabricIssues(newIssues);
  };

  // Real-time auto-fill suggested GSM for fabric issues when style, PO or buyer changes
  useEffect(() => {
    if (fabricIssues.length > 0 && (selectedStyle || selectedPO)) {
      let changed = false;
      const updated = fabricIssues.map(issue => {
        if (issue.fabric) {
          const suggested = getSuggestedGsmForFabric(issue.fabric);
          if (suggested && issue.gsm !== suggested) {
            changed = true;
            return { ...issue, gsm: suggested };
          }
        }
        return issue;
      });
      if (changed) {
        setFabricIssues(updated);
      }
    }
  }, [selectedStyle, selectedPO, currentStyleBuyer, gsmRules, getSuggestedGsmForFabric]);

  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [showReport, setShowReport] = useState(true);
  const [reportSearch, setReportSearch] = useState('');
  const [reportBuyerFilter, setReportBuyerFilter] = useState('ALL');
  const [reportFabricFilter, setReportFabricFilter] = useState('ALL');
  const [reportColorFilter, setReportColorFilter] = useState('ALL');
  const [reportGsmFilter, setReportGsmFilter] = useState('ALL');
  const [historySearch, setHistorySearch] = useState('');

  const gsmSuggestions = useMemo(() => {
    const list = history.map(h => h.gsm).filter(Boolean) as number[];
    return [...new Set(list)].sort((a, b) => b - a);
  }, [history]);

  const reportBuyers = useMemo(() => {
    const buyersSet = new Set<string>();
    pos.forEach(po => {
      if (po.buyer) buyersSet.add(po.buyer.trim().toUpperCase());
    });
    gsmRules.forEach(rule => {
      if (rule.buyer) buyersSet.add(rule.buyer.trim().toUpperCase());
    });
    history.forEach(h => {
      if (h.po_number) {
        const po = pos.find(p => p.po_number === h.po_number);
        if (po?.buyer) buyersSet.add(po.buyer.trim().toUpperCase());
      }
    });
    return ['ALL', ...Array.from(buyersSet).sort()];
  }, [pos, gsmRules, history]);

  const reportFabrics = useMemo(() => {
    const fabricSet = new Set<string>();
    fabricTypes.forEach(ft => {
      if (ft.name) fabricSet.add(normalizeFabric(ft.name));
    });
    history.forEach(h => {
      if (h.fabric_name) fabricSet.add(normalizeFabric(h.fabric_name));
    });
    gsmRules.forEach(r => {
      if (r.fabric_type) fabricSet.add(normalizeFabric(r.fabric_type));
    });
    return ['ALL', ...Array.from(fabricSet).sort()];
  }, [fabricTypes, history, gsmRules]);

  const reportColors = useMemo(() => {
    const list = history.map(h => (h.color || 'Universal').trim().toUpperCase()).filter(Boolean) as string[];
    const unique = Array.from(new Set(list));
    return ['ALL', ...unique].sort((a: string, b: string) => {
      if (a === 'ALL') return -1;
      if (b === 'ALL') return 1;
      return a.localeCompare(b);
    });
  }, [history]);

  const reportGsms = useMemo(() => {
    const list = history.map(h => h.gsm).filter(Boolean).map(g => g.toString()) as string[];
    const unique = Array.from(new Set(list));
    return ['ALL', ...unique].sort((a: string, b: string) => {
      if (a === 'ALL') return -1;
      if (b === 'ALL') return 1;
      return parseInt(a) - parseInt(b);
    });
  }, [history]);

  const poColorOptions = useMemo(() => {
    const allColors = new Set<string>();
    pos.forEach(po => {
      if (po.colors) {
        po.colors.split(',').forEach(c => {
          const fullColor = c.trim().toUpperCase();
          if (fullColor) {
            if (fullColor.includes('/')) {
              fullColor.split('/').forEach(t => allColors.add(t.trim().toUpperCase()));
            } else {
              allColors.add(fullColor);
            }
          }
        });
      }
    });
    return Array.from(allColors).sort();
  }, [pos]);

  const styleSuggestions = useMemo(() => {
    if (selectedPO) {
      if (poProducts.length > 0) {
        const styles = poProducts.map(p => p.style_num);
        return [...new Set(styles)].sort();
      }
      const po = pos.find(p => p.po_number === selectedPO);
      if (!po?.styles) return [];
      const styles = po.styles.split(',').map(s => s.trim()).filter(Boolean);
      return [...new Set(styles)].sort();
    } else {
      const allStyles = new Set<string>();
      pos.forEach(po => {
        if (po.styles) {
          po.styles.split(',').forEach(s => {
            const trimmed = s.trim();
            if (trimmed) allStyles.add(trimmed);
          });
        }
      });
      return Array.from(allStyles).sort();
    }
  }, [selectedPO, pos, poProducts]);

  const availablePOs = useMemo(() => {
    return Array.from(new Set(pos.map(p => p.po_number))).sort();
  }, [pos]);

  const availableStyles = useMemo(() => {
    return styleSuggestions;
  }, [styleSuggestions]);

  const availableColors = useMemo(() => {
    if (!selectedStyle) return [];
    
    if (selectedPO) {
      // Get colors defined for this style in the PO
      const allColors = new Set<string>();
      poProducts
        .filter(p => p.style_num === selectedStyle)
        .forEach(p => {
          if (p.color) {
            allColors.add(p.color);
          }
        });
        
      if (allColors.size > 0) {
        return Array.from(allColors).sort();
      }
      
      // Fallback to cutting programs
      cuttingPrograms
        .filter(p => p.style_num === selectedStyle)
        .forEach(p => {
          if (p.color) {
            allColors.add(p.color);
          }
        });
        
      if (allColors.size > 0) {
        return Array.from(allColors).sort();
      }

      // Ultimate fallback to Store Balance
      return [...new Set(StoreBalancePool
        .filter(i => !selectedStyle || history.some(h => h.style_num === selectedStyle && h.color.toUpperCase().includes(i.color.toUpperCase())))
        .map(i => i.color)
      )].sort();
    } else {
      // Style-wise colors
      return colorsByStyle;
    }
  }, [StoreBalancePool, selectedPO, selectedStyle, poProducts, cuttingPrograms, history, colorsByStyle]);

  const availableFabrics = useMemo(() => {
    if (!selectedPO || !selectedStyle || !selectedColor) return [];
    const fabrics = StoreBalancePool
      .filter(i => i.color.toUpperCase() === selectedColor.toUpperCase())
      .map(i => i.fabric);
    return [...new Set(fabrics)].sort();
  }, [StoreBalancePool, selectedColor, selectedPO, selectedStyle]);

  const availableGSMs = useMemo(() => {
    if (!selectedPO || !selectedStyle || !selectedColor || !selectedFabric) return [];
    const gsms = StoreBalancePool
      .filter(i => i.color.toUpperCase() === selectedColor.toUpperCase() && i.fabric.toUpperCase() === selectedFabric.toUpperCase())
      .map(i => i.gsm);
    return ([...new Set(gsms)] as number[]).sort((a, b) => b - a);
  }, [StoreBalancePool, selectedColor, selectedFabric, selectedPO, selectedStyle]);

  const currentAvailableBalance = useMemo(() => {
    if (!selectedColor || !selectedFabric || !gsmValue) return 0;
    const item = StoreBalancePool.find(i => 
      i.color.toUpperCase() === selectedColor.toUpperCase() && 
      i.fabric.toUpperCase() === selectedFabric.toUpperCase() && 
      i.gsm === (parseInt(gsmValue || '0') || 0)
    );
    return item ? item.balance : 0;
  }, [StoreBalancePool, selectedColor, selectedFabric, gsmValue]);

  const filteredColors = useMemo(() => {
    // If a style is selected, filter colors from PO products
    if (selectedStyle && poProducts.length > 0) {
      const allMatching = new Set<string>();
      poProducts
        .filter(p => p.style_num === selectedStyle)
        .forEach(p => {
          if (p.color) {
            const fullColor = p.color.toUpperCase();
            if (fullColor.includes('/')) {
              fullColor.split('/').forEach(t => allMatching.add(t.trim().toUpperCase()));
            } else {
              allMatching.add(fullColor);
            }
          }
        });
      
      const uniqueMatching = Array.from(allMatching).sort();
      if (uniqueMatching.length > 0) {
        return uniqueMatching.map((name, index) => ({ id: -index - 1, name }));
      }
    }
    
    // Otherwise show all system colors
    return colors;
  }, [selectedStyle, poProducts, colors]);

  const pivotedHistory = useMemo(() => {
    const filteredHistory = history.filter(h => {
      const hDate = h.created_at.substring(0, 10);
      const matchesSearch = !historySearch || 
                           h.po_number.toLowerCase().includes(historySearch.toLowerCase()) ||
                           (h.style_num && h.style_num.toLowerCase().includes(historySearch.toLowerCase())) ||
                           (h.color && h.color.toLowerCase().includes(historySearch.toLowerCase())) ||
                           (h.batch_id && h.batch_id.toLowerCase().includes(historySearch.toLowerCase())) ||
                           (h.recorder_name && h.recorder_name.toLowerCase().includes(historySearch.toLowerCase()));
      return hDate >= dateRange.start && hDate <= dateRange.end && matchesSearch;
    });

    return filteredHistory.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [history, dateRange, historySearch]);

  const consumptionStats = useMemo(() => {
    if (!showReport) return [];

    const stats: Record<string, any> = {};
    
    history.forEach(h => {
      const hColor = (h.color || 'Universal').trim().toUpperCase();
      const hFabric = normalizeFabric(h.fabric_name || 'Standard');
      const hGsm = Number(h.gsm) || 0;
      
      // Group by Item Attributes primarily
      const key = `${hColor}-${hFabric}-${hGsm}`;
      if (!stats[key]) {
        stats[key] = {
          po_list: new Set<string>(),
          style_list: new Set<string>(),
          buyer_list: new Set<string>(),
          color: h.color || 'Universal',
          fabric_name: hFabric,
          gsm: hGsm,
          inhouse_period: 0,
          issued_period: 0,
          returned_period: 0,
          consumed_period: 0,
          total_issued: 0,
          total_consumed: 0,
          total_inhouse: 0,
          store_balance: 0,
          floor_balance: 0,
          planned_program: 0,
          processed_programs: new Set() // To avoid double counting same CP
        };
      }

      const stat = stats[key];
      if (h.po_number && h.po_number !== 'UNIVERSAL') {
        stat.po_list.add(h.po_number);
        const matchedPO = pos.find(p => p.po_number === h.po_number);
        if (matchedPO?.buyer) {
          stat.buyer_list.add(matchedPO.buyer.trim().toUpperCase());
        }
      }
      if (h.style_num && h.style_num !== 'GENERAL' && h.style_num !== 'N/A') stat.style_list.add(h.style_num);
      
      const hDate = h.created_at ? h.created_at.substring(0, 10) : '';
      const inPeriod = hDate >= dateRange.start && hDate <= dateRange.end;

      if (h.record_type === 'inhouse') {
        if (inPeriod) stat.inhouse_period += h.quantity_kg;
        stat.total_inhouse += h.quantity_kg;
        stat.store_balance += h.quantity_kg;
      }
      else if (h.record_type === 'issue') {
        if (h.status !== 'rejected') {
          if (inPeriod) stat.issued_period += h.quantity_kg;
          stat.total_issued += h.quantity_kg;
          stat.store_balance -= h.quantity_kg;
        }
        if (h.status === 'accepted') {
          stat.floor_balance += h.quantity_kg;
        }
      }
      else if (h.record_type === 'return') {
        if (inPeriod && h.status !== 'rejected') stat.returned_period += h.quantity_kg;
        if (h.status === 'accepted') stat.store_balance += h.quantity_kg;
        stat.floor_balance -= h.quantity_kg;
      }
      else if (h.record_type === 'consumption') {
        if (inPeriod) stat.consumed_period += h.quantity_kg;
        stat.total_consumed += h.quantity_kg;
        stat.floor_balance -= h.quantity_kg;
      }
    });

    // Post-process to calculate planned program and associate buyers from GSM Rules
    Object.keys(stats).forEach(key => {
      const stat = stats[key];

      // Add buyers from GSM rules matching this item's fabric and gsm
      gsmRules.forEach(rule => {
        if (
          normalizeFabric(rule.fabric_type) === normalizeFabric(stat.fabric_name) &&
          Number(rule.gsm) === Number(stat.gsm) &&
          rule.buyer
        ) {
          stat.buyer_list.add(rule.buyer.trim().toUpperCase());
        }
      });

      const relevantPrograms = allCuttingPrograms.filter(cp => {
        const cpColorRaw = String(cp.color || '').trim().toUpperCase();
        const cpColors = cpColorRaw.split('/').map((s: string) => s.trim());
        const matchesColor = cpColors.includes(stat.color.toUpperCase()) || cpColorRaw === stat.color.toUpperCase();
        return matchesColor;
      });
      stat.planned_program = relevantPrograms.reduce((sum: number, cp: any) => sum + (cp.planned_qty || 0), 0);
      
      // Format PO/Style strings
      stat.display_po = stat.po_list.size > 0 ? Array.from(stat.po_list).join(', ') : 'UNIVERSAL';
      stat.display_style = stat.style_list.size > 0 ? Array.from(stat.style_list).join(', ') : 'GENERAL';
    });

    let result = Object.values(stats);

    // Filter by Buyer according to GSM rules and PO assignments
    if (reportBuyerFilter && reportBuyerFilter !== 'ALL') {
      const selBuyer = reportBuyerFilter.trim().toUpperCase();
      const buyerGsmRules = gsmRules.filter(r => (r.buyer || '').trim().toUpperCase() === selBuyer);

      result = result.filter((s: any) => {
        const itemFabricNorm = normalizeFabric(s.fabric_name);
        const itemGsm = Number(s.gsm);

        // Check if this buyer has explicit GSM rule(s) for this specific fabric
        const matchingFabricRules = buyerGsmRules.filter(r => normalizeFabric(r.fabric_type) === itemFabricNorm);

        if (matchingFabricRules.length > 0) {
          // If the buyer has defined GSM rule(s) for this fabric, item MUST match one of the rule GSMs
          const matchesBuyerGsm = matchingFabricRules.some(r => Number(r.gsm) === itemGsm);
          if (!matchesBuyerGsm) {
            return false;
          }
          return true;
        }

        // Direct buyer match
        if (s.buyer_list && s.buyer_list.has(selBuyer)) return true;

        // PO buyer match
        const poMatch = Array.from(s.po_list as Set<string>).some(poNum => {
          const po = pos.find(p => p.po_number === poNum);
          return po && po.buyer && po.buyer.trim().toUpperCase() === selBuyer;
        });
        if (poMatch) return true;

        // GSM rule match: Buyer has GSM Rule for this fabric + GSM
        const ruleMatch = buyerGsmRules.some(r => 
          normalizeFabric(r.fabric_type) === itemFabricNorm &&
          Number(r.gsm) === itemGsm
        );
        return ruleMatch;
      });
    }

    // Filter by Fabric Name
    if (reportFabricFilter && reportFabricFilter !== 'ALL') {
      const selFabric = normalizeFabric(reportFabricFilter);
      result = result.filter((s: any) => 
        normalizeFabric(s.fabric_name) === selFabric
      );
    }

    // Filter by Color
    if (reportColorFilter && reportColorFilter !== 'ALL') {
      result = result.filter((s: any) => 
        (s.color || '').trim().toUpperCase() === reportColorFilter.trim().toUpperCase()
      );
    }

    // Filter by GSM
    if (reportGsmFilter && reportGsmFilter !== 'ALL') {
      result = result.filter((s: any) => 
        (s.gsm || 0).toString() === reportGsmFilter
      );
    }

    // Search term
    if (reportSearch) {
      const search = reportSearch.toLowerCase();
      result = result.filter((s: any) => 
        s.display_po.toLowerCase().includes(search) || 
        s.display_style.toLowerCase().includes(search) ||
        (s.color || '').toLowerCase().includes(search) ||
        (s.fabric_name || '').toLowerCase().includes(search) ||
        Array.from(s.buyer_list || []).some((b: any) => b.toLowerCase().includes(search))
      );
    }

    return result;
  }, [history, dateRange, showReport, reportSearch, reportBuyerFilter, reportFabricFilter, reportColorFilter, reportGsmFilter, allCuttingPrograms, pos, gsmRules]);

  const reportSummaryTotals = useMemo(() => {
    return consumptionStats.reduce((acc, stat: any) => {
      acc.totalInhouse += (Number(stat.total_inhouse) || 0);
      acc.totalIssued += (Number(stat.total_issued) || 0);
      acc.storeBalance += (Number(stat.store_balance) || 0);
      acc.floorBalance += (Number(stat.floor_balance) || 0);
      acc.totalConsumed += (Number(stat.total_consumed) || 0);
      return acc;
    }, {
      totalInhouse: 0,
      totalIssued: 0,
      storeBalance: 0,
      floorBalance: 0,
      totalConsumed: 0
    });
  }, [consumptionStats]);

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-bg4 pb-6">
        <div>
          <h2 className="text-2xl sm:text-4xl font-black tracking-tighter flex items-center gap-4 uppercase">
            <div className="p-3 bg-po/10 text-po rounded-2xl shrink-0">
              <Droplets className="w-8 h-8" />
            </div>
            <div>
              <span className="block leading-none">Fabric Management</span>
              <span className="text-text3 text-[10px] font-mono uppercase tracking-[0.3em] font-medium mt-1 leading-tight">In-house / Issue / Consumption</span>
            </div>
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-bg2 p-1 rounded-xl border border-bg4 self-start lg:self-auto overflow-x-auto max-w-full">
            {user?.role !== 'viewer' && (
              <div className="relative">
                <button 
                  onClick={() => setActiveTab('entry')}
                  className={cn(
                    "px-4 sm:px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                    activeTab === 'entry' ? "bg-po text-white shadow-lg shadow-po/20" : "text-text3 hover:text-text"
                  )}
                >
                  Entry Forms
                </button>
                {history.filter(r => r.record_type === 'return' && r.status === 'pending').length > 0 && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-reject rounded-full border-2 border-bg animate-pulse shadow-sm" />
                )}
              </div>
            )}
            <button 
              onClick={() => setActiveTab('reports')}
              className={cn(
                "px-4 sm:px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                activeTab === 'reports' ? "bg-po text-white shadow-lg shadow-po/20" : "text-text3 hover:text-text"
              )}
            >
              Inventory Logs
            </button>
            {user?.role !== 'viewer' && (
              <button 
                onClick={() => setActiveTab('types')}
                className={cn(
                  "px-4 sm:px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                  activeTab === 'types' ? "bg-po text-white shadow-lg shadow-po/20" : "text-text3 hover:text-text"
                )}
              >
                Fabric Types
              </button>
            )}
            {user?.role !== 'viewer' && (
              <button 
                onClick={() => setActiveTab('rules')}
                className={cn(
                  "px-4 sm:px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                  activeTab === 'rules' ? "bg-po text-white shadow-lg shadow-po/20" : "text-text3 hover:text-text"
                )}
              >
                GSM Rules
              </button>
            )}
            {user?.role !== 'viewer' && (
              <button 
                onClick={() => setActiveTab('consumption')}
                className={cn(
                  "px-4 sm:px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                  activeTab === 'consumption' ? "bg-po text-white shadow-lg shadow-po/20" : "text-text3 hover:text-text"
                )}
              >
                Consumption Rates
              </button>
            )}
            <button 
              onClick={() => setActiveTab('stock-report')}
              className={cn(
                "px-4 sm:px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-1.5",
                activeTab === 'stock-report' ? "bg-po text-white shadow-lg shadow-po/20" : "text-text3 hover:text-text"
              )}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Req & Stock Report
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'entry' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3 space-y-8">
            {history.filter(r => r.record_type === 'return' && r.status === 'pending').length > 0 && (
              <div className="bg-bg2 border-2 border-orange-500/50 rounded-2xl p-4 flex items-center justify-between shadow-lg shadow-orange-500/10 animate-pulse-slow">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-orange-500 text-bg rounded-xl">
                    <RotateCcw className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-tight text-orange-500">Action Required: Floor Returns</h4>
                    <p className="text-[10px] font-mono text-text3 uppercase font-bold tracking-widest">There is fabric being returned from the cutting floor. Please confirm receipt.</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    const el = document.getElementById('handover-sidebar');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="bg-orange-500 text-bg px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all"
                >
                  View Handover
                </button>
              </div>
            )}

            {/* QC Finishing Rejection Shortfalls Alert Banner */}
            {shortfalls.length > 0 && (
              <div className="bg-reject/5 border border-reject/20 rounded-2xl p-6 shadow-lg shadow-reject/5 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-reject text-white rounded-xl shadow-lg shadow-reject/20 shrink-0">
                      <PlusCircle className="w-5 h-5 animate-pulse" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black uppercase text-reject select-none tracking-tight">
                        QC Finishing Shortfall Alerts
                      </h4>
                      <p className="text-[10px] font-mono text-text3 uppercase font-bold tracking-widest mt-0.5">
                        The following products have finishing rejections causing shortfall below the actual order quantity
                      </p>
                    </div>
                  </div>
                  <span className="bg-reject/10 text-reject font-mono font-black px-3 py-1 rounded-full text-[10px] uppercase self-start md:self-auto shrink-0">
                    {shortfalls.length} Shortfall(s) Detected
                  </span>
                </div>

                <div className="overflow-hidden border border-bg4 rounded-xl divide-y divide-bg4">
                  {shortfalls.map((s) => (
                    <div key={s.id} className="p-4 bg-bg2 hover:bg-bg3/10 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 font-mono">
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 flex-1 text-left">
                        <div>
                          <p className="text-[8px] uppercase tracking-wider text-text3 font-bold">Order #</p>
                          <p className="text-[11px] font-black uppercase text-text">{s.po_number}</p>
                        </div>
                        <div>
                          <p className="text-[8px] uppercase tracking-wider text-text3 font-bold">Style / Color</p>
                          <p className="text-[11px] font-black uppercase text-text leading-tight">{s.style_num}</p>
                          <p className="text-[9px] font-medium uppercase text-text3 leading-tight">{s.color}</p>
                        </div>
                        <div className="text-center md:text-left">
                          <p className="text-[8px] uppercase tracking-wider text-text3 font-bold">Size</p>
                          <p className="text-xs font-black text-text">{s.size}</p>
                        </div>
                        <div className="text-right md:text-left">
                          <p className="text-[8px] uppercase tracking-wider text-text3 font-bold">Order Qty</p>
                          <p className="text-xs font-black text-text">{s.order_qty} pcs</p>
                        </div>
                        <div className="text-right md:text-left">
                          <p className="text-[8px] uppercase tracking-wider text-reject font-bold">QC Reject (Shortage)</p>
                          <p className="text-xs font-black text-reject bg-reject/5 px-2 py-0.5 rounded inline-block">
                            {s.total_rejected} Rejected (<span className="underline">-{s.shortfall} pcs</span>)
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handlePlanReworkShortfall(s)}
                        className="self-end md:self-auto bg-reject text-white font-black px-4 py-2 rounded-xl text-[10px] uppercase flex items-center gap-1.5 shadow-lg shadow-reject/20 hover:bg-red-600 transition-all"
                      >
                        <Calculator className="w-3.5 h-3.5" />
                        Quick-Plan Extra Cutting
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          {/* Quick Additions Panel */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* New Color Addition Quick Form */}
            <div className="bg-bg2 border border-bg4 p-4 rounded-xl flex items-center justify-between gap-4">
               <div className="flex items-center gap-2 text-[10px] font-mono text-text3 uppercase font-black">
                 <Plus className="w-3 h-3 text-pass" />
                 New Color:
               </div>
               <div className="flex items-center gap-2 flex-1">
                 <input 
                   type="text"
                   placeholder="Color Name (e.g. Red, XL-Black...)"
                   value={newColorName}
                   onChange={e => setNewColorName(e.target.value)}
                   className="bg-bg3 border border-bg4 rounded-lg px-3 py-1.5 text-xs font-bold outline-none uppercase w-full"
                 />
                 <button 
                   onClick={handleAddColor}
                   className="bg-pass text-white px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-green-600 transition-all shadow-sm shrink-0"
                 >
                   Add Color
                 </button>
               </div>
            </div>

            {/* New Fabric Type Addition Quick Form */}
            <div className="bg-bg2 border border-bg4 p-4 rounded-xl flex items-center justify-between gap-4">
               <div className="flex items-center gap-2 text-[10px] font-mono text-text3 uppercase font-black">
                 <Plus className="w-3 h-3 text-po" />
                 New Fabric Type:
               </div>
               <div className="flex items-center gap-2 flex-1">
                 <input 
                   type="text"
                   placeholder="Fabric Name (e.g. Terry, Knit...)"
                   value={newFabricName}
                   onChange={e => setNewFabricName(e.target.value)}
                   className="bg-bg3 border border-bg4 rounded-lg px-3 py-1.5 text-xs font-bold outline-none uppercase w-full"
                 />
                 <button 
                   onClick={handleAddFabricType}
                   className="bg-po text-white px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-opacity-95 transition-all shadow-sm shrink-0"
                 >
                   Add Type
                 </button>
               </div>
            </div>
          </div>

          <div className="bg-bg2 border border-bg4 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <span className="flex h-3 w-3 relative">
                {bypassFabricCheck ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                  </>
                ) : (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                  </>
                )}
              </span>
              <div className="flex flex-col">
                <p className="text-xs font-black uppercase tracking-wider text-text">First-Time Startup Mode</p>
                <p className="text-[10px] text-text3 font-medium tracking-wide">If active, you can issue fabric floor stock or record consumption retroactively even if those items aren't registered in store yet.</p>
              </div>
            </div>
            <label className="flex items-center gap-3 cursor-pointer bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-xl hover:bg-amber-500/15 transition-colors select-none shrink-0 w-full sm:w-auto justify-center sm:justify-start">
              <input 
                type="checkbox" 
                checked={bypassFabricCheck} 
                onChange={(e) => setBypassFabricCheck(e.target.checked)} 
                className="w-4 h-4 rounded accent-amber-500 bg-bg3 border-bg4 cursor-pointer"
              />
              <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest leading-none">Enable Bypass</span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-bg2 border border-bg4 p-6 rounded-2xl border-l-4 border-l-pass">
              <div className="flex items-center gap-2 mb-2 text-text3">
                <Plus className="w-4 h-4 text-pass" />
                <span className="text-[10px] font-mono uppercase tracking-widest">Store Stock (Inhouse)</span>
              </div>
              <p className="text-2xl font-black tracking-tighter leading-none">
                {currentDayStats.storeBalance.toFixed(2)} <span className="text-xs font-normal text-text3 ml-1">KG</span>
              </p>
            </div>
            
            <div className="bg-bg2 border border-bg4 p-6 rounded-2xl border-l-4 border-l-po">
              <div className="flex items-center gap-2 mb-2 text-text3">
                <Send className="w-4 h-4 text-po" />
                <span className="text-[10px] font-mono uppercase tracking-widest">Floor Stock (Issued)</span>
              </div>
              <p className="text-2xl font-black tracking-tighter leading-none">
                {currentDayStats.floorBalance.toFixed(2)} <span className="text-xs font-normal text-text3 ml-1">KG</span>
              </p>
            </div>

            <div className="bg-bg2 border border-bg4 p-6 rounded-2xl">
              <div className="flex items-center gap-2 mb-2 text-text3">
                <Calculator className="w-4 h-4 text-reject" />
                <span className="text-[10px] font-mono uppercase tracking-widest">Consumption Rate</span>
              </div>
              <p className="text-2xl font-black">{currentDayStats.efficiency} <span className="text-xs font-normal text-text3">KG/PC</span></p>
            </div>

            <div className="bg-bg2 border border-bg4 p-6 rounded-2xl bg-bg3/30">
              <div className="flex items-center gap-2 mb-2 text-text3">
                <History className="w-4 h-4" />
                <span className="text-[10px] font-mono uppercase tracking-widest">Current System Date</span>
              </div>
              <p className="text-lg font-black">{fmtDate(workingDate || '')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div id="fabric-inhouse-form" className="bg-bg2 border border-bg4 rounded-3xl overflow-hidden shadow-xl">
              <div className="p-6 border-b border-bg4 bg-pass/5 flex items-center justify-between">
                  <h3 className="font-black uppercase tracking-tight flex items-center gap-2">
                  <Plus className="w-5 h-5 text-pass" />
                  1. Fabric In-house
                </h3>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest">Order # (Optional)</label>
                      <select 
                        value={selectedPO}
                        onChange={e => handlePOSelect(e.target.value)}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold outline-none"
                      >
                        <option value="">UNIVERSAL</option>
                        {pos.map((po, idx) => <option key={`${po.id}-${po.buyer || idx}`} value={po.po_number}>{po.po_number}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest">Buyer</label>
                      <input 
                        type="text"
                        list="buyer-list-entry"
                        placeholder="Buyer (e.g. Badger)"
                        value={inhouseBuyer}
                        onChange={e => setInhouseBuyer(e.target.value)}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold outline-none uppercase"
                      />
                      <datalist id="buyer-list-entry">
                        {knownBuyers.map(b => <option key={b} value={b} />)}
                      </datalist>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest">Fabric Name</label>
                      <select 
                        value={selectedFabric}
                        onChange={e => {
                          const fab = e.target.value;
                          setSelectedFabric(fab);
                          const sug = getSuggestedGsmForFabric(fab, inhouseBuyer);
                          if (sug) setGsmValue(sug);
                        }}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold outline-none"
                      >
                        <option value="">Fabric Name</option>
                        {fabricTypes.map(ft => (
                          <option key={ft.id} value={ft.name}>{ft.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest">Color (from POs)</label>
                      <select 
                        value={selectedColor}
                        onChange={e => setSelectedColor(e.target.value)}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold outline-none"
                      >
                        <option value="">Select Color</option>
                        {poColorOptions.map(c => <option key={c} value={c}>{c}</option>)}
                        <optgroup label="System Colors">
                          {colors.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </optgroup>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest">GSM</label>
                        {(() => {
                          const sug = getSuggestedGsmForFabric(selectedFabric, inhouseBuyer);
                          return sug ? (
                            <span className="text-[9px] font-mono font-black text-po bg-po/10 px-2 py-0.5 rounded border border-po/20 flex items-center gap-1">
                              <Sparkles className="w-2.5 h-2.5 text-po" />
                              Suggested: {sug} GSM
                            </span>
                          ) : null;
                        })()}
                      </div>
                      <input 
                        type="text"
                        list="gsm-list-entry"
                        placeholder="GSM"
                        value={gsmValue}
                        onChange={e => setGsmValue(e.target.value.replace(/\D/g, ''))}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold outline-none"
                      />
                      <datalist id="gsm-list-entry">
                        {gsmSuggestions.map(g => <option key={g} value={g} />)}
                      </datalist>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest">Batch/Roll ID (Optional)</label>
                      <input 
                        type="text"
                        placeholder="Batch ID"
                        value={batchId}
                        onChange={e => setBatchId(e.target.value)}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold outline-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest text-pass font-black">Weight In-house (KG)</label>
                    <input 
                      type="number"
                      step="0.001"
                      placeholder="0.000"
                      value={inhouseQty}
                      onChange={e => setInhouseQty(e.target.value)}
                      className="w-full bg-bg3 border border-bg4 rounded-xl p-4 text-lg font-black focus:ring-2 focus:ring-pass/50 outline-none"
                    />
                  </div>
                  <button 
                    onClick={() => handleCreateRecord('inhouse')}
                    disabled={isSubmitting}
                    className={cn(
                      "w-full bg-pass text-white font-black py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all uppercase tracking-widest text-sm",
                      isSubmitting ? "opacity-50 cursor-not-allowed" : "shadow-pass/30 hover:bg-green-600"
                    )}
                  >
                    {isSubmitting ? 'Syncing...' : 'Receive in Store'}
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-bg2 border border-bg4 rounded-3xl overflow-hidden shadow-xl">
              <div className="p-6 border-b border-bg4 bg-reject/5 flex items-center justify-between">
                  <h3 className="font-black uppercase tracking-tight flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-reject" />
                  2. Return to Store
                </h3>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest">Order #</label>
                      <select 
                        value={selectedPO}
                        onChange={e => handlePOSelect(e.target.value)}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold outline-none"
                      >
                        <option value="">Order #</option>
                        {pos.map((po, idx) => <option key={`${po.id}-${po.buyer || idx}`} value={po.po_number}>{po.po_number}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest">Style #</label>
                      <select 
                        value={selectedStyle}
                        onChange={e => setSelectedStyle(e.target.value)}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold outline-none"
                      >
                        <option value="">Style #</option>
                        {styleSuggestions.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest">Fabric Name</label>
                      <select 
                        value={selectedFabric}
                        onChange={e => setSelectedFabric(e.target.value)}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold outline-none"
                      >
                        <option value="">Fabric Name</option>
                        {fabricTypes.map(ft => (
                          <option key={ft.id} value={ft.name}>{ft.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest">Color</label>
                      <select 
                        value={selectedColor}
                        onChange={e => setSelectedColor(e.target.value)}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold outline-none"
                      >
                        <option value="">Color</option>
                        {filteredColors.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest">GSM</label>
                      <input 
                        type="text"
                        list="gsm-list-return"
                        placeholder="GSM"
                        value={gsmValue}
                        onChange={e => setGsmValue(e.target.value.replace(/\D/g, ''))}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold outline-none"
                      />
                      <datalist id="gsm-list-return">
                        {gsmSuggestions.map(g => <option key={g} value={g} />)}
                      </datalist>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest text-reject font-black">Weight to Return (KG)</label>
                    <input 
                      type="number"
                      step="0.001"
                      placeholder="0.000"
                      value={returnQty}
                      onChange={e => setReturnQty(e.target.value)}
                      className="w-full bg-bg3 border border-bg4 rounded-xl p-4 text-lg font-black focus:ring-2 focus:ring-reject/50 outline-none"
                    />
                  </div>
                  <div className="pt-10">
                    <button 
                      onClick={() => handleCreateRecord('return')}
                      disabled={isSubmitting}
                      className={cn(
                        "w-full font-black py-4 rounded-xl border flex items-center justify-center gap-2 transition-all uppercase tracking-widest text-sm",
                        isSubmitting 
                          ? "bg-bg3 text-text3 border-bg4 cursor-not-allowed" 
                          : "bg-bg text-text border-bg4 shadow-sm hover:bg-bg3"
                      )}
                    >
                      {isSubmitting ? 'Processing...' : 'Move to Store'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-bg2 border border-bg4 rounded-3xl overflow-hidden shadow-xl">
              <div className="p-6 border-b border-bg4 bg-amber-500/5 flex items-center justify-between">
                <h3 className="font-black uppercase tracking-tight flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-amber-500" />
                  3. Log Consumption Retroactively
                </h3>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest">Order #</label>
                      <select 
                        value={selectedPO}
                        onChange={e => handlePOSelect(e.target.value)}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold outline-none font-bold"
                      >
                        <option value="">Order #</option>
                        {pos.map((po, idx) => <option key={`${po.id}-${po.buyer || idx}`} value={po.po_number}>{po.po_number}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest">Style #</label>
                      <select 
                        value={selectedStyle}
                        onChange={e => setSelectedStyle(e.target.value)}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold outline-none font-bold"
                      >
                        <option value="">Style #</option>
                        {styleSuggestions.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest">Fabric Name</label>
                      <select 
                        value={selectedFabric}
                        onChange={e => setSelectedFabric(e.target.value)}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold outline-none font-bold"
                      >
                        <option value="">Fabric Name</option>
                        {fabricTypes.map(ft => (
                          <option key={ft.id} value={ft.name}>{ft.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest">Color</label>
                      <select 
                        value={selectedColor}
                        onChange={e => setSelectedColor(e.target.value)}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold outline-none font-bold"
                      >
                        <option value="">Color</option>
                        {filteredColors.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest">GSM</label>
                      <input 
                        type="text"
                        list="gsm-list-consumption"
                        placeholder="GSM"
                        value={gsmValue}
                        onChange={e => setGsmValue(e.target.value.replace(/\D/g, ''))}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold outline-none font-bold"
                      />
                      <datalist id="gsm-list-consumption">
                        {gsmSuggestions.map(g => <option key={g} value={g} />)}
                      </datalist>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest text-amber-500 font-black">Weight Consumed (KG)</label>
                    <input 
                      type="number"
                      step="0.001"
                      placeholder="0.000"
                      value={consumptionQty}
                      onChange={e => setConsumptionQty(e.target.value)}
                      className="w-full bg-bg3 border border-bg4 rounded-xl p-4 text-lg font-black focus:ring-2 focus:ring-amber-500/50 outline-none"
                    />
                  </div>
                  <div className="pt-10">
                    <button 
                      onClick={() => handleCreateRecord('consumption')}
                      disabled={isSubmitting}
                      className={cn(
                        "w-full bg-amber-500 text-white font-black py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all uppercase tracking-widest text-sm shadow-amber-500/30 hover:bg-amber-600",
                        isSubmitting ? "opacity-50 cursor-not-allowed" : ""
                      )}
                    >
                      {isSubmitting ? 'Processing...' : 'Log Consumption'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

            {/* Cutting Management Section: Mandatory Filters + Issue Form + Program Table */}
            <div id="cutting-program-section" className="bg-bg2 border border-bg4 rounded-3xl overflow-hidden shadow-xl mt-8">
              <div className="p-6 border-b border-bg4 bg-po/5 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-po text-white rounded-lg">
                      <Calculator className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-black uppercase tracking-tight text-sm">Cutting Management</h3>
                      <p className="text-[10px] font-mono text-text3 uppercase font-bold tracking-widest mt-0.5">Issue fabric and plan cutting targets</p>
                    </div>
                  </div>
                  
                  {/* Mandatory Filters for Cutting Management */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="space-y-1">
                      <p className="text-[8px] font-black uppercase text-text3 ml-1">1. Order # (PO)</p>
                      <select 
                        value={selectedPO}
                        onChange={(e) => handlePOSelect(e.target.value)}
                        className="bg-bg3 border border-bg4 rounded-xl px-4 py-2 text-[10px] font-black uppercase outline-none focus:border-po min-w-[140px]"
                      >
                        <option value="">Style-Wise (All POs)</option>
                        {availablePOs.map((po, idx) => <option key={`cm-po-${po}-${idx}`} value={po}>{po}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[8px] font-black uppercase text-text3 ml-1">2. Style #</p>
                      <select 
                        value={selectedStyle}
                        onChange={e => {
                          const style = e.target.value;
                          setSelectedStyle(style);
                          setSelectedColor('');
                          setAddedColors([]);
                          
                          // Initialize fabric issues based on all colors for this style
                          if (style) {
                            const tokens = new Set<string>();
                            if (selectedPO) {
                              poProducts
                                .filter(p => p.style_num === style)
                                .map(p => p.color)
                                .filter(Boolean)
                                .forEach(c => {
                                  c.split('/').forEach(t => tokens.add(t.trim().toUpperCase()));
                                });
                            } else {
                              colorsByStyle.forEach(c => {
                                c.split('/').forEach(t => tokens.add(t.trim().toUpperCase()));
                              });
                            }
                            
                            setFabricIssues(Array.from(tokens).sort().map(t => ({
                              fabric: '',
                              gsm: '',
                              availWeight: 0,
                              issueWeight: '',
                              targetColor: t
                            })));
                          } else {
                            setFabricIssues([{ fabric: '', gsm: '', availWeight: 0, issueWeight: '', targetColor: '' }]);
                          }
                        }}
                        className="bg-bg3 border border-bg4 rounded-xl px-4 py-2 text-[10px] font-black uppercase outline-none focus:border-po min-w-[140px]"
                      >
                        <option value="">Select Style</option>
                        {styleSuggestions.map((s, idx) => <option key={`cm-style-${s}-${idx}`} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[8px] font-black uppercase text-text3 ml-1">3. Color</p>
                      <select 
                        value={selectedColor}
                        disabled={!selectedStyle}
                        onChange={e => {
                          setSelectedColor(e.target.value);
                        }}
                        className="bg-bg3 border border-bg4 rounded-xl px-4 py-2 text-[10px] font-black uppercase outline-none focus:border-po min-w-[140px] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="">Select Color</option>
                        {availableColors.map((c, idx) => <option key={`cm-color-${c}-${idx}`} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Fabric Requirement & Procurement Planner Widget */}
                {selectedStyle && (
                  <div className="bg-bg3/80 rounded-2xl p-6 border-2 border-po/40 space-y-4 shadow-xl animate-in slide-in-from-top-2 duration-300">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-bg4/60 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-po text-white rounded-xl shadow-md shrink-0">
                          <Calculator className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 text-po font-black uppercase text-[10px] tracking-widest">
                            <Sparkles className="w-3.5 h-3.5 text-po" />
                            Fabric Requirement & In-House Procurement Planner
                          </div>
                          <h3 className="text-base font-black text-text uppercase tracking-tight mt-0.5">
                            Style #{selectedStyle} {selectedColor ? `(${selectedColor})` : '(All Colors)'} {selectedPO ? `[PO: ${selectedPO}]` : '[All Active POs]'}
                          </h3>
                        </div>
                      </div>

                      {requirementSummary && (
                        <div className="flex flex-wrap items-center gap-3 bg-bg2/90 px-4 py-2.5 rounded-xl border border-bg4 shadow-inner">
                          <div className="text-center">
                            <p className="text-[8px] font-black uppercase text-text3">Order Qty</p>
                            <p className="text-xs font-black text-text">{requirementSummary.total_order_qty} pcs</p>
                          </div>
                          <div className="h-6 w-px bg-bg4" />
                          <div className="text-center">
                            <p className="text-[8px] font-black uppercase text-text3">Already Cut</p>
                            <p className="text-xs font-black text-pass">{requirementSummary.total_already_cut_qty} pcs</p>
                          </div>
                          <div className="h-6 w-px bg-bg4" />
                          <div className="text-center">
                            <p className="text-[8px] font-black uppercase text-po">Target Cut Batch</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <input 
                                type="number" 
                                value={targetCutQty} 
                                onChange={(e) => setTargetCutQty(Math.max(0, parseInt(e.target.value) || 0))} 
                                className="w-20 bg-bg3 border border-po/50 rounded px-2 py-0.5 text-xs font-black text-po text-center outline-none focus:ring-1 focus:ring-po"
                              />
                              <span className="text-[10px] font-bold text-text3">pcs</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {isSummaryLoading ? (
                      <div className="p-8 text-center text-text3 text-xs font-mono uppercase animate-pulse">
                        Calculating exact fabric requirements for Style #{selectedStyle}...
                      </div>
                    ) : !requirementSummary || requirementSummary.fabric_requirements.length === 0 ? (
                      <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-500 text-xs font-bold flex items-center justify-between">
                        <span>⚠️ No consumption rates registered for Style #{selectedStyle}. Add rates under "Consumption Rates" tab to calculate exact KG needed.</span>
                        <button onClick={() => setActiveTab('consumption')} className="underline text-[10px] uppercase font-black ml-2 hover:text-amber-400">
                          Set Rates
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="overflow-x-auto rounded-xl border border-bg4/60">
                          <table className="w-full text-left font-mono text-xs">
                            <thead>
                              <tr className="bg-bg2/90 text-[9px] uppercase font-black text-text3 border-b border-bg4/60">
                                <th className="p-3">Fabric Type</th>
                                <th className="p-3 text-center">Buyer GSM</th>
                                <th className="p-3 text-center">Consumption Rate</th>
                                <th className="p-3 text-right">Required for {targetCutQty} Pcs</th>
                                <th className="p-3 text-right">Store Stock {selectedColor ? `(${selectedColor})` : '(All Colors)'}</th>
                                <th className="p-3 text-right text-po">Net Needed to In-House</th>
                                <th className="p-3 text-center">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-bg4/40 bg-bg2/40">
                              {requirementSummary.fabric_requirements.map((req: any) => {
                                const calculatedReqKg = targetCutQty * req.expected_consumption;
                                const netNeeded = Math.max(0, calculatedReqKg - req.current_store_stock_kg);
                                return (
                                  <tr key={req.id} className="hover:bg-bg3/50 transition-colors">
                                    <td className="p-3 font-black uppercase text-text flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-po shrink-0" />
                                      {req.fabric_type}
                                    </td>
                                    <td className="p-3 text-center">
                                      {req.buyer_gsm ? (
                                        <span className="bg-po/10 text-po text-[10px] font-black px-2 py-0.5 rounded border border-po/20">
                                          {req.buyer_gsm} GSM
                                        </span>
                                      ) : (
                                        <span className="text-text3 text-[10px] font-bold">—</span>
                                      )}
                                    </td>
                                    <td className="p-3 text-center font-bold text-text2">
                                      {req.expected_consumption.toFixed(3)} <span className="text-[9px] font-normal text-text3">KG/PC</span>
                                    </td>
                                    <td className="p-3 text-right font-black text-text">
                                      {calculatedReqKg.toFixed(2)} <span className="text-[9px] font-normal text-text3">KG</span>
                                    </td>
                                    <td className="p-3 text-right font-bold text-text2">
                                      {req.current_store_stock_kg.toFixed(2)} <span className="text-[9px] font-normal text-text3">KG</span>
                                    </td>
                                    <td className="p-3 text-right font-black bg-po/5">
                                      {netNeeded > 0 ? (
                                        <span className="text-po font-black bg-po/10 px-2.5 py-1 rounded border border-po/30">
                                          {netNeeded.toFixed(2)} KG
                                        </span>
                                      ) : (
                                        <span className="text-pass font-bold">
                                          0.00 KG (Stock Covered)
                                        </span>
                                      )}
                                    </td>
                                    <td className="p-3 text-center">
                                      <button
                                        onClick={() => {
                                          setSelectedFabric(req.fabric_type);
                                          if (selectedStyle) setSelectedStyle(selectedStyle);
                                          if (selectedPO) setSelectedPO(selectedPO);
                                          if (selectedColor) setSelectedColor(selectedColor);
                                          if (req.buyer_gsm) setGsmValue(String(req.buyer_gsm));
                                          if (requirementSummary.buyers && requirementSummary.buyers.length > 0) {
                                            setInhouseBuyer(requirementSummary.buyers[0]);
                                          }
                                          setInhouseQty(netNeeded > 0 ? netNeeded.toFixed(2) : calculatedReqKg.toFixed(2));
                                          const el = document.getElementById('fabric-inhouse-form');
                                          el?.scrollIntoView({ behavior: 'smooth' });
                                        }}
                                        className="bg-pass text-white text-[9px] font-black uppercase px-3 py-1.5 rounded-lg shadow-sm hover:bg-green-600 transition-all inline-flex items-center gap-1.5"
                                      >
                                        <Plus className="w-3 h-3" />
                                        Fill In-House Form ({netNeeded > 0 ? netNeeded.toFixed(2) : calculatedReqKg.toFixed(2)} KG)
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[10px] font-mono text-text3 px-1 gap-1">
                          <span>💡 In-house precisely the net required KG to prevent store excess or shortage.</span>
                          <span className="font-bold text-po uppercase">Formula: (Target Cut Pcs × Rate) - Store Stock</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Dynamic Fabric Issue Form */}
                {selectedPO && selectedStyle && (
                  <div className="bg-bg3/50 rounded-2xl p-6 border border-bg4/50 space-y-4 animate-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-po">Fabric Issue Form</h4>
                      <button 
                        onClick={() => setFabricIssues([...fabricIssues, { fabric: '', gsm: '', availWeight: 0, issueWeight: '', targetColor: '' }])}
                        className="flex items-center gap-2 text-po bg-po/10 hover:bg-po/20 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all"
                      >
                        <PlusCircle className="w-3 h-3" />
                        + Fabric
                      </button>
                    </div>

                    <div className="space-y-3">
                      {fabricIssues.map((issue, idx) => (
                        <div key={idx} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end bg-bg2/50 p-4 rounded-xl border border-bg4/30">
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-text3 ml-1">Color Part</label>
                            <select 
                              value={issue.targetColor}
                              onChange={e => {
                                if (e.target.value === '__CHOOSE_ACTIVE_COLOR__') {
                                  setChoosingIndex(idx);
                                  setIsColorPickerOpen(true);
                                } else {
                                  updateFabricRow(idx, 'targetColor', e.target.value);
                                }
                              }}
                              className="w-full bg-po/5 border border-po/20 rounded-lg px-3 py-2 text-[10px] font-black uppercase outline-none font-sans"
                            >
                              <option value="">Select Part</option>
                              {colorPartChoices.map((p, pIdx) => (
                                <option key={`part-${p}-${pIdx}`} value={p}>{p}</option>
                              ))}
                              <option value="__CHOOSE_ACTIVE_COLOR__" className="text-po font-bold hover:bg-po/5">+ Add Other Color...</option>
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-text3 ml-1">Fabric Name</label>
                            <select 
                              value={issue.fabric}
                              disabled={!issue.targetColor}
                              onChange={e => updateFabricRow(idx, 'fabric', e.target.value)}
                              className="w-full bg-bg3 border border-bg4 rounded-lg px-3 py-2 text-[10px] font-bold outline-none"
                            >
                              <option value="">Select Fabric</option>
                              {getFabricOptionsForColor(issue.targetColor).map((f, fIdx) => (
                                <option key={`issue-fab-${f}-${fIdx}`} value={f}>{f}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="text-[9px] font-black uppercase text-text3 ml-1">GSM</label>
                              {(() => {
                                const sug = getSuggestedGsmForFabric(issue.fabric);
                                return sug ? (
                                  <span className="text-[8px] font-mono font-black text-po bg-po/10 px-1.5 py-0.5 rounded border border-po/20 flex items-center gap-1">
                                    <Sparkles className="w-2.5 h-2.5 text-po" />
                                    Rule: {sug} GSM
                                  </span>
                                ) : null;
                              })()}
                            </div>
                            <select 
                              value={issue.gsm}
                              disabled={!issue.fabric}
                              onChange={e => updateFabricRow(idx, 'gsm', e.target.value)}
                              className={cn(
                                "w-full bg-bg3 border border-bg4 rounded-lg px-3 py-2 text-[10px] font-bold outline-none transition-colors",
                                getSuggestedGsmForFabric(issue.fabric) && issue.gsm === getSuggestedGsmForFabric(issue.fabric) && "border-po/60 bg-po/5 text-po font-black"
                              )}
                            >
                              <option value="">Select GSM</option>
                              {getGsmOptionsForRow(issue.targetColor, issue.fabric).map((gsm, gIdx) => {
                                const sug = getSuggestedGsmForFabric(issue.fabric);
                                const isSug = sug && String(gsm) === String(sug);
                                return (
                                  <option key={`issue-gsm-${gsm}-${gIdx}`} value={gsm}>
                                    {gsm} {isSug ? '⭐ (Suggested Rule)' : ''}
                                  </option>
                                );
                              })}
                            </select>
                            {(() => {
                              const sug = getSuggestedGsmForFabric(issue.fabric);
                              if (sug) {
                                return (
                                  <div className="text-[8px] font-mono text-po font-black flex items-center gap-1 mt-0.5 animate-in fade-in">
                                    <Sparkles className="w-2.5 h-2.5 shrink-0" />
                                    <span>Suggested GSM: <strong>{sug}</strong></span>
                                    {currentStyleBuyer && <span className="opacity-75 font-normal">({currentStyleBuyer})</span>}
                                  </div>
                                );
                              } else if (issue.fabric) {
                                return (
                                  <div className="text-[8px] font-mono text-text3 opacity-60 mt-0.5">
                                    No rule for {currentStyleBuyer || 'buyer'} + {issue.fabric}
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-text3 ml-1">Available KG</label>
                            <div className="bg-bg3/50 border border-bg4 rounded-lg px-3 py-2 text-[10px] font-black text-pass">
                              {issue.availWeight.toFixed(2)} KG
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="space-y-1.5 flex-1">
                              <label className="text-[9px] font-black uppercase text-text3 ml-1">Issue KG</label>
                              <input 
                                type="number"
                                placeholder="0.00"
                                value={issue.issueWeight}
                                onChange={e => updateFabricRow(idx, 'issueWeight', e.target.value)}
                                className="w-full bg-bg3 border border-bg4 focus:border-po rounded-lg px-3 py-2 text-[10px] font-black outline-none"
                              />
                            </div>
                            {fabricIssues.length > 1 && (
                              <button 
                                onClick={() => setFabricIssues(fabricIssues.filter((_, i) => i !== idx))}
                                className="mb-1 p-2 text-reject hover:bg-reject/10 rounded-lg transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <button 
                      onClick={handleIssueFabricBatch}
                      disabled={isSubmitting}
                      className={cn(
                        "w-full text-white font-black py-3 rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all uppercase tracking-widest text-xs mt-4",
                        isSubmitting 
                          ? "bg-bg4 cursor-not-allowed" 
                          : "bg-po shadow-po/20 hover:bg-orange-600"
                      )}
                    >
                      {isSubmitting ? (
                        <>
                          <Activity className="w-4 h-4 animate-spin" />
                          Transacting...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Issue Selected Fabric to Floor
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                {selectedStyle && selectedColor ? (
                  <table className="w-full text-left font-mono">
                    <thead>
                      <tr className="bg-bg3/50 text-text3 border-b border-bg4 uppercase text-[10px] font-black">
                        {!selectedPO && <th className="p-4">Order # (PO)</th>}
                        {!selectedPO && <th className="p-4">Buyer</th>}
                        <th className="p-4">Style</th>
                        <th className="p-4">Color</th>
                        <th className="p-4 text-center">Size</th>
                        <th className="p-4 text-right">Order Qty</th>
                        <th className="p-4 text-right text-cyan-600 dark:text-cyan-400 bg-cyan-500/5 font-black">Shipped</th>
                        <th className="p-4 text-right bg-pass/5 text-pass pr-6">
                          <div className="flex items-center justify-end gap-1.5 min-w-[120px]">
                            <span>Order+{extraPct}%</span>
                            <select
                              value={extraPct}
                              onChange={(e) => setExtraPct(Number(e.target.value))}
                              className="bg-bg2 border border-pass/30 rounded px-1.5 py-0.5 text-[10px] font-black text-pass outline-none cursor-pointer hover:border-pass transition-all"
                            >
                              <option value={3}>3%</option>
                              <option value={4}>4%</option>
                              <option value={5}>5%</option>
                            </select>
                          </div>
                        </th>
                        <th className="p-4 text-right">Total Prog</th>
                        <th className="p-4 text-right">Prev Cut (All)</th>
                        <th className="p-4 text-right text-indigo-600 dark:text-indigo-400 bg-indigo-500/5 font-black">Net Active Cut</th>
                        <th className="p-4 text-right text-reject">Finishing Rej</th>
                        <th className="p-4 text-right text-reject">Bal to Cut</th>
                        <th className="p-4 w-36 text-center bg-po/5">
                          <div className="flex items-center justify-center gap-2">
                            <span>To Issue</span>
                            <button
                              type="button"
                              onClick={() => {
                                const newPlanned: Record<number, string> = {};
                                filteredCuttingPrograms.forEach(p => {
                                  const unshippedQty = Number(p.qty) || 0;
                                  const originalQty = Number(p.original_qty || p.qty) || 0;
                                  const prevCutAllTime = Number(p.prev_cut_qty) || 0;
                                  const totalShipped = Number(p.total_shipped) || 0;
                                  const totalRejected = Number(p.total_rejected) || 0;

                                  const activeCut = Math.max(0, prevCutAllTime - totalShipped);
                                  const orderPlusPct = Math.ceil(unshippedQty * (1 + extraPct / 100));
                                  const activeGoodCut = Math.max(0, activeCut - totalRejected);
                                  const bal = Math.max(0, orderPlusPct - activeGoodCut);

                                  const rowId = p.product_id || p.id;
                                  newPlanned[rowId] = bal.toString();
                                });
                                setPlannedQuantities(newPlanned);
                              }}
                              className="px-2 py-0.5 text-[9px] bg-po text-white rounded hover:bg-orange-600 transition-colors uppercase font-black tracking-tight"
                              title="Autofill balance quantities according to selected order percentage and net active cuts"
                            >
                              Autofill
                            </button>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-bg4">
                      {filteredCuttingPrograms.length === 0 ? (
                        <tr>
                          <td colSpan={selectedPO ? 12 : 14} className="p-10 text-center text-text3 text-[10px] font-black uppercase italic opacity-50">No cutting records found for matching Style/Color</td>
                        </tr>
                      ) : (
                        filteredCuttingPrograms.map((p) => {
                          const unshippedQty = Number(p.qty) || 0;
                          const originalQty = Number(p.original_qty || p.qty) || 0;
                          const prevCutAllTime = Number(p.prev_cut_qty) || 0;
                          const totalShipped = Number(p.total_shipped) || 0;
                          const totalRejected = Number(p.total_rejected) || 0;
                          const totalProg = Number(p.planned_qty) || 0;

                          // Net active cut pieces in house (excluding already shipped garments)
                          const activeCut = Math.max(0, prevCutAllTime - totalShipped);
                          const orderPlusPct = Math.ceil(unshippedQty * (1 + extraPct / 100));
                          const activeGoodCut = Math.max(0, activeCut - totalRejected);
                          const balanceToCut = Math.max(0, orderPlusPct - activeGoodCut);
                          const rowId = p.product_id || p.id;
                          
                          return (
                            <tr key={rowId} className="hover:bg-bg3/20 transition-all font-mono">
                              {!selectedPO && <td className="p-4 text-xs font-black text-po">{p.po_number}</td>}
                              {!selectedPO && <td className="p-4 text-xs font-bold text-text2 uppercase">{p.buyer || '—'}</td>}
                              <td className="p-4 font-black text-xs text-text border-r border-bg4/20">
                                <div>{p.style_num}</div>
                                {(() => {
                                  const currentPacked = Math.max(0, Number(p.total_accepted_packed_qty || 0) - Number(p.total_shipped || 0));
                                  return currentPacked > 0 ? (
                                    <div className="mt-1 text-[8px] leading-tight tracking-tight bg-amber-500/10 text-amber-600 font-bold px-1.5 py-0.5 rounded flex items-center gap-1 w-max font-sans animate-pulse">
                                      ⚠️ PACKED: {currentPacked} Pcs
                                    </div>
                                  ) : null;
                                })()}
                                {Number(p.total_accepted_blister_qty || 0) > 0 && (
                                  <div className="mt-1 text-[8px] leading-tight tracking-tight bg-amber-500/10 text-amber-600 font-bold px-1.5 py-0.5 rounded flex items-center gap-1 w-max font-sans">
                                    📦 Blister: {p.total_accepted_blister_qty} Pcs
                                  </div>
                                )}
                              </td>
                              <td className="p-4 text-xs font-bold">{p.color}</td>
                              <td className="p-4 text-center text-xs font-black">{p.size}</td>
                              <td className="p-4 text-right text-xs">
                                <div className="font-bold">{unshippedQty}</div>
                                {totalShipped > 0 && (
                                  <div className="text-[9px] text-text3 font-medium whitespace-nowrap" title={`Original PO Qty: ${originalQty}`}>
                                    Orig: {originalQty}
                                  </div>
                                )}
                              </td>
                              <td className="p-4 text-right text-xs font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-500/5">
                                {totalShipped}
                              </td>
                              <td className="p-4 text-right text-xs font-black text-pass bg-pass/5">{orderPlusPct}</td>
                              <td className="p-4 text-right text-xs font-black text-po">{totalProg}</td>
                              <td className="p-4 text-right text-xs font-bold text-text">
                                {prevCutAllTime}
                              </td>
                              <td className="p-4 text-right text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-500/5">
                                {activeCut}
                              </td>
                              <td className={cn("p-4 text-right text-xs font-black", totalRejected > 0 ? "text-reject bg-reject/5 animate-pulse-slow" : "text-text3")}>
                                {totalRejected > 0 ? totalRejected : '—'}
                              </td>
                              <td className="p-4 text-right text-xs font-black text-reject">{balanceToCut}</td>
                              <td className="p-4 bg-po/5">
                                <input 
                                  type="number"
                                  value={plannedQuantities[rowId] || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setPlannedQuantities(prev => ({ ...prev, [rowId]: val }));
                                  }}
                                  className={cn(
                                    "w-full bg-bg3 border rounded-lg p-2 text-xs font-black text-center outline-none transition-all",
                                    (() => {
                                      const currentPacked = Math.max(0, Number(p.total_accepted_packed_qty || 0) - Number(p.total_shipped || 0));
                                      return (currentPacked > 0 || Number(p.total_accepted_blister_qty || 0) > 0);
                                    })()
                                      ? "border-amber-500/50 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 text-amber-600 font-extrabold animate-pulse-slow"
                                      : "border-po/30 focus:border-po focus:ring-1 focus:ring-po/30"
                                  )}
                                  placeholder={(() => {
                                    const currentPacked = Math.max(0, Number(p.total_accepted_packed_qty || 0) - Number(p.total_shipped || 0));
                                    return currentPacked > 0 ? `Pkd ${currentPacked}` : "Qty";
                                  })()}
                                />
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    {filteredCuttingPrograms.length > 0 && (
                      <tfoot className="bg-bg3/30 border-t border-bg4">
                        <tr>
                          <td colSpan={selectedPO ? 11 : 13} className="p-4 text-right">
                            <p className="text-[10px] font-mono text-text3 uppercase font-bold">Planned values are incremental</p>
                          </td>
                          <td className="p-4">
                            <div className="flex flex-col gap-2">
                              <button 
                                onClick={handleSendProgram}
                                disabled={isSubmitting || (Object.values(plannedQuantities) as string[]).every(v => !v || parseInt(v) <= 0)}
                                className="w-full bg-po text-white font-black py-2.5 rounded-xl shadow-lg shadow-po/20 hover:bg-orange-600 transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-[10px] disabled:opacity-50"
                              >
                                <Send className="w-3 h-3" />
                                Send Cutting Prog
                              </button>
                              {confirmClear ? (
                                <div className="flex gap-1.5 w-full">
                                  <button
                                    onClick={handleClearProgram}
                                    disabled={isSubmitting}
                                    className="flex-1 bg-reject text-white font-black py-2 rounded-xl transition-all flex items-center justify-center gap-1 uppercase tracking-widest text-[9px] disabled:opacity-50"
                                  >
                                    Yes, Clear
                                  </button>
                                  <button
                                    onClick={() => setConfirmClear(false)}
                                    className="px-3 bg-bg3 text-text2 font-black py-2 rounded-xl border border-bg4 hover:bg-bg4 transition-all flex items-center justify-center text-[9px] uppercase tracking-widest"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button 
                                  onClick={() => setConfirmClear(true)}
                                  disabled={isSubmitting}
                                  className="w-full bg-reject/10 text-reject font-black py-2 rounded-xl border border-reject/20 hover:bg-reject hover:text-white transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-[10px] disabled:opacity-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Clear Program
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                ) : (
                  <div className="p-16 text-center">
                    <div className="p-4 bg-bg3 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4 border border-bg4">
                      <Search className="w-8 h-8 text-text3 opacity-20" />
                    </div>
                    <h4 className="text-xs font-black uppercase text-text3 tracking-widest">Style and Color Required</h4>
                    <p className="text-[10px] font-mono text-text3/50 uppercase font-bold tracking-tight mt-2">Please select Style# and Color to access Cutting Management</p>
                  </div>
                )}
              </div>
            </div>
          </div>

        <div className="lg:col-span-1 space-y-6" id="handover-sidebar">
             <HandoverList 
                title="Returns from Floor"
                table="fabric_records"
                records={selectedPO 
                  ? history.filter(r => r.record_type === 'return' && r.po_number === selectedPO)
                  : history.filter(r => r.record_type === 'return')
                }
                onRefresh={() => fetchInitialData()}
             />
             
             {!selectedPO && history.filter(r => r.record_type === 'return' && r.status === 'pending').length > 0 && (
               <div className="bg-bg2 border border-bg4 p-6 rounded-2xl text-center">
                 <Handshake className="w-8 h-8 text-orange-500/30 mx-auto mb-3" />
                 <p className="text-[10px] font-mono text-text3 uppercase tracking-widest">Select an order to filter pending returns</p>
               </div>
             )}
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="space-y-8">
          <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-6 bg-bg3 border-b border-bg4 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
              <div className="space-y-1">
                <h3 className="text-2xl font-bold uppercase tracking-tight text-text">Fabric Inventory Balance</h3>
                <p className="text-xs font-medium text-text2 uppercase tracking-wider">Summary of stock in Store and on Floor</p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                 <button
                  onClick={() => setShowReport(!showReport)}
                  className={cn(
                    "px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg active:scale-95",
                    showReport ? "bg-bg4" : "bg-po text-white shadow-po/20"
                  )}
                >
                  {showReport ? 'Hide Detailed Tables' : 'View Detailed Tables'}
                </button>
              </div>
            </div>

            {/* Summation Header on Top */}
            <div className="p-6 bg-bg3/70 border-b border-bg4 grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-bg2 border border-bg4 p-4 rounded-xl border-l-4 border-l-pass shadow-sm">
                <div className="text-[10px] font-mono uppercase tracking-wider text-text3 font-bold">Total In Store</div>
                <div className="text-xl font-black text-pass font-mono mt-1">
                  {reportSummaryTotals.totalInhouse.toFixed(2)} <span className="text-xs font-normal text-text3">KG</span>
                </div>
              </div>

              <div className="bg-bg2 border border-bg4 p-4 rounded-xl border-l-4 border-l-po shadow-sm">
                <div className="text-[10px] font-mono uppercase tracking-wider text-text3 font-bold">Cutting Issue</div>
                <div className="text-xl font-black text-po font-mono mt-1">
                  {reportSummaryTotals.totalIssued.toFixed(2)} <span className="text-xs font-normal text-text3">KG</span>
                </div>
              </div>

              <div className="bg-bg2 border border-bg4 p-4 rounded-xl border-l-4 border-l-emerald-500 shadow-sm">
                <div className="text-[10px] font-mono uppercase tracking-wider text-text3 font-bold">Balance In Store</div>
                <div className={cn("text-xl font-black font-mono mt-1", reportSummaryTotals.storeBalance <= 0 ? "text-reject" : "text-emerald-400")}>
                  {reportSummaryTotals.storeBalance.toFixed(2)} <span className="text-xs font-normal text-text3">KG</span>
                </div>
              </div>

              <div className="bg-bg2 border border-bg4 p-4 rounded-xl border-l-4 border-l-amber-500 shadow-sm">
                <div className="text-[10px] font-mono uppercase tracking-wider text-text3 font-bold">Floor Stock Balance</div>
                <div className="text-xl font-black text-amber-500 font-mono mt-1">
                  {reportSummaryTotals.floorBalance.toFixed(2)} <span className="text-xs font-normal text-text3">KG</span>
                </div>
              </div>

              <div className="bg-bg2 border border-bg4 p-4 rounded-xl border-l-4 border-l-blue-500 shadow-sm col-span-2 md:col-span-1">
                <div className="text-[10px] font-mono uppercase tracking-wider text-text3 font-bold">Weight Consumed</div>
                <div className="text-xl font-black text-blue-400 font-mono mt-1">
                  {reportSummaryTotals.totalConsumed.toFixed(2)} <span className="text-xs font-normal text-text3">KG</span>
                </div>
              </div>
            </div>

            {showReport && (
              <div className="p-6 bg-bg3/50 border-b border-bg4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  {/* Search Input */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text3 uppercase tracking-wider block">Search</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text3 w-3.5 h-3.5" />
                      <input
                        type="text"
                        placeholder="PO, Style, Fabric or Color..."
                        value={reportSearch}
                        onChange={(e) => setReportSearch(e.target.value)}
                        className="w-full bg-bg3 border border-bg4 rounded-xl py-2 pl-9 pr-4 text-xs font-black outline-none uppercase text-text focus:border-po/50 transition-colors"
                      />
                      {reportSearch && (
                        <button 
                          onClick={() => setReportSearch('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-reject hover:text-reject/80"
                        >
                          CLEAR
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Buyer Filter */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text3 uppercase tracking-wider block">Filter by Buyer</label>
                    <select
                      value={reportBuyerFilter}
                      onChange={(e) => setReportBuyerFilter(e.target.value)}
                      className="w-full bg-bg3 border border-bg4 rounded-xl py-2 px-3 text-xs font-black outline-none uppercase text-text focus:border-po/50 transition-colors"
                    >
                      {reportBuyers.map((buyer, idx) => (
                        <option key={`rep-buyer-${buyer}-${idx}`} value={buyer}>{buyer === 'ALL' ? 'ALL BUYERS' : buyer}</option>
                      ))}
                    </select>
                  </div>

                  {/* Fabric Filter */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text3 uppercase tracking-wider block">Filter by Fabric</label>
                    <select
                      value={reportFabricFilter}
                      onChange={(e) => setReportFabricFilter(e.target.value)}
                      className="w-full bg-bg3 border border-bg4 rounded-xl py-2 px-3 text-xs font-black outline-none uppercase text-text focus:border-po/50 transition-colors"
                    >
                      {reportFabrics.map((fabric, idx) => (
                        <option key={`rep-fab-${fabric}-${idx}`} value={fabric}>{fabric === 'ALL' ? 'ALL FABRICS' : fabric}</option>
                      ))}
                    </select>
                  </div>

                  {/* Color Filter */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text3 uppercase tracking-wider block">Filter by Color</label>
                    <select
                      value={reportColorFilter}
                      onChange={(e) => setReportColorFilter(e.target.value)}
                      className="w-full bg-bg3 border border-bg4 rounded-xl py-2 px-3 text-xs font-black outline-none uppercase text-text focus:border-po/50 transition-colors"
                    >
                      {reportColors.map((color, idx) => (
                        <option key={`rep-col-${color}-${idx}`} value={color}>{color}</option>
                      ))}
                    </select>
                  </div>

                  {/* GSM Filter */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-text3 uppercase tracking-wider block">Filter by GSM</label>
                    <select
                      value={reportGsmFilter}
                      onChange={(e) => setReportGsmFilter(e.target.value)}
                      className="w-full bg-bg3 border border-bg4 rounded-xl py-2 px-3 text-xs font-black outline-none uppercase text-text focus:border-po/50 transition-colors"
                    >
                      {reportGsms.map((gsm, idx) => (
                        <option key={`rep-gsm-${gsm}-${idx}`} value={gsm}>{gsm === 'ALL' ? 'ALL GSM' : `${gsm} GSM`}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Active Rules Banner & Active Filter Chips */}
                {(reportBuyerFilter !== 'ALL' || reportFabricFilter !== 'ALL' || reportColorFilter !== 'ALL' || reportGsmFilter !== 'ALL' || reportSearch) && (
                  <div className="flex flex-wrap items-center justify-between bg-po/10 border border-po/20 p-3 rounded-xl gap-2 text-xs">
                    <div className="flex items-center gap-2 flex-wrap text-text">
                      <Sliders className="w-4 h-4 text-po shrink-0" />
                      <span className="font-black text-po uppercase tracking-wider">Active Filters:</span>
                      
                      {reportBuyerFilter !== 'ALL' && (
                        <span className="bg-po text-white px-2 py-0.5 rounded font-black text-[10px] uppercase">
                          Buyer: {reportBuyerFilter}
                        </span>
                      )}
                      
                      {reportFabricFilter !== 'ALL' && (
                        <span className="bg-bg4 text-text font-black px-2 py-0.5 rounded text-[10px] uppercase">
                          Fabric: {reportFabricFilter}
                        </span>
                      )}

                      {reportColorFilter !== 'ALL' && (
                        <span className="bg-bg4 text-text font-black px-2 py-0.5 rounded text-[10px] uppercase">
                          Color: {reportColorFilter}
                        </span>
                      )}

                      {reportGsmFilter !== 'ALL' && (
                        <span className="bg-bg4 text-text font-black px-2 py-0.5 rounded text-[10px] uppercase">
                          GSM: {reportGsmFilter}
                        </span>
                      )}

                      {reportSearch && (
                        <span className="bg-bg4 text-text font-black px-2 py-0.5 rounded text-[10px] uppercase">
                          Query: "{reportSearch}"
                        </span>
                      )}

                      {reportBuyerFilter !== 'ALL' && (
                        <div className="ml-2 text-[11px] font-bold text-text2">
                          (GSM Rules Configured for {reportBuyerFilter}: {
                            gsmRules
                              .filter(r => r.buyer.trim().toUpperCase() === reportBuyerFilter.trim().toUpperCase())
                              .map(r => `${r.fabric_type} ${r.gsm} GSM`)
                              .join(', ') || 'None'
                          })
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        setReportBuyerFilter('ALL');
                        setReportFabricFilter('ALL');
                        setReportColorFilter('ALL');
                        setReportGsmFilter('ALL');
                        setReportSearch('');
                      }}
                      className="text-[10px] font-black text-reject hover:underline uppercase tracking-widest"
                    >
                      Reset All Filters
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-bg3 text-text border-b border-bg4">
                    <th className="p-4 font-black text-[11px] uppercase tracking-widest border-r border-bg4 text-center">#</th>
                    <th className="p-4 font-black text-[11px] uppercase tracking-widest border-r border-bg4">PO / Style / Fabric Setup</th>
                    <th className="p-4 font-black text-[11px] uppercase tracking-widest text-right border-r border-bg4 bg-bg3/30">In Store</th>
                    <th className="p-4 font-black text-[11px] uppercase tracking-widest text-right border-r border-bg4 bg-bg3/30">Cutting Issue</th>
                    <th className="p-4 font-black text-[11px] uppercase tracking-widest text-right border-r border-bg4 bg-bg3/30">Balance In Store</th>
                    <th className="p-4 font-black text-[11px] uppercase tracking-widest text-right border-r border-bg4 bg-bg3/30">Weight Cons by Cutting</th>
                    <th className="p-4 font-black text-[11px] uppercase tracking-widest text-right border-r border-bg4">Expected Cons</th>
                    <th className="p-4 font-black text-[11px] uppercase tracking-widest text-right">Actual Cons</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-bg4">
                  {consumptionStats.map((stat: any, i) => {
                    const expectedCons = stat.planned_program > 0 ? (stat.total_issued / stat.planned_program).toFixed(3) : '0.000';
                    const actualCons = stat.planned_program > 0 ? (stat.total_consumed / stat.planned_program).toFixed(3) : '0.000';
                    
                    const isTargetStyle = stat.display_style?.includes('1215') || stat.display_po?.includes('1215');
                    const rowKey = `${i}-${stat.display_po}-${stat.display_style}-${stat.color}-${stat.fabric_name}-${stat.gsm}`;

                    const configuredRate = consumptionRates.find(r => {
                      const searchStyle = r.style_num.toUpperCase();
                      const statStyle = (stat.display_style || '').toUpperCase();
                      const statFabric = (stat.fabric_name || '').toUpperCase();
                      return (statStyle.includes(searchStyle) || searchStyle.includes(statStyle)) && 
                             (r.fabric_type.toUpperCase() === statFabric);
                    });

                    const expectedValue = configuredRate ? configuredRate.expected_consumption : parseFloat(expectedCons);
                    const actualValue = parseFloat(actualCons);
                    const hasConfigured = !!configuredRate;
                    const isOverConsumed = hasConfigured && actualValue > expectedValue && actualValue > 0;
                    
                    return (
                      <tr key={rowKey} className={cn(
                        "hover:bg-bg3 transition-colors text-sm border-b-2 border-bg4 last:border-0",
                        isTargetStyle ? "bg-bg3 border-l-4 border-l-po font-black" : ""
                      )}>
                        <td className="p-4 border-r border-bg4 text-center font-black text-text3">{i + 1}</td>
                        <td className="p-4 border-r border-bg4">
                          <div className={cn("text-text mb-1", isTargetStyle ? "text-lg font-black" : "font-black text-sm")}>{stat.display_po}</div>
                          <div className={cn("text-text mb-2", isTargetStyle ? "text-base font-black" : "text-xs font-bold")}>{stat.display_style}</div>
                          <div className="flex flex-col gap-1">
                            <div className={cn(
                              "text-xs font-black uppercase tracking-tight px-2 py-0.5 rounded inline-block w-fit",
                              isTargetStyle ? "bg-po text-white" : "bg-bg4/50 text-text2"
                            )}>
                              {stat.fabric_name} • {stat.gsm} GSM
                            </div>
                            <div className="text-xs font-black text-text uppercase tracking-widest">{stat.color}</div>
                          </div>
                        </td>
                        <td className="p-4 border-r border-bg4 text-right font-black text-text text-base whitespace-nowrap bg-bg3/10">
                          {stat.total_inhouse.toFixed(2)} <span className="text-[10px] text-text3">KG</span>
                        </td>
                        <td className="p-4 border-r border-bg4 text-right font-black text-text text-base whitespace-nowrap bg-bg3/10">
                          {stat.total_issued.toFixed(2)} <span className="text-[10px] text-text3">KG</span>
                        </td>
                        <td className={cn(
                          "p-4 border-r border-bg4 text-right font-black text-base whitespace-nowrap",
                          stat.store_balance <= 0 ? "text-reject bg-reject/5" : "text-pass bg-pass/5"
                        )}>
                          {stat.store_balance.toFixed(2)} <span className="text-[10px] opacity-60">KG</span>
                        </td>
                        <td className="p-4 border-r border-bg4 text-right font-black text-text text-base whitespace-nowrap bg-bg3/10">
                          {stat.total_consumed.toFixed(2)} <span className="text-[10px] text-text3">KG</span>
                        </td>
                        <td className="p-4 border-r border-bg4 text-right">
                          <div className="font-black text-text text-sm">
                            {expectedValue.toFixed(3)}
                          </div>
                          {hasConfigured ? (
                            <div className="text-[8px] font-mono text-pass uppercase tracking-widest font-bold">Configured</div>
                          ) : (
                            <div className="text-[8px] font-mono text-text3 uppercase tracking-widest font-medium">Avg (kg/pcs)</div>
                          )}
                        </td>
                        <td className={cn(
                          "p-4 text-right font-black text-sm",
                          isOverConsumed ? "text-reject bg-reject/5 animate-pulse-slow font-black" : "text-text"
                        )}>
                          <div>{actualValue.toFixed(3)}</div>
                          {isOverConsumed && (
                            <div className="text-[8px] font-mono text-reject uppercase tracking-widest font-black">EXCEEDS TARGET ⚠️</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-bg3 border-t-2 border-bg4 font-black text-sm text-text">
                    <td colSpan={2} className="p-4 border-r border-bg4 text-right uppercase tracking-wider text-xs">
                      Filtered Sum Total ({consumptionStats.length} Item Groups):
                    </td>
                    <td className="p-4 border-r border-bg4 text-right text-pass">
                      {reportSummaryTotals.totalInhouse.toFixed(2)} <span className="text-[10px] text-text3 font-mono">KG</span>
                    </td>
                    <td className="p-4 border-r border-bg4 text-right text-po">
                      {reportSummaryTotals.totalIssued.toFixed(2)} <span className="text-[10px] text-text3 font-mono">KG</span>
                    </td>
                    <td className={cn(
                      "p-4 border-r border-bg4 text-right font-black text-base",
                      reportSummaryTotals.storeBalance <= 0 ? "text-reject" : "text-emerald-400"
                    )}>
                      {reportSummaryTotals.storeBalance.toFixed(2)} <span className="text-[10px] opacity-60 font-mono">KG</span>
                    </td>
                    <td className="p-4 border-r border-bg4 text-right text-blue-400">
                      {reportSummaryTotals.totalConsumed.toFixed(2)} <span className="text-[10px] text-text3 font-mono">KG</span>
                    </td>
                    <td colSpan={2} className="p-4 text-right text-xs text-text3 uppercase font-mono">
                      Floor Bal: {reportSummaryTotals.floorBalance.toFixed(2)} KG
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
             <div className="p-6 bg-bg3/30 border-b border-bg4 flex items-center justify-between">
                <h3 className="font-black uppercase tracking-tight text-text1">Transaction Log</h3>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text3 w-3 h-3" />
                  <input
                    type="text"
                    placeholder="Search Log..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="bg-bg3 border border-bg4 rounded-lg py-1 pl-8 pr-3 text-[10px] font-bold outline-none uppercase"
                  />
                </div>
             </div>
             <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-bg3 text-text2 border-b border-bg4">
                       <th className="p-4 font-bold uppercase tracking-tight">Date</th>
                       <th className="p-4 font-bold uppercase tracking-tight">Batch/Roll</th>
                       <th className="p-4 font-bold uppercase tracking-tight">Style #</th>
                       <th className="p-4 font-bold uppercase tracking-tight">Fabric / GSM</th>
                       <th className="p-4 font-bold uppercase tracking-tight">Type</th>
                       <th className="p-4 font-bold uppercase tracking-tight">Order #</th>
                       <th className="p-4 font-bold uppercase tracking-tight">Color</th>
                       <th className="p-4 font-bold uppercase tracking-tight text-center">Status</th>
                       <th className="p-4 font-bold uppercase tracking-tight text-right">Qty (KG)</th>
                       <th className="p-4 font-bold uppercase tracking-tight text-right px-6">Recorder</th>
                       <th className="p-4 font-bold uppercase tracking-tight text-center w-[60px]">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bg4">
                    {pivotedHistory.map((rec) => (
                      <tr key={rec.id} className="hover:bg-bg3/50 group transition-colors">
                        <td className="p-4 font-medium text-text2">{fmtDate(rec.created_at)}</td>
                        <td className="p-4 font-bold text-text">{rec.batch_id || '-'}</td>
                        <td className="p-4 font-bold text-text">{rec.style_num || '-'}</td>
                        <td className="p-4 font-medium text-text2 uppercase">
                          {rec.fabric_name || '-'} / {rec.gsm || '-'}
                        </td>
                        <td className="p-4">
                           <span className={cn(
                             "px-2 py-0.5 rounded-[4px] font-bold uppercase text-[10px]",
                             rec.record_type === 'inhouse' ? "bg-pass/10 text-pass" : 
                             rec.record_type === 'issue' ? "bg-po/10 text-po" : 
                             rec.record_type === 'return' ? "bg-reject/10 text-reject" : 
                             rec.record_type === 'consumption' ? "bg-amber-500/10 text-amber-500 font-extrabold" :
                             "bg-bg4 text-text2"
                           )}>{rec.record_type}</span>
                        </td>
                        <td className="p-4 font-bold text-text">{rec.po_number}</td>
                        <td className="p-4 uppercase font-medium text-text2">{rec.color || '-'}</td>
                        <td className="p-4">
                          {rec.record_type === 'issue' ? (
                            <div className="flex justify-center">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                rec.status === 'accepted' ? "bg-pass/10 text-pass" :
                                rec.status === 'rejected' ? "bg-reject/10 text-reject" : "bg-bg4 text-text2 animate-pulse"
                              )}>
                                {rec.status}
                              </span>
                            </div>
                          ) : (
                            <div className="text-center text-text3 opacity-20 font-bold">-</div>
                          )}
                        </td>
                        <td className={cn(
                          "p-4 text-right font-bold",
                          rec.record_type === 'inhouse' ? "text-pass" :
                          rec.record_type === 'issue' ? "text-po" : 
                          rec.record_type === 'consumption' ? "text-amber-500 font-extrabold" : "text-reject"
                        )}>
                          {rec.quantity_kg.toFixed(3)}
                        </td>
                        <td className="p-4 text-right px-6 text-text2 font-medium">
                          {rec.recorder_name}
                        </td>
                        <td className="p-4 text-center">
                          <button 
                            onClick={() => handleDeleteRecord(rec.id)} 
                            className="p-1 text-reject hover:bg-reject/10 rounded-lg transition-colors group-hover:opacity-100 opacity-0"
                            title="Delete entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'types' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Create Component Form */}
            <div className="bg-bg2 border border-bg4 rounded-3xl overflow-hidden shadow-xl self-start">
              <div className="p-6 border-b border-bg4 bg-po/5">
                <h3 className="font-black uppercase tracking-tight flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-po" />
                  Add Fabric Type
                </h3>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest">Fabric Type Name</label>
                  <input
                    type="text"
                    placeholder="e.g. S.Jersey, Fleece, Rib..."
                    value={newFabricName}
                    onChange={e => setNewFabricName(e.target.value)}
                    className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold outline-none"
                  />
                </div>
                <button
                  onClick={handleAddFabricType}
                  className="w-full bg-po text-white font-black py-3 rounded-xl shadow-lg hover:bg-opacity-95 transition-all text-xs uppercase tracking-widest"
                >
                  Create Fabric Type
                </button>
              </div>
            </div>

            {/* List and Management */}
            <div className="md:col-span-2 bg-bg2 border border-bg4 rounded-3xl overflow-hidden shadow-xl">
              <div className="p-6 border-b border-bg4 bg-bg3 flex items-center justify-between">
                <h3 className="font-black uppercase tracking-tight flex items-center gap-2">
                  <History className="w-5 h-5 text-text3" />
                  System Fabric Types
                </h3>
                <span className="text-xs font-mono font-black text-text3 bg-bg4 px-2.5 py-1 rounded-full uppercase">
                  {fabricTypes.length} Types
                </span>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-bg4 bg-bg3 text-text3">
                      <th className="p-4 font-black text-[11px] uppercase tracking-widest text-center w-16">ID</th>
                      <th className="p-4 font-black text-[11px] uppercase tracking-widest">Fabric Type Name</th>
                      <th className="p-4 font-black text-[11px] uppercase tracking-widest text-right px-6">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bg4">
                    {fabricTypes.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-12 text-center text-text3 font-medium">
                          No fabric types found. Check your database connection.
                        </td>
                      </tr>
                    ) : (
                      fabricTypes.map((type, idx) => (
                        <tr key={type.id || idx} className="hover:bg-bg3/50 transition-all">
                          <td className="p-4 text-center font-mono text-xs text-text3">{idx + 1}</td>
                          <td className="p-4">
                            {editingFabricId === type.id ? (
                              <input
                                type="text"
                                value={editingFabricName}
                                onChange={e => setEditingFabricName(e.target.value)}
                                className="bg-bg3 border border-po rounded-lg px-3 py-1.5 text-sm font-bold outline-none uppercase w-full max-w-sm"
                                autoFocus
                              />
                            ) : (
                              <span className="font-black text-sm text-text uppercase tracking-wider">{type.name}</span>
                            )}
                          </td>
                          <td className="p-4 text-right px-6">
                            <div className="flex items-center justify-end gap-2">
                              {editingFabricId === type.id ? (
                                <>
                                  <button
                                    onClick={() => handleUpdateFabricType(type.id)}
                                    className="bg-pass text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-green-600 transition-all shadow-sm"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingFabricId(null);
                                      setEditingFabricName('');
                                    }}
                                    className="bg-bg4 text-text2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-opacity-85 transition-all"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingFabricId(type.id);
                                      setEditingFabricName(type.name);
                                    }}
                                    className="border border-bg4 text-text2 hover:text-po hover:border-po/30 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteFabricType(type.id)}
                                    className="border border-reject/30 text-reject hover:bg-reject/10 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Create GSM Rule Form */}
            <div className="bg-bg2 border border-bg4 rounded-3xl overflow-hidden shadow-xl self-start">
              <div className="p-6 border-b border-bg4 bg-po/5">
                <h3 className="font-black uppercase tracking-tight flex items-center gap-2 text-po">
                  <Sliders className="w-5 h-5" />
                  Add GSM Rule
                </h3>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest">Buyer</label>
                  <input
                    type="text"
                    list="rules-buyer-list"
                    placeholder="e.g. BADGER"
                    value={newRuleBuyer}
                    onChange={e => setNewRuleBuyer(e.target.value)}
                    className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold outline-none uppercase"
                  />
                  <datalist id="rules-buyer-list">
                    {knownBuyers.map((b, idx) => <option key={`rule-b-${b}-${idx}`} value={b} />)}
                  </datalist>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest">Fabric Type</label>
                  <select
                    value={newRuleFabric}
                    onChange={e => setNewRuleFabric(e.target.value)}
                    className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold outline-none"
                  >
                    <option value="">Select Fabric Type</option>
                    {fabricTypes.map((ft, idx) => (
                      <option key={`rule-ft-${ft.id}-${idx}`} value={ft.name}>{ft.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest">Default GSM</label>
                  <input
                    type="number"
                    placeholder="e.g. 315"
                    value={newRuleGsm}
                    onChange={e => setNewRuleGsm(e.target.value)}
                    className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold outline-none"
                  />
                </div>

                <button
                  onClick={handleAddRule}
                  disabled={isSubmitting}
                  className="w-full bg-po text-white font-black py-3 rounded-xl shadow-lg hover:bg-opacity-95 transition-all text-xs uppercase tracking-widest disabled:opacity-55"
                >
                  {isSubmitting ? 'Adding...' : 'Create GSM Rule'}
                </button>
              </div>
            </div>

            {/* List and Management */}
            <div className="md:col-span-2 bg-bg2 border border-bg4 rounded-3xl overflow-hidden shadow-xl">
              <div className="p-6 border-b border-bg4 bg-bg3 flex items-center justify-between">
                <h3 className="font-black uppercase tracking-tight flex items-center gap-2">
                  <Activity className="w-5 h-5 text-text3" />
                  Buyer GSM Rules
                </h3>
                <span className="text-xs font-mono font-black text-text3 bg-bg4 px-2.5 py-1 rounded-full uppercase">
                  {gsmRules.length} Rules
                </span>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-bg4 bg-bg3 text-text3">
                      <th className="p-4 font-black text-[11px] uppercase tracking-widest text-center w-16">ID</th>
                      <th className="p-4 font-black text-[11px] uppercase tracking-widest">Buyer</th>
                      <th className="p-4 font-black text-[11px] uppercase tracking-widest">Fabric Type</th>
                      <th className="p-4 font-black text-[11px] uppercase tracking-widest text-center">GSM</th>
                      <th className="p-4 font-black text-[11px] uppercase tracking-widest text-right px-6">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bg4">
                    {gsmRules.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-12 text-center text-text3 font-medium">
                          No buyer GSM rules configured yet. Setup rules to automate GSM selection during fabric in-house!
                        </td>
                      </tr>
                    ) : (
                      gsmRules.map((rule, idx) => (
                        <tr key={rule.id || idx} className="hover:bg-bg3/50 transition-all">
                          <td className="p-4 text-center font-mono text-xs text-text3">{idx + 1}</td>
                          <td className="p-4 font-black text-sm text-text uppercase tracking-wider">{rule.buyer}</td>
                          <td className="p-4 text-sm font-semibold text-text2 uppercase">{rule.fabric_type}</td>
                          <td className="p-4 text-center font-mono font-bold text-sm text-pass">{rule.gsm}</td>
                          <td className="p-4 text-right px-6">
                            <button
                              onClick={() => handleDeleteRule(rule.id)}
                              disabled={isSubmitting}
                              className="border border-reject/30 text-reject hover:bg-reject/10 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-55"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'consumption' && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Header & Excel Actions Banner */}
          <div className="bg-bg2 border border-bg4 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-2.5 bg-po/10 text-po rounded-2xl border border-po/20">
                  <Calculator className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight text-text">
                    Style Consumption Rate Manager
                  </h3>
                  <p className="text-xs text-text3 font-mono uppercase font-bold tracking-wider mt-0.5">
                    Dual-Rate Architecture: Greige Rate & Ready-to-Cut Rate (with Loss % Shrinkage Adjustment)
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <button
                type="button"
                onClick={handleDownloadExcelSample}
                className="flex-1 md:flex-initial px-4 py-2.5 bg-bg3 border border-bg4 hover:bg-bg4 text-text font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4 text-po" />
                Download Excel Template
              </button>

              <label className="flex-1 md:flex-initial px-4 py-2.5 bg-po text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-po/20 hover:bg-orange-600 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98">
                <Upload className="w-4 h-4" />
                <span>Bulk Excel Upload</span>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleExcelFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Manual Form with Live Rate Preview */}
            <div className="bg-bg2 border border-bg4 rounded-3xl p-6 shadow-xl h-fit space-y-6">
              <div>
                <h4 className="text-base font-black uppercase tracking-tight flex items-center gap-2 text-text">
                  <Sliders className="w-5 h-5 text-po" />
                  Manual Entry / Edit
                </h4>
                <p className="text-[10px] font-mono text-text3 uppercase font-bold tracking-wider mt-1">
                  Enter Greige Rate & Loss % to auto-calculate Ready-to-Cut rate.
                </p>
              </div>

              <form onSubmit={handleAddConsumptionRate} className="space-y-4">
                <div>
                  <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest block mb-1.5 font-bold">Style #</label>
                  <input
                    type="text"
                    list="consumption-styles-list"
                    placeholder="e.g. 5500, 1215"
                    value={newRateStyle}
                    onChange={e => setNewRateStyle(e.target.value.toUpperCase())}
                    className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold outline-none uppercase text-text focus:border-po transition-all"
                    required
                  />
                  <datalist id="consumption-styles-list">
                    {[...new Set([
                      ...pos.map(p => p.style_num),
                      ...allCuttingPrograms.map(p => p.style_num),
                      ...history.map(p => p.style_num).filter(Boolean)
                    ])].sort().map((style, idx) => (
                      <option key={`rate-style-opt-${style}-${idx}`} value={style} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest block mb-1.5 font-bold">Fabric Type</label>
                  <select
                    value={newRateFabric}
                    onChange={e => setNewRateFabric(e.target.value)}
                    className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold outline-none uppercase text-text focus:border-po transition-all"
                    required
                  >
                    <option value="">-- SELECT FABRIC TYPE --</option>
                    {fabricTypes.map((type, idx) => (
                      <option key={`rate-ft-select-${type.id}-${idx}`} value={type.name}>{type.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest block mb-1.5 font-bold">Greige Rate (KG/PC)</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="0.862"
                      value={newRateGreige}
                      onChange={e => {
                        const val = e.target.value;
                        setNewRateGreige(val);
                        if (val && !isNaN(parseFloat(val))) {
                          const loss = parseFloat(newRateLossPct) || 0;
                          const calculatedExpected = (parseFloat(val) * (1 - loss / 100)).toFixed(3);
                          setNewRateExpected(calculatedExpected);
                        }
                      }}
                      className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold outline-none text-text focus:border-po transition-all font-mono"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest font-bold">Process Loss %</label>
                      <div className="flex gap-1">
                        {[10, 13, 15].map(pct => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => {
                              setNewRateLossPct(pct.toString());
                              if (newRateGreige && !isNaN(parseFloat(newRateGreige))) {
                                const calculatedExpected = (parseFloat(newRateGreige) * (1 - pct / 100)).toFixed(3);
                                setNewRateExpected(calculatedExpected);
                              }
                            }}
                            className={cn(
                              "px-1.5 py-0.5 text-[9px] font-mono font-bold rounded transition-all",
                              newRateLossPct === pct.toString() ? "bg-po text-white" : "bg-bg3 text-text3 hover:text-text"
                            )}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="50"
                      placeholder="13"
                      value={newRateLossPct}
                      onChange={e => {
                        const loss = e.target.value;
                        setNewRateLossPct(loss);
                        if (newRateGreige && !isNaN(parseFloat(newRateGreige))) {
                          const lossNum = parseFloat(loss) || 0;
                          const calculatedExpected = (parseFloat(newRateGreige) * (1 - lossNum / 100)).toFixed(3);
                          setNewRateExpected(calculatedExpected);
                        }
                      }}
                      className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold outline-none text-text focus:border-po transition-all font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-text3 uppercase pl-1 tracking-widest block mb-1.5 font-bold">
                    Ready-to-Cut Rate (KG/PC)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    placeholder="0.750"
                    value={newRateExpected}
                    onChange={e => setNewRateExpected(e.target.value)}
                    className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold outline-none text-pass focus:border-pass transition-all font-mono bg-pass/5"
                  />
                </div>

                {/* Live Side-by-Side Calculation Preview Card */}
                {parseFloat(newRateGreige) > 0 && (
                  <div className="bg-bg3/60 border border-po/30 rounded-2xl p-4 space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between text-xs font-mono font-black uppercase text-po">
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5" />
                        Live Calculation Preview
                      </span>
                      <span className="bg-po/10 text-po px-2 py-0.5 rounded text-[10px]">
                        Loss: {newRateLossPct || '0'}%
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="bg-bg2 p-3 rounded-xl border border-bg4">
                        <div className="text-[9px] font-mono text-text3 uppercase font-bold">Greige (Raw) Rate</div>
                        <div className="text-base font-black text-text font-mono mt-0.5">
                          {parseFloat(newRateGreige || '0').toFixed(3)} <span className="text-[10px] text-text3 font-normal">KG/PC</span>
                        </div>
                      </div>

                      <div className="bg-pass/10 p-3 rounded-xl border border-pass/30">
                        <div className="text-[9px] font-mono text-pass uppercase font-bold">Ready-to-Cut Rate</div>
                        <div className="text-base font-black text-pass font-mono mt-0.5">
                          {(parseFloat(newRateExpected) || 0).toFixed(3)} <span className="text-[10px] opacity-70 font-normal">KG/PC</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-po text-white font-black py-3.5 rounded-xl shadow-lg shadow-po/20 hover:bg-opacity-95 transition-all text-xs uppercase tracking-widest disabled:opacity-55 active:scale-98"
                >
                  {isSubmitting ? 'Saving...' : 'Set Consumption Rate'}
                </button>
              </form>
            </div>

            {/* List and Management */}
            <div className="lg:col-span-2 bg-bg2 border border-bg4 rounded-3xl overflow-hidden shadow-xl flex flex-col">
              {/* Table Header & Search */}
              <div className="p-6 border-b border-bg4 bg-bg3 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Droplets className="w-5 h-5 text-po" />
                  <h3 className="font-black uppercase tracking-tight text-text">
                    Configured Consumption Rates
                  </h3>
                  <span className="text-xs font-mono font-black text-text3 bg-bg4 px-2.5 py-1 rounded-full uppercase">
                    {consumptionRates.length} Entries
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {/* Select All / Deselect All Button */}
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedRateIds.length === consumptionRates.length) {
                        setSelectedRateIds([]);
                      } else {
                        setSelectedRateIds(consumptionRates.map(r => r.id));
                      }
                    }}
                    className="px-3 py-1.5 bg-bg2 border border-bg4 hover:bg-bg4 text-text2 font-mono text-[10px] font-black uppercase rounded-xl transition-all"
                  >
                    {selectedRateIds.length === consumptionRates.length && consumptionRates.length > 0 ? 'Deselect All' : 'Select All Styles'}
                  </button>

                  <div className="relative min-w-[180px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text3" />
                    <input
                      type="text"
                      placeholder="Search style or fabric..."
                      value={consumptionSearch}
                      onChange={e => setConsumptionSearch(e.target.value)}
                      className="w-full bg-bg2 border border-bg4 rounded-xl py-1.5 pl-9 pr-3 text-xs font-bold outline-none uppercase"
                    />
                  </div>
                </div>
              </div>

              {/* Bulk Loss % Adjustment Floating Action Bar */}
              {selectedRateIds.length > 0 && (
                <div className="p-4 bg-po/10 border-b border-po/30 animate-in fade-in slide-in-from-top-2 duration-200 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="bg-po text-white text-xs font-mono font-black px-2.5 py-1 rounded-lg uppercase shadow-md shadow-po/20 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" />
                      {selectedRateIds.length} Rate(s) Selected
                    </span>
                    <span className="text-xs font-mono text-text3 font-bold hidden sm:inline">
                      Change Loss % for selected styles:
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1">
                      {[0, 5, 10, 12, 13, 15, 18, 20].map(pct => (
                        <button
                          key={`batch-pct-${pct}`}
                          type="button"
                          onClick={() => {
                            setBatchLossPctInput(pct.toString());
                            handleApplyBatchLossPct(pct);
                          }}
                          disabled={isUpdatingLossPct}
                          className={cn(
                            "px-2 py-1 text-[10px] font-mono font-black rounded-md transition-all",
                            batchLossPctInput === pct.toString() ? "bg-po text-white" : "bg-bg2 border border-bg4 text-text hover:bg-bg4"
                          )}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="50"
                        value={batchLossPctInput}
                        onChange={e => setBatchLossPctInput(e.target.value)}
                        className="w-16 bg-bg2 border border-po/40 rounded-lg p-1 text-center text-xs font-mono font-black text-text outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleApplyBatchLossPct()}
                        disabled={isUpdatingLossPct}
                        className="px-4 py-1.5 bg-po hover:bg-orange-600 text-white font-mono font-black text-xs uppercase rounded-lg shadow-md shadow-po/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {isUpdatingLossPct ? 'Updating...' : 'Update Selected'}
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedRateIds([])}
                        className="px-2.5 py-1.5 text-text3 hover:text-text font-mono text-[10px] font-bold uppercase rounded-lg hover:bg-bg4 transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto flex-1">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-bg4 bg-bg3/50 text-text3 font-mono text-[10px] uppercase">
                      <th className="p-4 text-center w-10">
                        {(() => {
                          const filtered = consumptionRates.filter(r => {
                            if (!consumptionSearch) return true;
                            const q = consumptionSearch.toUpperCase();
                            return r.style_num.toUpperCase().includes(q) || r.fabric_type.toUpperCase().includes(q);
                          });
                          const isAllFilteredSelected = filtered.length > 0 && filtered.every(r => selectedRateIds.includes(r.id));
                          return (
                            <input
                              type="checkbox"
                              checked={isAllFilteredSelected}
                              onChange={() => handleToggleSelectAllRates(filtered)}
                              className="rounded border-bg4 text-po focus:ring-po accent-po w-4 h-4 cursor-pointer"
                              title="Select / Deselect All Filtered"
                            />
                          );
                        })()}
                      </th>
                      <th className="p-4 font-black">Style #</th>
                      <th className="p-4 font-black">Fabric Type</th>
                      <th className="p-4 font-black text-right">Greige Rate</th>
                      <th className="p-4 font-black text-center">Loss %</th>
                      <th className="p-4 font-black text-right text-pass">Ready-to-Cut Rate</th>
                      <th className="p-4 font-black text-right px-6">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bg4">
                    {(() => {
                      const filtered = consumptionRates.filter(r => {
                        if (!consumptionSearch) return true;
                        const q = consumptionSearch.toUpperCase();
                        return r.style_num.toUpperCase().includes(q) || r.fabric_type.toUpperCase().includes(q);
                      });

                      if (filtered.length === 0) {
                        return (
                          <tr>
                            <td colSpan={8} className="p-12 text-center text-text3 font-medium uppercase text-xs font-mono tracking-wider">
                              No matching consumption rates found. Upload Excel or use the form to set style consumption rates!
                            </td>
                          </tr>
                        );
                      }

                      return filtered.map((rate, idx) => {
                        const greige = rate.greige_consumption || rate.expected_consumption;
                        const lossPct = rate.process_loss_pct || 0;
                        const readyToCut = rate.expected_consumption;
                        const isSelected = selectedRateIds.includes(rate.id);

                        return (
                          <tr 
                            key={rate.id || idx} 
                            className={cn(
                              "transition-all font-mono",
                              isSelected ? "bg-po/10 hover:bg-po/15" : "hover:bg-bg3/50"
                            )}
                          >
                            <td className="p-4 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelectRate(rate.id)}
                                className="rounded border-bg4 text-po focus:ring-po accent-po w-4 h-4 cursor-pointer"
                              />
                            </td>
                            <td className="p-4">
                              <button
                                type="button"
                                onClick={() => handleSelectByStyle(rate.style_num)}
                                className="font-black text-sm text-text uppercase tracking-wider hover:text-po transition-colors flex items-center gap-1 group text-left"
                                title="Click to select/deselect all rates for this style"
                              >
                                <span>{rate.style_num}</span>
                                <span className="text-[9px] text-text3 opacity-0 group-hover:opacity-100 transition-opacity font-normal">
                                  (Select Style)
                                </span>
                              </button>
                            </td>
                            <td className="p-4 text-xs font-bold text-text2 uppercase">{rate.fabric_type}</td>
                            <td className="p-4 text-right font-bold text-xs text-text">
                              {greige.toFixed(3)} <span className="text-[9px] text-text3">KG/PC</span>
                            </td>
                            <td className="p-4 text-center">
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-bold transition-all",
                                isSelected ? "bg-po text-white font-black" : "bg-bg4 text-text2"
                              )}>
                                {lossPct}%
                              </span>
                            </td>
                            <td className="p-4 text-right font-black text-sm text-pass bg-pass/5">
                              {readyToCut.toFixed(3)} <span className="text-[9px] opacity-70">KG/PC</span>
                            </td>
                            <td className="p-4 text-right px-6">
                              <button
                                onClick={() => handleDeleteConsumptionRate(rate.id)}
                                disabled={isSubmitting}
                                className="border border-reject/30 text-reject hover:bg-reject/10 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-55"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'stock-report' && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <FabricRequirementStockReportTable onFillInhouseForm={handleFillInhouseFromReport} />
        </div>
      )}

      {/* Bulk Excel Upload Preview Modal */}
      {bulkExcelModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-bg2 border border-bg4 w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-bg4 bg-po/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-po text-white rounded-2xl">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black uppercase text-base tracking-wide text-text">
                    Bulk Excel Consumption Import
                  </h3>
                  <p className="text-[10px] font-mono text-text3 uppercase font-black tracking-wider mt-0.5">
                    Found {bulkParsedRates.length} consumption rate entries ready for import
                  </p>
                </div>
              </div>

              <button 
                onClick={() => {
                  setBulkExcelModalOpen(false);
                  setBulkParsedRates([]);
                }}
                className="text-text3 hover:text-reject hover:bg-reject/10 p-2 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 border-b border-bg4 bg-bg3/30 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-black text-text3 uppercase tracking-wider">Apply Global Loss %:</span>
                <div className="flex gap-1.5">
                  {[10, 12, 13, 15, 18].map(pct => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => handleApplyGlobalLossToBulkModal(pct)}
                      className={cn(
                        "px-2.5 py-1 text-xs font-mono font-black rounded-lg transition-all",
                        globalLossPct === pct ? "bg-po text-white shadow-md shadow-po/20" : "bg-bg3 border border-bg4 text-text2 hover:text-text"
                      )}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-xs font-mono text-text3">
                Raw Greige Rate x (1 - Loss %) = Ready-to-Cut Rate
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-6">
              <table className="w-full border-collapse text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-bg4 bg-bg3 text-text3 text-[10px] uppercase">
                    <th className="p-3 text-center w-12">#</th>
                    <th className="p-3">Style #</th>
                    <th className="p-3">Fabric Type</th>
                    <th className="p-3 text-right">Greige Rate (KG/PC)</th>
                    <th className="p-3 text-center">Loss %</th>
                    <th className="p-3 text-right text-pass">Ready-to-Cut Rate (KG/PC)</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg4">
                  {bulkParsedRates.map((row, idx) => (
                    <tr key={`bulk-row-${idx}`} className="hover:bg-bg3/50 transition-all">
                      <td className="p-3 text-center text-text3">{idx + 1}</td>
                      <td className="p-3 font-black text-text uppercase">{row.style_num}</td>
                      <td className="p-3 font-bold text-text2 uppercase">{row.fabric_type}</td>
                      <td className="p-3 text-right font-bold text-text">{row.greige_consumption.toFixed(3)}</td>
                      <td className="p-3 text-center">
                        <span className="bg-bg4 px-2 py-0.5 rounded font-bold text-text2">{row.process_loss_pct}%</span>
                      </td>
                      <td className="p-3 text-right font-black text-pass bg-pass/5">{row.expected_consumption.toFixed(3)}</td>
                      <td className="p-3 text-center">
                        {row.status === 'OK' ? (
                          <span className="bg-pass/10 text-pass text-[9px] font-black uppercase px-2 py-0.5 rounded inline-flex items-center gap-1">
                            <Check className="w-3 h-3" /> Ready
                          </span>
                        ) : (
                          <span className="bg-amber-500/10 text-amber-500 text-[9px] font-black uppercase px-2 py-0.5 rounded inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> New Fabric
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-6 border-t border-bg4 bg-bg3/30 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setBulkExcelModalOpen(false);
                  setBulkParsedRates([]);
                }}
                className="px-5 py-2.5 border border-bg4 bg-bg3 hover:bg-bg4 text-text font-black text-xs uppercase tracking-wider rounded-xl transition-all"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmBulkSave}
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-po text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-po/20 hover:bg-orange-600 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? 'Importing...' : `Import ${bulkParsedRates.length} Consumption Rates`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Color picker overlay modal */}
      {isColorPickerOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-bg2 border border-bg4 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-bg4 bg-po/5 flex items-center justify-between">
              <div>
                <h3 className="font-sans font-black uppercase text-sm tracking-wide text-text">Choose Color Part</h3>
                <p className="text-[10px] font-mono text-text3 uppercase font-black tracking-wider mt-0.5">Select a color to include in the list</p>
              </div>
              <button 
                onClick={() => {
                  setIsColorPickerOpen(false);
                  setChoosingIndex(null);
                  setColorSearchQuery('');
                }}
                className="text-text3 hover:text-reject hover:bg-reject/10 p-2 rounded-xl transition-all"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text3" />
                <input 
                  type="text" 
                  placeholder="Search existing active colors..."
                  value={colorSearchQuery}
                  onChange={e => setColorSearchQuery(e.target.value)}
                  className="w-full bg-bg3 border border-bg4 rounded-xl py-2.5 pl-11 pr-6 text-xs font-bold outline-none focus:ring-1 focus:ring-po/30 transition-all font-sans uppercase"
                />
              </div>

              <div className="max-h-60 overflow-y-auto border border-bg4/60 rounded-xl p-3 bg-bg3/30">
                {filteredSelectableColors.length === 0 ? (
                  <div className="p-8 text-center text-text3 text-xs font-bold uppercase tracking-wider">
                    {selectableActiveColors.length === 0 ? 'No other active colors in system' : 'No matching colors found'}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {filteredSelectableColors.map(c => (
                      <button
                        key={c}
                        onClick={() => {
                          const uppercaseColor = c.toUpperCase();
                          if (!addedColors.includes(uppercaseColor)) {
                            setAddedColors(prev => [...prev, uppercaseColor]);
                          }
                          if (choosingIndex !== null) {
                            updateFabricRow(choosingIndex, 'targetColor', uppercaseColor);
                          }
                          setIsColorPickerOpen(false);
                          setChoosingIndex(null);
                          setColorSearchQuery('');
                        }}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-bg2 hover:bg-po/5 hover:border-po/30 border border-bg4 text-left transition-all group"
                      >
                        <span className="text-[10px] font-black uppercase text-text2 group-hover:text-po transition-colors">{c}</span>
                        <PlusCircle className="w-4 h-4 text-text3 group-hover:text-po opacity-0 group-hover:opacity-100 transition-all" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-bg4/50 pt-4 flex items-center gap-2">
                <input 
                  type="text" 
                  placeholder="Or enter completely new color..."
                  id="custom-new-color-input"
                  className="flex-1 bg-bg3 border border-bg4 rounded-xl px-4 py-2 text-xs font-bold uppercase outline-none focus:border-po"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const val = (e.currentTarget.value || '').trim().toUpperCase();
                      if (val) {
                        if (!addedColors.includes(val)) {
                          setAddedColors(prev => [...prev, val]);
                        }
                        if (choosingIndex !== null) {
                          updateFabricRow(choosingIndex, 'targetColor', val);
                        }
                        setIsColorPickerOpen(false);
                        setChoosingIndex(null);
                        setColorSearchQuery('');
                      }
                    }
                  }}
                />
                <button
                  onClick={() => {
                    const el = document.getElementById('custom-new-color-input') as HTMLInputElement;
                    const val = (el?.value || '').trim().toUpperCase();
                    if (val) {
                      if (!addedColors.includes(val)) {
                        setAddedColors(prev => [...prev, val]);
                      }
                      if (choosingIndex !== null) {
                        updateFabricRow(choosingIndex, 'targetColor', val);
                      }
                      setIsColorPickerOpen(false);
                      setChoosingIndex(null);
                      setColorSearchQuery('');
                    }
                  }}
                  className="bg-po text-white text-[10px] font-black uppercase tracking-wider px-4 py-2 rounded-xl hover:bg-opacity-90 transition-all cursor-pointer whitespace-nowrap"
                >
                  Add Custom
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
