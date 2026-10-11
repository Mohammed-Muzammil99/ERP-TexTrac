import React, { useState, useEffect, useMemo } from "react";
import {
  cuttingService,
  poService,
  fabricService,
  permissionRequestService,
} from "../services/erpService";
import { ProductionOrder, POProduct } from "../types";
import {
  Scissors,
  Plus,
  Search,
  History,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Edit2,
  Trash2,
  Package,
  RotateCcw,
} from "lucide-react";
import { cn, fmtDate, compareSizes } from "../lib/utils";
import { motion } from "motion/react";
import { HandoverList } from "../components/HandoverList";
import { ReturnModal } from "../components/ReturnModal";
import { DiscardModal } from "../components/DiscardModal";
import { ReturnsHandoverList } from "../components/ReturnsHandoverList";
import { ChangeRecordPOButton } from "../components/ChangeRecordPOButton";

export const CuttingPage: React.FC = () => {
  const [pos, setPos] = useState<ProductionOrder[]>([]);
  const [selectedPONum, setSelectedPONum] = useState("");
  const [products, setProducts] = useState<POProduct[]>([]);
  const [cuttingPrograms, setCuttingPrograms] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [showCompleted, setShowCompleted] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // Style and Color Mix Mode State
  const [entryMode, setEntryMode] = useState<"style_color" | "single_po">("style_color");
  const [mixStyle, setMixStyle] = useState("");
  const [mixColor, setMixColor] = useState("");
  const [checkedPOs, setCheckedPOs] = useState<Record<string, boolean>>({});
  const [allActiveProducts, setAllActiveProducts] = useState<any[]>([]);
  const [mixQuantities, setMixQuantities] = useState<Record<string, string>>({});
  const [allCuttingPrograms, setAllCuttingPrograms] = useState<any[]>([]);

  // Return Modal State
  const [returnProduct, setReturnProduct] = useState<any>(null);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);

  // Discard Modal State
  const [discardProduct, setDiscardProduct] = useState<any>(null);
  const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false);

  // Explicit/Custom color state from Fabric Page
  const [explicitlyAddedColors, setExplicitlyAddedColors] = useState<string[]>([]);
  const [showExplicitColorsModal, setShowExplicitColorsModal] = useState(false);
  const [foundExplicitColors, setFoundExplicitColors] = useState<string[]>([]);
  const [pendingStyleForExplicit, setPendingStyleForExplicit] = useState<string>('');

  const getExplicitColorsForStyle = (styleName: string, poNumber?: string) => {
    if (!styleName) return [];
    
    let styleProds = allActiveProducts.filter(
      (p) => p.style_num?.toUpperCase().trim() === styleName.toUpperCase().trim()
    );
    if (poNumber) {
      styleProds = styleProds.filter(
        (p) => p.po_number?.toUpperCase().trim() === poNumber.toUpperCase().trim()
      );
    }
    
    const standardColorTokens = new Set<string>();
    styleProds.forEach((p) => {
      if (p.color) {
        p.color.split("/").forEach((c) => standardColorTokens.add(c.toUpperCase().trim()));
      }
    });
    
    let issuedRecords = incomingFabric.filter(
      (f) =>
        f.style_num?.toUpperCase().trim() === styleName.toUpperCase().trim() &&
        f.record_type === "issue"
    );
    if (poNumber) {
      issuedRecords = issuedRecords.filter(
        (f) => f.po_number?.toUpperCase().trim() === poNumber.toUpperCase().trim()
      );
    }
    
    const issuedColorTokens = new Set<string>();
    issuedRecords.forEach((f) => {
      if (f.color) {
        f.color.split("/").forEach((c) => issuedColorTokens.add(c.toUpperCase().trim()));
      }
    });
    
    const explicitColors = Array.from(issuedColorTokens).filter(
      (c) => !standardColorTokens.has(c)
    );
    return explicitColors;
  };

  const checkForExplicitColors = (style: string, poNum?: string) => {
    if (!style || style === "All") return;
    
    const explicitColors = getExplicitColorsForStyle(style, poNum);
    if (explicitColors.length > 0) {
      setFoundExplicitColors(explicitColors);
      setPendingStyleForExplicit(style);
      setShowExplicitColorsModal(true);
    }
  };

  const [bypassFabricCheck, setBypassFabricCheck] = useState(false);

  // Filters
  const [filterStyle, setFilterStyle] = useState("All");
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [filterSize, setFilterSize] = useState("All");

  const [colorWeights, setColorWeights] = useState<Record<string, string>>({});
  const [lastCalculated, setLastCalculated] = useState<any[]>([]);
  const [latestReport, setLatestReport] = useState<any | null>(null);
  const [consumptionStats, setConsumptionStats] = useState<any[]>([]);
  const [incomingFabric, setIncomingFabric] = useState<any[]>([]);
  const [fabricRecords, setFabricRecords] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [historyDateRange, setHistoryDateRange] = useState({
    start: new Date().toISOString().split("T")[0],
    end: new Date().toISOString().split("T")[0],
  });
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Fabric Consumption Correction Request Modal State
  const [correctionTarget, setCorrectionTarget] = useState<any | null>(null);
  const [correctionNewWeight, setCorrectionNewWeight] = useState<string>("");
  const [correctionReason, setCorrectionReason] = useState<string>("");
  const [isSubmittingCorrection, setIsSubmittingCorrection] = useState(false);

  const handleUpdate = async (id: number) => {
    try {
      const qty = parseInt(editValue) || 0;
      if (qty <= 0) return;
      await cuttingService.update(id, { quantity: qty });
      setEditingId(null);
      await fetchHistory();
      if (selectedPONum) await handlePOChange(selectedPONum);
    } catch (error: any) {
      alert(error.message);
    }
  };
  const [fabricBalances, setFabricBalances] = useState<Record<string, number>>(
    {},
  );
  const [styleFabrics, setStyleFabrics] = useState<
    Record<string, { name: string; gsm: number; isPending?: boolean }[]>
  >({});

  const fetchFabricBalances = async (poNum: string) => {
    try {
      const records = await fabricService.list();
      const balances: Record<string, number> = {};
      const sf: Record<
        string,
        { name: string; gsm: number; isPending?: boolean }[]
      > = {};

      const normalizedPoNum = poNum.trim().toUpperCase();

      records.forEach((r) => {
        const rPo = (r.po_number || "").trim().toUpperCase();
        if (rPo !== normalizedPoNum) return;

        const style = (r.style_num || "").trim();
        const color = (r.color || "Universal").trim().toUpperCase();
        const fabricName = (r.fabric_name || "Standard").trim().toUpperCase();
        const gsm = r.gsm || 0;
        const balanceKey = `${color}|${fabricName}|${gsm}`;

        if (!balances[balanceKey]) balances[balanceKey] = 0;

        if (r.record_type === "issue") {
          if (r.status === "accepted") {
            balances[balanceKey] += r.quantity_kg;
          }

          if (style && r.fabric_name) {
            const styleKey = `${style}-${color}`;
            if (!sf[styleKey]) sf[styleKey] = [];

            const existing = sf[styleKey].find(
              (f) =>
                f.name.toUpperCase() === fabricName && (f.gsm || 0) === gsm,
            );
            if (!existing) {
              sf[styleKey].push({
                name: r.fabric_name,
                gsm: gsm,
                isPending: r.status === "pending",
              });
            } else if (r.status === "pending") {
              existing.isPending = true;
            }
          }
        } else if (r.record_type === "return" && r.status !== "rejected") {
          balances[balanceKey] -= r.quantity_kg;
        } else if (r.record_type === "consumption") {
          balances[balanceKey] -= r.quantity_kg;
        }
      });

      setFabricBalances(balances);
      setStyleFabrics(sf);
    } catch (error) {
      console.error("Failed to fetch fabric balances:", error);
    }
  };

  const getIndividualColors = (colors: string[]) => {
    const individual = new Set<string>();
    colors.forEach((c) => {
      if (c === "All") return;
      c.split("/").forEach((part) => {
        const trimmed = part.trim();
        if (trimmed) individual.add(trimmed);
      });
    });
    return Array.from(individual);
  };

  const weightColors = getIndividualColors(
    selectedColor ? [selectedColor] : [],
  );

  const [activeTab, setActiveTab] = useState<"entry" | "reports">("entry");
  const [expandedColors, setExpandedColors] = useState<string[]>([]);
  const [reportSearch, setReportSearch] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 1))
      .toISOString()
      .split("T")[0], // Last 24 hours
    end: new Date().toISOString().split("T")[0],
  });
  const [fabricReportDateRange, setFabricReportDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 30))
      .toISOString()
      .split("T")[0], // Last 30 days default for fabric report
    end: new Date().toISOString().split("T")[0],
  });
  const [fabricReportSearch, setFabricReportSearch] = useState("");
  const [expandedFabricRows, setExpandedFabricRows] = useState<string[]>([]);
  const [consumptionRates, setConsumptionRates] = useState<any[]>([]);

  const REPORT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"];

  const getDisplaySizeLabel = (sz: string) => {
    const upper = sz.toUpperCase();
    if (upper === "XS") return "xs";
    if (upper === "S") return "s";
    if (upper === "M") return "m";
    if (upper === "L") return "L";
    if (upper === "XL") return "xl";
    if (upper === "2XL") return "2xl";
    if (upper === "3XL") return "3xl";
    if (upper === "4XL") return "4xl";
    return sz.toLowerCase();
  };

  const getExpectedConsForGroup = (styleNum: string, matches: any[], groupPo?: string) => {
    if (!styleNum) return null;
    const cleanStyle = styleNum.trim().toUpperCase();

    // 1. Try to find unique fabric names from the provided matches
    let uniqueFabrics: string[] = [];
    if (matches && matches.length > 0) {
      uniqueFabrics = Array.from(new Set(matches.map(m => (m.fabric_name || '').trim().toUpperCase()).filter(Boolean)));
    }

    // 2. If no matches or fabric names, try to find any fabric records for this PO and style
    if (uniqueFabrics.length === 0 && groupPo) {
      const cleanPo = groupPo.trim().toUpperCase();
      const poStyleRecords = fabricRecords.filter(f => 
        String(f.style_num || '').trim().toUpperCase() === cleanStyle &&
        String(f.po_number || '').trim().toUpperCase() === cleanPo
      );
      if (poStyleRecords.length > 0) {
        uniqueFabrics = Array.from(new Set(poStyleRecords.map(m => (m.fabric_name || '').trim().toUpperCase()).filter(Boolean)));
      }
    }

    // 3. Match against the style rates using fabric names
    if (uniqueFabrics.length > 0) {
      for (const fn of uniqueFabrics) {
        const rate = consumptionRates.find(r => {
          const searchStyle = r.style_num.trim().toUpperCase();
          const rateFabric = r.fabric_type.trim().toUpperCase();
          return (cleanStyle.includes(searchStyle) || searchStyle.includes(cleanStyle)) && 
                 (rateFabric === fn);
        });
        if (rate) return rate.expected_consumption;
      }
    }

    // 4. Fallback: find any rate configured for this style
    const styleRates = consumptionRates.filter(r => {
      const searchStyle = r.style_num.trim().toUpperCase();
      return cleanStyle.includes(searchStyle) || searchStyle.includes(cleanStyle);
    });

    if (styleRates.length > 0) {
      // If we have multiple, see if we can match on any fabric type mentioned in any fabric records of this style
      if (styleRates.length > 1) {
        const styleRecords = fabricRecords.filter(f => 
          String(f.style_num || '').trim().toUpperCase() === cleanStyle
        );
        const styleFabrics = Array.from(new Set(styleRecords.map(m => (m.fabric_name || '').trim().toUpperCase()).filter(Boolean)));
        for (const sf of styleFabrics) {
          const rate = styleRates.find(r => r.fabric_type.trim().toUpperCase() === sf);
          if (rate) return rate.expected_consumption;
        }
      }
      // Ultimate fallback: first rate configured for this style
      return styleRates[0].expected_consumption;
    }

    return null;
  };

  useEffect(() => {
    if (activeTab === "reports") {
      fetchStats();
      fetchIncomingFabric();
      fetchConsumptionRates();
    }
  }, [activeTab]);

  const combinations = useMemo(() => {
    if (!showReport) return [];

    // Filter history by date range
    const filteredHistory = history.filter((h) => {
      const hDate = h.created_at.split("T")[0];
      return hDate >= dateRange.start && hDate <= dateRange.end;
    });

    const styleColors: Record<string, string[]> = {};
    filteredHistory.forEach((h) => {
      if (!styleColors[h.style_num]) styleColors[h.style_num] = [];
      if (!styleColors[h.style_num].includes(h.color))
        styleColors[h.style_num].push(h.color);
    });

    const result: any[] = [];
    Object.entries(styleColors).forEach(([styleNum, colors]) => {
      colors.forEach((productColor) => {
        const components = productColor
          .split("/")
          .map((s) => s.trim().toUpperCase());
        // Filter consumption stats relevant to the filtered history context
        const relevantStats = consumptionStats.filter(
          (s) =>
            (s.style_num || "").toUpperCase() === styleNum.toUpperCase() &&
            components.includes((s.color || "").trim().toUpperCase()),
        );

        if (relevantStats.length > 0) {
          const totalWeight = relevantStats.reduce(
            (sum, s) => sum + Number(s.total_kg || 0),
            0,
          );
          const totalPcs = Math.max(
            ...relevantStats.map((s) => Number(s.total_qty || 0)),
          );
          const totalPlanned = Math.max(
            ...relevantStats.map((s) => Number(s.total_planned || 0)),
          );
          const totalIssued = relevantStats.reduce(
            (sum, s) => sum + Number(s.total_issued || 0),
            0,
          );

          const actualCons =
            totalPcs > 0 ? (totalWeight / totalPcs).toFixed(3) : "0.000";
          const expectedCons =
            totalPlanned > 0
              ? (totalIssued / totalPlanned).toFixed(3)
              : "0.000";

          result.push({
            combinationId: `${styleNum}-${productColor}`,
            colorCombination: productColor,
            styleNum,
            totalWeight,
            totalPcs,
            actualCons,
            expectedCons,
            components: relevantStats,
          });
        }
      });
    });

    if (!reportSearch) return result;

    const search = reportSearch.toLowerCase();
    return result.filter(
      (c) =>
        c.styleNum.toLowerCase().includes(search) ||
        c.colorCombination.toLowerCase().includes(search),
    );
  }, [history, consumptionStats, reportSearch, showReport, dateRange]);

  const individualColorStats = useMemo(() => {
    if (!showReport) return [];

    const colorGroups: Record<string, any[]> = {};
    consumptionStats.forEach((stat) => {
      const color = stat.color.trim().toUpperCase();
      if (!colorGroups[color]) colorGroups[color] = [];
      colorGroups[color].push(stat);
    });

    const result = Object.entries(colorGroups).map(([color, stats]) => {
      const totalKg = stats.reduce((sum, s) => sum + Number(s.total_kg), 0);
      const totalPcs = stats.reduce((sum, s) => sum + Number(s.total_qty), 0);
      const totalPlanned = stats.reduce(
        (sum, s) => sum + Number(s.total_planned || 0),
        0,
      );
      const totalIssued = stats.reduce(
        (sum, s) => sum + Number(s.total_issued || 0),
        0,
      );

      const actualCons =
        totalPcs > 0 ? (totalKg / totalPcs).toFixed(3) : "0.000";
      const expectedCons =
        totalPlanned > 0 ? (totalIssued / totalPlanned).toFixed(3) : "0.000";

      return {
        color,
        originalColorName: stats[0].color.trim(),
        stats,
        totalKg,
        totalPcs,
        actualCons,
        expectedCons,
      };
    });

    if (!reportSearch) return result;
    const search = reportSearch.toLowerCase();
    return result.filter(
      (r) =>
        r.color.toLowerCase().includes(search) ||
        r.stats.some((s: any) => s.style_num.toLowerCase().includes(search)),
    );
  }, [consumptionStats, showReport, reportSearch]);

  const pivotedHistory = useMemo(() => {
    // 1. Group records by Date, PO, Style, Color, Creator
    const groups: Record<string, any> = {};
    const allSizes = new Set<string>();

    // Filter history by date range
    const filteredHistory = history.filter((h) => {
      const hDate = h.created_at.split("T")[0];
      return hDate >= dateRange.start && hDate <= dateRange.end;
    });

    filteredHistory.forEach((rec) => {
      const date = rec.created_at.split("T")[0];
      const key = `${date}-${rec.po_number}-${rec.style_num}-${rec.color}-${rec.creator_name || "System"}-${rec.buyer || ""}`;

      const search = historySearch.toLowerCase();
      const matchesSearch =
        !historySearch ||
        rec.po_number.toLowerCase().includes(search) ||
        rec.style_num.toLowerCase().includes(search) ||
        rec.color.toLowerCase().includes(search) ||
        (rec.buyer && rec.buyer.toLowerCase().includes(search)) ||
        (rec.creator_name && rec.creator_name.toLowerCase().includes(search));

      if (matchesSearch) {
        if (!groups[key]) {
          groups[key] = {
            date: rec.created_at,
            po_number: rec.po_number,
            style_num: rec.style_num,
            color: rec.color,
            buyer: rec.buyer || "",
            creator_name: rec.creator_name || "System",
            sizes: {},
          };
        }

        groups[key].sizes[rec.size] =
          (groups[key].sizes[rec.size] || 0) + rec.quantity;
        allSizes.add(rec.size);
      }
    });

    // 2. Sort sizes ...
    const order = [
      "XXS",
      "XS",
      "S",
      "M",
      "L",
      "XL",
      "XXL",
      "2XL",
      "3XL",
      "4XL",
    ];
    const sortedSizes = Array.from(allSizes).sort((a, b) => {
      const indexA = order.indexOf(a.toUpperCase());
      const indexB = order.indexOf(b.toUpperCase());
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return a.localeCompare(b);
    });

    return {
      rows: Object.values(groups).sort(
        (a: any, b: any) =>
          new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
      sizes: sortedSizes,
    };
  }, [history, dateRange, historySearch]);

  const individualFabricConsReport = useMemo(() => {
    if (!showReport) return [];

    const filteredHistory = history.filter(h => {
      const hDate = h.created_at ? h.created_at.substring(0, 10) : '';
      return hDate >= fabricReportDateRange.start && hDate <= fabricReportDateRange.end;
    });

    // Build lookup of standard garment colors per style
    const standardColorsByStyle: Record<string, Set<string>> = {};
    const registerColorToken = (style?: string, colorStr?: string) => {
      const s = String(style || '').trim().toUpperCase();
      if (!s) return;
      if (!standardColorsByStyle[s]) standardColorsByStyle[s] = new Set();
      if (colorStr) {
        colorStr.split(/[\/\+,]/).forEach(c => {
          const t = c.trim().toUpperCase();
          if (t) standardColorsByStyle[s].add(t);
        });
      }
    };
    allActiveProducts.forEach(p => registerColorToken(p.style_num, p.color));
    history.forEach(h => registerColorToken(h.style_num, h.color));

    const cutGroups: Record<string, {
      date: string;
      created_at: string;
      po_number: string;
      style_num: string;
      color: string;
      total_pcs: number;
      sizes: Record<string, number>;
    }> = {};

    filteredHistory.forEach(rec => {
      const datePart = rec.created_at ? rec.created_at.substring(0, 10) : '';
      const fullTime = rec.created_at || '';
      const key = `${fullTime}_${rec.po_number.trim().toUpperCase()}_${String(rec.style_num).trim().toUpperCase()}_${String(rec.color).trim().toUpperCase()}`;
      if (!cutGroups[key]) {
        cutGroups[key] = {
          date: datePart,
          created_at: fullTime,
          po_number: rec.po_number,
          style_num: rec.style_num,
          color: rec.color,
          total_pcs: 0,
          sizes: {}
        };
      }
      cutGroups[key].total_pcs += Number(rec.quantity || 0);
      const sz = String(rec.size || '').trim().toUpperCase();
      if (sz) {
        cutGroups[key].sizes[sz] = (cutGroups[key].sizes[sz] || 0) + Number(rec.quantity || 0);
      }
    });

    const list = Object.values(cutGroups).map((group: any) => {
      const gStyle = String(group.style_num || '').trim().toUpperCase();
      const gPo = String(group.po_number || '').trim().toUpperCase();
      const gColor = String(group.color || '').trim().toUpperCase();
      const gColors = gColor.split(/[\/\+,]/).map(c => c.trim()).filter(Boolean);
      const styleStandardColors = standardColorsByStyle[gStyle] || new Set();

      const matches = fabricRecords.filter(f => {
        const typeMatch = f.record_type === 'consumption';
        if (!typeMatch) return false;

        const fPo = String(f.po_number || '').trim().toUpperCase();
        const fStyle = String(f.style_num || '').trim().toUpperCase();
        const fColor = String(f.color || '').trim().toUpperCase();

        // 1. PO and Style matching
        const poMatch = !fPo || fPo === 'UNIVERSAL' || !gPo || gPo === 'UNIVERSAL' || fPo === gPo;
        const styleMatch = !fStyle || fStyle === 'GENERAL' || !gStyle || gStyle === 'GENERAL' || fStyle === gStyle;
        if (!poMatch || !styleMatch) return false;

        // 2. Date / Timing matching
        const isSameTransaction = Boolean(f.created_at && group.created_at && f.created_at === group.created_at);
        const isSameDate = Boolean(f.created_at && f.created_at.substring(0, 10) === group.date);
        
        if (!isSameTransaction && !isSameDate) return false;

        // If this fabric record has an exact timestamp matching a DIFFERENT cutting group on the same date/po/style
        // that matches fColor, prevent it from attaching to this group
        if (!isSameTransaction && f.created_at) {
          const matchingOtherGroupWithSameTs = Object.values(cutGroups).some(otherG => {
            if (otherG === group || otherG.created_at !== f.created_at) return false;
            const otherGColor = String(otherG.color || '').trim().toUpperCase();
            if (fColor === otherGColor) return true;
            const otherGColors = otherGColor.split(/[\/\+,]/).map(c => c.trim()).filter(Boolean);
            return otherGColors.some(gc => gc === fColor);
          });
          if (matchingOtherGroupWithSameTs) {
            return false;
          }
        }

        // 3. Strict Color Matching
        // A) Exact color match (e.g. BLACK === BLACK)
        if (fColor === gColor) return true;

        // B) Multi-color combo split components (e.g. BLACK in BLACK/WHITE or NAVY in NAVY/WHITE)
        const fColors = fColor.split(/[\/\+,]/).map(c => c.trim()).filter(Boolean);
        const hasMutualComponent = gColors.some(gc => fColors.includes(gc)) || fColors.some(fc => gColors.includes(fc));
        if (hasMutualComponent) return true;

        // C) Universal color match
        if (!fColor || fColor === 'UNIVERSAL' || gColor === 'UNIVERSAL') return true;

        // D) Custom / Extra Color Fabric (e.g. trim / contrast rib / custom fabric added via "Add Custom Color"):
        // If fColor is NOT one of the style's standard garment colors (e.g. GOLD trim on style 1252 whose garment colors are BLACK and WHITE),
        // and was consumed in this exact transaction or on this date when no other group claims it:
        const isStandardGarmentColor = styleStandardColors.has(fColor);
        if (!isStandardGarmentColor) {
          if (isSameTransaction) {
            return true;
          }
          const otherGroupsOnSameDate = Object.values(cutGroups).filter(otherG => {
            return otherG !== group &&
                   otherG.date === group.date &&
                   String(otherG.po_number).trim().toUpperCase() === gPo &&
                   String(otherG.style_num).trim().toUpperCase() === gStyle;
          });
          const otherGroupMatchesCustom = otherGroupsOnSameDate.some(otherG => {
            const oc = String(otherG.color || '').trim().toUpperCase();
            return oc === fColor || oc.split(/[\/\+,]/).some(c => c.trim() === fColor);
          });
          if (!otherGroupMatchesCustom) {
            return true;
          }
        }

        // Standard colors (e.g. WHITE vs BLACK) are strictly isolated and will never bleed across
        return false;
      });

      const fabricType = matches.length > 0 
        ? matches.map(m => `${m.fabric_name || 'Standard'}${m.gsm ? ` (${m.gsm} GSM)` : ''}`).join(', ')
        : 'N/A';
      
      const weightUsed = matches.reduce((sum, m) => sum + Number(m.quantity_kg || 0), 0);
      const actualCons = group.total_pcs > 0 ? (weightUsed / group.total_pcs) : 0;

      return {
        ...group,
        fabricType,
        weightUsed,
        actualCons,
        matches
      };
    }).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (!fabricReportSearch) return list;
    const search = fabricReportSearch.toLowerCase();
    return list.filter(item => 
      (item.po_number || '').toLowerCase().includes(search) ||
      (item.style_num || '').toLowerCase().includes(search) ||
      (item.color || '').toLowerCase().includes(search) ||
      (item.fabricType || '').toLowerCase().includes(search)
    );
  }, [history, fabricRecords, fabricReportDateRange, fabricReportSearch, showReport, consumptionRates, allActiveProducts]);

  const fetchConsumptionRates = async () => {
    try {
      const data = await fabricService.getConsumptionRates().catch(() => []);
      setConsumptionRates(data || []);
    } catch (error) {
      console.error("Failed to fetch consumption rates:", error);
    }
  };

  useEffect(() => {
    fetchPOs();
    fetchHistory();
    fetchStats();
    fetchIncomingFabric();
    fetchConsumptionRates();
  }, []);

  const fetchStats = async (style?: string) => {
    try {
      const data = await cuttingService.getConsumptionStats(
        style === "All" ? undefined : style,
      );
      setConsumptionStats(data);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  };

  const fetchPOs = async () => {
    try {
      const data = await cuttingService.getActivePOs();
      const priorityOrder: Record<string, number> = {
        Urgent: 0,
        Normal: 1,
        Low: 2,
      };
      const sorted = [...data].sort(
        (a, b) =>
          (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1),
      );
      setPos(sorted);
    } catch (error: any) {
      console.error("Failed to fetch POs:", error);
    }
  };

  const fetchHistory = async () => {
    try {
      const data = await cuttingService.list();
      setHistory(data);
    } catch (error: any) {
      console.error("Failed to fetch cutting history:", error);
    }
  };

  const fetchIncomingFabric = async () => {
    try {
      const data = await fabricService.list();
      setFabricRecords(data || []);
      // Filter only 'issue' records for Cutting handover
      setIncomingFabric(data.filter((r) => r.record_type === "issue"));
    } catch (error) {
      console.error("Failed to fetch incoming fabric:", error);
    }
  };

  const fetchAllActiveProducts = async () => {
    try {
      const activePOs = pos.filter((po) => po.status === "Active");
      const progData = await cuttingService.getAllCuttingPrograms();
      setAllCuttingPrograms(progData);

      const results = await Promise.all(
        activePOs.map(async (po) => {
          try {
            const res = await cuttingService.getPOProducts(po.po_number);
            return res.products.map((p) => ({
              ...p,
              po_number: po.po_number,
              priority: po.priority,
            }));
          } catch (e) {
            console.error(e);
            return [];
          }
        })
      );
      setAllActiveProducts(results.flat());
    } catch (err) {
      console.error("Failed to load active products:", err);
    }
  };

  useEffect(() => {
    if (pos.length > 0) {
      fetchAllActiveProducts();
    }
  }, [pos]);

  const availableMixStyles = useMemo(() => {
    const styles = allActiveProducts
      .filter((p) => allCuttingPrograms.some((cp) => cp.product_id === p.id))
      .map((p) => p.style_num);
    return Array.from(new Set(styles)).sort();
  }, [allActiveProducts, allCuttingPrograms]);

  const availableMixColors = useMemo(() => {
    if (!mixStyle) return [];
    const colors = allActiveProducts
      .filter((p) => p.style_num === mixStyle)
      .filter((p) => allCuttingPrograms.some((cp) => cp.product_id === p.id))
      .map((p) => p.color);

    // Also include any explicitly added/issued colors from fabric page
    const issuedColors = incomingFabric
      .filter(
        (f) =>
          f.style_num?.toUpperCase().trim() === mixStyle.toUpperCase().trim() &&
          f.record_type === "issue"
      )
      .map((f) => f.color);

    return Array.from(new Set([...colors, ...issuedColors])).sort();
  }, [allActiveProducts, allCuttingPrograms, mixStyle, incomingFabric]);

  const matchingPOs = useMemo(() => {
    if (!mixStyle || !mixColor) return [];
    const poNums = allActiveProducts
      .filter(
        (p) =>
          p.style_num === mixStyle &&
          p.color === mixColor &&
          allCuttingPrograms.some((cp) => cp.product_id === p.id)
      )
      .map((p) => p.po_number);
    const uniquePOs = Array.from(new Set(poNums));
    return pos.filter((po) => uniquePOs.includes(po.po_number));
  }, [allActiveProducts, allCuttingPrograms, mixStyle, mixColor, pos]);

  useEffect(() => {
    const initialChecked: Record<string, boolean> = {};
    matchingPOs.forEach((po) => {
      initialChecked[po.po_number] = true;
    });
    setCheckedPOs(initialChecked);
    setMixQuantities({});
  }, [matchingPOs]);

  const mixProducts = useMemo(() => {
    if (!mixStyle || !mixColor) return [];
    return allActiveProducts.filter(
      (p) =>
        p.style_num === mixStyle &&
        p.color === mixColor &&
        checkedPOs[p.po_number] &&
        allCuttingPrograms.some((cp) => cp.product_id === p.id)
    );
  }, [allActiveProducts, mixStyle, mixColor, checkedPOs, allCuttingPrograms]);

  const mixUniqueSizes = useMemo(() => {
    const sizes = mixProducts.map((p) => p.size);
    return Array.from(new Set(sizes)).sort(compareSizes);
  }, [mixProducts]);

  const fetchFabricBalancesForPOs = async (poNums: string[]) => {
    try {
      const records = await fabricService.list();
      const balances: Record<string, number> = {};
      const sf: Record<
        string,
        { name: string; gsm: number; isPending?: boolean }[]
      > = {};

      const normalizedPoNums = poNums.map((po) => po.trim().toUpperCase());

      records.forEach((r) => {
        const rPo = (r.po_number || "").trim().toUpperCase();
        if (!normalizedPoNums.includes(rPo)) return;

        const style = (r.style_num || "").trim();
        const color = (r.color || "Universal").trim().toUpperCase();
        const fabricName = (r.fabric_name || "Standard").trim().toUpperCase();
        const gsm = r.gsm || 0;
        const balanceKey = `${color}|${fabricName}|${gsm}`;

        if (!balances[balanceKey]) balances[balanceKey] = 0;

        if (r.record_type === "issue") {
          if (r.status === "accepted") {
            balances[balanceKey] += r.quantity_kg;
          }

          if (style && r.fabric_name) {
            const styleKey = `${style}-${color}`;
            if (!sf[styleKey]) sf[styleKey] = [];

            const existing = sf[styleKey].find(
              (f) =>
                f.name.toUpperCase() === fabricName && (f.gsm || 0) === gsm
            );
            if (!existing) {
              sf[styleKey].push({
                name: r.fabric_name,
                gsm: gsm,
                isPending: r.status === "pending",
              });
            } else if (r.status === "pending") {
              existing.isPending = true;
            }
          }
        } else if (r.record_type === "return" && r.status !== "rejected") {
          balances[balanceKey] -= r.quantity_kg;
        } else if (r.record_type === "consumption") {
          balances[balanceKey] -= r.quantity_kg;
        }
      });

      setFabricBalances(balances);
      setStyleFabrics(sf);
    } catch (error) {
      console.error("Failed to fetch fabric balances:", error);
    }
  };

  useEffect(() => {
    const selectedPOs = Object.keys(checkedPOs).filter((po) => checkedPOs[po]);
    if (selectedPOs.length > 0) {
      fetchFabricBalancesForPOs(selectedPOs);
    }
  }, [checkedPOs]);

  const handleMixSubmit = async (isDraft: boolean = false) => {
    if (isDraft) {
      alert("Draft saving is supported in single PO mode.");
      return;
    }

    try {
      setIsLoading(true);
      const recordsToSubmit: any[] = [];
      const activeProducts: any[] = [];

      mixUniqueSizes.forEach((size) => {
        const enteredQty = parseInt(mixQuantities[size] || "0");
        if (enteredQty <= 0) return;

        const matchingProds = mixProducts.filter((p) => p.size === size);

        const sortedProds = [...matchingProds].sort((a, b) => {
          const priorityOrder: Record<string, number> = { Urgent: 0, Normal: 1, Low: 2 };
          const pA = priorityOrder[a.priority || "Normal"] ?? 1;
          const pB = priorityOrder[b.priority || "Normal"] ?? 1;
          if (pA !== pB) return pA - pB;
          const poA = pos.find((po) => po.po_number === a.po_number);
          const poB = pos.find((po) => po.po_number === b.po_number);
          return (poA?.id || 0) - (poB?.id || 0);
        });

        let remainingToAllocate = enteredQty;

        sortedProds.forEach((p, idx) => {
          const targetGoal = p.qty || 0;
          const alreadyDone = p.total_cut || 0;
          const need = Math.max(0, targetGoal - alreadyDone);

          const isLastProd = idx === sortedProds.length - 1;
          let pAlloc = 0;

          if (isLastProd) {
            pAlloc = remainingToAllocate;
          } else {
            pAlloc = Math.min(remainingToAllocate, need);
          }

          if (pAlloc > 0) {
            recordsToSubmit.push({
              po_number: p.po_number,
              product_id: p.id,
              quantity: pAlloc,
            });
            activeProducts.push({
              id: p.id,
              qty: pAlloc,
              product: p,
            });
            remainingToAllocate -= pAlloc;
          }
        });
      });

      const cutColors = new Set<string>();
      activeProducts.forEach((p) => {
        const pColor = p.product?.color || "";
        pColor.split("/").forEach((part) => {
          const trimmed = part.trim().toUpperCase();
          if (trimmed) cutColors.add(trimmed);
        });
      });
      if (mixColor && mixColor !== "All") {
        mixColor.split("/").forEach(part => {
          const t = part.trim().toUpperCase();
          if (t) cutColors.add(t);
        });
      }
      explicitlyAddedColors.forEach(c => cutColors.add(c.trim().toUpperCase()));

      const weightsToSubmit: any[] = [];
      const exceededBalances: string[] = [];
      Object.entries(colorWeights).forEach(([weightKey, weightVal]) => {
        const weight = parseFloat(weightVal as string);
        if (isNaN(weight) || weight <= 0) return;

        const [color, fabric, gsm] = weightKey.split("|");
        const normColor = (color || '').trim().toUpperCase();
        if (cutColors.size > 0 && !cutColors.has(normColor)) {
          return;
        }

        const available = fabricBalances[weightKey] || 0;
        if (weight > available) {
          exceededBalances.push(
            `${color} ${fabric} (Avail: ${available.toFixed(2)}kg, Req: ${weight.toFixed(2)}kg)`
          );
        }

        const firstPONum = Object.keys(checkedPOs).find((po) => checkedPOs[po]) || "";

        weightsToSubmit.push({
          po_number: firstPONum,
          style_num: mixStyle,
          color: color,
          fabric_name: fabric,
          gsm: parseInt(gsm) || 0,
          record_type: "consumption" as const,
          quantity_kg: weight,
        });
      });

      if (recordsToSubmit.length === 0 && weightsToSubmit.length === 0) {
        alert("No quantities or fabric weights entered.");
        setIsLoading(false);
        return;
      }

      const missingFabricInfo: string[] = [];

      cutColors.forEach((color) => {
        const normalizedColor = color.trim().toUpperCase();
        const fabrics = styleFabrics[`${mixStyle}-${normalizedColor}`] || [];

        if (fabrics.length === 0) {
          missingFabricInfo.push(`${color} (No fabric handover found)`);
          return;
        }

        fabrics.forEach((fab) => {
          const weightKey = `${normalizedColor}|${fab.name.toUpperCase()}|${fab.gsm || 0}`;
          const weight = parseFloat(colorWeights[weightKey] || "0");
          if (isNaN(weight) || weight <= 0) {
            missingFabricInfo.push(`${color} - ${fab.name}`);
          }
        });
      });

      if (missingFabricInfo.length > 0 && !bypassFabricCheck) {
        alert(`Please provide fabric weight for: ${missingFabricInfo.join(", ")}`);
        setIsLoading(false);
        return;
      }

      if (exceededBalances.length > 0 && !bypassFabricCheck) {
        alert(`Submission Error: Insufficient fabric inventory for: ${exceededBalances.join(", ")}. Please issue more fabric in the Fabric Page.`);
        setIsLoading(false);
        return;
      }

      await cuttingService.createBulk({
        records: recordsToSubmit,
        fabric_consumption: weightsToSubmit,
        bypass_fabric_check: bypassFabricCheck,
      });

      setLatestReport({
        timestamp: new Date().toISOString(),
        po_number: "MULTIPLE POs (AUTO-ALLOCATED)",
        style: mixStyle,
        items: activeProducts.map((p) => ({
          color: p.product?.color,
          size: p.product?.size,
          qty: p.qty,
        })),
        fabric: [],
      });

      await fetchPOs();
      await fetchHistory();
      await fetchIncomingFabric();
      await fetchStats(mixStyle);
      setMixQuantities({});
      setColorWeights({});
      alert("Cutting logs and fabric consumption submitted successfully!");
    } catch (err: any) {
      alert(err.response?.data?.error || err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePOChange = async (poNum: string) => {
    setSelectedPONum(poNum);
    if (!poNum) {
      setProducts([]);
      setCuttingPrograms([]);
      return;
    }
    setIsLoading(true);
    try {
      const [productData, programData] = await Promise.all([
        cuttingService.getPOProducts(poNum),
        cuttingService.getCuttingPrograms(poNum),
      ]);

      fetchFabricBalances(poNum);
      const priorityOrder: Record<string, number> = {
        Urgent: 0,
        Normal: 1,
        Low: 2,
      };
      const sortedProducts = [...productData.products].sort((a, b) => {
        const pA = priorityOrder[a.priority || "Normal"] ?? 1;
        const pB = priorityOrder[b.priority || "Normal"] ?? 1;
        if (pA !== pB) return pA - pB;

        const sA = String(a.style_num || "");
        const sB = String(b.style_num || "");
        const styleComp = sA.localeCompare(sB);
        if (styleComp !== 0) return styleComp;

        const cA = String(a.color || "");
        const cB = String(b.color || "");
        const colorComp = cA.localeCompare(cB);
        if (colorComp !== 0) return colorComp;

        return compareSizes(a.size || "", b.size || "");
      });
      setProducts(sortedProducts);
      setCuttingPrograms(programData);

      // Reset filters when PO changes
      setFilterStyle("All");
      setSelectedColor(null);
      setFilterSize("All");
      setColorWeights({});
      setLastCalculated([]);
      setLatestReport(null);

      const initialQtys: Record<number, string> = {};
      sortedProducts.forEach((p: any) => (initialQtys[p.id] = "0"));

      // LOAD DRAFT from localStorage if exists for this PO
      const draftStr = localStorage.getItem(`cutting_draft_${poNum}`);
      if (draftStr) {
        try {
          const draft = JSON.parse(draftStr);
          if (draft.quantities) {
            // Only load quantities for products that still exist in this PO
            const mergedQtys = { ...initialQtys };
            Object.keys(draft.quantities).forEach((id) => {
              const numericId = Number(id);
              if (mergedQtys.hasOwnProperty(numericId)) {
                mergedQtys[numericId] = String(draft.quantities[id] || "0");
              }
            });
            setQuantities(mergedQtys);
          }
          if (draft.colorWeights) {
            setColorWeights(draft.colorWeights);
          }
          if (draft.filterStyle) setFilterStyle(draft.filterStyle);
          if (draft.selectedColor) setSelectedColor(draft.selectedColor);
        } catch (e) {
          console.error("Failed to load draft", e);
          setQuantities(initialQtys);
        }
      } else {
        setQuantities(initialQtys);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearProgram = async () => {
    if (filterStyle === "All" || !selectedColor || selectedColor === "All") {
      alert("Please select a specific Style and Color to clear the program.");
      return;
    }

    try {
      setIsLoading(true);
      const token = localStorage.getItem("erp_token") || "";
      const response = await fetch("/api/cutting-programs/clear", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          style_num: filterStyle,
          color: selectedColor,
          po_number: selectedPONum || undefined,
        }),
      });

      const resData = await response.json();
      if (!response.ok)
        throw new Error(resData.error || "Failed to clear program");

      // Refresh products and programs
      handlePOChange(selectedPONum);
      setConfirmClear(false);
      alert("Cutting program cleared successfully.");
    } catch (error: any) {
      console.error("Failed to clear program", error);
      alert(error.message || "Failed to clear cutting program.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (isDraft: boolean = false, isDoubleCuttingApproved: boolean = false) => {
    try {
      setIsLoading(true);
      // Save to localStorage if it's a draft
      if (isDraft) {
        if (!selectedPONum) {
          setIsLoading(false);
          return;
        }
        const draft = {
          quantities,
          colorWeights,
          filterStyle,
          selectedColor,
          timestamp: new Date().toISOString(),
        };
        localStorage.setItem(
          `cutting_draft_${selectedPONum}`,
          JSON.stringify(draft),
        );
        alert("Progress saved locally. You can continue later.");
        setIsLoading(false);
        return;
      }

      // ONLY process products that are CURRENTLY visible in the filtered list
      const activeProducts = filteredProducts
        .filter((p) => parseInt(quantities[p.id] || "0") > 0)
        .map((p) => ({
          id: p.id,
          qty: parseInt(quantities[p.id] || "0"),
          product: p,
        }));

      // Warning check for already packed stock (Initial Stock Mode)
      const warningItems: string[] = [];
      activeProducts.forEach((ap) => {
        const p = ap.product;
        const totalShipped = Number(p.total_shipped || 0);
        const packed = Math.max(0, (Number(p.total_accepted_packed_qty || 0) + Number(p.total_accepted_blister_qty || 0)) - totalShipped);
        if (packed > 0) {
          warningItems.push(`- Style ${p.style_num} (${p.color}/${p.size}): has ${packed} pcs already PACKED (remaining in store).`);
        }
      });

      if (warningItems.length > 0 && !isDraft && !isDoubleCuttingApproved) {
        const confirmMsg = `⚠️ DOUBLE CUTTING DETECTED!\n\nThe following items already have finished/packed stock (e.g. from Initial Stock Mode):\n\n${warningItems.join("\n")}\n\nCutting on top of pre-packed goods might lead to overproduction. Do you still want to enter these cut quantities?`;
        setConfirmDialog({
          title: "Double Cutting Detected",
          message: confirmMsg,
          onConfirm: () => handleSubmit(false, true),
        });
        setIsLoading(false);
        return;
      }

      const hasWeights = Object.values(colorWeights).some(
        (w) => parseFloat(w as string) > 0,
      );

      if (activeProducts.length === 0 && !hasWeights) {
        alert("No quantities or weights entered.");
        setIsLoading(false);
        return;
      }

      if (activeProducts.length === 0) {
        alert("At least one cutting quantity is required for final submission.");
        setIsLoading(false);
        return;
      }

      // VALIDATION: Ensure weight is provided for every color being cut
      const cutColors = new Set<string>();
      activeProducts.forEach((p) => {
        const pColor = p.product?.color || "";
        pColor.split("/").forEach((part) => {
          const trimmed = part.trim();
          if (trimmed) cutColors.add(trimmed);
        });
      });

      const missingFabricInfo: string[] = [];
      const exceededBalances: string[] = [];

      // In Draft mode, we don't necessarily require EVERYTHING to match.
      // However, we still need to validate what IS provided.

      // We need to validate weight for each FABRIC of each color
      if (!isDraft) {
        cutColors.forEach((color) => {
          const normalizedColor = color.trim().toUpperCase();
          const style =
            filterStyle !== "All"
              ? filterStyle
              : activeProducts.find((p) => p.product?.color.includes(color))
                  ?.product?.style_num;
          const fabrics = styleFabrics[`${style}-${normalizedColor}`] || [];

          if (fabrics.length === 0) {
            missingFabricInfo.push(`${color} (No fabric handover found)`);
            return;
          }

          fabrics.forEach((fab) => {
            const weightKey = `${normalizedColor}|${fab.name.toUpperCase()}|${fab.gsm || 0}`;
            const weight = parseFloat(colorWeights[weightKey] || "0");
            if (isNaN(weight) || weight <= 0) {
              missingFabricInfo.push(`${color} - ${fab.name}`);
            }
          });
        });
      }

      // Stock check validation (needed for both to avoid server transaction failure if possible)
      const weightsToSubmit: any[] = [];

      const allowedColors = new Set<string>();
      cutColors.forEach(c => allowedColors.add(c.trim().toUpperCase()));
      explicitlyAddedColors.forEach(c => allowedColors.add(c.trim().toUpperCase()));
      if (selectedColor && selectedColor !== "All") {
        selectedColor.split("/").forEach(part => {
          const t = part.trim().toUpperCase();
          if (t) allowedColors.add(t);
        });
      }

      // Collect all entered weights based on the current available stock patterns
      // This looks at all weight keys that have a value > 0
      Object.entries(colorWeights).forEach(([weightKey, weightVal]) => {
        const weight = parseFloat(weightVal as string);
        if (isNaN(weight) || weight <= 0) return;

        const [color, fabric, gsm] = weightKey.split("|");
        const normColor = (color || '').trim().toUpperCase();
        if (allowedColors.size > 0 && !allowedColors.has(normColor)) {
          return;
        }

        const style =
          filterStyle !== "All"
            ? filterStyle
            : activeProducts.find((p) =>
                p.product?.color.toUpperCase().includes(color.toUpperCase()),
              )?.product?.style_num || "";

        const available = fabricBalances[weightKey] || 0;
        if (weight > available) {
          exceededBalances.push(
            `${color} ${fabric} (Avail: ${available.toFixed(2)}kg, Req: ${weight.toFixed(2)}kg)`,
          );
        }

        weightsToSubmit.push({
          po_number: selectedPONum,
          style_num: style,
          color: color,
          fabric_name: fabric,
          gsm: parseInt(gsm) || 0,
          record_type: "consumption" as const,
          quantity_kg: weight,
        });
      });

      if (!isDraft && missingFabricInfo.length > 0 && !bypassFabricCheck) {
        alert(
          `Please provide fabric weight for: ${missingFabricInfo.join(", ")}`,
        );
        setIsLoading(false);
        return;
      }

      if (exceededBalances.length > 0 && !bypassFabricCheck) {
        alert(
          `${isDraft ? "Draft Save Warning" : "Submission Error"}: Insufficient fabric inventory for: ${exceededBalances.join(", ")}. Please issue more fabric in the Fabric Page.`,
        );
        setIsLoading(false);
        return;
      }

      const records = activeProducts.map((p) => ({
        po_number: selectedPONum,
        product_id: p.id,
        quantity: p.qty,
      }));

      await cuttingService.createBulk({
        records,
        fabric_consumption: weightsToSubmit,
        bypass_fabric_check: bypassFabricCheck,
      });

      // Calculate results for local display report
      const results: any[] = [];
      weightsToSubmit.forEach((w) => {
        const relevantProdQty = activeProducts
          .filter((p) =>
            p.product?.color.toUpperCase().includes(w.color.toUpperCase()),
          )
          .reduce((sum, p) => sum + p.qty, 0);

        results.push({
          color: `${w.color} (${w.fabric_name} - ${w.gsm} GSM)`,
          weight: w.quantity_kg,
          totalQty: relevantProdQty,
          perPc:
            relevantProdQty > 0
              ? (w.quantity_kg / relevantProdQty).toFixed(3)
              : "0",
        });
      });

      setLastCalculated(results);

      if (!isDraft) {
        localStorage.removeItem(`cutting_draft_${selectedPONum}`);
        setLatestReport({
          timestamp: new Date().toISOString(),
          po_number: selectedPONum,
          style: filterStyle !== "All" ? filterStyle : "Multiple Styles",
          items: activeProducts.map((p) => ({
            color: p.product?.color,
            size: p.product?.size,
            qty: p.qty,
          })),
          fabric: results,
        });
      }

      handlePOChange(selectedPONum);
      fetchHistory();
      fetchIncomingFabric();
      fetchStats(filterStyle === "All" ? undefined : filterStyle);
      alert(
        isDraft
          ? "Progress saved successfully."
          : "Cutting bulk & Fabric consumption submitted successfully",
      );
    } catch (error: any) {
      alert(error.response?.data?.error || error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Must have an issued cutting program
      const program = cuttingPrograms.find((cp) => cp.product_id === p.id);
      if (!program) return false;

      const isCompleted = (p.total_cut || 0) >= (p.qty || 0);
      const passStatus = showCompleted || !isCompleted;

      return (
        passStatus &&
        (filterStyle === "All" || p.style_num === filterStyle) &&
        (!selectedColor || p.color === selectedColor) &&
        (filterSize === "All" || p.size === filterSize)
      );
    });
  }, [
    products,
    cuttingPrograms,
    showCompleted,
    filterStyle,
    selectedColor,
    filterSize,
  ]);

  const uniqueStyles = useMemo(() => {
    const styles = products
      .filter((p) => cuttingPrograms.some((cp) => cp.product_id === p.id))
      .map((p) => p.style_num);
    return ["All", ...new Set(styles)].sort();
  }, [products, cuttingPrograms]);

  const uniqueColors = useMemo(() => {
    const colors = products
      .filter((p) => cuttingPrograms.some((cp) => cp.product_id === p.id))
      .filter((p) => filterStyle === "All" || p.style_num === filterStyle)
      .map((p) => p.color);
    return ["All", ...new Set(colors)].sort();
  }, [products, cuttingPrograms, filterStyle]);

  const uniqueSizes = useMemo(() => {
    const sizes = products
      .filter((p) => cuttingPrograms.some((cp) => cp.product_id === p.id))
      .filter((p) => filterStyle === "All" || p.style_num === filterStyle)
      .filter((p) => !selectedColor || p.color === selectedColor)
      .map((p) => p.size);
    return ["All", ...Array.from(new Set(sizes)).sort(compareSizes)];
  }, [products, cuttingPrograms, filterStyle, selectedColor]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-6 border-b border-bg4 gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-cut/10 text-cut rounded-2xl shrink-0">
            <Scissors className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight uppercase text-slate-900 dark:text-white">
              Cutting Dept
            </h1>
            <p className="text-text3 text-[10px] font-mono uppercase tracking-[0.3em] font-medium leading-tight">
              Production workflow & tracking
            </p>
          </div>
        </div>

        <div className="flex bg-bg2 p-1 rounded-xl border border-bg4 self-start lg:self-auto overflow-x-auto max-w-full">
          <div className="relative">
            <button
              onClick={() => setActiveTab("entry")}
              className={cn(
                "px-4 sm:px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                activeTab === "entry"
                  ? "bg-cut text-bg shadow-lg shadow-cut/20"
                  : "text-text3 hover:text-text",
              )}
            >
              Form Entry
            </button>
            {incomingFabric.filter((r) => r.status === "pending").length >
              0 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full border-2 border-bg animate-pulse shadow-sm" />
            )}
          </div>
          <button
            onClick={() => setActiveTab("reports")}
            className={cn(
              "px-4 sm:px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
              activeTab === "reports"
                ? "bg-cut text-bg shadow-lg shadow-cut/20"
                : "text-text3 hover:text-text",
            )}
          >
            Table Reports
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {activeTab === "entry" ? (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3 space-y-6">
              {incomingFabric.filter((r) => r.status === "pending").length >
                0 && (
                <div className="bg-bg2 border-2 border-orange-500/50 rounded-2xl p-4 flex items-center justify-between shadow-lg shadow-orange-500/10 animate-pulse-slow">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-orange-500 text-bg rounded-xl">
                      <Package className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black uppercase tracking-tight text-orange-500">
                        Action Required: Fabric Handover
                      </h4>
                      <p className="text-[10px] font-mono text-text3 uppercase font-bold tracking-widest">
                        You have incoming fabric from the Fabrication Dept. You
                        must ACCEPT it before it shows in your available stock.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const el = document.getElementById(
                        "handover-sidebar-cutting",
                      );
                      el?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="bg-orange-500 text-bg px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-orange-500/20 hover:bg-orange-600 transition-all"
                  >
                    Accept Fabric
                  </button>
                </div>
              )}
              {/* Entry Mode Switcher */}
              <div className="bg-bg2 border border-bg4 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-tight text-slate-800 dark:text-white">
                    Entry Mode
                  </h3>
                  <p className="text-[10px] font-mono text-text3 uppercase mt-1">
                    Choose how you want to record cutting production output
                  </p>
                </div>
                <div className="flex bg-bg3 p-1 rounded-xl border border-bg4 max-w-fit">
                  <button
                    onClick={() => {
                      setEntryMode("style_color");
                      setSelectedPONum("");
                    }}
                    className={cn(
                      "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap",
                      entryMode === "style_color"
                        ? "bg-cut text-white shadow-md shadow-cut/20"
                        : "text-text3 hover:text-text"
                    )}
                  >
                    🎯 Style & Color
                  </button>
                  <button
                    onClick={() => {
                      setEntryMode("single_po");
                      setMixStyle("");
                      setMixColor("");
                    }}
                    className={cn(
                      "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap",
                      entryMode === "single_po"
                        ? "bg-cut text-white shadow-md shadow-cut/20"
                        : "text-text3 hover:text-text"
                    )}
                  >
                    🗃️ Single PO
                  </button>
                </div>
              </div>

              {entryMode === "style_color" ? (
                <div className="space-y-6">
                  {/* Style and Color Selector Card */}
                  <div className="bg-bg2 border border-bg4 rounded-2xl p-6 flex flex-col md:flex-row md:items-center gap-6">
                    <div className="flex-1 space-y-2">
                      <label className="text-[10px] font-mono text-text3 uppercase tracking-widest">
                        Choose Style
                      </label>
                      <select
                        value={mixStyle}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMixStyle(val);
                          setMixColor("");
                          setExplicitlyAddedColors([]);
                          checkForExplicitColors(val);
                        }}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold text-slate-800 dark:text-white"
                      >
                        <option value="">-- CHOOSE STYLE --</option>
                        {availableMixStyles.map((style) => (
                          <option key={style} value={style}>
                            {style}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex-1 space-y-2">
                      <label className="text-[10px] font-mono text-text3 uppercase tracking-widest">
                        Choose Color
                      </label>
                      <select
                        value={mixColor}
                        onChange={(e) => setMixColor(e.target.value)}
                        disabled={!mixStyle}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold text-slate-800 dark:text-white disabled:opacity-50"
                      >
                        <option value="">-- CHOOSE COLOR --</option>
                        {availableMixColors.map((color) => (
                          <option key={color} value={color}>
                            {color}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="shrink-0 pt-2 md:pt-6 flex items-center justify-start">
                      <label className="flex items-center gap-3 cursor-pointer bg-amber-500/10 border border-amber-500/20 px-4 py-2.5 rounded-xl hover:bg-amber-500/15 transition-colors select-none">
                        <input
                          type="checkbox"
                          checked={bypassFabricCheck}
                          onChange={(e) => setBypassFabricCheck(e.target.checked)}
                          className="w-4 h-4 rounded accent-amber-500 bg-bg3 border-bg4 cursor-pointer"
                        />
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest leading-none">
                            First-Time Bypass
                          </span>
                          <span className="text-[8px] font-semibold text-amber-400 uppercase tracking-widest mt-1">
                            Allow Zero Floor & In-House Stock
                          </span>
                        </div>
                      </label>
                    </div>

                    <div className="shrink-0 pt-6 flex gap-3">
                      <button
                        onClick={() => handleMixSubmit(false)}
                        disabled={
                          !mixStyle ||
                          !mixColor ||
                          ((Object.values(mixQuantities) as string[]).every(
                            (q) => parseInt(q || "0") <= 0
                          ) &&
                            Object.values(colorWeights).every(
                              (w) => !w || parseFloat(w as string) <= 0
                            ))
                        }
                        className="bg-cut text-white font-black px-8 py-3 rounded-xl shadow-lg shadow-cut/30 disabled:opacity-50 hover:bg-orange-600 transition-all flex items-center gap-2 uppercase tracking-widest text-xs"
                      >
                        <Check className="w-5 h-5" /> Confirm & Submit
                      </button>
                    </div>
                  </div>

                  {mixStyle && mixColor && (
                    <div className="bg-bg2 border border-bg4 rounded-2xl p-6 space-y-4">
                      {/* Active POs list as Checkboxes */}
                      <div className="space-y-2">
                        <span className="text-[10px] font-mono text-text3 uppercase tracking-widest font-black">
                          POs containing this style & color (FIFO auto-allocated)
                        </span>
                        <div className="flex flex-wrap gap-3">
                          {matchingPOs.map((po, idx) => (
                            <label
                              key={`${po.po_number}-${po.buyer || idx}`}
                              className={cn(
                                "flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer select-none transition-all",
                                checkedPOs[po.po_number]
                                  ? "bg-bg3 border-cut text-cut shadow-sm"
                                  : "bg-bg2 border-bg4 text-text3 hover:border-bg4"
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={checkedPOs[po.po_number] || false}
                                onChange={(e) =>
                                  setCheckedPOs({
                                    ...checkedPOs,
                                    [po.po_number]: e.target.checked,
                                  })
                                }
                                className="w-4 h-4 rounded accent-cut bg-bg3 border-bg4 cursor-pointer"
                              />
                              <span>
                                {po.po_number} ({po.buyer})
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {mixStyle && mixColor && (
                    <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
                      <div className="p-4 bg-bg3/30 border-b border-bg4 flex items-center justify-between">
                        <h3 className="text-sm font-bold uppercase tracking-tight">
                          Size Requirements (Aggregated)
                        </h3>
                        <p className="text-[10px] font-mono text-text3 uppercase">
                          {mixUniqueSizes.length} Size Groups Found
                        </p>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-bg3/50 border-b border-bg4 text-text3">
                              <th className="p-4 text-xs font-mono uppercase font-black">Size</th>
                              <th className="p-4 text-xs font-mono uppercase font-black text-center">Planned (Goal)</th>
                              <th className="p-4 text-xs font-mono uppercase font-black text-center">Already Cut</th>
                              <th className="p-4 text-xs font-mono uppercase font-black text-center">Remaining Balance</th>
                              <th className="p-4 text-xs font-mono uppercase font-black text-center w-64">Today's Cut Qty</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-bg4">
                            {mixUniqueSizes.map((size) => {
                              const matchingSizeProds = mixProducts.filter((p) => p.size === size);
                              const totalPlanned = matchingSizeProds.reduce((sum, p) => {
                                const target = p.qty || 0;
                                return sum + target;
                              }, 0);
                              const alreadyCutValue = matchingSizeProds.reduce((sum, p) => sum + (p.total_cut || 0), 0);
                              const rem = Math.max(0, totalPlanned - alreadyCutValue);

                              return (
                                <tr key={size} className="hover:bg-bg3/20 transition-colors">
                                  <td className="p-4 text-center">
                                    <span className="font-black font-mono text-sm uppercase bg-cut/10 text-cut px-2.5 py-1 rounded">
                                      {size}
                                    </span>
                                  </td>
                                  <td className="p-4 text-center font-mono text-sm">{totalPlanned}</td>
                                  <td className="p-4 text-center font-mono text-sm">{alreadyCutValue}</td>
                                  <td className="p-4 text-center font-mono text-sm text-po font-bold bg-po/5">{rem}</td>
                                  <td className="p-4">
                                    <input
                                      type="number"
                                      min="0"
                                      value={mixQuantities[size] || ""}
                                      onChange={(e) =>
                                        setMixQuantities({
                                          ...mixQuantities,
                                          [size]: e.target.value,
                                        })
                                      }
                                      className="w-full bg-bg3 border border-bg4 rounded-xl p-2.5 text-sm font-black text-center focus:ring-1 focus:ring-cut outline-none transition-all"
                                      placeholder="0"
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {mixStyle && mixColor && (
                    <div className="bg-bg2 border border-bg4 rounded-2xl p-6 space-y-4">
                      <div className="flex items-center justify-between border-b border-bg4 pb-3">
                        <h4 className="text-xs font-black uppercase tracking-wider text-text">
                          Fabric Handover Consumption Weights
                        </h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {(() => {
                          const list: any[] = [];
                          // 1. Standard style-color fabrics
                          const stdFabrics = styleFabrics[`${mixStyle}-${mixColor.toUpperCase()}`] || [];
                          stdFabrics.forEach(f => {
                            list.push({ ...f, color: mixColor.toUpperCase() });
                          });

                          // 2. Explicitly added/issued colors (such as WHITE)
                          explicitlyAddedColors.forEach((expColor) => {
                            if (expColor.toUpperCase() !== mixColor.toUpperCase()) {
                              const expFabrics = styleFabrics[`${mixStyle}-${expColor.toUpperCase()}`] || [];
                              expFabrics.forEach(f => {
                                const alreadyExists = list.some(item => 
                                  item.color === expColor.toUpperCase() && 
                                  item.name.toUpperCase() === f.name.toUpperCase() && 
                                  (item.gsm || 0) === (f.gsm || 0)
                                );
                                if (!alreadyExists) {
                                  list.push({ ...f, color: expColor.toUpperCase() });
                                }
                              });
                            }
                          });

                          return list.map((fab) => {
                            const weightKey = `${fab.color}|${fab.name.toUpperCase()}|${fab.gsm || 0}`;
                            const available = fabricBalances[weightKey] || 0;
                            return (
                              <div
                                key={weightKey}
                                className="bg-bg3/30 border border-bg4 rounded-2xl p-4 space-y-3"
                              >
                                <div className="flex justify-between items-start">
                                  <div>
                                    <h5 className="text-xs font-black uppercase leading-tight">
                                      {fab.name}
                                    </h5>
                                    <p className="text-[9px] font-mono text-text3 mt-0.5">
                                      {fab.gsm} GSM • {fab.color}
                                    </p>
                                  </div>
                                  {fab.isPending && (
                                    <span className="bg-orange-500/10 text-orange-500 text-[8px] font-black px-2 py-0.5 rounded uppercase animate-pulse">
                                      Pending Issue
                                    </span>
                                  )}
                                </div>
                                <div className="flex justify-between text-[10px] font-mono text-text3">
                                  <span>Floor Balance:</span>
                                  <span className="font-bold text-slate-800 dark:text-white">
                                    {available.toFixed(2)} kg
                                  </span>
                                </div>
                                <div className="relative">
                                  <input
                                    type="number"
                                    placeholder="Consumption kg"
                                    value={colorWeights[weightKey] || ""}
                                    onChange={(e) =>
                                      setColorWeights({
                                        ...colorWeights,
                                        [weightKey]: e.target.value,
                                      })
                                    }
                                    className="w-full bg-bg3 border border-bg4 rounded-xl p-2.5 text-xs font-black pl-8 outline-none focus:border-cut focus:ring-1 focus:ring-cut"
                                  />
                                  <span className="absolute left-3 top-2.5 text-text3 text-xs font-mono">
                                    kg
                                  </span>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-bg2 border border-bg4 rounded-2xl p-6 flex flex-col md:flex-row md:items-center gap-6">
                  <div className="flex-1 space-y-2">
                    <label className="text-[10px] font-mono text-text3 uppercase tracking-widest">
                      Select Production Order
                    </label>
                    <select
                      value={selectedPONum}
                      onChange={(e) => handlePOChange(e.target.value)}
                      className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold text-po"
                    >
                      <option value="">-- CHOOSE PO --</option>
                      {pos
                        .filter((po) => po.status === "Active")
                        .map((po, idx) => (
                          <option
                            key={`${po.id}-${po.buyer || idx}`}
                            value={po.po_number}
                            className={
                              po.priority === "Urgent"
                                ? "text-reject font-bold"
                                : ""
                            }
                          >
                            {po.priority === "Urgent" ? "🔥 " : ""}
                            {po.po_number} ({po.buyer})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="shrink-0 pt-2 md:pt-6 flex items-center justify-start">
                    <label className="flex items-center gap-3 cursor-pointer bg-amber-500/10 border border-amber-500/20 px-4 py-2.5 rounded-xl hover:bg-amber-500/15 transition-colors select-none">
                      <input
                        type="checkbox"
                        checked={bypassFabricCheck}
                        onChange={(e) => setBypassFabricCheck(e.target.checked)}
                        className="w-4 h-4 rounded accent-amber-500 bg-bg3 border-bg4 cursor-pointer"
                      />
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest leading-none">
                          First-Time Bypass
                        </span>
                        <span className="text-[8px] font-semibold text-amber-400 uppercase tracking-widest mt-1">
                          Allow Zero Floor & In-House Stock
                        </span>
                      </div>
                    </label>
                  </div>

                  <div className="shrink-0 pt-6 flex gap-3">
                    <button
                      onClick={() => handleSubmit(true)}
                      disabled={
                        !selectedPONum ||
                        ((Object.values(quantities) as string[]).every(
                          (q) => parseInt(q || "0") <= 0,
                        ) &&
                          Object.values(colorWeights).every(
                            (w) => !w || parseFloat(w as string) <= 0,
                          ))
                      }
                      className="bg-bg3 text-text3 border border-bg4 font-black px-6 py-3 rounded-xl hover:bg-bg4 transition-all flex items-center gap-2 uppercase tracking-widest text-xs"
                    >
                      Save Progress
                    </button>
                    <button
                      onClick={() => handleSubmit(false)}
                      disabled={
                        !selectedPONum ||
                        (Object.values(quantities) as string[]).every(
                          (q) => parseInt(q || "0") <= 0,
                        )
                      }
                      className="bg-cut text-white font-black px-8 py-3 rounded-xl shadow-lg shadow-cut/30 disabled:opacity-50 hover:bg-orange-600 transition-all flex items-center gap-2 uppercase tracking-widest text-xs"
                    >
                      <Check className="w-5 h-5" /> Confirm & Submit
                    </button>
                  </div>
                </div>
              )}

              {selectedPONum && (
                <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
                  <div className="p-4 bg-bg3/30 border-b border-bg4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <h3 className="text-sm font-bold uppercase tracking-tight">
                        Bulk Cutting Entry
                      </h3>
                      <div className="h-4 w-px bg-bg4 hidden md:block" />
                      <p className="text-[10px] font-mono text-text3 uppercase">
                        {filteredProducts.length} Products Found
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setShowCompleted(!showCompleted)}
                        className={cn(
                          "text-[10px] font-black uppercase px-4 py-2 rounded-lg transition-colors border shadow-sm",
                          showCompleted
                            ? "bg-bg4 border-bg4 text-text hover:bg-bg3"
                            : "bg-cut/10 border-cut/30 text-cut hover:bg-cut/20",
                        )}
                      >
                        {showCompleted
                          ? "Hide Completed"
                          : "Show All (incl. Completed)"}
                      </button>

                      <div className="flex items-center gap-2 bg-bg3 p-1 rounded-lg border border-bg4">
                        <span className="text-[10px] font-mono text-text3 uppercase px-2">
                          Style
                        </span>
                        <select
                          value={filterStyle}
                          onChange={(e) => {
                            const style = e.target.value;
                            setFilterStyle(style);
                            setSelectedColor(null);
                            setColorWeights({});
                            setExplicitlyAddedColors([]);
                            fetchStats(style);
                            checkForExplicitColors(style, selectedPONum);
                          }}
                          className="bg-transparent border-none text-xs font-bold focus:ring-0"
                        >
                          {uniqueStyles.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2 bg-bg3 p-1 rounded-lg border border-bg4">
                        <span className="text-[10px] font-mono text-text3 uppercase px-2">
                          Color
                        </span>
                        <select
                          value={selectedColor || "All"}
                          onChange={(e) => {
                            const val =
                              e.target.value === "All" ? null : e.target.value;
                            setSelectedColor(val);
                          }}
                          className="bg-transparent border-none text-xs font-bold focus:ring-0"
                        >
                          {uniqueColors.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2 bg-bg3 p-1 rounded-lg border border-bg4">
                        <span className="text-[10px] font-mono text-text3 uppercase px-2">
                          Size
                        </span>
                        <select
                          value={filterSize}
                          onChange={(e) => setFilterSize(e.target.value)}
                          className="bg-transparent border-none text-xs font-bold focus:ring-0"
                        >
                          {uniqueSizes.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={() => {
                          const newQtys = { ...quantities };
                          filteredProducts.forEach((p) => {
                            newQtys[p.id] = "0";
                          });
                          setQuantities(newQtys);
                        }}
                        className="bg-bg text-[10px] font-black text-reject hover:text-white hover:bg-reject uppercase px-4 py-2 rounded-lg transition-all border border-reject/30 shadow-sm"
                      >
                        Clear (Filtered)
                      </button>

                      <button
                        onClick={() => {
                          const newQtys = { ...quantities };
                          filteredProducts.forEach((p) => {
                            const orderQty = p.qty || 0;
                            const targetQty = Math.round(orderQty * 1.03);
                            const remaining = targetQty - (p.total_cut || 0);
                            newQtys[p.id] =
                              remaining > 0 ? remaining.toString() : "0";
                          });
                          setQuantities(newQtys);
                        }}
                        className="bg-bg text-[10px] font-black text-cut hover:text-white hover:bg-cut uppercase px-4 py-2 rounded-lg transition-all border border-cut/30 shadow-sm"
                      >
                        Fill (Filtered Items)
                      </button>

                      {filterStyle !== "All" && selectedColor && selectedColor !== "All" && (
                        confirmClear ? (
                          <div className="flex gap-1 items-center bg-bg p-0.5 rounded-lg border border-reject/30">
                            <button
                              onClick={handleClearProgram}
                              className="text-[9px] font-black text-white bg-reject uppercase px-2.5 py-1.5 rounded transition-all shadow-sm"
                            >
                              Confirm Clear
                            </button>
                            <button
                              onClick={() => setConfirmClear(false)}
                              className="text-[9px] font-black text-text2 bg-bg3 uppercase px-2.5 py-1.5 rounded border border-bg4 hover:bg-bg4 transition-all"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmClear(true)}
                            className="bg-bg text-[10px] font-black text-reject hover:text-white hover:bg-reject uppercase px-4 py-2 rounded-lg transition-all border border-reject/30 shadow-sm flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Clear Program
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Dynamic Weight Inputs - Visible for colors being cut or manually selected */}
                  {(() => {
                    const currentCuttingColors = new Set<string>();

                    // 1. Colors that have quantities entered in CURRENT PO
                    products.forEach((p) => {
                      if (parseInt(quantities[p.id] || "0") > 0) {
                        p.color.split("/").forEach((part) => {
                          const trimmed = part.trim();
                          if (trimmed)
                            currentCuttingColors.add(trimmed.toUpperCase());
                        });
                      }
                    });

                    // 2. Colors that have weights already entered in state
                    Object.keys(colorWeights).forEach((key) => {
                      if (parseFloat(colorWeights[key] || "0") > 0) {
                        const color = key.split("|")[0];
                        currentCuttingColors.add(color.toUpperCase());
                      }
                    });

                    // 3. Colors in the currently filtered style
                    if (filterStyle !== "All") {
                      products
                        .filter((p) => p.style_num === filterStyle)
                        .forEach((p) => {
                          p.color.split("/").forEach((part) => {
                            const trimmed = part.trim();
                            if (trimmed)
                              currentCuttingColors.add(trimmed.toUpperCase());
                          });
                        });
                    }

                    // 3.5. Explicitly added/issued colors from popup
                    explicitlyAddedColors.forEach((color) => {
                      currentCuttingColors.add(color.toUpperCase());
                    });

                    // 4. Specifically selected color
                    if (selectedColor && selectedColor !== "All") {
                      selectedColor.split("/").forEach((part) => {
                        const trimmed = part.trim();
                        if (trimmed)
                          currentCuttingColors.add(trimmed.toUpperCase());
                      });
                    }

                    // Filter down if selectedColor is active
                    if (selectedColor && selectedColor !== "All") {
                      const allowed = new Set<string>();
                      selectedColor.split("/").forEach((part) => {
                        const trimmed = part.trim();
                        if (trimmed) allowed.add(trimmed.toUpperCase());
                      });
                      explicitlyAddedColors.forEach((color) => {
                        allowed.add(color.toUpperCase());
                      });
                      const filtered = Array.from(currentCuttingColors).filter(
                        (color) => allowed.has(color),
                      );
                      currentCuttingColors.clear();
                      filtered.forEach((c) => currentCuttingColors.add(c));
                    }

                    if (currentCuttingColors.size === 0) return null;

                    return (
                      <div className="p-6 bg-yellow-500/5 border-b border-bg4 space-y-4">
                        <div className="flex items-center gap-3 text-orange-500">
                          <div className="p-1.5 bg-orange-500/10 rounded-lg">
                            <AlertCircle className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-xs font-black uppercase tracking-wider">
                              Mandatory Fabric Weight Verification
                            </p>
                            <p className="text-[10px] font-mono text-text3 uppercase mt-0.5">
                              Please provide total fabric weight (KG) used for
                              each color being cut
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {Array.from(currentCuttingColors).map((color) => {
                            const normalizedColor = color.trim().toUpperCase();
                            const style =
                              filterStyle !== "All"
                                ? filterStyle
                                : products.find((p) => {
                                    const pColors = p.color
                                      .split("/")
                                      .map((s) => s.trim().toUpperCase());
                                    return pColors.includes(normalizedColor);
                                  })?.style_num;
                            const fabrics =
                              styleFabrics[`${style}-${normalizedColor}`] || [];

                            return fabrics.map((fab) => {
                              const weightKey = `${normalizedColor}|${fab.name.toUpperCase()}|${fab.gsm || 0}`;
                              const weightStr = colorWeights[weightKey] || "";
                              const hasWeight = parseFloat(weightStr) > 0;
                              const available = fabricBalances[weightKey] || 0;
                              const isExceeded =
                                parseFloat(weightStr) > available;
                              const hasPending = fab.isPending;

                              return (
                                <div
                                  key={weightKey}
                                  className={cn(
                                    "bg-bg2 p-4 rounded-2xl border transition-all duration-300",
                                    isExceeded
                                      ? "border-reject shadow-lg shadow-reject/5"
                                      : available <= 0 && hasPending
                                        ? "border-orange-500 border-dashed animate-pulse-slow"
                                        : hasWeight
                                          ? "border-bg4"
                                          : "border-orange-500/50 shadow-lg shadow-orange-500/5",
                                  )}
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <div>
                                      <span className="text-[10px] font-black text-text3 uppercase tracking-tight">
                                        {color}
                                      </span>
                                      <div className="flex items-center gap-1 mt-0.5">
                                        <span className="text-[9px] font-mono text-text3 uppercase">
                                          Available:
                                        </span>
                                        <span
                                          className={cn(
                                            "text-[9px] font-mono font-black",
                                            available <= 0
                                              ? hasPending
                                                ? "text-orange-500"
                                                : "text-reject"
                                              : "text-pass",
                                          )}
                                        >
                                          {available.toFixed(2)} KG
                                        </span>
                                      </div>
                                      <div className="mt-1 flex flex-col">
                                        <span className="text-[9px] text-cut font-black uppercase">
                                          {fab.name}
                                        </span>
                                        <span className="text-[8px] text-text3 font-mono">
                                          {fab.gsm ? `${fab.gsm} GSM` : "-"}
                                        </span>
                                      </div>
                                    </div>
                                    <span
                                      className={cn(
                                        "text-[8px] font-black uppercase px-2 py-0.5 rounded-full",
                                        isExceeded
                                          ? "bg-reject/10 text-reject"
                                          : available <= 0 && hasPending
                                            ? "bg-orange-500/10 text-orange-500"
                                            : hasWeight
                                              ? "bg-pass/10 text-pass"
                                              : "bg-orange-500/10 text-orange-500",
                                      )}
                                    >
                                      {isExceeded
                                        ? "Exceeds Stock"
                                        : available <= 0 && hasPending
                                          ? "Pending Accept"
                                          : hasWeight
                                            ? "Weight"
                                            : "Required"}
                                    </span>
                                  </div>
                                  <div className="relative">
                                    <input
                                      type="number"
                                      step="0.001"
                                      min="0"
                                      placeholder="0.00"
                                      disabled={available <= 0 && !hasPending}
                                      value={weightStr}
                                      onChange={(e) =>
                                        setColorWeights({
                                          ...colorWeights,
                                          [weightKey]: e.target.value,
                                        })
                                      }
                                      className={cn(
                                        "w-full bg-bg3 border rounded-xl p-3 text-sm font-black outline-none transition-all",
                                        available <= 0 && hasPending
                                          ? "border-orange-500 focus:border-orange-600 bg-orange-500/5"
                                          : hasWeight
                                            ? "border-bg4 focus:border-cut"
                                            : "border-orange-500 focus:border-orange-600",
                                      )}
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-text3">
                                      KG
                                    </span>
                                  </div>
                                  {available <= 0 && hasPending && (
                                    <button
                                      onClick={() => {
                                        const el = document.getElementById(
                                          "handover-sidebar-cutting",
                                        );
                                        el?.scrollIntoView({
                                          behavior: "smooth",
                                        });
                                      }}
                                      className="mt-3 w-full bg-orange-500 text-bg py-2 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-orange-500/20 hover:bg-orange-600"
                                    >
                                      Accept Fabric Now
                                    </button>
                                  )}
                                </div>
                              );
                            });
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Calculation Summary */}
                  {lastCalculated.length > 0 && (
                    <div className="p-4 bg-bg2 border-b border-bg4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-[10px] font-mono text-text3 uppercase tracking-widest font-black">
                          Calculation Summary ({filterStyle})
                        </h4>
                        <button
                          onClick={() => setLastCalculated([])}
                          className="text-[8px] font-mono uppercase bg-bg4 px-2 py-1 rounded"
                        >
                          Dismiss Summary
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {lastCalculated.map((res) => (
                          <div
                            key={res.color}
                            className="p-3 bg-bg3/50 rounded-xl border border-bg4 flex flex-col"
                          >
                            <span className="text-[9px] font-mono text-text3 uppercase mb-1">
                              {res.color}
                            </span>
                            <div className="flex items-baseline gap-2">
                              <span className="text-lg font-black text-cut">
                                {res.perPc}
                              </span>
                              <span className="text-[10px] font-mono text-text3">
                                kg / pc
                              </span>
                            </div>
                            <div className="mt-2 pt-2 border-t border-bg4/30 flex justify-between text-[10px] font-mono text-text3">
                              <span>Qty: {res.totalQty}</span>
                              <span>Total: {res.weight}kg</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Latest Submission Report Modal-like view */}
                  {latestReport && (
                    <div className="p-4 bg-cut/5 border-b-2 border-cut/20">
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-cut text-bg rounded-lg">
                            <Check className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-lg font-black uppercase tracking-tight">
                              Post-Cutting Report
                            </h4>
                            <p className="text-[10px] font-mono text-text3 uppercase tracking-widest">
                              Submitted on {fmtDate(latestReport.timestamp)}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setLatestReport(null)}
                          className="text-[10px] font-black uppercase bg-bg border border-bg4 px-5 py-2.5 rounded-xl hover:bg-bg2 transition-all shadow-sm active:scale-95"
                        >
                          Close Report
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <h5 className="text-[11px] font-black uppercase text-cut/70 tracking-[0.2em] border-b border-bg4 pb-2">
                            Cutting Details
                          </h5>
                          <div className="bg-bg2 border border-bg4 rounded-xl overflow-hidden">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-bg3/50 text-left">
                                  <th className="p-3 font-mono text-[9px] uppercase text-text font-black">
                                    Color
                                  </th>
                                  <th className="p-3 font-mono text-[9px] uppercase text-text font-black">
                                    Size
                                  </th>
                                  <th className="p-3 font-mono text-[9px] uppercase text-text font-black text-right">
                                    Quantity
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-bg4">
                                {latestReport.items.map(
                                  (item: any, i: number) => (
                                    <tr key={i}>
                                      <td className="p-3 font-bold">
                                        {item.color}
                                      </td>
                                      <td className="p-3 uppercase">
                                        {item.size}
                                      </td>
                                      <td className="p-3 text-right font-black text-cut">
                                        +{item.qty}
                                      </td>
                                    </tr>
                                  ),
                                )}
                                <tr className="bg-bg3/20 font-black">
                                  <td
                                    colSpan={2}
                                    className="p-3 text-right uppercase text-[9px]"
                                  >
                                    Total Produced
                                  </td>
                                  <td className="p-3 text-right text-sm">
                                    {latestReport.items.reduce(
                                      (sum: number, it: any) => sum + it.qty,
                                      0,
                                    )}{" "}
                                    Pcs
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h5 className="text-[11px] font-black uppercase text-cut/70 tracking-[0.2em] border-b border-bg4 pb-2">
                            Fabric Consumption
                          </h5>
                          <div className="grid grid-cols-1 gap-4">
                            {latestReport.fabric.length > 0 ? (
                              <>
                                {latestReport.fabric.map(
                                  (fab: any, i: number) => (
                                    <div
                                      key={i}
                                      className="bg-bg2 border-2 border-cut/10 p-5 rounded-2xl flex items-center justify-between shadow-sm"
                                    >
                                      <div>
                                        <p className="text-[10px] font-mono text-text3 uppercase tracking-widest leading-none mb-2">
                                          {fab.color}
                                        </p>
                                        <p className="text-sm font-bold">
                                          {fab.weight} KG Issued
                                        </p>
                                        <p className="text-[9px] font-mono text-text2 uppercase mt-1">
                                          For {fab.totalQty} Pieces
                                        </p>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-2xl font-black text-cut leading-none">
                                          {fab.perPc}
                                        </p>
                                        <p className="text-[10px] font-mono text-text3 uppercase mt-1">
                                          KG PER PC
                                        </p>
                                      </div>
                                    </div>
                                  ),
                                )}

                                {/* Summary Card */}
                                {latestReport.fabric.length > 1 && (
                                  <div className="bg-cut text-bg p-6 rounded-2xl shadow-xl shadow-cut/20">
                                    <p className="text-[10px] font-mono uppercase tracking-[0.2em] mb-4 opacity-80">
                                      Total Submission Summary
                                    </p>
                                    <div className="flex justify-between items-end">
                                      <div>
                                        <p className="text-3xl font-black leading-none">
                                          {latestReport.fabric
                                            .reduce(
                                              (acc: number, f: any) =>
                                                acc + f.weight,
                                              0,
                                            )
                                            .toFixed(2)}{" "}
                                          KG
                                        </p>
                                        <p className="text-[10px] font-mono uppercase mt-2 opacity-80">
                                          Total Combined Weight
                                        </p>
                                      </div>
                                      <div className="text-right border-l border-bg/20 pl-6">
                                        <p className="text-3xl font-black leading-none">
                                          {(
                                            latestReport.fabric.reduce(
                                              (acc: number, f: any) =>
                                                acc + f.weight,
                                              0,
                                            ) /
                                            latestReport.items.reduce(
                                              (sum: number, it: any) =>
                                                sum + it.qty,
                                              0,
                                            )
                                          ).toFixed(3)}
                                        </p>
                                        <p className="text-[10px] font-mono uppercase mt-2 opacity-80">
                                          Avg KG / PC
                                        </p>
                                      </div>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-bg/10 flex justify-between text-[10px] font-mono uppercase">
                                      <span>
                                        Components: {latestReport.fabric.length}
                                      </span>
                                      <span>
                                        Total Pcs:{" "}
                                        {latestReport.items.reduce(
                                          (sum: number, it: any) =>
                                            sum + it.qty,
                                          0,
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="p-10 border-2 border-dashed border-bg4 rounded-2xl text-center">
                                <p className="text-[10px] font-mono text-text3 uppercase tracking-widest">
                                  No fabric weight data submitted
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-bg3/50 border-b border-bg4 text-text">
                          <th className="p-4 text-xs font-mono uppercase font-black">
                            Style Number
                          </th>
                          <th className="p-4 text-xs font-mono uppercase font-black">
                            Color
                          </th>
                          <th className="p-4 text-xs font-mono uppercase font-black text-center">
                            Size
                          </th>
                          <th className="p-4 text-xs font-mono uppercase font-black text-center">
                            Total Program
                          </th>
                          <th className="p-4 text-xs font-mono uppercase font-black text-center">
                            Already Cut
                          </th>
                          <th className="p-4 text-xs font-mono uppercase font-black text-center text-po">
                            Bal of Prog
                          </th>
                          <th className="p-4 text-xs font-mono uppercase font-black text-center text-reject">
                            Overall Bal
                          </th>
                          <th className="p-4 text-xs font-mono uppercase font-black w-32">
                            Cut Qty
                          </th>
                          <th className="p-4 text-xs font-mono uppercase font-black w-10 text-center">
                            Return
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-bg4">
                        {filteredProducts.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="p-12 text-center">
                              <p className="text-text3 text-xs font-mono uppercase tracking-widest">
                                {products.length > 0 && !showCompleted
                                  ? "All products in this PO are completed. Switch to 'Show All' to view them."
                                  : "No products found for the selected filters."}
                              </p>
                            </td>
                          </tr>
                        ) : (
                          filteredProducts.map((p) => {
                            const totalProgram = p.planned_qty || 0;
                            const alreadyCut = p.total_cut || 0;
                            const balOfProg = totalProgram - alreadyCut;
                            const overallBal = (p.qty || 0) - alreadyCut;

                            return (
                              <tr
                                key={p.id}
                                className={cn(
                                  "hover:bg-bg3/20 transition-colors",
                                  p.priority === "Urgent"
                                    ? "bg-reject/[0.02]"
                                    : "",
                                )}
                              >
                                <td className="p-4">
                                  <div className="flex items-center gap-2">
                                    <p className="font-bold text-sm tracking-tight">
                                      {p.style_num}
                                    </p>
                                    {(() => {
                                      const currentPacked = Math.max(0, Number(p.total_accepted_packed_qty || 0) - Number(p.total_shipped || 0));
                                      return currentPacked > 0 ? (
                                        <span className="bg-amber-500/10 text-amber-600 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase animate-pulse font-sans">
                                          ⚠️ PACKED: {currentPacked} Pcs
                                        </span>
                                      ) : null;
                                    })()}
                                    {Number(p.total_accepted_blister_qty || 0) > 0 && (
                                      <span className="bg-amber-500/10 text-amber-600 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase font-sans">
                                        📦 Blister: {p.total_accepted_blister_qty} Pcs
                                      </span>
                                    )}
                                    {p.priority === "Urgent" && (
                                      <span className="bg-reject text-bg text-[8px] font-black px-1.5 py-0.5 rounded uppercase animate-pulse">
                                        Urgent
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-4">
                                  <p className="text-xs font-bold text-text2 uppercase">
                                    {p.color}
                                  </p>
                                </td>
                                <td className="p-4 text-center">
                                  <p className="text-xs font-mono font-black text-cut uppercase bg-cut/5 px-2 py-0.5 rounded inline-block">
                                    {p.size}
                                  </p>
                                </td>
                                <td className="p-4 text-center font-mono text-sm">
                                  {totalProgram}
                                </td>
                                <td className="p-4 text-center">
                                  <div className="space-y-1 mx-auto max-w-[120px]">
                                    <div className="flex justify-between items-end">
                                      <p className="font-bold text-xs">
                                        {alreadyCut}
                                      </p>
                                      <p className="text-[10px] text-text3">
                                        {totalProgram > 0
                                          ? Math.round(
                                              (alreadyCut / totalProgram) * 100,
                                            )
                                          : 0}
                                        %
                                      </p>
                                    </div>
                                    <div className="w-full bg-bg4 h-1 rounded-full overflow-hidden">
                                      <div
                                        className="bg-cut h-full transition-all duration-500"
                                        style={{
                                          width: `${totalProgram > 0 ? Math.min((alreadyCut / totalProgram) * 100, 100) : 0}%`,
                                        }}
                                      />
                                    </div>
                                  </div>
                                </td>
                                <td className="p-4 text-center font-mono text-sm text-po font-bold bg-po/5">
                                  {balOfProg}
                                </td>
                                <td className="p-4 text-center font-mono text-sm text-reject font-bold bg-bg3/10">
                                  {overallBal}
                                </td>
                                <td className="p-4 relative">
                                  <div className="relative">
                                    <input
                                      type="number"
                                      min="0"
                                      value={quantities[p.id] || ""}
                                      onChange={(e) =>
                                        setQuantities({
                                          ...quantities,
                                          [p.id]: e.target.value,
                                        })
                                      }
                                      className={cn(
                                        "w-full bg-bg3 border rounded-xl p-2.5 text-sm font-black text-center focus:ring-1 outline-none transition-all",
                                        totalProgram > 0 &&
                                          alreadyCut +
                                            parseInt(quantities[p.id] || "0") >=
                                            totalProgram &&
                                          parseInt(quantities[p.id] || "0") > 0
                                          ? "border-pass focus:border-pass focus:ring-pass/20"
                                          : "border-bg4 focus:border-cut focus:ring-cut/20",
                                      )}
                                    />
                                    {totalProgram > 0 &&
                                      alreadyCut +
                                        parseInt(quantities[p.id] || "0") >=
                                        totalProgram &&
                                      parseInt(quantities[p.id] || "0") > 0 && (
                                        <div className="absolute -top-2 -right-2 bg-pass text-white text-[8px] font-black px-1.5 py-1 rounded shadow-lg animate-bounce-slow flex items-center gap-1 z-10">
                                          <Check className="w-2 h-2" /> MET!
                                        </div>
                                      )}
                                  </div>
                                </td>
                                <td className="p-4 text-center">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      onClick={() => {
                                        setReturnProduct({
                                          po_number: p.po_number,
                                          product_id: p.id,
                                          style_num: p.style_num,
                                          color: p.color,
                                          size: p.size,
                                          available_qty: Math.max(0, (p.total_cut || 0) - (p.total_sent || p.total_accepted_sent || 0)),
                                        });
                                        setIsReturnModalOpen(true);
                                      }}
                                      className="p-1 text-text3 hover:text-po transition-colors"
                                      title="Send back to other department"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        setDiscardProduct({
                                          po_number: p.po_number,
                                          product_id: p.id,
                                          style_num: p.style_num,
                                          color: p.color,
                                          size: p.size,
                                          available_qty: p.total_cut || 0,
                                        });
                                        setIsDiscardModalOpen(true);
                                      }}
                                      className="p-1 text-text3 hover:text-reject transition-colors"
                                      title="Partial Discard of this item"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Recent Entries for current PO */}
              {selectedPONum && (
                <div className="mt-8 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 text-text3" />
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-text3">
                        Recent Entries (This PO)
                      </h4>
                    </div>

                    <div className="flex items-center gap-2 bg-bg2 p-1.5 rounded-xl border border-bg4">
                      <div className="flex items-center gap-2 px-2 border-r border-bg4/50">
                        <span className="text-[9px] font-mono text-text3 uppercase">
                          From
                        </span>
                        <input
                          type="date"
                          value={historyDateRange.start}
                          onChange={(e) =>
                            setHistoryDateRange((prev) => ({
                              ...prev,
                              start: e.target.value,
                            }))
                          }
                          className="bg-transparent border-none text-[10px] font-bold focus:ring-0 p-0 h-4"
                        />
                      </div>
                      <div className="flex items-center gap-2 px-2">
                        <span className="text-[9px] font-mono text-text3 uppercase">
                          To
                        </span>
                        <input
                          type="date"
                          value={historyDateRange.end}
                          onChange={(e) =>
                            setHistoryDateRange((prev) => ({
                              ...prev,
                              end: e.target.value,
                            }))
                          }
                          className="bg-transparent border-none text-[10px] font-bold focus:ring-0 p-0 h-4"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-sm">
                    <div className="max-h-[400px] overflow-auto">
                      <table className="w-full text-left border-collapse border-b border-bg4 min-w-[600px]">
                        <thead className="sticky top-0 z-10 bg-bg3/95 backdrop-blur-sm border-b border-bg4">
                          <tr className="text-text2">
                            <th className="p-3 text-[9px] font-mono uppercase font-black">
                              Time
                            </th>
                            <th className="p-3 text-[9px] font-mono uppercase font-black">
                              Style
                            </th>
                            <th className="p-3 text-[9px] font-mono uppercase font-black">
                              Color
                            </th>
                            <th className="p-3 text-[9px] font-mono uppercase font-black text-center">
                              Size
                            </th>
                            <th className="p-3 text-[9px] font-mono uppercase font-black text-right">
                              Qty
                            </th>
                            <th className="p-3 text-[9px] font-mono uppercase font-black text-center w-24">
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-bg4">
                          {Object.entries(
                            history
                              .filter((h) => {
                                const date = h.created_at.split("T")[0];
                                return (
                                  h.po_number === selectedPONum &&
                                  date >= historyDateRange.start &&
                                  date <= historyDateRange.end
                                );
                              })
                              .reduce(
                                (groups, rec) => {
                                  const date = new Date(
                                    rec.created_at,
                                  ).toLocaleDateString([], {
                                    weekday: "short",
                                    day: "numeric",
                                    month: "short",
                                  });
                                  if (!groups[date]) groups[date] = [];
                                  groups[date].push(rec);
                                  return groups;
                                },
                                {} as Record<string, any[]>,
                              ),
                          ).length > 0 ? (
                            Object.entries(
                              history
                                .filter((h) => {
                                  const date = h.created_at.substring(0, 10);
                                  return (
                                    h.po_number === selectedPONum &&
                                    date >= historyDateRange.start &&
                                    date <= historyDateRange.end
                                  );
                                })
                                .reduce(
                                  (groups, rec) => {
                                    const date = new Date(
                                      rec.created_at,
                                    ).toLocaleDateString([], {
                                      weekday: "short",
                                      day: "numeric",
                                      month: "short",
                                    });
                                    if (!groups[date]) groups[date] = [];
                                    groups[date].push(rec);
                                    return groups;
                                  },
                                  {} as Record<string, any[]>,
                                ),
                            ).map(([date, records]) => (
                              <React.Fragment key={date}>
                                <tr className="bg-bg3/30">
                                  <td
                                    colSpan={6}
                                    className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-text3 border-y border-bg4/50"
                                  >
                                    {date}
                                  </td>
                                </tr>
                                {(records as any[]).map((rec) => (
                                  <tr
                                    key={rec.id}
                                    className="hover:bg-bg3/20 transition-colors group"
                                  >
                                    <td className="p-3 text-[10px] font-mono text-text3">
                                      {new Date(
                                        rec.created_at,
                                      ).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </td>
                                    <td className="p-3 text-[10px] font-bold">
                                      {rec.style_num}
                                    </td>
                                    <td className="p-3 text-[10px] font-medium uppercase">
                                      {rec.color}
                                    </td>
                                    <td className="p-3 text-[10px] text-center font-mono">
                                      {rec.size}
                                    </td>
                                    <td className="p-3 text-[10px] text-right font-black text-cut">
                                      {editingId === rec.id ? (
                                        <input
                                          autoFocus
                                          type="number"
                                          value={editValue}
                                          onChange={(e) =>
                                            setEditValue(e.target.value)
                                          }
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter")
                                              handleUpdate(rec.id);
                                            if (e.key === "Escape")
                                              setEditingId(null);
                                          }}
                                          className="w-16 bg-bg text-right px-1 border border-cut rounded outline-none focus:ring-1 focus:ring-cut"
                                        />
                                      ) : (
                                        `+${rec.quantity}`
                                      )}
                                    </td>
                                    <td className="p-3 text-center">
                                      <div className="flex items-center justify-center gap-1">
                                        {editingId === rec.id ? (
                                          <>
                                            <button
                                              onClick={() =>
                                                handleUpdate(rec.id)
                                              }
                                              className="p-1 px-2 bg-pass text-white text-[8px] font-black uppercase rounded shadow-sm hover:bg-pass/90"
                                            >
                                              Save
                                            </button>
                                            <button
                                              onClick={() => setEditingId(null)}
                                              className="p-1 px-2 bg-bg3 text-text3 text-[8px] font-black uppercase rounded border border-bg4"
                                            >
                                              Esc
                                            </button>
                                          </>
                                        ) : rec.status === "pending" ? (
                                          <>
                                            <button
                                              onClick={() => {
                                                setEditingId(rec.id);
                                                setEditValue(
                                                  rec.quantity.toString(),
                                                );
                                              }}
                                              className="p-1.5 text-po hover:bg-po/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                              title="Edit entry"
                                            >
                                              <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                            <ChangeRecordPOButton
                                              recordId={rec.id}
                                              currentPo={selectedPONum}
                                              department="cutting"
                                              pos={pos}
                                              onSuccess={() => {
                                                fetchHistory();
                                                handlePOChange(selectedPONum);
                                              }}
                                            />
                                            <button
                                              onClick={() => {
                                                setConfirmDialog({
                                                  title: "Delete Cutting Entry",
                                                  message: "Are you sure you want to delete this cutting entry? This will NOT delete associated fabric weight.",
                                                  onConfirm: async () => {
                                                    try {
                                                      await cuttingService.delete(rec.id);
                                                      fetchHistory();
                                                      handlePOChange(selectedPONum);
                                                    } catch (error: any) {
                                                      alert(error.message);
                                                    }
                                                  },
                                                });
                                              }}
                                              className="p-1.5 text-reject hover:bg-reject/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                              title="Delete entry"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </>
                                        ) : (
                                          <span className="text-[9px] font-mono font-black uppercase text-pass flex items-center justify-center gap-1 bg-pass/10 px-2 py-1 rounded">
                                            <Check className="w-3 h-3 text-pass" />{" "}
                                            Accepted
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </React.Fragment>
                            ))
                          ) : (
                            <tr>
                              <td
                                colSpan={6}
                                className="p-8 text-center text-[10px] text-text3 font-mono uppercase tracking-widest"
                              >
                                No records found for this date range
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div
              className="lg:col-span-1 space-y-6"
              id="handover-sidebar-cutting"
            >
              <ReturnsHandoverList
                department="Cutting"
                onRefresh={() => {
                  fetchPOs();
                  if (selectedPONum) handlePOChange(selectedPONum);
                }}
              />

              <HandoverList
                title="Incoming Fabric"
                table="fabric_records"
                records={
                  selectedPONum
                    ? incomingFabric.filter(
                        (r) => r.po_number === selectedPONum,
                      )
                    : incomingFabric
                }
                onRefresh={() => {
                  fetchIncomingFabric();
                  if (selectedPONum) fetchFabricBalances(selectedPONum);
                }}
              />

              {!selectedPONum && (
                <div className="bg-bg2 border border-bg4 p-6 rounded-2xl text-center">
                  <Package className="w-8 h-8 text-text3/20 mx-auto mb-3" />
                  <p className="text-[10px] font-mono text-text3 uppercase tracking-widest">
                    Select a PO to filter incoming fabric
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Aggregated Style/Color Consumption Table */}
            <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-6 bg-cut/5 border-b border-bg4 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                <div className="space-y-1">
                  <h3 className="text-xl font-black uppercase tracking-tight text-cut">
                    1. Color Combination Summary
                  </h3>
                  <p className="text-[10px] font-mono text-text3 uppercase">
                    Aggregated averages by product color combinations
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  {/* Date Filters */}
                  <div className="flex items-center gap-2 bg-bg3 p-1.5 rounded-xl border border-bg4">
                    <div className="flex flex-col px-3">
                      <span className="text-[10px] font-mono text-text3 uppercase font-bold">
                        From
                      </span>
                      <input
                        type="date"
                        value={dateRange.start}
                        onChange={(e) =>
                          setDateRange((prev) => ({
                            ...prev,
                            start: e.target.value,
                          }))
                        }
                        className="bg-transparent text-xs font-black text-text outline-none"
                      />
                    </div>
                    <div className="w-px h-8 bg-bg4" />
                    <div className="flex flex-col px-3">
                      <span className="text-[10px] font-mono text-text3 uppercase font-bold">
                        To
                      </span>
                      <input
                        type="date"
                        value={dateRange.end}
                        onChange={(e) =>
                          setDateRange((prev) => ({
                            ...prev,
                            end: e.target.value,
                          }))
                        }
                        className="bg-transparent text-xs font-black text-text outline-none"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => setShowReport(!showReport)}
                    className={cn(
                      "px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg active:scale-95",
                      showReport
                        ? "bg-bg4 text-text hover:bg-bg3 border border-bg4"
                        : "bg-cut text-white hover:bg-orange-600 hover:shadow-cut/30 shadow-cut/20",
                    )}
                  >
                    {showReport ? "Hide Reports" : "Generate Reports"}
                  </button>

                  {showReport && (
                    <div className="relative w-full md:w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text3 w-4 h-4" />
                      <input
                        type="text"
                        placeholder="Global Reports Search..."
                        value={reportSearch}
                        onChange={(e) => {
                          setReportSearch(e.target.value);
                          setHistorySearch(e.target.value);
                        }}
                        className="w-full bg-bg3 border border-bg4 rounded-xl py-2 pl-10 pr-4 text-xs font-bold focus:border-cut focus:ring-1 focus:ring-cut/20 outline-none transition-all"
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-bg3/30 text-text border-b border-bg4 group/header">
                      <th className="p-4 font-mono text-xs uppercase tracking-widest font-black border-r border-bg4">
                        Color Combination
                      </th>
                      <th className="p-4 font-mono text-xs uppercase tracking-widest font-black border-r border-bg4">
                        Style
                      </th>
                      <th className="p-4 font-mono text-xs uppercase tracking-widest font-black text-right border-r border-bg4">
                        Total Consumed (KG)
                      </th>
                      <th className="p-4 font-mono text-xs uppercase tracking-widest font-black text-right border-r border-bg4">
                        Total Actual Cut Pcs
                      </th>
                      <th className="p-4 font-mono text-xs uppercase tracking-widest font-black text-right border-r border-bg4 text-cut">
                        Actual Cons.
                      </th>
                      <th className="p-4 font-mono text-xs uppercase tracking-widest font-black text-right text-black">
                        Expected Cons.
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bg4">
                    {!showReport ? (
                      <tr>
                        <td colSpan={6} className="p-16 text-center">
                          <div className="flex flex-col items-center gap-4">
                            <div className="p-4 bg-bg3 rounded-full">
                              <History className="w-8 h-8 text-text3/30" />
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm font-black uppercase tracking-widest text-text2">
                                Analysis Standby
                              </p>
                              <p className="text-[10px] font-mono text-text3 uppercase max-w-xs mx-auto">
                                Select a date range and click "Generate Reports"
                                to process and view summary analytics.
                              </p>
                            </div>
                            <button
                              onClick={() => setShowReport(true)}
                              className="mt-2 px-10 py-4 bg-cut text-white border border-cut/20 rounded-2xl text-xs font-black uppercase hover:bg-orange-600 shadow-xl shadow-cut/20 transition-all hover:scale-105"
                            >
                              Process Data Now
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : combinations.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="p-12 text-center text-text3 italic uppercase text-xs tracking-widest"
                        >
                          No consumption data found in the selected date range
                        </td>
                      </tr>
                    ) : (
                      combinations.map((comb) => {
                        const isExpanded = expandedColors.includes(
                          comb.combinationId,
                        );
                        return (
                          <React.Fragment key={comb.combinationId}>
                            {/* Main Combination Row */}
                            <tr
                              onClick={() => {
                                if (isExpanded)
                                  setExpandedColors(
                                    expandedColors.filter(
                                      (c) => c !== comb.combinationId,
                                    ),
                                  );
                                else
                                  setExpandedColors([
                                    ...expandedColors,
                                    comb.combinationId,
                                  ]);
                              }}
                              className={cn(
                                "cursor-pointer transition-colors border-b border-bg4 font-black group",
                                isExpanded
                                  ? "bg-bg3 shadow-inner"
                                  : "hover:bg-bg3/30",
                              )}
                            >
                              <td className="p-4 border-r border-bg4">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-2">
                                    {isExpanded ? (
                                      <ChevronDown className="w-4 h-4 text-cut" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4 text-text3" />
                                    )}
                                    <span className="text-sm uppercase tracking-tight text-text1">
                                      {comb.colorCombination}
                                    </span>
                                  </div>
                                  <span className="text-[8px] font-mono text-text3 ml-6 uppercase opacity-0 group-hover:opacity-100 transition-opacity">
                                    (ON CLICK)
                                  </span>
                                </div>
                              </td>
                              <td className="p-4 border-r border-bg4 text-center font-mono text-sm">
                                {comb.styleNum}
                              </td>
                              <td className="p-4 border-r border-bg4 text-right font-mono text-sm">
                                {comb.totalWeight.toFixed(2)}
                              </td>
                              <td className="p-4 border-r border-bg4 text-right font-mono text-sm">
                                {comb.totalPcs}
                              </td>
                              <td className="p-4 border-r border-bg4 text-right font-mono text-sm text-cut font-black">
                                {comb.actualCons}
                              </td>
                              <td className="p-4 text-right font-mono text-sm font-black">
                                {comb.expectedCons}
                              </td>
                            </tr>

                            {/* Breakdown Rows */}
                            {isExpanded &&
                              comb.components.map((comp: any, idx: number) => (
                                <tr
                                  key={`${comb.combinationId}-comp-${idx}`}
                                  className="bg-bg2/50 border-b border-bg4/30 animate-in fade-in slide-in-from-top-1 duration-200"
                                >
                                  <td className="p-3 pl-10 border-r border-bg4/30 text-[11px] uppercase font-bold text-text2">
                                    <div>{comp.color}</div>
                                    <div className="text-[9px] text-text3 font-mono font-medium">
                                      {comp.fabric_name || "-"} /{" "}
                                      {comp.gsm || "-"} GSM
                                    </div>
                                  </td>
                                  <td className="p-3 border-r border-bg4/30 text-center font-mono text-[11px] text-text3">
                                    {comp.style_num}
                                  </td>
                                  <td className="p-3 border-r border-bg4/30 text-right font-mono text-[11px]">
                                    {Number(comp.total_kg).toFixed(2)}
                                  </td>
                                  <td className="p-3 border-r border-bg4/30 text-right font-mono text-[11px]">
                                    {comp.total_qty}
                                  </td>
                                  <td className="p-3 border-r border-bg4/30 text-right font-mono text-[11px] text-cut/70">
                                    {comp.actual_consumption}
                                  </td>
                                  <td className="p-3 text-right font-mono font-black text-sm text-text1">
                                    {comp.expected_consumption}
                                  </td>
                                </tr>
                              ))}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 2. Individual Color Tables */}
            {showReport && individualColorStats.length > 0 && (
              <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
                <div className="p-6 bg-bg3/30 border-b border-bg4">
                  <h3 className="text-xl font-black uppercase tracking-tight text-po">
                    2. Individual Color Tables
                  </h3>
                  <p className="text-[10px] font-mono text-text3 uppercase">
                    Consumption broken down by individual colors
                  </p>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {individualColorStats.map((colorSet) => (
                    <div key={colorSet.color} className="space-y-4">
                      <h4 className="text-sm font-black text-cut uppercase tracking-widest border-b-2 border-cut pb-2 inline-block">
                        {colorSet.originalColorName}
                      </h4>
                      <div className="bg-bg3/50 rounded-xl overflow-hidden border border-bg4">
                        <table className="w-full text-[10px] text-left">
                          <thead>
                            <tr className="bg-bg4/30 text-text3">
                              <th className="p-2 uppercase font-black">
                                Style
                              </th>
                              <th className="p-2 uppercase font-black text-right">
                                Total KG
                              </th>
                              <th className="p-2 uppercase font-black text-right text-black">
                                Actual
                              </th>
                              <th className="p-2 uppercase font-black text-right text-black">
                                Expected
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-bg4/30">
                            {colorSet.stats.map((s: any, i: number) => (
                              <tr key={i}>
                                <td className="p-2 font-bold">{s.style_num}</td>
                                <td className="p-2 text-right font-mono">
                                  {Number(s.total_kg).toFixed(2)}
                                </td>
                                <td className="p-2 text-right font-mono text-cut font-black">
                                  {s.actual_consumption}
                                </td>
                                <td className="p-2 text-right font-mono text-black font-black">
                                  {s.expected_consumption}
                                </td>
                              </tr>
                            ))}
                            <tr className="bg-bg4/10 font-black border-t border-bg4">
                              <td className="p-2 uppercase">TOTAL</td>
                              <td className="p-2 text-right font-mono">
                                {colorSet.totalKg.toFixed(2)}
                              </td>
                              <td className="p-2 text-right font-mono text-cut">
                                {colorSet.actualCons}
                              </td>
                              <td className="p-2 text-right font-mono text-black">
                                {colorSet.expectedCons}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Detailed Entry History Table */}
            {showReport && (
              <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
                <div className="p-6 bg-bg3/30 border-b border-bg4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-xl font-black uppercase tracking-tight text-text1">
                      3. Detailed Cutting Log
                    </h3>
                    <p className="text-[10px] font-mono text-text3 uppercase">
                      Individual entry records for matching period
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="relative w-full md:w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text3 w-3.5 h-3.5" />
                      <input
                        type="text"
                        placeholder="Search Log (PO, Style, User)..."
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        className="w-full bg-bg3 border border-bg4 rounded-xl py-1.5 pl-9 pr-4 text-[10px] font-bold focus:border-cut focus:ring-1 focus:ring-cut/20 outline-none transition-all placeholder:text-text3/50"
                      />
                    </div>
                    <div className="h-6 w-px bg-bg4 hidden md:block" />
                    <span className="text-[10px] font-mono text-text3 uppercase bg-bg4 px-3 py-1 rounded-full whitespace-nowrap">
                      {pivotedHistory.rows.length} Records
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-bg2 text-text border-b border-bg4">
                        <th className="p-4 font-mono text-xs uppercase tracking-widest font-black sticky left-0 bg-bg2 z-10">
                          Date
                        </th>
                        <th className="p-4 font-mono text-xs uppercase tracking-widest font-black">
                          PO # / Buyer
                        </th>
                        <th className="p-4 font-mono text-xs uppercase tracking-widest font-black">
                          Style
                        </th>
                        <th className="p-4 font-mono text-xs uppercase tracking-widest font-black">
                          Color
                        </th>
                        {pivotedHistory.sizes.map((size) => (
                          <th
                            key={size}
                            className="p-4 font-mono text-xs uppercase tracking-widest font-black text-center min-w-[60px] bg-bg3/20"
                          >
                            {size}
                          </th>
                        ))}
                        <th className="p-4 font-mono text-xs uppercase tracking-widest font-black text-center bg-bg4/30">
                          Total
                        </th>
                        <th className="p-4 font-mono text-xs uppercase tracking-widest font-black">
                          Creator
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-bg4">
                      {pivotedHistory.rows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={pivotedHistory.sizes.length + 6}
                            className="p-8 text-center text-text3 italic uppercase text-[10px] tracking-widest"
                          >
                            No records matching filters
                          </td>
                        </tr>
                      ) : (
                        pivotedHistory.rows.map((row: any, i: number) => {
                          const total = Object.values(row.sizes).reduce(
                            (sum: number, q: any) => sum + q,
                            0,
                          ) as number;
                          return (
                            <tr
                              key={i}
                              className="hover:bg-bg3/50 transition-colors"
                            >
                              <td className="p-4 font-mono text-xs text-text3 sticky left-0 bg-bg2/90 backdrop-blur-sm z-10 font-bold">
                                {fmtDate(row.date)}
                              </td>
                              <td className="p-4">
                                <p className="font-bold text-po text-sm">
                                  {row.po_number}
                                </p>
                                <p className="text-[10px] text-text3 uppercase font-medium">
                                  {row.buyer}
                                </p>
                              </td>
                              <td className="p-4 font-black">
                                {row.style_num}
                              </td>
                              <td className="p-4 font-bold uppercase text-text2">
                                {row.color}
                              </td>
                              {pivotedHistory.sizes.map((size) => (
                                <td
                                  key={size}
                                  className="p-4 text-center font-mono text-xs font-bold"
                                >
                                  {row.sizes[size] ? (
                                    <span className="text-cut">
                                      {row.sizes[size]}
                                    </span>
                                  ) : (
                                    <span className="text-text3/20">-</span>
                                  )}
                                </td>
                              ))}
                              <td className="p-4 text-center bg-bg4/10">
                                <span className="bg-cut text-white px-3 py-1 rounded-full font-black text-[11px]">
                                  {total}
                                </span>
                              </td>
                              <td className="p-4 font-mono text-[10px] text-text3 truncate max-w-[120px]">
                                {row.creator_name}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 4. Date-wise Individual Fabric Consumption Report */}
            {showReport && (
              <div id="fabric-consumption-report-section" className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl mt-8">
                <div className="p-6 bg-amber-500/5 border-b border-bg4 flex flex-col lg:flex-row lg:items-center justify-between gap-6 font-sans">
                  <div className="space-y-1">
                    <h3 className="text-xl font-black uppercase tracking-tight text-amber-500">
                      4. Date-Wise Individual Fabric Consumption
                    </h3>
                    <p className="text-[10px] font-mono text-text3 uppercase">
                      Individual consumption metrics per cutting batch / entry
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    {/* Dedicated Date Filters for Fabric Report */}
                    <div className="flex items-center gap-2 bg-bg3 p-1.5 rounded-xl border border-bg4">
                      <div className="flex flex-col px-3">
                        <span className="text-[10px] font-mono text-text3 uppercase font-bold">
                          From
                        </span>
                        <input
                          type="date"
                          value={fabricReportDateRange.start}
                          onChange={(e) =>
                            setFabricReportDateRange((prev) => ({
                              ...prev,
                              start: e.target.value,
                            }))
                          }
                          className="bg-transparent text-xs font-black text-text outline-none"
                        />
                      </div>
                      <div className="w-px h-8 bg-bg4" />
                      <div className="flex flex-col px-3">
                        <span className="text-[10px] font-mono text-text3 uppercase font-bold">
                          To
                        </span>
                        <input
                          type="date"
                          value={fabricReportDateRange.end}
                          onChange={(e) =>
                            setFabricReportDateRange((prev) => ({
                              ...prev,
                              end: e.target.value,
                            }))
                          }
                          className="bg-transparent text-xs font-black text-text outline-none"
                        />
                      </div>
                    </div>

                    {/* Dedicated Search Filter */}
                    <div className="relative w-full md:w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text3 w-3.5 h-3.5" />
                      <input
                        type="text"
                        placeholder="Search Fabric Log (PO, Style)..."
                        value={fabricReportSearch}
                        onChange={(e) => setFabricReportSearch(e.target.value)}
                        className="w-full bg-bg3 border border-bg4 rounded-xl py-1.5 pl-9 pr-4 text-[10px] font-bold focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 outline-none transition-all placeholder:text-text3/50"
                      />
                    </div>

                    <span className="text-[10px] font-mono text-[11px] font-black text-amber-600 bg-amber-500/10 px-3 py-1 rounded-full whitespace-nowrap">
                      {individualFabricConsReport.length} Entries
                    </span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-bg3 text-text border-b border-bg4">
                        <th className="p-4 font-mono text-xs uppercase tracking-widest font-black sticky left-0 bg-bg3 z-10">
                          Date
                        </th>
                        <th className="p-4 font-mono text-xs uppercase tracking-widest font-black">
                          PO Number
                        </th>
                        <th className="p-4 font-mono text-xs uppercase tracking-widest font-black">
                          Style
                        </th>
                        <th className="p-4 font-mono text-xs uppercase tracking-widest font-black">
                          Color
                        </th>
                        <th className="p-4 font-mono text-xs uppercase tracking-widest font-black">
                          Fabric Type
                        </th>
                        {REPORT_SIZES.map(sz => (
                          <th key={sz} className="p-2 font-mono text-xs uppercase tracking-widest font-black text-center min-w-[50px] bg-bg3/45">
                            {getDisplaySizeLabel(sz)}
                          </th>
                        ))}
                        <th className="p-4 font-mono text-xs uppercase tracking-widest font-black text-center">
                          Total Pcs Cut
                        </th>
                        <th className="p-4 font-mono text-xs uppercase tracking-widest font-black text-right">
                          Weight Used
                        </th>
                        <th className="p-4 font-mono text-xs uppercase tracking-widest font-black text-right text-pass bg-pass/5">
                          Expected Consumption
                        </th>
                        <th className="p-4 font-mono text-xs uppercase tracking-widest font-black text-right text-cut font-black bg-cut/5">
                          Actual Consumption
                        </th>
                        <th className="p-4 font-mono text-xs uppercase tracking-widest font-black text-center w-28">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-bg4">
                      {individualFabricConsReport.length === 0 ? (
                        <tr>
                          <td
                            colSpan={18}
                            className="p-8 text-center text-text3 italic uppercase text-[10px] tracking-widest font-bold"
                          >
                            No matching cutting entries with consumption recorded
                          </td>
                        </tr>
                      ) : (
                        individualFabricConsReport.map((row: any, idx: number) => {
                          const rowKey = `${row.created_at || row.date}_${row.po_number}_${row.style_num}_${row.color}`;
                          const isExpanded = expandedFabricRows.includes(rowKey);
                          const displayMatches = row.matches && row.matches.length > 1 ? row.matches : [];
                          
                          const expectedValueCombined = getExpectedConsForGroup(row.style_num, row.matches, row.po_number);
                          const hasConfiguredCombined = expectedValueCombined !== null;
                          const isOverConsumedCombined = hasConfiguredCombined && row.actualCons > (expectedValueCombined as number) && row.actualCons > 0;

                          const toggleRow = () => {
                            if (isExpanded) {
                              setExpandedFabricRows(expandedFabricRows.filter(k => k !== rowKey));
                            } else {
                              setExpandedFabricRows([...expandedFabricRows, rowKey]);
                            }
                          };

                          if (isExpanded && displayMatches.length > 0) {
                            return displayMatches.map((m: any, mIdx: number) => {
                              const actCons = row.total_pcs > 0 ? (m.quantity_kg / row.total_pcs) : 0;
                              const expectedValue = getExpectedConsForGroup(row.style_num, [m], row.po_number);
                              const hasConfigured = expectedValue !== null;
                              const isOverConsumed = hasConfigured && actCons > (expectedValue as number) && actCons > 0;
                              return (
                                <tr 
                                  key={`${rowKey}-split-${mIdx}`} 
                                  onClick={toggleRow}
                                  className="cursor-pointer bg-amber-500/[0.04] hover:bg-amber-500/[0.08] border-b border-dashed border-amber-500/20 transition-all duration-200"
                                  title="Click to merge fabrics back into combined row"
                                >
                                  <td className="p-4 font-mono text-xs text-text3 font-bold flex items-center gap-1">
                                    <span className="text-amber-500 font-extrabold text-base">↳</span>
                                    {fmtDate(row.date)}
                                  </td>
                                  <td className="p-4 font-bold text-red-600 bg-red-500/[0.01]">
                                    {row.po_number || "-"}
                                  </td>
                                  <td className="p-4 font-black text-slate-800">
                                    {row.style_num || "-"}
                                  </td>
                                  <td className="p-4 font-bold uppercase text-slate-700">
                                    {m.color || row.color || "-"}
                                  </td>
                                  <td className="p-4 font-bold text-amber-600 font-mono flex items-center gap-1.5">
                                    <span className="bg-amber-500/10 px-2 py-0.5 rounded text-[10px] uppercase font-black tracking-wide">
                                      {m.fabric_name || 'Standard'}
                                    </span>
                                    <span>{m.gsm ? `(${m.gsm} GSM)` : ''}</span>
                                  </td>
                                  {REPORT_SIZES.map(sz => {
                                    const qty = row.sizes[sz.toUpperCase()] || 0;
                                    return (
                                      <td key={sz} className="p-2 text-center font-mono text-xs font-bold bg-amber-500/5">
                                        {qty > 0 ? (
                                          <span className="text-amber-500 font-extrabold">{qty}</span>
                                        ) : (
                                          <span className="text-text3/30">-</span>
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td className="p-4 text-center font-black font-mono text-sm text-text1">
                                    {row.total_pcs || 0}{" "}
                                    <span className="text-[9px] opacity-65">PCS</span>
                                  </td>
                                  <td className="p-4 text-right font-black text-sm text-red-600 bg-red-500/5">
                                    {m.quantity_kg > 0 ? `${m.quantity_kg.toFixed(2)} KG` : '-'}
                                  </td>
                                  <td className="p-4 text-right font-mono font-bold text-sm text-text border-r border-bg4/20 bg-bg2">
                                    {hasConfigured ? (
                                      <div>
                                        {expectedValue.toFixed(3)}{' '}
                                        <span className="text-[9px] font-medium opacity-65 uppercase">kg/pc</span>
                                        <div className="text-[8px] font-mono text-pass uppercase tracking-widest font-bold mt-0.5">Configured</div>
                                      </div>
                                    ) : (
                                      <span className="text-text3/50">-</span>
                                    )}
                                  </td>
                                  <td className={cn(
                                    "p-4 text-right font-mono font-extrabold text-base transition-all duration-300",
                                    isOverConsumed ? "text-reject bg-reject/10 animate-pulse-slow" : "text-amber-500 bg-amber-500/5"
                                  )}>
                                    {m.quantity_kg > 0 ? `${actCons.toFixed(3)}` : '0.000'}{" "}
                                    <span className="text-[9px] font-medium opacity-65 uppercase">
                                      kg/pc
                                    </span>
                                    {isOverConsumed && (
                                      <div className="text-[8px] font-mono text-reject uppercase tracking-widest font-black mt-0.5">
                                        EXCEEDS TARGET ⚠️
                                      </div>
                                    )}
                                  </td>
                                  <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                                    {m.id ? (
                                      <button
                                        onClick={() => {
                                          setCorrectionTarget({
                                            fabric_record_id: m.id,
                                            po_number: m.po_number || row.po_number,
                                            style_num: m.style_num || row.style_num,
                                            color: m.color || row.color,
                                            fabric_name: m.fabric_name || 'Standard',
                                            gsm: m.gsm || null,
                                            old_quantity_kg: m.quantity_kg,
                                            cut_quantity: row.total_pcs || 0,
                                            date: row.date,
                                          });
                                          setCorrectionNewWeight(String(m.quantity_kg || ""));
                                          setCorrectionReason("");
                                        }}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-amber-500/10 text-amber-600 hover:bg-amber-500 hover:text-white transition-all shadow-sm cursor-pointer active:scale-95"
                                        title="Request Fabric Consumption Correction"
                                      >
                                        <Edit2 className="w-3 h-3" />
                                        Correct
                                      </button>
                                    ) : (
                                      <span className="text-text3/30 text-[10px]">-</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            });
                          }

                          const singleMatch = row.matches && row.matches.length === 1 ? row.matches[0] : null;

                          return (
                            <tr
                              key={idx}
                              onClick={toggleRow}
                              className={cn(
                                "cursor-pointer hover:bg-bg3/55 transition-colors duration-150",
                                row.matches && row.matches.length > 1 ? "border-l-4 border-amber-500/60" : ""
                              )}
                              title={row.matches && row.matches.length > 1 ? "Click to split fabrics details" : undefined}
                            >
                              <td className="p-4 font-mono text-xs text-text3 sticky left-0 bg-bg2/90 backdrop-blur-sm z-10 font-bold">
                                {fmtDate(row.date)}
                              </td>
                              <td className="p-4 font-black text-po">{row.po_number || "-"}</td>
                              <td className="p-4 font-black">{row.style_num || "-"}</td>
                              <td className="p-4 font-bold uppercase text-text2">
                                {row.color || "-"}
                              </td>
                              <td className="p-4 font-medium text-text3 font-mono">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span>{row.fabricType || "N/A"}</span>
                                  {row.matches && row.matches.length > 1 && (
                                    <span className="bg-amber-500/10 text-amber-600 text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider animate-pulse whitespace-nowrap">
                                      Click to Split ({row.matches.length})
                                    </span>
                                  )}
                                </div>
                              </td>
                              {REPORT_SIZES.map(sz => {
                                const qty = row.sizes[sz.toUpperCase()] || 0;
                                return (
                                  <td key={sz} className="p-2 text-center font-mono text-xs font-bold">
                                    {qty > 0 ? (
                                      <span className="text-amber-500 font-extrabold">{qty}</span>
                                    ) : (
                                      <span className="text-text3/30">-</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="p-4 text-center font-bold font-mono text-sm text-text1">
                                {row.total_pcs || 0}{" "}
                                <span className="text-[9px] opacity-65">PCS</span>
                              </td>
                              <td className="p-4 text-right font-black text-sm text-po">
                                {row.weightUsed > 0
                                  ? `${row.weightUsed.toFixed(2)} KG`
                                  : "-"}
                              </td>
                              <td className="p-4 text-right font-mono font-bold text-sm text-text border-r border-bg4/20 bg-bg2">
                                {hasConfiguredCombined ? (
                                  <div>
                                    {expectedValueCombined.toFixed(3)}{' '}
                                    <span className="text-[9px] font-medium opacity-65 uppercase">kg/pc</span>
                                    <div className="text-[8px] font-mono text-pass uppercase tracking-widest font-bold mt-0.5">Configured</div>
                                  </div>
                                ) : (
                                  <span className="text-text3/50">-</span>
                                )}
                              </td>
                              <td className={cn(
                                "p-4 text-right font-mono font-extrabold text-base transition-all duration-300",
                                isOverConsumedCombined ? "text-reject bg-reject/10 animate-pulse-slow" : "text-cut bg-cut/5"
                              )}>
                                {row.weightUsed > 0
                                  ? `${row.actualCons.toFixed(3)}`
                                  : "0.000"}{" "}
                                <span className="text-[9px] font-medium opacity-65 uppercase">
                                  kg/pc
                                </span>
                                {isOverConsumedCombined && (
                                  <div className="text-[8px] font-mono text-reject uppercase tracking-widest font-black mt-0.5">
                                    EXCEEDS TARGET ⚠️
                                  </div>
                                )}
                              </td>
                              <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                                {singleMatch && singleMatch.id ? (
                                  <button
                                    onClick={() => {
                                      setCorrectionTarget({
                                        fabric_record_id: singleMatch.id,
                                        po_number: singleMatch.po_number || row.po_number,
                                        style_num: singleMatch.style_num || row.style_num,
                                        color: singleMatch.color || row.color,
                                        fabric_name: singleMatch.fabric_name || 'Standard',
                                        gsm: singleMatch.gsm || null,
                                        old_quantity_kg: singleMatch.quantity_kg,
                                        cut_quantity: row.total_pcs || 0,
                                        date: row.date,
                                      });
                                      setCorrectionNewWeight(String(singleMatch.quantity_kg || ""));
                                      setCorrectionReason("");
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-amber-500/10 text-amber-600 hover:bg-amber-500 hover:text-white transition-all shadow-sm cursor-pointer active:scale-95"
                                    title="Request Fabric Consumption Correction"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                    Correct
                                  </button>
                                ) : row.matches && row.matches.length > 1 ? (
                                  <span className="text-amber-500 font-mono text-[10px] font-bold">Split to edit</span>
                                ) : (
                                  <span className="text-text3/30 text-[10px]">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {returnProduct && (
        <ReturnModal
          isOpen={isReturnModalOpen}
          onClose={() => setIsReturnModalOpen(false)}
          currentDepartment="Cutting"
          product={returnProduct}
          onSuccess={() => {
            fetchPOs();
            if (selectedPONum) handlePOChange(selectedPONum);
          }}
        />
      )}

      <DiscardModal
        isOpen={isDiscardModalOpen}
        onClose={() => setIsDiscardModalOpen(false)}
        currentDepartment="Cutting"
        product={discardProduct}
        onSuccess={() => {
          fetchPOs();
          if (selectedPONum) handlePOChange(selectedPONum);
        }}
      />

      {confirmDialog && (
        <div id="system-confirm-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-bg2 border border-bg4 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-6"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-red-500/10 text-red-500 rounded-2xl animate-pulse">
                <AlertCircle className="w-6 h-6 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-black uppercase tracking-wider text-text">{confirmDialog.title}</h4>
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
                className="px-5 py-2 bg-red-600 hover:bg-red-750 text-white font-black text-xs uppercase tracking-wider text-center rounded-xl transition-all shadow-md shadow-red-600/10 cursor-pointer"
              >
                Confirm
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {showExplicitColorsModal && (
        <div 
          id="explicit-color-prompt-modal"
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div className="bg-bg2 border border-bg4 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in duration-200">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 text-orange-500">
                <div className="p-2.5 bg-orange-500/10 rounded-xl">
                  <AlertCircle className="w-6 h-6 animate-bounce" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider">
                    Found Explicit Color(s)
                  </h3>
                  <p className="text-[10px] font-mono text-text3 uppercase mt-0.5">
                    Fabric issued on Fabric Page
                  </p>
                </div>
              </div>
              
              <p className="text-xs text-text2 leading-relaxed">
                The color(s) <span className="font-black text-slate-800 dark:text-white bg-bg3 px-1.5 py-0.5 rounded font-mono">{foundExplicitColors.join(", ")}</span> was explicitly added and issued for style <span className="font-black text-slate-800 dark:text-white">{pendingStyleForExplicit}</span> on the Fabric page.
              </p>
              
              <p className="text-xs text-text3 font-medium">
                Would you like to add fabric weight (consumption) input for this color too?
              </p>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-bg4">
                <button
                  id="decline-explicit-color-btn"
                  onClick={() => {
                    setShowExplicitColorsModal(false);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-black uppercase border border-bg4 hover:bg-bg3 text-text3 hover:text-text transition-all cursor-pointer"
                >
                  No, Skip
                </button>
                <button
                  id="confirm-explicit-color-btn"
                  onClick={() => {
                    setExplicitlyAddedColors(prev => {
                      const union = new Set([...prev, ...foundExplicitColors]);
                      return Array.from(union);
                    });
                    setShowExplicitColorsModal(false);
                  }}
                  className="px-5 py-2 rounded-xl text-xs font-black uppercase bg-cut hover:bg-orange-600 text-white shadow-lg shadow-cut/20 transition-all cursor-pointer"
                >
                  Yes, Add Input
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fabric Consumption Correction Modal */}
      {correctionTarget && (
        <div 
          id="fabric-consumption-correction-modal"
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div className="bg-bg2 border border-bg4 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in duration-200">
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-bg4 pb-4">
                <div className="flex items-center gap-3 text-amber-500">
                  <div className="p-2.5 bg-amber-500/10 rounded-xl">
                    <Scissors className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-text">
                      Request Consumption Correction
                    </h3>
                    <p className="text-[10px] font-mono text-text3 uppercase mt-0.5">
                      Requires Admin Approval
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setCorrectionTarget(null)}
                  className="text-text3 hover:text-text p-1.5 rounded-lg hover:bg-bg3 text-lg font-black transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="bg-bg3/60 p-4 rounded-2xl border border-bg4 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-text3 font-mono text-[10px] uppercase font-bold">PO & Style:</span>
                  <span className="font-bold text-text">{correctionTarget.po_number || '-'} / {correctionTarget.style_num || '-'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text3 font-mono text-[10px] uppercase font-bold">Color / Fabric:</span>
                  <span className="font-bold text-text">{correctionTarget.color || '-'} ({correctionTarget.fabric_name || 'Standard'}{correctionTarget.gsm ? ` - ${correctionTarget.gsm} GSM` : ''})</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text3 font-mono text-[10px] uppercase font-bold">Cutting Date / Pcs:</span>
                  <span className="font-mono font-bold text-text">{fmtDate(correctionTarget.date)} ({correctionTarget.cut_quantity || 0} PCS)</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-bg4">
                  <span className="text-text3 font-mono text-[10px] uppercase font-bold">Currently Recorded Weight:</span>
                  <span className="font-mono font-black text-red-500 text-sm">{Number(correctionTarget.old_quantity_kg || 0).toFixed(2)} KG</span>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-mono uppercase font-black text-text3 tracking-wider mb-1.5">
                    Corrected Fabric Weight (KG) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Enter correct weight in KG (e.g. 45.5)"
                    value={correctionNewWeight}
                    onChange={(e) => setCorrectionNewWeight(e.target.value)}
                    className="w-full bg-bg3 border border-bg4 focus:border-amber-500 rounded-xl px-4 py-2.5 text-sm font-bold text-text outline-none transition-all font-mono"
                  />
                  {correctionNewWeight && !isNaN(parseFloat(correctionNewWeight)) && (
                    <p className="text-[10px] font-mono text-amber-600 mt-1">
                      Adjustment: {(parseFloat(correctionNewWeight) - Number(correctionTarget.old_quantity_kg || 0)) > 0 ? '+' : ''}
                      {(parseFloat(correctionNewWeight) - Number(correctionTarget.old_quantity_kg || 0)).toFixed(2)} KG
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase font-black text-text3 tracking-wider mb-1.5">
                    Reason for Correction <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Describe why this correction is needed (e.g. Typo in fabric scale input, entered 55kg instead of 45kg)..."
                    value={correctionReason}
                    onChange={(e) => setCorrectionReason(e.target.value)}
                    className="w-full bg-bg3 border border-bg4 focus:border-amber-500 rounded-xl p-3 text-xs text-text outline-none transition-all placeholder:text-text3/50"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-bg4">
                <button
                  type="button"
                  onClick={() => setCorrectionTarget(null)}
                  className="px-4 py-2 rounded-xl text-xs font-black uppercase border border-bg4 hover:bg-bg3 text-text3 hover:text-text transition-all cursor-pointer"
                  disabled={isSubmittingCorrection}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmittingCorrection}
                  onClick={async () => {
                    const newWeight = parseFloat(correctionNewWeight);
                    if (isNaN(newWeight) || newWeight < 0) {
                      alert("Please enter a valid weight in KG (0 or greater).");
                      return;
                    }
                    if (!correctionReason.trim()) {
                      alert("Please provide a reason for the correction so the Admin can review it.");
                      return;
                    }
                    if (Math.abs(newWeight - Number(correctionTarget.old_quantity_kg || 0)) < 0.001) {
                      alert("The new weight is the same as the current weight. No correction needed.");
                      return;
                    }

                    setIsSubmittingCorrection(true);
                    try {
                      await permissionRequestService.create({
                        request_type: 'cutting_consumption_correction',
                        requested_items: {
                          fabric_record_id: correctionTarget.fabric_record_id,
                          po_number: correctionTarget.po_number,
                          style_num: correctionTarget.style_num,
                          color: correctionTarget.color,
                          fabric_name: correctionTarget.fabric_name,
                          gsm: correctionTarget.gsm,
                          old_quantity_kg: Number(correctionTarget.old_quantity_kg || 0),
                          new_quantity_kg: newWeight,
                          cut_quantity: correctionTarget.cut_quantity || 0,
                          date: correctionTarget.date,
                          reason: correctionReason.trim(),
                        },
                        reason: `Fabric consumption correction for ${correctionTarget.style_num} ${correctionTarget.color}: ${correctionReason.trim()}`,
                      });

                      alert("Consumption correction request submitted successfully! An Admin will review and approve it.");
                      setCorrectionTarget(null);
                      setCorrectionNewWeight("");
                      setCorrectionReason("");
                    } catch (err: any) {
                      alert(err.response?.data?.error || err.message || "Failed to submit correction request.");
                    } finally {
                      setIsSubmittingCorrection(false);
                    }
                  }}
                  className="px-5 py-2.5 rounded-xl text-xs font-black uppercase bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20 transition-all cursor-pointer flex items-center gap-2"
                >
                  {isSubmittingCorrection ? "Submitting..." : "Submit for Approval"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
