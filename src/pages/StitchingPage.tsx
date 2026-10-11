import React, { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { useSystem } from "../context/SystemContext";
import {
  stitchingService,
  cuttingService,
  poService,
  sendingService,
  statusService,
  returnService,
} from "../services/erpService";
import { ProductionOrder, POProduct } from "../types";
import {
  Activity,
  History,
  Check,
  Handshake,
  RotateCcw,
  Edit2,
  Trash2,
  FileSpreadsheet,
} from "lucide-react";
import { cn, fmtDate, compareSizes } from "../lib/utils";
import { HandoverList } from "../components/HandoverList";
import { ReturnModal } from "../components/ReturnModal";
import { DiscardModal } from "../components/DiscardModal";
import { ReturnsHandoverList } from "../components/ReturnsHandoverList";
import { ChangeRecordPOButton } from "../components/ChangeRecordPOButton";
import { ConfirmModal } from "../components/ConfirmModal";

export const StitchingPage: React.FC = () => {
  const { isInitialStockMode } = useSystem();
  const [pos, setPos] = useState<ProductionOrder[]>([]);
  const [selectedPONum, setSelectedPONum] = useState("");
  const [products, setProducts] = useState<POProduct[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [incomingDispatches, setIncomingDispatches] = useState<any[]>([]);
  const [lineNum, setLineNum] = useState("1");
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  // Style and Color Mix Mode State
  const [entryMode, setEntryMode] = useState<"style_color" | "single_po">("style_color");
  const [mixStyle, setMixStyle] = useState("");
  const [mixColor, setMixColor] = useState("");
  const [checkedPOs, setCheckedPOs] = useState<Record<string, boolean>>({});
  const [allActiveProducts, setAllActiveProducts] = useState<any[]>([]);
  const [mixQuantities, setMixQuantities] = useState<Record<string, string>>({});

  // Return Modal State
  const [returnProduct, setReturnProduct] = useState<any>(null);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);

  // Discard Modal State
  const [discardProduct, setDiscardProduct] = useState<any>(null);
  const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false);

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

  // Filters
  const [filterStyle, setFilterStyle] = useState("All");
  const [filterColor, setFilterColor] = useState("All");
  const [filterSize, setFilterSize] = useState("All");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  const handleUpdate = async (id: number) => {
    try {
      const qty = parseInt(editValue) || 0;
      if (qty <= 0) return;
      await stitchingService.update(id, { quantity: qty });
      setEditingId(null);
      await fetchHistory();
      if (selectedPONum) handlePOChange(selectedPONum);
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Delete this stitching entry?")) {
      try {
        await stitchingService.delete(id);
        await fetchHistory();
        if (selectedPONum) handlePOChange(selectedPONum);
      } catch (error: any) {
        alert(error.message);
      }
    }
  };

  const [activeTab, setActiveTab] = useState<"entry" | "reports">("entry");
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 1))
      .toISOString()
      .split("T")[0],
    end: new Date().toISOString().split("T")[0],
  });
  const [showReport, setShowReport] = useState(false);
  const [reportSearch, setReportSearch] = useState("");
  const [historySearch, setHistorySearch] = useState("");

  useEffect(() => {
    fetchPOs();
    fetchHistory();
    fetchIncoming();
  }, [isInitialStockMode]);

  useEffect(() => {
    if (selectedPONum) {
      handlePOChange(selectedPONum);
    }
  }, [lineNum]);

  const fetchPOs = async () => {
    try {
      const statusData = await statusService.getPOStatus();
      // Only show POs that have some quantity sent to lines (ready for stitching) OR show all active POs in initial mode
      const stitchablePOs = statusData.filter(
        (po) => isInitialStockMode || (po.any_sent || 0) > 0,
      );

      const formatted = stitchablePOs.map((po) => ({
        id: `${po.po_number}-${po.buyer || ""}`,
        po_number: po.po_number,
        buyer: po.buyer,
        status: "Active",
        priority: po.priority || "Normal",
      })) as any[];

      const priorityOrder: Record<string, number> = {
        Urgent: 0,
        Normal: 1,
        Low: 2,
      };
      const sorted = formatted.sort(
        (a, b) =>
          (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1),
      );
      setPos(sorted);
    } catch (error) {
      console.error("Failed to fetch filtered POs:", error);
      const data = await poService.list();
      const priorityOrder: Record<string, number> = {
        Urgent: 0,
        Normal: 1,
        Low: 2,
      };
      const sorted = data
        .filter((p) => p.status === "Active")
        .sort(
          (a, b) =>
            (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1),
        )
        .map((po, idx) => ({
          id: `${po.po_number}-${po.buyer || idx}`,
          po_number: po.po_number,
          buyer: po.buyer,
          status: po.status,
          priority: po.priority || "Normal",
        })) as any[];
      setPos(sorted);
    }
  };

  const fetchHistory = async () => {
    const data = await stitchingService.list();
    setHistory(data);
  };

  const fetchIncoming = async () => {
    const data = await sendingService.list();
    setIncomingDispatches(data);
  };

  const fetchAllActiveProducts = async () => {
    try {
      const activePOs = pos.filter((po) => po.status === "Active");
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
      .filter((p) => isInitialStockMode || (p.qty || 0) > 0)
      .map((p) => p.style_num);
    return Array.from(new Set(styles)).sort();
  }, [allActiveProducts, isInitialStockMode]);

  const availableMixColors = useMemo(() => {
    if (!mixStyle) return [];
    const colors = allActiveProducts
      .filter((p) => isInitialStockMode || (p.qty || 0) > 0)
      .filter((p) => p.style_num === mixStyle)
      .map((p) => p.color);
    return Array.from(new Set(colors)).sort();
  }, [allActiveProducts, isInitialStockMode, mixStyle]);

  const matchingPOs = useMemo(() => {
    if (!mixStyle || !mixColor) return [];
    const poNums = allActiveProducts
      .filter(
        (p) =>
          p.style_num === mixStyle &&
          p.color === mixColor &&
          (isInitialStockMode || (p.qty || 0) > 0)
      )
      .map((p) => p.po_number);
    const uniquePOs = Array.from(new Set(poNums));
    return pos.filter((po) => uniquePOs.includes(po.po_number));
  }, [allActiveProducts, isInitialStockMode, mixStyle, mixColor, pos]);

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
        (isInitialStockMode || (p.qty || 0) > 0)
    );
  }, [allActiveProducts, mixStyle, mixColor, checkedPOs, isInitialStockMode]);

  const mixUniqueSizes = useMemo(() => {
    const sizes = mixProducts.map((p) => p.size);
    return Array.from(new Set(sizes)).sort(compareSizes);
  }, [mixProducts]);

  const handleMixSubmit = async () => {
    const recordsToSubmit: any[] = [];

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
        const alreadyDone = p.total_stitched || 0;
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
            line_number: lineNum,
          });
          remainingToAllocate -= pAlloc;
        }
      });
    });

    if (recordsToSubmit.length === 0) {
      alert("No quantities entered.");
      return;
    }

    const totalSubmittedPcs = recordsToSubmit.reduce((sum, r) => sum + r.quantity, 0);

    setConfirmModalConfig({
      isOpen: true,
      title: "Confirm Style/Color Mix Output",
      type: "success",
      confirmText: "Submit Output",
      message: (
        <div className="space-y-2">
          <p>Are you sure you want to submit mixed stitching output for Style <strong className="text-text">{mixStyle}</strong> and Color <strong className="text-text">{mixColor}</strong> on <strong className="text-text">Line {lineNum}</strong>?</p>
          <div className="p-3 bg-bg3 rounded-xl border border-bg4 font-mono text-xs">
            <div><strong>Total Output Quantity:</strong> <span className="text-po font-black">{totalSubmittedPcs} pcs</span></div>
            <div><strong>Submitting Across:</strong> {recordsToSubmit.length} allocation record(s)</div>
          </div>
        </div>
      ),
      onConfirm: async () => {
        try {
          setIsLoading(true);
          for (const r of recordsToSubmit) {
            await stitchingService.create(r);
          }
          alert("Stitching production logs successfully submitted!");
          setMixQuantities({});
          await fetchPOs();
          await fetchHistory();
        } catch (error: any) {
          alert(error.message || "An error occurred during mixed submission.");
        } finally {
          setIsLoading(false);
        }
      }
    });
  };

  const handlePOChange = async (poNum: string) => {
    setSelectedPONum(poNum);
    if (!poNum) {
      setProducts([]);
      return;
    }
    setIsLoading(true);
    try {
      await fetchIncoming();
      const data = await cuttingService.getPOProducts(poNum, lineNum);
      const priorityOrder: Record<string, number> = {
        Urgent: 0,
        Normal: 1,
        Low: 2,
      };
      const sortedProducts = [...data.products].sort((a, b) => {
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

      setFilterStyle("All");
      setFilterColor("All");
      setFilterSize("All");

      const initialQtys: Record<number, number> = {};
      sortedProducts.forEach((p: any) => (initialQtys[p.id] = 0));
      setQuantities(initialQtys);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    const payload = Object.entries(quantities)
      .filter(([_, qty]) => (qty as number) > 0)
      .map(([id, qty]) => ({
        po_number: selectedPONum,
        product_id: parseInt(id) || 0,
        quantity: qty as number,
        line_number: lineNum,
      }));

    if (payload.length === 0) return;

    const totalQty = payload.reduce((sum, item) => sum + item.quantity, 0);

    // Warning check for already packed stock (Initial Stock Mode)
    const warningItems: string[] = [];
    payload.forEach((item) => {
      const p = products.find((prod) => prod.id === item.product_id);
      if (p) {
        const totalShipped = Number(p.total_shipped || 0);
        const packed = Math.max(0, (Number(p.total_accepted_packed_qty || 0) + Number(p.total_accepted_blister_qty || 0)) - totalShipped);
        if (packed > 0) {
          warningItems.push(`- Style ${p.style_num} (${p.color}/${p.size}): has ${packed} pcs already PACKED.`);
        }
      }
    });

    setConfirmModalConfig({
      isOpen: true,
      title: warningItems.length > 0 ? "⚠️ DOUBLE STITCHING WARNING" : "Confirm Bulk Stitching Output",
      type: warningItems.length > 0 ? "warning" : "success",
      confirmText: "Confirm Output",
      message: (
        <div className="space-y-2">
          {warningItems.length > 0 && (
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl text-xs space-y-1">
              <p className="font-bold">Items already have packed stock:</p>
              {warningItems.map((w, idx) => <p key={idx}>{w}</p>)}
            </div>
          )}
          <p>Are you sure you want to record stitching output for PO <strong className="text-text font-bold">{selectedPONum}</strong>?</p>
          <div className="p-3 bg-bg3/60 rounded-xl border border-bg4 space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-text3">Items count:</span> <span className="font-bold text-text">{payload.length}</span></div>
            <div className="flex justify-between"><span className="text-text3">Total Output Quantity:</span> <span className="font-bold text-emerald-400">{totalQty} pcs</span></div>
            <div className="flex justify-between"><span className="text-text3">Target Line:</span> <span className="font-bold text-text">Line {lineNum}</span></div>
          </div>
        </div>
      ),
      onConfirm: async () => {
        setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        try {
          setIsLoading(true);
          for (const p of payload) {
            await stitchingService.create(p);
          }
          handlePOChange(selectedPONum);
          fetchHistory();
          alert("Stitching output recorded successfully");
        } catch (error: any) {
          alert(error.message || "An error occurred during output entry.");
        } finally {
          setIsLoading(false);
        }
      },
    });
  };

  const handleBulkReturn = async () => {
    const payload = Object.entries(quantities)
      .filter(([_, q]) => (q as number) > 0)
      .map(([productId, q]) => {
        const p = products.find((prod) => prod.id === parseInt(productId));
        return {
          po_number: p?.po_number || selectedPONum,
          product_id: parseInt(productId),
          from_department: "Stitching" as const,
          to_department: "Feeding" as const,
          quantity: q as number,
          reason: "Bulk Return to Feeding",
          line_number: lineNum,
        };
      });

    if (payload.length === 0) {
      alert("Please enter return quantities for at least one item.");
      return;
    }

    const totalQty = payload.reduce((sum, item) => sum + item.quantity, 0);

    setConfirmModalConfig({
      isOpen: true,
      title: "Confirm Bulk Return",
      type: "danger",
      confirmText: "Confirm Return",
      message: (
        <div className="space-y-2">
          <p>Are you sure you want to return items back to <strong className="text-text font-bold">Feeding</strong>?</p>
          <div className="p-3 bg-bg3/60 rounded-xl border border-bg4 space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-text3">PO Number:</span> <span className="font-bold text-text">{selectedPONum}</span></div>
            <div className="flex justify-between"><span className="text-text3">Items count:</span> <span className="font-bold text-text">{payload.length}</span></div>
            <div className="flex justify-between"><span className="text-text3">Total Return Quantity:</span> <span className="font-bold text-rose-400">{totalQty} pcs</span></div>
            <div className="flex justify-between"><span className="text-text3">Destination:</span> <span className="font-bold text-text">Feeding</span></div>
          </div>
        </div>
      ),
      onConfirm: async () => {
        setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        try {
          setIsLoading(true);
          await returnService.createBulk(payload);
          setQuantities({});
          handlePOChange(selectedPONum);
          fetchHistory();
          alert("Bulk return request initiated successfully");
        } catch (error: any) {
          alert(error.message || "An error occurred during bulk return.");
        } finally {
          setIsLoading(false);
        }
      },
    });
  };

  const handleExportDeficits = () => {
    const deficits = products.filter(p => {
      const available = isInitialStockMode
        ? ((p as any).original_qty ?? (p as any).qty ?? 0) - ((p as any).total_stitched || 0)
        : ((p as any).total_accepted_sent || 0) - ((p as any).total_stitched || 0);
      return available < 0;
    });

    if (deficits.length === 0) {
      alert("No deficit items (negative available quantities) found for this PO.");
      return;
    }

    const groups: Record<string, { po_number: string; style_num: string; color: string; line_number: string; sizes: Record<string, number> }> = {};

    deficits.forEach(p => {
      const poNum = p.po_number || selectedPONum || "PO-N/A";
      const lineStr = `LINE ${lineNum}`;
      const key = `${poNum}-${p.style_num}-${p.color}-${lineStr}`;
      if (!groups[key]) {
        groups[key] = {
          po_number: poNum,
          style_num: p.style_num,
          color: p.color,
          line_number: lineStr,
          sizes: { 'XS': 0, 'S': 0, 'M': 0, 'L': 0, 'XL': 0, '2XL': 0, '3XL': 0, '4XL': 0 }
        };
      }
      const sz = String(p.size).trim().toUpperCase();
      const available = isInitialStockMode
        ? ((p as any).original_qty ?? (p as any).qty ?? 0) - ((p as any).total_stitched || 0)
        : ((p as any).total_accepted_sent || 0) - ((p as any).total_stitched || 0);
      if (groups[key].sizes.hasOwnProperty(sz)) {
        groups[key].sizes[sz] = Math.abs(available);
      }
    });

    const exportRows = Object.values(groups).map(g => {
      const row: any = {
        'PO #': g.po_number,
        'STYLE #': g.style_num,
        'COLOR': g.color,
        'LINE': g.line_number
      };
      let rowTotal = 0;
      Object.entries(g.sizes).forEach(([sizeName, qty]) => {
        row[sizeName] = qty;
        rowTotal += qty;
      });
      row['Total'] = rowTotal;
      return row;
    });

    const headers = ['PO #', 'STYLE #', 'COLOR', 'LINE', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'Total'];
    const worksheet = XLSX.utils.json_to_sheet(exportRows, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Deficits-Stitching');
    XLSX.writeFile(workbook, `Deficits_Stitching_${selectedPONum || 'ALL'}_Line${lineNum}.xlsx`);
  };

  const filteredProducts = useMemo(
    () =>
      products.filter((p) => {
        const hasInventory =
          isInitialStockMode || ((p as any).total_accepted_sent || 0) > 0;
        const targetGoal = isInitialStockMode ? ((p as any).original_qty ?? (p as any).qty ?? 0) : ((p as any).total_accepted_sent || 0);
        const isCompleted =
          ((p as any).total_stitched || 0) >=
          targetGoal;
        const passStatus = showCompleted || isInitialStockMode || !isCompleted;

        return (
          hasInventory &&
          passStatus &&
          (filterStyle === "All" || p.style_num === filterStyle) &&
          (filterColor === "All" || p.color === filterColor) &&
          (filterSize === "All" || p.size === filterSize)
        );
      }),
    [
      products,
      showCompleted,
      filterStyle,
      filterColor,
      filterSize,
      isInitialStockMode,
    ],
  );

  const uniqueStyles = ["All", ...new Set(products.map((p) => p.style_num))];
  const uniqueColors = ["All", ...new Set(products.map((p) => p.color))];
  const uniqueSizes = [
    "All",
    ...Array.from(new Set(products.map((p) => p.size))).sort(compareSizes),
  ];

  const pivotedHistory = useMemo(() => {
    const groups: Record<string, any> = {};
    const allSizes = new Set<string>();

    const filteredHistory = history.filter((h) => {
      const hDate = h.created_at.split("T")[0];
      const search = historySearch.toLowerCase();
      const matchesSearch =
        !historySearch ||
        h.po_number.toLowerCase().includes(search) ||
        h.style_num.toLowerCase().includes(search) ||
        h.color.toLowerCase().includes(search) ||
        (h.creator_name && h.creator_name.toLowerCase().includes(search));
      return (
        hDate >= dateRange.start &&
        hDate <= dateRange.end &&
        matchesSearch &&
        h.status !== "rejected"
      );
    });

    filteredHistory.forEach((rec) => {
      const date = rec.created_at.split("T")[0];
      const key = `${date}-${rec.po_number}-${rec.style_num}-${rec.color}-${rec.line_number}-${rec.creator_name || "System"}`;

      if (!groups[key]) {
        groups[key] = {
          date: rec.created_at,
          po_number: rec.po_number,
          style_num: rec.style_num,
          color: rec.color,
          line_number: rec.line_number,
          creator_name: rec.creator_name || "System",
          sizes: {},
        };
      }

      groups[key].sizes[rec.size] =
        (groups[key].sizes[rec.size] || 0) + rec.quantity;
      allSizes.add(rec.size);
    });

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

  const outputStats = useMemo(() => {
    if (!showReport) return [];

    const stats: Record<string, any> = {};

    const filteredHistory = history.filter((h) => {
      const hDate = h.created_at.split("T")[0];
      return (
        hDate >= dateRange.start &&
        hDate <= dateRange.end &&
        h.status !== "rejected"
      );
    });

    filteredHistory.forEach((h) => {
      const key = `${h.style_num}-${h.color}-${h.line_number || "All"}`;
      if (!stats[key]) {
        stats[key] = {
          style_num: h.style_num,
          color: h.color,
          line_number: h.line_number || "All",
          total: 0,
        };
      }
      stats[key].total += h.quantity;
    });

    const result = Object.values(stats);

    if (!reportSearch) return result;
    const search = reportSearch.toLowerCase();
    return result.filter(
      (s: any) =>
        s.style_num.toLowerCase().includes(search) ||
        s.color.toLowerCase().includes(search) ||
        String(s.line_number).toLowerCase().includes(search),
    );
  }, [history, dateRange, showReport, reportSearch]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-6 border-b border-bg4 gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-stitch/10 text-stitch rounded-2xl shrink-0">
            <Activity className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight uppercase text-slate-900 dark:text-white">
              Stitching Dept
            </h1>
            <p className="text-text3 text-[10px] font-mono uppercase tracking-[0.3em] font-medium leading-tight">
              Production workflow & tracking
            </p>
          </div>
        </div>

        <div className="flex bg-bg2 p-1 rounded-xl border border-bg4 self-start lg:self-auto overflow-x-auto max-w-full">
          <button
            onClick={() => setActiveTab("entry")}
            className={cn(
              "px-4 sm:px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
              activeTab === "entry"
                ? "bg-stitch text-white shadow-lg shadow-stitch/20"
                : "text-text3 hover:text-text",
            )}
          >
            Form Entry
          </button>
          <button
            onClick={() => setActiveTab("reports")}
            className={cn(
              "px-4 sm:px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
              activeTab === "reports"
                ? "bg-stitch text-white shadow-lg shadow-stitch/20"
                : "text-text3 hover:text-text",
            )}
          >
            Table Reports
          </button>
        </div>
      </div>

      {activeTab === "entry" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Entry Table Area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Entry Mode Switcher */}
            <div className="bg-bg2 border border-bg4 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight text-slate-800 dark:text-white">
                  Entry Mode
                </h3>
                <p className="text-[10px] font-mono text-text3 uppercase mt-1">
                  Choose how you want to record stitching production output
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
                      ? "bg-stitch text-white shadow-md shadow-stitch/20"
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
                      ? "bg-stitch text-white shadow-md shadow-stitch/20"
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
                <div className="bg-bg2 border border-bg4 rounded-2xl p-6 flex flex-col md:flex-row md:items-center gap-6 shadow-sm">
                  <div className="flex-1 space-y-2">
                    <label className="text-[10px] font-mono text-text3 uppercase tracking-widest pl-1">
                      Choose Style
                    </label>
                    <select
                      value={mixStyle}
                      onChange={(e) => {
                        setMixStyle(e.target.value);
                        setMixColor("");
                      }}
                      className="w-full bg-bg3 border border-bg4 rounded-xl p-3.5 text-sm font-bold text-slate-800 dark:text-white"
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
                    <label className="text-[10px] font-mono text-text3 uppercase tracking-widest pl-1">
                      Choose Color
                    </label>
                    <select
                      value={mixColor}
                      onChange={(e) => setMixColor(e.target.value)}
                      disabled={!mixStyle}
                      className="w-full bg-bg3 border border-bg4 rounded-xl p-3.5 text-sm font-bold text-slate-800 dark:text-white disabled:opacity-50"
                    >
                      <option value="">-- CHOOSE COLOR --</option>
                      {availableMixColors.map((color) => (
                        <option key={color} value={color}>
                          {color}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex-1 space-y-2">
                    <label className="text-[10px] font-mono text-text3 uppercase tracking-widest pl-1">
                      Production Line
                    </label>
                    <select
                      value={lineNum}
                      onChange={(e) => setLineNum(e.target.value)}
                      className="w-full bg-bg3 border border-bg4 rounded-xl p-3.5 text-sm font-bold text-stitch outline-none"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <option key={n} value={n.toString()}>
                          LINE {n}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="shrink-0 pt-6">
                    <button
                      onClick={handleMixSubmit}
                      disabled={
                        !mixStyle ||
                        !mixColor ||
                        (Object.values(mixQuantities) as string[]).every(
                          (q) => parseInt(q || "0") <= 0
                        )
                      }
                      className="bg-stitch text-white font-black px-12 py-4 rounded-xl shadow-xl shadow-stitch/30 disabled:opacity-50 hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs"
                    >
                      <Activity className="w-5 h-5" /> Bulk Output
                    </button>
                  </div>
                </div>

                {mixStyle && mixColor && (
                  <div className="bg-bg2 border border-bg4 rounded-2xl p-6 space-y-4">
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
                                ? "bg-bg3 border-stitch text-stitch shadow-sm"
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
                              className="w-4 h-4 rounded accent-stitch bg-bg2 border-bg4 cursor-pointer"
                            />
                            <span>
                              {po.po_number}
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
                        Aggregate Fed Components Availability
                      </h3>
                      <p className="text-[10px] font-mono text-text3 uppercase font-bold tracking-widest">
                        {mixUniqueSizes.length} Size Groups Found
                      </p>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-bg3/50 border-b border-bg4 text-text3">
                            <th className="p-4 text-xs font-mono uppercase font-black">Size</th>
                            <th className="p-4 text-xs font-mono uppercase font-black text-center">{isInitialStockMode ? "Required Qty" : "Accepted Fed"}</th>
                            <th className="p-4 text-xs font-mono uppercase font-black text-center">Already Stitched</th>
                            <th className="p-4 text-xs font-mono uppercase font-black text-center">Available Floor Balance</th>
                            <th className="p-4 text-xs font-mono uppercase font-black text-center w-64">Today's Stitched Qty</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-bg4">
                          {mixUniqueSizes.map((size) => {
                            const matchingSizeProds = mixProducts.filter((p) => p.size === size);
                            const totalFed = matchingSizeProds.reduce((sum, p) => sum + (isInitialStockMode ? (p.qty || 0) : (p.total_accepted_sent || 0)), 0);
                            const totalStitched = matchingSizeProds.reduce((sum, p) => sum + (p.total_stitched || 0), 0);
                            const avail = Math.max(0, totalFed - totalStitched);

                            return (
                              <tr key={size} className="hover:bg-bg3/20 transition-colors">
                                <td className="p-4 text-center">
                                  <span className="font-black font-mono text-sm uppercase bg-stitch/10 text-stitch px-2.5 py-1 rounded">
                                    {size}
                                  </span>
                                </td>
                                <td className="p-4 text-center font-mono text-sm">{totalFed}</td>
                                <td className="p-4 text-center font-mono text-sm">{totalStitched}</td>
                                <td className="p-4 text-center font-mono text-sm text-po font-bold bg-po/5">{avail}</td>
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
                                    className="w-full bg-bg3 border border-bg4 rounded-xl p-2.5 text-sm font-black text-center focus:ring-1 focus:ring-stitch outline-none transition-all"
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
              </div>
            ) : (
              <div className="bg-bg2 border border-bg4 rounded-2xl p-6 flex flex-col md:flex-row md:items-center gap-6 shadow-sm">
                <div className="flex-1 space-y-2">
                  <label className="text-[10px] font-mono text-text3 uppercase tracking-widest block pl-1">
                    Select PO
                  </label>
                  <select
                    value={selectedPONum}
                    onChange={(e) => handlePOChange(e.target.value)}
                    className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold text-po outline-none focus:ring-1 focus:ring-po/30 transition-all"
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
                          {po.po_number}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="flex-1 space-y-2">
                  <label className="text-[10px] font-mono text-text3 uppercase tracking-widest block pl-1">
                    Production Line
                  </label>
                  <select
                    value={lineNum}
                    onChange={(e) => setLineNum(e.target.value)}
                    className="w-full bg-bg3 border border-bg4 rounded-xl p-3.5 text-sm font-bold text-stitch outline-none focus:ring-1 focus:ring-stitch/30 transition-all"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n.toString()}>
                        LINE {n}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="shrink-0 pt-6 flex items-center gap-3">
                  <button
                    onClick={handleSubmit}
                    disabled={
                      !selectedPONum ||
                      Object.values(quantities).every((q) => (q as number) <= 0)
                    }
                    className="bg-stitch text-white font-black px-8 py-4 rounded-2xl shadow-xl shadow-stitch/30 disabled:opacity-50 hover:bg-emerald-600 hover:translate-y-[-1px] active:translate-y-[0px] transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs min-w-[160px]"
                  >
                    <Activity className="w-5 h-5" /> Bulk Output
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkReturn}
                    disabled={
                      !selectedPONum ||
                      Object.values(quantities).every((q) => (q as number) <= 0)
                    }
                    className="bg-rose-600 text-white font-black px-8 py-4 rounded-2xl shadow-xl shadow-rose-600/30 disabled:opacity-50 hover:bg-rose-700 hover:translate-y-[-1px] active:translate-y-[0px] transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs min-w-[160px]"
                  >
                    <RotateCcw className="w-5 h-5" /> Bulk Return
                  </button>
                </div>
              </div>
            )}

            {selectedPONum && (
              <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
                <div className="p-4 bg-bg3/30 border-b border-bg4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <h3 className="text-sm font-bold uppercase tracking-tight">
                      Bulk Stitching Entry
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
                          : "bg-stitch/10 border-stitch/30 text-stitch hover:bg-stitch/20",
                      )}
                    >
                      {showCompleted ? "Hide Completed" : "Show All"}
                    </button>

                    <select
                      value={filterStyle}
                      onChange={(e) => setFilterStyle(e.target.value)}
                      className="bg-bg3 border border-bg4 rounded-lg text-xs font-bold p-2 outline-none"
                    >
                      {uniqueStyles.map((s) => (
                        <option key={s} value={s}>
                          {s === "All" ? "All Styles" : s}
                        </option>
                      ))}
                    </select>
                    <select
                      value={filterColor}
                      onChange={(e) => setFilterColor(e.target.value)}
                      className="bg-bg3 border border-bg4 rounded-lg text-xs font-bold p-2 outline-none"
                    >
                      {uniqueColors.map((c) => (
                        <option key={c} value={c}>
                          {c === "All" ? "All Colors" : c}
                        </option>
                      ))}
                    </select>
                    <select
                      value={filterSize}
                      onChange={(e) => setFilterSize(e.target.value)}
                      className="bg-bg3 border border-bg4 rounded-lg text-xs font-bold p-2 outline-none"
                    >
                      {uniqueSizes.map((s) => (
                        <option key={s} value={s}>
                          {s === "All" ? "All Sizes" : s}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => {
                        const newQtys = { ...quantities };
                        filteredProducts.forEach((p) => {
                          const available = isInitialStockMode
                            ? (p.original_qty ?? p.qty ?? 0) - (p.total_stitched || 0)
                            : (p.total_accepted_sent || 0) - (p.total_stitched || 0);
                          newQtys[p.id] = available > 0 ? available : 0;
                        });
                        setQuantities(newQtys);
                      }}
                      className="bg-bg text-[10px] font-black text-stitch hover:text-white hover:bg-stitch uppercase px-4 py-2 rounded-lg transition-all border border-stitch/30 shadow-sm ml-auto"
                    >
                      Fill (Available)
                    </button>

                    <button
                      onClick={handleExportDeficits}
                      className="bg-bg text-[10px] font-black text-rose-500 hover:text-white hover:bg-rose-500 uppercase px-4 py-2 rounded-lg transition-all border border-rose-500/30 shadow-sm flex items-center gap-1.5"
                      title="Export negative available items as Excel to import in Old Stock"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Export Deficits
                    </button>
                  </div>
                </div>

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
                          Batch/Line
                        </th>
                        <th className="p-4 text-xs font-mono uppercase font-black text-center">
                          Order Qty
                        </th>
                        <th className="p-4 text-xs font-mono uppercase font-black text-center">
                          Accepted Fed
                        </th>
                        <th className="p-4 text-xs font-mono uppercase font-black text-center">
                          Available
                        </th>
                        <th className="p-4 text-xs font-mono uppercase font-black text-center">
                          Stitched
                        </th>
                        <th className="p-4 text-xs font-mono uppercase font-black w-32">
                          Qty Output
                        </th>
                        <th className="p-4 text-xs font-mono uppercase font-black w-10 text-center">
                          Return
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-bg4">
                      {filteredProducts.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-12 text-center">
                            <p className="text-text3 text-xs font-mono uppercase tracking-widest">
                              No products available in this line
                            </p>
                          </td>
                        </tr>
                      ) : (
                        filteredProducts.map((p: any) => {
                          const available = isInitialStockMode
                            ? (p.original_qty ?? p.qty ?? 0) - (p.total_stitched || 0)
                            : (p.total_accepted_sent || 0) - (p.total_stitched || 0);
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
                                <p className="text-xs font-mono font-black text-stitch uppercase bg-stitch/5 px-2 py-0.5 rounded inline-block">
                                  {p.size}
                                </p>
                              </td>
                              <td className="p-4 text-center">
                                <p className="text-[10px] font-mono text-text3 uppercase font-black">
                                  {p.line_num ? `L# ${p.line_num}` : "N/A"}
                                </p>
                              </td>
                              <td className="p-4 text-center font-mono text-sm">
                                {p.original_qty ?? p.qty ?? 0}
                              </td>
                              <td className="p-4 text-center font-mono text-sm">
                                {p.total_accepted_sent || 0}
                              </td>
                              <td className="p-4 text-center font-mono text-sm font-black text-stitch bg-stitch/5">
                                {available}
                              </td>
                              <td className="p-4 text-center">
                                <div className="space-y-1 mx-auto max-w-[120px]">
                                  <div className="flex justify-between items-end">
                                    <p className="font-bold text-xs">
                                      {p.total_stitched || 0}
                                    </p>
                                    <p className="text-[10px] text-text3">
                                      {available} ready
                                    </p>
                                  </div>
                                  <div className="w-full bg-bg4 h-1 rounded-full overflow-hidden">
                                    <div
                                      className="bg-stitch h-full transition-all duration-500"
                                      style={{
                                        width: `${Math.min(((p.total_stitched || 0) / Math.max(isInitialStockMode ? (p.original_qty ?? p.qty ?? 0) : (p.total_accepted_sent || 0), 1)) * 100, 100)}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="p-4">
                                <input
                                  type="number"
                                  min="0"
                                  max={available}
                                  value={quantities[p.id] || 0}
                                  onChange={(e) =>
                                    setQuantities({
                                      ...quantities,
                                      [p.id]: parseInt(e.target.value) || 0,
                                    })
                                  }
                                  className={cn(
                                    "w-full bg-bg3 border border-bg4 rounded-xl p-2.5 text-sm font-black text-center focus:ring-1 outline-none transition-all",
                                    (quantities[p.id] || 0) > available
                                      ? "border-reject text-reject focus:ring-reject/20"
                                      : "focus:border-stitch focus:ring-stitch/20",
                                  )}
                                />
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
                                        available_qty: Math.max(0, available),
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
                                        available_qty: available,
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

                {/* Secondary Bottom Submit Controls */}
                <div className="p-4 bg-bg3/30 border-t border-bg4 flex items-center justify-between gap-4">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-text">
                      {Object.values(quantities).filter((q) => (q as number) > 0).length} Sizes Queued
                    </span>
                    <span className="text-[10px] font-mono text-text3 uppercase mt-0.5">
                      Ready to transfer to active production logs
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSubmit}
                      disabled={
                        !selectedPONum ||
                        Object.values(quantities).every((q) => (q as number) <= 0)
                      }
                      className="bg-stitch text-white font-black px-8 py-3.5 rounded-xl shadow-lg shadow-stitch/30 disabled:opacity-50 hover:bg-emerald-600 active:translate-y-[1px] transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs min-w-[160px]"
                    >
                      <Activity className="w-4 h-4" /> Bulk Output
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkReturn}
                      disabled={
                        !selectedPONum ||
                        Object.values(quantities).every((q) => (q as number) <= 0)
                      }
                      className="bg-rose-600 text-white font-black px-8 py-3.5 rounded-xl shadow-lg shadow-rose-600/30 disabled:opacity-50 hover:bg-rose-700 active:translate-y-[1px] transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs min-w-[160px]"
                    >
                      <RotateCcw className="w-4 h-4" /> Bulk Return
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-1 space-y-6">
            <ReturnsHandoverList
              department="Stitching"
              onRefresh={() => {
                fetchPOs();
                if (selectedPONum) handlePOChange(selectedPONum);
              }}
            />

            <HandoverList
              title="Incoming from Feeding"
              table="send_records"
              records={incomingDispatches.filter(
                (r) => String(r.line_number) === String(lineNum),
              )}
              onRefresh={() => {
                fetchIncoming();
                if (selectedPONum) handlePOChange(selectedPONum);
              }}
            />

            <div className="bg-bg2 border border-bg4 rounded-3xl overflow-hidden shadow-lg border-t-4 border-t-stitch">
              <div className="p-6 border-b border-bg4 bg-bg3/30 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-tight">
                    Stitching Feed
                  </h3>
                  <p className="text-[9px] font-mono font-medium text-text3 mt-0.5">
                    Editable until accepted by Finishing
                  </p>
                </div>
                <Activity className="w-4 h-4 text-text3" />
              </div>
              <div className="overflow-x-auto max-h-[700px]">
                <table className="w-full text-left border-collapse border-b border-bg4 min-w-[500px]">
                  <thead className="sticky top-0 z-10 bg-bg3 border-b border-bg4">
                    <tr className="text-text2">
                      <th className="p-3 text-[9px] font-mono uppercase font-black">
                        Time
                      </th>
                      <th className="p-3 text-[9px] font-mono uppercase font-black">
                        PO / Style
                      </th>
                      <th className="p-3 text-[9px] font-mono uppercase font-black">
                        Variant
                      </th>
                      <th className="p-3 text-[9px] font-mono uppercase font-black text-center">
                        Line
                      </th>
                      <th className="p-3 text-[9px] font-mono uppercase font-black text-right">
                        Qty
                      </th>
                      <th className="p-3 text-[9px] font-mono uppercase font-black text-center w-28">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bg4">
                    {history.length > 0 ? (
                      history.slice(0, 50).map((rec, i) => (
                        <tr
                          key={rec.id || i}
                          className="hover:bg-bg3/20 transition-colors group"
                        >
                          <td className="p-3 text-[10px] font-mono text-text3">
                            {new Date(rec.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="p-3">
                            <div className="text-[8px] font-mono text-po font-black uppercase">
                              {rec.po_number}
                            </div>
                            <div className="text-[11px] font-black">
                              {rec.style_num}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="text-[10px] uppercase font-semibold text-text2">
                              {rec.color}
                            </div>
                            <div className="text-[9px] font-mono text-text3">
                              Size: {rec.size}
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <span className="bg-stitch/5 border border-stitch/20 text-stitch text-[9px] font-black px-2 py-0.5 rounded uppercase">
                              L-{rec.line_number}
                            </span>
                          </td>
                          <td className="p-3 text-right font-black text-stitch text-xs">
                            {editingId === rec.id ? (
                              <input
                                autoFocus
                                type="number"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleUpdate(rec.id);
                                  if (e.key === "Escape") setEditingId(null);
                                }}
                                className="w-16 bg-bg text-right px-1 border border-stitch rounded outline-none focus:ring-1 focus:ring-stitch"
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
                                    onClick={() => handleUpdate(rec.id)}
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
                                      setEditValue(rec.quantity.toString());
                                    }}
                                    className="p-1.5 text-po hover:bg-po/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                    title="Edit"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <ChangeRecordPOButton
                                    recordId={rec.id}
                                    currentPo={selectedPONum}
                                    department="stitching"
                                    pos={pos}
                                    onSuccess={() => {
                                      if (selectedPONum) handlePOChange(selectedPONum);
                                    }}
                                  />
                                  <button
                                    onClick={() => handleDelete(rec.id)}
                                    className="p-1.5 text-reject hover:bg-reject/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : (
                                <span
                                  className={cn(
                                    "text-[8px] font-black uppercase px-2 py-0.5 rounded flex items-center gap-1 justify-center",
                                    rec.status === "accepted"
                                      ? "bg-pass/10 text-pass"
                                      : "bg-reject/10 text-reject",
                                  )}
                                >
                                  {rec.status === "accepted" && (
                                    <Check className="w-2.5 h-2.5" />
                                  )}{" "}
                                  {rec.status}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={6}
                          className="p-4 text-center text-[10px] font-mono text-text3"
                        >
                          No stitching logs found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {/* REMOVED OLD BLOCKS */}
            <div className="hidden">
              <div className="max-h-[700px] overflow-y-auto divide-y divide-bg4">
                {history.slice(0, 50).map((rec, i) => (
                  <div
                    key={i}
                    className="p-4 hover:bg-bg3/20 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-mono text-[10px] text-po font-bold mb-1 uppercase tracking-wider">
                          {rec.po_number}
                        </p>
                        <p className="text-sm font-bold">{rec.style_num}</p>
                        <p className="text-[10px] font-mono text-text3 uppercase">
                          {rec.color} • {rec.size}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="bg-stitch/10 text-stitch text-[10px] font-bold px-2 py-1 rounded uppercase">
                            Line {rec.line_number}
                          </span>
                          <div
                            className={cn(
                              "text-[8px] font-black uppercase px-2 py-0.5 rounded",
                              rec.status === "pending"
                                ? "bg-orange-500/10 text-orange-500"
                                : rec.status === "accepted"
                                  ? "bg-pass/10 text-pass"
                                  : "bg-reject/10 text-reject",
                            )}
                          >
                            {rec.status}
                          </div>
                        </div>
                        <p className="text-lg font-black mt-1">
                          +{rec.quantity}
                        </p>
                      </div>
                    </div>
                    <p className="text-[10px] font-mono text-text3 text-right uppercase mt-2">
                      {fmtDate(rec.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-6 bg-stitch/5 border-b border-bg4 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
              <div className="space-y-1">
                <h3 className="text-xl font-black uppercase tracking-tight text-stitch">
                  1. Style Output Summary
                </h3>
                <p className="text-[10px] font-mono text-text3 uppercase">
                  Aggregated production totals by style and color
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 bg-bg3 p-1.5 rounded-xl border border-bg4">
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) =>
                      setDateRange((prev) => ({
                        ...prev,
                        start: e.target.value,
                      }))
                    }
                    className="bg-transparent text-xs font-black outline-none"
                  />
                  <span className="text-[10px] font-mono text-text3 px-2">
                    TO
                  </span>
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) =>
                      setDateRange((prev) => ({ ...prev, end: e.target.value }))
                    }
                    className="bg-transparent text-xs font-black outline-none"
                  />
                </div>

                <button
                  onClick={() => setShowReport(!showReport)}
                  className={cn(
                    "px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all shadow-lg",
                    showReport
                      ? "bg-bg4"
                      : "bg-stitch text-white shadow-stitch/20",
                  )}
                >
                  {showReport ? "Hide Reports" : "Generate Reports"}
                </button>

                {showReport && (
                  <input
                    type="text"
                    placeholder="Search Style/Color..."
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                    className="bg-bg3 border border-bg4 rounded-xl py-2 px-4 text-xs font-bold outline-none"
                  />
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-bg3/30 border-b border-bg4">
                    <th className="p-4 font-mono uppercase font-black">
                      Style Number
                    </th>
                    <th className="p-4 font-mono uppercase font-black">
                      Color
                    </th>
                    <th className="p-4 font-mono uppercase font-black text-center">
                      Production Line
                    </th>
                    <th className="p-4 font-mono uppercase font-black text-right">
                      Total Production
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg4">
                  {!showReport ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="p-16 text-center text-text3 font-mono uppercase"
                      >
                        Click Generate to process reports
                      </td>
                    </tr>
                  ) : outputStats.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="p-16 text-center text-text3 font-mono uppercase"
                      >
                        No records found
                      </td>
                    </tr>
                  ) : (
                    outputStats.map((stat: any, i) => (
                      <tr key={i} className="hover:bg-bg3/20 transition-colors">
                        <td className="p-4 font-black">{stat.style_num}</td>
                        <td className="p-4 font-bold uppercase">
                          {stat.color}
                        </td>
                        <td className="p-4 text-center font-mono">
                          <span className="bg-stitch/10 text-stitch border border-stitch/20 text-[10px] font-bold px-2 py-0.5 rounded font-mono">
                            Line {stat.line_number}
                          </span>
                        </td>
                        <td className="p-4 text-right font-black text-sm text-stitch">
                          {stat.total} PCS
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-6 bg-bg3/30 border-b border-bg4 flex items-center justify-between">
              <h3 className="text-xl font-black uppercase tracking-tight">
                2. Detailed Stitching Log (Pivoted)
              </h3>
              <input
                type="text"
                placeholder="Global Search..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="bg-bg3 border border-bg4 rounded-xl py-1.5 px-4 text-xs font-bold outline-none"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-bg3/50 border-b border-bg4 uppercase">
                    <th className="p-4 font-mono font-black sticky left-0 bg-bg2 z-10">
                      Date
                    </th>
                    <th className="p-4 font-mono font-black">PO / Line</th>
                    <th className="p-4 font-mono font-black">Style / Color</th>
                    {pivotedHistory.sizes.map((s) => (
                      <th
                        key={s}
                        className="p-4 font-mono font-black text-center"
                      >
                        {s}
                      </th>
                    ))}
                    <th className="p-4 font-mono font-black text-center bg-bg4/30">
                      Total
                    </th>
                    <th className="p-4 font-mono font-black">User</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg4">
                  {pivotedHistory.rows.map((row: any, i) => (
                    <tr key={i} className="hover:bg-bg3/10 transition-colors">
                      <td className="p-4 font-mono text-text3 sticky left-0 bg-bg2">
                        {fmtDate(row.date)}
                      </td>
                      <td className="p-4">
                        <p className="font-bold text-po">{row.po_number}</p>
                        <span className="text-[9px] bg-stitch/10 text-stitch px-1.5 py-0.5 rounded uppercase">
                          Line {row.line_number}
                        </span>
                      </td>
                      <td className="p-4">
                        <p className="font-black text-sm">{row.style_num}</p>
                        <p className="text-[10px] text-text3 uppercase font-medium">
                          {row.color}
                        </p>
                      </td>
                      {pivotedHistory.sizes.map((s) => (
                        <td
                          key={s}
                          className="p-4 text-center font-mono font-bold text-stitch"
                        >
                          {row.sizes[s] || "-"}
                        </td>
                      ))}
                      <td className="p-4 text-center bg-bg4/10">
                        <span className="bg-slate-900 text-white px-2 py-1 rounded-full font-black text-[10px]">
                          {
                            Object.values(row.sizes).reduce(
                              (a: any, b: any) => a + b,
                              0,
                            ) as number
                          }
                        </span>
                      </td>
                      <td className="p-4 font-mono text-text3">
                        {row.creator_name}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {returnProduct && (
        <ReturnModal
          isOpen={isReturnModalOpen}
          onClose={() => setIsReturnModalOpen(false)}
          currentDepartment="Stitching"
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
        currentDepartment="Stitching"
        product={discardProduct}
        onSuccess={() => {
          fetchPOs();
          if (selectedPONum) handlePOChange(selectedPONum);
        }}
      />

      <ConfirmModal
        isOpen={confirmModalConfig.isOpen}
        title={confirmModalConfig.title}
        message={confirmModalConfig.message}
        confirmText={confirmModalConfig.confirmText}
        type={confirmModalConfig.type}
        onConfirm={confirmModalConfig.onConfirm}
        onCancel={() => setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }))}
        isLoading={isLoading}
      />
    </div>
  );
};
