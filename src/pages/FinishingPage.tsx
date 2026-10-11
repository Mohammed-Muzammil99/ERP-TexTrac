import React, { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { useSystem } from "../context/SystemContext";
import {
  finishingService,
  cuttingService,
  poService,
  stitchingService,
  statusService,
  returnService,
} from "../services/erpService";
import { ProductionOrder, POProduct } from "../types";
import {
  CheckCircle2,
  Package,
  History,
  XCircle,
  Handshake,
  Search,
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

export const FinishingPage: React.FC = () => {
  const { isInitialStockMode } = useSystem();
  const [pos, setPos] = useState<ProductionOrder[]>([]);
  const [selectedPONum, setSelectedPONum] = useState("");
  const [products, setProducts] = useState<POProduct[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [incomingStitching, setIncomingStitching] = useState<any[]>([]);
  const [quantities, setQuantities] = useState<
    Record<number, { pass: number; reject: number }>
  >({});
  const [isLoading, setIsLoading] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  // Workflow Mode: Standard QC (Pass/Reject to Loose) or Direct Carton Pack (Bypass Blister)
  const [workflowType, setWorkflowType] = useState<"standard_qc" | "direct_carton">("standard_qc");
  const [mixDirectCarton, setMixDirectCarton] = useState<Record<string, { cartons: string; pcs_per_carton: string }>>({});
  const [directCartonQtys, setDirectCartonQtys] = useState<Record<number, { cartons: string; pcs_per_carton: string }>>({});
  const [historyFilter, setHistoryFilter] = useState<"all" | "standard" | "direct_carton" | "qc">("all");

  // Style and Color Mix Mode State
  const [entryMode, setEntryMode] = useState<"style_color" | "single_po">("style_color");
  const [mixStyle, setMixStyle] = useState("");
  const [mixColor, setMixColor] = useState("");
  const [checkedPOs, setCheckedPOs] = useState<Record<string, boolean>>({});
  const [allActiveProducts, setAllActiveProducts] = useState<any[]>([]);
  const [mixQuantities, setMixQuantities] = useState<Record<string, { pass: string; reject: string }>>({});

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
      await finishingService.update(id, { quantity: qty });
      setEditingId(null);
      await fetchHistory();
      if (selectedPONum) handlePOChange(selectedPONum);
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Delete this finishing entry?")) {
      try {
        await finishingService.delete(id);
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

  const fetchPOs = async () => {
    try {
      const statusData = await statusService.getPOStatus();
      // Only show POs that have some quantity stitched (ready for finishing) OR if in initial mode show all
      const finishablePOs = statusData.filter(
        (po) => isInitialStockMode || (po.any_stitched || 0) > 0,
      );

      const formatted = finishablePOs.map((po) => ({
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
    const data = await finishingService.list();
    setHistory(data);
  };

  const fetchIncoming = async () => {
    const data = await stitchingService.list();
    setIncomingStitching(data);
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
      const parentQtyObj = mixQuantities[size] || { pass: "0", reject: "0" };
      const enteredPass = parseInt(parentQtyObj.pass || "0");
      const enteredReject = parseInt(parentQtyObj.reject || "0");

      if (enteredPass <= 0 && enteredReject <= 0) return;

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

      // 1. Allocate Pass Qty
      if (enteredPass > 0) {
        let remaining = enteredPass;
        sortedProds.forEach((p, idx) => {
          const targetGoal = p.qty || 0;
          const alreadyFinished = (p.total_finished || 0) + (p.total_rejected || 0);
          const need = Math.max(0, targetGoal - alreadyFinished);

          const isLastProd = idx === sortedProds.length - 1;
          let pAlloc = isLastProd ? remaining : Math.min(remaining, need);

          if (pAlloc > 0) {
            recordsToSubmit.push({
              po_number: p.po_number,
              product_id: p.id,
              quantity: pAlloc,
              result: "pass",
            });
            remaining -= pAlloc;
          }
        });
      }

      // 2. Allocate Reject Qty
      if (enteredReject > 0) {
        let remaining = enteredReject;
        sortedProds.forEach((p, idx) => {
          const targetGoal = p.qty || 0;
          const alreadyFinished = (p.total_finished || 0) + (p.total_rejected || 0);
          const need = Math.max(0, targetGoal - alreadyFinished);

          const isLastProd = idx === sortedProds.length - 1;
          let pAlloc = isLastProd ? remaining : Math.min(remaining, need);

          if (pAlloc > 0) {
            recordsToSubmit.push({
              po_number: p.po_number,
              product_id: p.id,
              quantity: pAlloc,
              result: "reject",
            });
            remaining -= pAlloc;
          }
        });
      }
    });

    if (recordsToSubmit.length === 0) {
      alert("No quantities entered.");
      return;
    }

    const totalPass = recordsToSubmit.filter(p => p.result === "pass").reduce((s, p) => s + p.quantity, 0);
    const totalReject = recordsToSubmit.filter(p => p.result === "reject").reduce((s, p) => s + p.quantity, 0);

    setConfirmModalConfig({
      isOpen: true,
      title: "Confirm Style/Color Mix QC Batch",
      type: "success",
      confirmText: "Submit QC Batch",
      message: (
        <div className="space-y-2">
          <p>Are you sure you want to submit mixed QC results for Style <strong className="text-text font-bold">{mixStyle}</strong> and Color <strong className="text-text font-bold">{mixColor}</strong>?</p>
          <div className="p-3 bg-bg3/60 rounded-xl border border-bg4 space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-text3">Pass Quantity:</span> <span className="font-bold text-emerald-400">{totalPass} pcs</span></div>
            <div className="flex justify-between"><span className="text-text3">Reject Quantity:</span> <span className="font-bold text-rose-400">{totalReject} pcs</span></div>
            <div className="flex justify-between border-t border-bg4/50 pt-1 mt-1"><span className="text-text3 font-bold">Total Processed:</span> <span className="font-bold text-text">{totalPass + totalReject} pcs</span></div>
          </div>
        </div>
      ),
      onConfirm: async () => {
        setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        try {
          setIsLoading(true);
          await Promise.all(recordsToSubmit.map((r) => finishingService.create(r)));
          alert("Finishing QC logs successfully submitted!");
          setMixQuantities({});
          await fetchPOs();
          await fetchHistory();
        } catch (error: any) {
          alert(error.message);
        } finally {
          setIsLoading(false);
        }
      }
    });
  };

  const handleMixDirectCartonSubmit = async () => {
    const recordsToSubmit: any[] = [];

    mixUniqueSizes.forEach((size) => {
      const parentQtyObj = mixDirectCarton[size] || { cartons: "0", pcs_per_carton: "24" };
      const enteredCartons = parseInt(parentQtyObj.cartons || "0");
      const pcsPerCarton = parseInt(parentQtyObj.pcs_per_carton || "24");

      if (enteredCartons <= 0 || pcsPerCarton <= 0) return;

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

      let remainingCartons = enteredCartons;
      sortedProds.forEach((p, idx) => {
        const targetGoal = p.qty || 0;
        const alreadyFinished = (p.total_finished || 0) + (p.total_rejected || 0);
        const needPcs = Math.max(0, targetGoal - alreadyFinished);
        const needCtns = Math.ceil(needPcs / pcsPerCarton);

        const isLastProd = idx === sortedProds.length - 1;
        let pCartonsAlloc = isLastProd ? remainingCartons : Math.min(remainingCartons, needCtns);

        if (pCartonsAlloc > 0) {
          recordsToSubmit.push({
            po_number: p.po_number,
            product_id: p.id,
            cartons: pCartonsAlloc,
            pcs_per_carton: pcsPerCarton,
            quantity: pCartonsAlloc * pcsPerCarton,
          });
          remainingCartons -= pCartonsAlloc;
        }
      });
    });

    if (recordsToSubmit.length === 0) {
      alert("No carton quantities entered.");
      return;
    }

    const totalCartons = recordsToSubmit.reduce((s, p) => s + p.cartons, 0);
    const totalPcs = recordsToSubmit.reduce((s, p) => s + p.quantity, 0);

    setConfirmModalConfig({
      isOpen: true,
      title: "Confirm Direct Carton Pack Batch (From Finishing)",
      type: "success",
      confirmText: "Submit Direct Carton Batch",
      message: (
        <div className="space-y-2">
          <p>
            Are you sure you want to directly pack into cartons for Style{" "}
            <strong className="text-text font-bold">{mixStyle}</strong> and Color{" "}
            <strong className="text-text font-bold">{mixColor}</strong>?
          </p>
          <p className="text-[11px] text-text3">
            This bypasses the loose passing and blister process, dispatching directly to Carton Store.
          </p>
          <div className="p-3 bg-bg3/60 rounded-xl border border-bg4 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-text3">Total Cartons:</span>{" "}
              <span className="font-bold text-po">{totalCartons} Cartons</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text3">Total Pieces:</span>{" "}
              <span className="font-bold text-emerald-400">{totalPcs} pcs</span>
            </div>
            <div className="flex justify-between border-t border-bg4/50 pt-1 mt-1">
              <span className="text-text3 font-bold">Affected POs:</span>{" "}
              <span className="font-bold text-text">
                {Array.from(new Set(recordsToSubmit.map((r) => r.po_number))).join(", ")}
              </span>
            </div>
          </div>
        </div>
      ),
      onConfirm: async () => {
        setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        try {
          setIsLoading(true);
          await finishingService.directCartonPack({ items: recordsToSubmit });
          alert(`Successfully created ${totalCartons} cartons (${totalPcs} pcs) via Direct Carton Pack!`);
          setMixDirectCarton({});
          await fetchPOs();
          await fetchHistory();
        } catch (error: any) {
          alert(error.response?.data?.error || error.message);
        } finally {
          setIsLoading(false);
        }
      },
    });
  };

  const handleSinglePODirectCartonSubmit = async () => {
    const payloads: any[] = [];
    Object.entries(directCartonQtys).forEach(([id, q]) => {
      const entry = q as { cartons?: string; pcs_per_carton?: string };
      const ctns = parseInt(entry.cartons || "0");
      const pcsPerCtn = parseInt(entry.pcs_per_carton || "24");
      if (ctns > 0 && pcsPerCtn > 0) {
        payloads.push({
          po_number: selectedPONum,
          product_id: parseInt(id) || 0,
          cartons: ctns,
          pcs_per_carton: pcsPerCtn,
          quantity: ctns * pcsPerCtn,
        });
      }
    });

    if (payloads.length === 0) return;

    const totalCartons = payloads.reduce((s, p) => s + p.cartons, 0);
    const totalPcs = payloads.reduce((s, p) => s + p.quantity, 0);

    setConfirmModalConfig({
      isOpen: true,
      title: "Confirm Direct Carton Pack (Single PO)",
      type: "success",
      confirmText: "Submit Direct Carton Batch",
      message: (
        <div className="space-y-2">
          <p>
            Are you sure you want to direct pack cartons for PO{" "}
            <strong className="text-text font-bold">{selectedPONum}</strong>?
          </p>
          <p className="text-[11px] text-text3">
            This bypasses the loose passing and blister process, dispatching directly to Carton Store.
          </p>
          <div className="p-3 bg-bg3/60 rounded-xl border border-bg4 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-text3">Total Cartons:</span>{" "}
              <span className="font-bold text-po">{totalCartons} Cartons</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text3">Total Pieces:</span>{" "}
              <span className="font-bold text-emerald-400">{totalPcs} pcs</span>
            </div>
          </div>
        </div>
      ),
      onConfirm: async () => {
        setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        try {
          setIsLoading(true);
          await finishingService.directCartonPack({ po_number: selectedPONum, items: payloads });
          handlePOChange(selectedPONum);
          fetchHistory();
          alert(`Direct carton packing successful: ${totalCartons} cartons (${totalPcs} pcs) recorded.`);
        } catch (error: any) {
          alert(error.response?.data?.error || error.message);
        } finally {
          setIsLoading(false);
        }
      },
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
      const data = await cuttingService.getPOProducts(poNum);
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

      const initialQtys: Record<number, { pass: number; reject: number }> = {};
      sortedProducts.forEach(
        (p: any) => (initialQtys[p.id] = { pass: 0, reject: 0 }),
      );
      setQuantities(initialQtys);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    const payloads: any[] = [];
    Object.entries(quantities).forEach(([id, q]) => {
      const qtys = q as { pass: number; reject: number };
      if (qtys.pass > 0) {
        payloads.push({
          po_number: selectedPONum,
          product_id: parseInt(id) || 0,
          quantity: qtys.pass,
          result: "pass",
        });
      }
      if (qtys.reject > 0) {
        payloads.push({
          po_number: selectedPONum,
          product_id: parseInt(id) || 0,
          quantity: qtys.reject,
          result: "reject",
        });
      }
    });

    if (payloads.length === 0) return;

    const totalPass = payloads.filter(p => p.result === "pass").reduce((s, p) => s + p.quantity, 0);
    const totalReject = payloads.filter(p => p.result === "reject").reduce((s, p) => s + p.quantity, 0);

    setConfirmModalConfig({
      isOpen: true,
      title: "Confirm QC Results Batch",
      type: "success",
      confirmText: "Submit QC Batch",
      message: (
        <div className="space-y-2">
          <p>Are you sure you want to submit QC results for PO <strong className="text-text font-bold">{selectedPONum}</strong>?</p>
          <div className="p-3 bg-bg3/60 rounded-xl border border-bg4 space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-text3">Pass Quantity:</span> <span className="font-bold text-emerald-400">{totalPass} pcs</span></div>
            <div className="flex justify-between"><span className="text-text3">Reject Quantity:</span> <span className="font-bold text-rose-400">{totalReject} pcs</span></div>
            <div className="flex justify-between border-t border-bg4/50 pt-1 mt-1"><span className="text-text3">Total Processed:</span> <span className="font-bold text-text">{totalPass + totalReject} pcs</span></div>
          </div>
        </div>
      ),
      onConfirm: async () => {
        setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        try {
          setIsLoading(true);
          await Promise.all(payloads.map((p) => finishingService.create(p)));
          handlePOChange(selectedPONum);
          fetchHistory();
          alert("QC results recorded successfully");
        } catch (error: any) {
          alert(error.message);
        } finally {
          setIsLoading(false);
        }
      },
    });
  };

  const handleBulkReturn = async () => {
    const payload: any[] = [];
    Object.entries(quantities).forEach(([productId, q]) => {
      const qtys = q as { pass: number; reject: number };
      const totalQty = (qtys.pass || 0) + (qtys.reject || 0);
      if (totalQty > 0) {
        const p = products.find((prod) => prod.id === parseInt(productId));
        payload.push({
          po_number: p?.po_number || selectedPONum,
          product_id: parseInt(productId),
          from_department: "Finishing" as const,
          to_department: "Stitching" as const,
          quantity: totalQty,
          reason: "Bulk Return to Stitching",
          line_number: (p as any)?.line_number || p?.line_num || undefined,
        });
      }
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
          <p>Are you sure you want to return items back to <strong className="text-text font-bold">Stitching</strong>?</p>
          <div className="p-3 bg-bg3/60 rounded-xl border border-bg4 space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-text3">PO Number:</span> <span className="font-bold text-text">{selectedPONum}</span></div>
            <div className="flex justify-between"><span className="text-text3">Items count:</span> <span className="font-bold text-text">{payload.length}</span></div>
            <div className="flex justify-between"><span className="text-text3">Total Return Quantity:</span> <span className="font-bold text-rose-400">{totalQty} pcs</span></div>
            <div className="flex justify-between"><span className="text-text3">Destination:</span> <span className="font-bold text-text">Stitching</span></div>
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
      const finished = (p as any).total_finished || 0;
      const rejected = (p as any).total_rejected || 0;
      const available = isInitialStockMode
        ? ((p as any).original_qty ?? (p as any).qty ?? 0) - finished - rejected
        : ((p as any).total_accepted_stitched || 0) - finished - rejected;
      return available < 0;
    });

    if (deficits.length === 0) {
      alert("No deficit items (negative available quantities) found for this PO.");
      return;
    }

    const groups: Record<string, { po_number: string; style_num: string; color: string; line_number: string; sizes: Record<string, number> }> = {};

    deficits.forEach(p => {
      const poNum = p.po_number || selectedPONum || "PO-N/A";
      const lineStr = String((p as any).line_number || (p as any).line_num || "LINE 1").trim();
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
      const finished = (p as any).total_finished || 0;
      const rejected = (p as any).total_rejected || 0;
      const available = isInitialStockMode
        ? ((p as any).original_qty ?? (p as any).qty ?? 0) - finished - rejected
        : ((p as any).total_accepted_stitched || 0) - finished - rejected;
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
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Deficits-Finishing');
    XLSX.writeFile(workbook, `Deficits_Finishing_${selectedPONum || 'ALL'}.xlsx`);
  };

  const filteredProducts = useMemo(
    () =>
      products.filter((p) => {
        const hasInventory =
          isInitialStockMode || ((p as any).total_accepted_stitched || 0) > 0;
        const targetGoal = isInitialStockMode ? ((p as any).original_qty ?? (p as any).qty ?? 0) : ((p as any).total_accepted_stitched || 0);
        const isCompleted =
          ((p as any).total_finished || 0) + ((p as any).total_rejected || 0) >=
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
      const key = `${date}-${rec.po_number}-${rec.style_num}-${rec.color}-${rec.creator_name || "System"}`;

      if (!groups[key]) {
        groups[key] = {
          date: rec.created_at,
          po_number: rec.po_number,
          style_num: rec.style_num,
          color: rec.color,
          creator_name: rec.creator_name || "System",
          sizes: {},
        };
      }

      const sizeKey = rec.size;
      if (!groups[key].sizes[sizeKey]) {
        groups[key].sizes[sizeKey] = { passed: 0, rejected: 0 };
      }
      if (rec.result === "pass")
        groups[key].sizes[sizeKey].passed += rec.quantity;
      else groups[key].sizes[sizeKey].rejected += rec.quantity;
      allSizes.add(sizeKey);
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
      const key = `${h.style_num}-${h.color}`;
      if (!stats[key]) {
        stats[key] = {
          style_num: h.style_num,
          color: h.color,
          passed: 0,
          rejected: 0,
        };
      }
      if (h.result === "pass") stats[key].passed += h.quantity;
      else stats[key].rejected += h.quantity;
    });

    const result = Object.values(stats);

    if (!reportSearch) return result;
    const search = reportSearch.toLowerCase();
    return result.filter(
      (s: any) =>
        s.style_num.toLowerCase().includes(search) ||
        s.color.toLowerCase().includes(search),
    );
  }, [history, dateRange, showReport, reportSearch]);

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-bg4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-pass/10 text-pass rounded-2xl shrink-0">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight uppercase">
              Quality Control
            </h1>
            <p className="text-text3 text-[10px] font-mono uppercase tracking-[0.3em] font-medium leading-tight mt-1">
              Finishing & Inspection Center
            </p>
          </div>
        </div>

        <div className="flex bg-bg2 p-1 rounded-xl border border-bg4 shadow-sm self-start lg:self-auto overflow-x-auto max-w-full">
          <button
            onClick={() => setActiveTab("entry")}
            className={cn(
              "px-4 sm:px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
              activeTab === "entry"
                ? "bg-pass text-white shadow-lg shadow-pass/20"
                : "text-text3 hover:text-text",
            )}
          >
            QC Form
          </button>
          <button
            onClick={() => setActiveTab("reports")}
            className={cn(
              "px-4 sm:px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
              activeTab === "reports"
                ? "bg-pass text-white shadow-lg shadow-pass/20"
                : "text-text3 hover:text-text",
            )}
          >
            QC Analytics
          </button>
        </div>
      </div>

      {activeTab === "entry" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Workflow Mode & Entry Mode Switchers */}
            <div className="space-y-4">
              {/* Workflow Mode Switcher */}
              <div className="bg-bg2 border border-bg4 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-tight text-slate-800 dark:text-white flex items-center gap-2">
                    Workflow Route
                    {workflowType === "direct_carton" && (
                      <span className="text-[9px] bg-po/10 text-po border border-po/30 px-2 py-0.5 rounded-full font-bold uppercase">
                        Bypasses Blister Stage
                      </span>
                    )}
                  </h3>
                  <p className="text-[10px] font-mono text-text3 uppercase mt-0.5">
                    {workflowType === "standard_qc"
                      ? "Standard QC: Records passed pieces into Loose buffer for subsequent packing"
                      : "Direct Carton: Packs inspected pieces straight into Cartons, bypassing Blister packing"}
                  </p>
                </div>
                <div className="flex bg-bg3 p-1 rounded-xl border border-bg4 max-w-fit gap-1">
                  <button
                    onClick={() => {
                      setWorkflowType("standard_qc");
                    }}
                    className={cn(
                      "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5",
                      workflowType === "standard_qc"
                        ? "bg-pass text-white shadow-md shadow-pass/20"
                        : "text-text3 hover:text-text"
                    )}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Standard QC
                  </button>
                  <button
                    onClick={() => {
                      setWorkflowType("direct_carton");
                    }}
                    className={cn(
                      "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5",
                      workflowType === "direct_carton"
                        ? "bg-po text-white shadow-md shadow-po/20"
                        : "text-text3 hover:text-text"
                    )}
                  >
                    <Package className="w-3.5 h-3.5" />
                    Direct Carton Pack
                  </button>
                </div>
              </div>

              {/* Entry Mode Switcher */}
              <div className="bg-bg2 border border-bg4 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-tight text-slate-800 dark:text-white">
                    Entry Mode
                  </h3>
                  <p className="text-[10px] font-mono text-text3 uppercase mt-1">
                    Choose how you want to record {workflowType === "direct_carton" ? "direct carton packing" : "QC finishing"} output
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
                        ? workflowType === "direct_carton" ? "bg-po text-white shadow-md shadow-po/20" : "bg-pass text-white shadow-md shadow-pass/20"
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
                        ? workflowType === "direct_carton" ? "bg-po text-white shadow-md shadow-po/20" : "bg-pass text-white shadow-md shadow-pass/20"
                        : "text-text3 hover:text-text"
                    )}
                  >
                    🗃️ Single PO
                  </button>
                </div>
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

                  <div className="shrink-0 pt-6">
                    {workflowType === "direct_carton" ? (
                      <button
                        onClick={handleMixDirectCartonSubmit}
                        disabled={
                          !mixStyle ||
                          !mixColor ||
                          Object.values(mixDirectCarton).every((q) => {
                            const item = q as { cartons?: string };
                            return parseInt(item.cartons || "0") <= 0;
                          })
                        }
                        className="bg-po text-white font-black px-10 py-4 rounded-xl shadow-xl shadow-po/30 disabled:opacity-50 hover:bg-amber-600 transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs"
                      >
                        <Package className="w-5 h-5" /> Submit Direct Carton Batch
                      </button>
                    ) : (
                      <button
                        onClick={handleMixSubmit}
                        disabled={
                          !mixStyle ||
                          !mixColor ||
                          (Object.values(mixQuantities) as { pass: string; reject: string }[]).every(
                            (q) => parseInt(q.pass || "0") <= 0 && parseInt(q.reject || "0") <= 0
                          )
                        }
                        className="bg-pass text-white font-black px-12 py-4 rounded-xl shadow-xl shadow-pass/30 disabled:opacity-50 hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs"
                      >
                        <CheckCircle2 className="w-5 h-5" /> Submit QC Batch
                      </button>
                    )}
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
                                ? workflowType === "direct_carton"
                                  ? "bg-bg3 border-po text-po shadow-sm"
                                  : "bg-bg3 border-pass text-pass shadow-sm"
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
                              className={cn(
                                "w-4 h-4 rounded bg-bg2 border-bg4 cursor-pointer",
                                workflowType === "direct_carton" ? "accent-po" : "accent-pass"
                              )}
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
                      <h3 className="text-sm font-bold uppercase tracking-tight flex items-center gap-2">
                        {workflowType === "direct_carton" ? (
                          <>
                            <Package className="w-4 h-4 text-po" />
                            Direct Carton Packing Allocation
                          </>
                        ) : (
                          "Aggregate Stitched Components Availability"
                        )}
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
                            <th className="p-4 text-xs font-mono uppercase font-black text-center">{isInitialStockMode ? "Required Qty" : "Accepted Stitched"}</th>
                            <th className="p-4 text-xs font-mono uppercase font-black text-center">Already Finished</th>
                            <th className="p-4 text-xs font-mono uppercase font-black text-center">Available Balance</th>
                            {workflowType === "direct_carton" ? (
                              <>
                                <th className="p-4 text-xs font-mono uppercase font-black text-center w-32">Cartons</th>
                                <th className="p-4 text-xs font-mono uppercase font-black text-center w-36">Pcs / Ctn</th>
                                <th className="p-4 text-xs font-mono uppercase font-black text-center w-32">Total Pcs</th>
                                <th className="p-4 text-xs font-mono uppercase font-black text-center w-32">Quick Actions</th>
                              </>
                            ) : (
                              <>
                                <th className="p-4 text-xs font-mono uppercase font-black text-center w-40">Today's Pass</th>
                                <th className="p-4 text-xs font-mono uppercase font-black text-center w-40">Today's Reject</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-bg4">
                          {mixUniqueSizes.map((size) => {
                            const matchingSizeProds = mixProducts.filter((p) => p.size === size);
                            const totalStitched = matchingSizeProds.reduce((sum, p) => sum + (isInitialStockMode ? (p.qty || 0) : (p.total_accepted_stitched || 0)), 0);
                            const totalPass = matchingSizeProds.reduce((sum, p) => sum + (p.total_finished || 0), 0);
                            const totalReject = matchingSizeProds.reduce((sum, p) => sum + (p.total_rejected || 0), 0);
                            const avail = Math.max(0, totalStitched - (totalPass + totalReject));

                            if (workflowType === "direct_carton") {
                              const ctnObj = mixDirectCarton[size] || { cartons: "", pcs_per_carton: "24" };
                              const ctns = parseInt(ctnObj.cartons || "0");
                              const pcsPerCtn = parseInt(ctnObj.pcs_per_carton || "24");
                              const totalPcs = ctns * pcsPerCtn;
                              const maxPossibleCtns = Math.floor(avail / (pcsPerCtn || 24));

                              return (
                                <tr key={size} className="hover:bg-bg3/20 transition-colors">
                                  <td className="p-4 text-center">
                                    <span className="font-black font-mono text-sm uppercase bg-po/10 text-po px-2.5 py-1 rounded">
                                      {size}
                                    </span>
                                  </td>
                                  <td className="p-4 text-center font-mono text-sm">{totalStitched}</td>
                                  <td className="p-4 text-center font-mono text-sm">{totalPass} / <span className="text-reject">{totalReject}</span></td>
                                  <td className="p-4 text-center font-mono text-sm text-po font-bold bg-po/5">{avail}</td>
                                  <td className="p-4">
                                    <input
                                      type="number"
                                      min="0"
                                      value={ctnObj.cartons}
                                      onChange={(e) =>
                                        setMixDirectCarton({
                                          ...mixDirectCarton,
                                          [size]: {
                                            cartons: e.target.value,
                                            pcs_per_carton: ctnObj.pcs_per_carton || "24",
                                          },
                                        })
                                      }
                                      className="w-full bg-bg3 border border-bg4 rounded-xl p-2 text-sm font-black text-center focus:ring-1 focus:ring-po outline-none transition-all text-po"
                                      placeholder="0"
                                    />
                                  </td>
                                  <td className="p-4">
                                    <select
                                      value={ctnObj.pcs_per_carton || "24"}
                                      onChange={(e) =>
                                        setMixDirectCarton({
                                          ...mixDirectCarton,
                                          [size]: {
                                            cartons: ctnObj.cartons || "",
                                            pcs_per_carton: e.target.value,
                                          },
                                        })
                                      }
                                      className="w-full bg-bg3 border border-bg4 rounded-xl p-2 text-xs font-bold text-center focus:ring-1 focus:ring-po outline-none transition-all"
                                    >
                                      <option value="12">12 pcs/ctn</option>
                                      <option value="24">24 pcs/ctn</option>
                                      <option value="36">36 pcs/ctn</option>
                                      <option value="48">48 pcs/ctn</option>
                                      <option value="60">60 pcs/ctn</option>
                                    </select>
                                  </td>
                                  <td className="p-4 text-center font-mono text-sm font-bold text-emerald-400">
                                    {totalPcs > 0 ? `${totalPcs} pcs` : "-"}
                                  </td>
                                  <td className="p-4 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setMixDirectCarton({
                                            ...mixDirectCarton,
                                            [size]: {
                                              cartons: String(maxPossibleCtns > 0 ? maxPossibleCtns : 0),
                                              pcs_per_carton: ctnObj.pcs_per_carton || "24",
                                            },
                                          })
                                        }
                                        className="px-2 py-1 bg-po/10 hover:bg-po/20 text-po rounded text-[10px] font-black uppercase transition-all"
                                        title="Fill maximum whole cartons available"
                                      >
                                        Max
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setMixDirectCarton({
                                            ...mixDirectCarton,
                                            [size]: {
                                              cartons: "",
                                              pcs_per_carton: ctnObj.pcs_per_carton || "24",
                                            },
                                          })
                                        }
                                        className="px-2 py-1 bg-bg4 hover:bg-bg3 text-text3 rounded text-[10px] font-black uppercase transition-all"
                                      >
                                        0
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            }

                            return (
                              <tr key={size} className="hover:bg-bg3/20 transition-colors">
                                <td className="p-4 text-center">
                                  <span className="font-black font-mono text-sm uppercase bg-pass/10 text-pass px-2.5 py-1 rounded">
                                    {size}
                                  </span>
                                </td>
                                <td className="p-4 text-center font-mono text-sm">{totalStitched}</td>
                                <td className="p-4 text-center font-mono text-sm">{totalPass} / <span className="text-reject">{totalReject}</span></td>
                                <td className="p-4 text-center font-mono text-sm text-po font-bold bg-po/5">{avail}</td>
                                <td className="p-4">
                                  <input
                                    type="number"
                                    min="0"
                                    value={mixQuantities[size]?.pass || ""}
                                    onChange={(e) =>
                                      setMixQuantities({
                                        ...mixQuantities,
                                        [size]: {
                                          pass: e.target.value,
                                          reject: mixQuantities[size]?.reject || "0",
                                        },
                                      })
                                    }
                                    className="w-full bg-bg3 border border-bg4 rounded-xl p-2 text-sm font-black text-center focus:ring-1 focus:ring-pass outline-none transition-all text-pass"
                                    placeholder="0"
                                  />
                                </td>
                                <td className="p-4">
                                  <input
                                    type="number"
                                    min="0"
                                    value={mixQuantities[size]?.reject || ""}
                                    onChange={(e) =>
                                      setMixQuantities({
                                        ...mixQuantities,
                                        [size]: {
                                          pass: mixQuantities[size]?.pass || "0",
                                          reject: e.target.value,
                                        },
                                      })
                                    }
                                    className="w-full bg-bg3 border border-bg4 rounded-xl p-2 text-sm font-black text-center focus:ring-1 focus:ring-reject outline-none transition-all text-reject"
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
              <div className="bg-bg2 border border-bg4 rounded-2xl p-6 flex flex-col md:flex-row md:items-center gap-6">
                <div className="flex-1 space-y-2">
                  <label className="text-[10px] font-mono text-text3 uppercase tracking-widest block pl-1">
                    Select Active PO
                  </label>
                  <select
                    value={selectedPONum}
                    onChange={(e) => handlePOChange(e.target.value)}
                    className="w-full bg-bg3 border border-bg4 rounded-xl p-3.5 text-sm font-bold text-po outline-none focus:ring-1 focus:ring-po/30 transition-all"
                  >
                    <option value="">-- CHOOSE PO --</option>
                    {pos
                      .filter((po) => po.status === "Active")
                      .map((po, idx) => (
                        <option
                          key={`${po.id}-${po.buyer || idx}`}
                          value={po.po_number}
                        >
                          {po.po_number}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="shrink-0 pt-6 flex items-center gap-3">
                  {workflowType === "direct_carton" ? (
                    <button
                      onClick={handleSinglePODirectCartonSubmit}
                      disabled={
                        !selectedPONum ||
                        Object.values(directCartonQtys).every((q) => {
                          const item = q as { cartons?: string };
                          return parseInt(item.cartons || "0") <= 0;
                        })
                      }
                      className="bg-po text-white font-black px-8 py-4 rounded-2xl shadow-xl shadow-po/30 disabled:opacity-50 hover:bg-amber-600 hover:translate-y-[-1px] active:translate-y-[0px] transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs min-w-[180px]"
                    >
                      <Package className="w-5 h-5" /> Submit Direct Carton Batch
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleSubmit}
                        disabled={
                          !selectedPONum ||
                          Object.values(quantities).every((q) => {
                            const qtys = q as { pass: number; reject: number };
                            return qtys.pass <= 0 && qtys.reject <= 0;
                          })
                        }
                        className="bg-pass text-white font-black px-8 py-4 rounded-2xl shadow-xl shadow-pass/30 disabled:opacity-50 hover:bg-emerald-600 hover:translate-y-[-1px] active:translate-y-[0px] transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs min-w-[160px]"
                      >
                        <CheckCircle2 className="w-5 h-5" /> Submit QC Batch
                      </button>
                      <button
                        type="button"
                        onClick={handleBulkReturn}
                        disabled={
                          !selectedPONum ||
                          Object.values(quantities).every((q) => {
                            const qtys = q as { pass: number; reject: number };
                            return qtys.pass <= 0 && qtys.reject <= 0;
                          })
                        }
                        className="bg-rose-600 text-white font-black px-8 py-4 rounded-2xl shadow-xl shadow-rose-600/30 disabled:opacity-50 hover:bg-rose-700 hover:translate-y-[-1px] active:translate-y-[0px] transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs min-w-[160px]"
                      >
                        <RotateCcw className="w-5 h-5" /> Bulk Return
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {selectedPONum && (
              <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
                <div className="p-4 bg-bg3/30 border-b border-bg4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <h3 className="text-sm font-bold uppercase tracking-tight flex items-center gap-2">
                      {workflowType === "direct_carton" ? (
                        <>
                          <Package className="w-4 h-4 text-po" />
                          Direct Carton Packaging Table
                        </>
                      ) : (
                        "Bulk QC Entry"
                      )}
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
                          : "bg-pass/10 border-pass/30 text-pass hover:bg-pass/20",
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

                    {workflowType === "direct_carton" ? (
                      <button
                        onClick={() => {
                          const newDirect = { ...directCartonQtys };
                          filteredProducts.forEach((p: any) => {
                            const stitched = isInitialStockMode ? (p.original_qty ?? p.qty ?? 0) : (p.total_accepted_stitched || 0);
                            const alreadyFinished = (p.total_finished || 0) + (p.total_rejected || 0);
                            const available = Math.max(0, stitched - alreadyFinished);
                            const pcsPerCtn = 24;
                            const maxCtns = Math.floor(available / pcsPerCtn);
                            newDirect[p.id] = {
                              cartons: maxCtns > 0 ? String(maxCtns) : "0",
                              pcs_per_carton: "24",
                            };
                          });
                          setDirectCartonQtys(newDirect);
                        }}
                        className="bg-bg text-[10px] font-black text-po hover:text-white hover:bg-po uppercase px-4 py-2 rounded-lg transition-all border border-po/30 shadow-sm ml-auto flex items-center gap-1.5"
                      >
                        <Package className="w-3.5 h-3.5" />
                        Fill Max Cartons (24 pcs/ctn)
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          const newQtys = { ...quantities };
                          filteredProducts.forEach((p: any) => {
                            const stitched = isInitialStockMode ? (p.original_qty ?? p.qty ?? 0) : (p.total_accepted_stitched || 0);
                            const alreadyFinished =
                              (p.total_finished || 0) + (p.total_rejected || 0);
                            const available = stitched - alreadyFinished;
                            newQtys[p.id] = {
                              pass: available > 0 ? available : 0,
                              reject: 0,
                            };
                          });
                          setQuantities(newQtys);
                        }}
                        className="bg-bg text-[10px] font-black text-pass hover:text-white hover:bg-pass uppercase px-4 py-2 rounded-lg transition-all border border-pass/30 shadow-sm ml-auto"
                      >
                        Fill (All Pass)
                      </button>
                    )}

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
                          Order Qty
                        </th>
                        <th className="p-4 text-xs font-mono uppercase font-black text-center">
                          Accepted Stitched
                        </th>
                        <th className="p-4 text-xs font-mono uppercase font-black text-center">
                          Available
                        </th>
                        <th className="p-4 text-xs font-mono uppercase font-black text-center">
                          Finished
                        </th>
                        {workflowType === "direct_carton" ? (
                          <>
                            <th className="p-4 text-xs font-mono uppercase font-black w-28 text-center">
                              Cartons
                            </th>
                            <th className="p-4 text-xs font-mono uppercase font-black w-32 text-center">
                              Pcs / Ctn
                            </th>
                            <th className="p-4 text-xs font-mono uppercase font-black w-28 text-center">
                              Total Pcs
                            </th>
                          </>
                        ) : (
                          <>
                            <th className="p-4 text-xs font-mono uppercase font-black w-24 text-center">
                              Pass
                            </th>
                            <th className="p-4 text-xs font-mono uppercase font-black w-24 text-center">
                              Reject
                            </th>
                            <th className="p-4 text-xs font-mono uppercase font-black w-10 text-center">
                              Return
                            </th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-bg4">
                      {filteredProducts.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-12 text-center">
                            <p className="text-text3 text-xs font-mono uppercase tracking-widest">
                              No stitched products ready for QC
                            </p>
                            <p className="text-[10px] text-text3 mt-2 font-mono">
                              Waiting for Stitching Dept handovers...
                            </p>
                          </td>
                        </tr>
                      ) : (
                        filteredProducts.map((p: any) => {
                          const finished = p.total_finished || 0;
                          const rejected = p.total_rejected || 0;
                          const available = isInitialStockMode
                            ? (p.original_qty ?? p.qty ?? 0) - finished - rejected
                            : (p.total_accepted_stitched || 0) - finished - rejected;
                          
                          if (workflowType === "direct_carton") {
                            const ctnEntry = directCartonQtys[p.id] || { cartons: "", pcs_per_carton: "24" };
                            const ctns = parseInt(ctnEntry.cartons || "0");
                            const pcsPerCtn = parseInt(ctnEntry.pcs_per_carton || "24");
                            const totalPcs = ctns * pcsPerCtn;

                            return (
                              <tr
                                key={p.id}
                                className={cn(
                                  "hover:bg-bg3/20 transition-colors",
                                  p.priority === "Urgent" ? "bg-reject/[0.02]" : ""
                                )}
                              >
                                <td className="p-4">
                                  <div className="flex items-center gap-2">
                                    <p className="font-bold text-sm tracking-tight">
                                      {p.style_num}
                                    </p>
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
                                  <p className="text-xs font-mono font-black text-po uppercase bg-po/5 px-2 py-0.5 rounded inline-block">
                                    {p.size}
                                  </p>
                                </td>
                                <td className="p-4 text-center font-mono text-sm">
                                  {p.original_qty ?? p.qty ?? 0}
                                </td>
                                <td className="p-4 text-center font-mono text-sm">
                                  {p.total_accepted_stitched || 0}
                                </td>
                                <td className="p-4 text-center font-mono text-sm font-black text-po bg-po/5">
                                  {available}
                                </td>
                                <td className="p-4 text-center font-mono text-sm">
                                  <span className="text-pass font-bold">{finished}</span>
                                  <span className="text-text3"> / </span>
                                  <span className="text-reject font-bold">{rejected}</span>
                                </td>
                                <td className="p-2">
                                  <input
                                    type="number"
                                    min="0"
                                    value={ctnEntry.cartons}
                                    onChange={(e) =>
                                      setDirectCartonQtys({
                                        ...directCartonQtys,
                                        [p.id]: {
                                          cartons: e.target.value,
                                          pcs_per_carton: ctnEntry.pcs_per_carton || "24",
                                        },
                                      })
                                    }
                                    className="w-full bg-bg3 border border-po/30 rounded-xl p-2 text-sm font-black text-center text-po"
                                    placeholder="0"
                                  />
                                </td>
                                <td className="p-2">
                                  <select
                                    value={ctnEntry.pcs_per_carton || "24"}
                                    onChange={(e) =>
                                      setDirectCartonQtys({
                                        ...directCartonQtys,
                                        [p.id]: {
                                          cartons: ctnEntry.cartons || "",
                                          pcs_per_carton: e.target.value,
                                        },
                                      })
                                    }
                                    className="w-full bg-bg3 border border-bg4 rounded-xl p-2 text-xs font-bold text-center focus:ring-1 focus:ring-po outline-none transition-all"
                                  >
                                    <option value="12">12 pcs</option>
                                    <option value="24">24 pcs</option>
                                    <option value="36">36 pcs</option>
                                    <option value="48">48 pcs</option>
                                    <option value="60">60 pcs</option>
                                  </select>
                                </td>
                                <td className="p-4 text-center font-mono text-sm font-bold text-emerald-400">
                                  {totalPcs > 0 ? `${totalPcs} pcs` : "-"}
                                </td>
                              </tr>
                            );
                          }

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
                                <p className="text-xs font-mono font-black text-pass uppercase bg-pass/5 px-2 py-0.5 rounded inline-block">
                                  {p.size}
                                </p>
                              </td>
                              <td className="p-4 text-center font-mono text-sm">
                                {p.original_qty ?? p.qty ?? 0}
                              </td>
                              <td className="p-4 text-center font-mono text-sm">
                                {p.total_accepted_stitched || 0}
                              </td>
                              <td className="p-4 text-center font-mono text-sm font-black text-pass bg-pass/5">
                                {available}
                              </td>
                              <td className="p-4 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <span className="text-pass font-bold">
                                    {finished}
                                  </span>
                                  <span className="text-text3">/</span>
                                  <span className="text-reject font-bold">
                                    {rejected}
                                  </span>
                                </div>
                                <div className="flex flex-col items-center gap-1 mt-1">
                                  <div className="w-24 bg-bg4 h-1 rounded-full overflow-hidden">
                                    <div
                                      className="bg-pass h-full"
                                      style={{
                                        width: `${Math.min(((finished + rejected) / Math.max(isInitialStockMode ? (p.original_qty ?? p.qty ?? 0) : (p.total_accepted_stitched || 0), 1)) * 100, 100)}%`,
                                      }}
                                    />
                                  </div>
                                  <span className="text-[9px] text-text3 font-mono uppercase">
                                    {available} ready
                                  </span>
                                </div>
                              </td>
                              <td className="p-2">
                                <input
                                  type="number"
                                  min="0"
                                  max={available}
                                  value={quantities[p.id]?.pass || 0}
                                  onChange={(e) =>
                                    setQuantities({
                                      ...quantities,
                                      [p.id]: {
                                        ...quantities[p.id],
                                        pass: parseInt(e.target.value) || 0,
                                      },
                                    })
                                  }
                                  className="w-full bg-bg3 border border-pass/30 rounded-xl p-2 text-sm font-black text-center text-pass"
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  type="number"
                                  min="0"
                                  max={
                                    available - (quantities[p.id]?.pass || 0)
                                  }
                                  value={quantities[p.id]?.reject || 0}
                                  onChange={(e) =>
                                    setQuantities({
                                      ...quantities,
                                      [p.id]: {
                                        ...quantities[p.id],
                                        reject: parseInt(e.target.value) || 0,
                                      },
                                    })
                                  }
                                  className="w-full bg-bg3 border border-reject/30 rounded-xl p-2 text-sm font-black text-center text-reject"
                                />
                              </td>
                              <td className="p-2 text-center">
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
                                    className="p-1.5 text-text3 hover:text-po transition-colors"
                                    title="Send back to other department"
                                  >
                                    <RotateCcw className="w-4 h-4" />
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
                                    className="p-1.5 text-text3 hover:text-reject transition-colors"
                                    title="Partial Discard of this item"
                                  >
                                    <Trash2 className="w-4 h-4" />
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

                <div className="p-4 bg-bg3/30 border-t border-bg4 flex items-center justify-between">
                  <span className="text-xs font-bold text-text3 uppercase">Batch Actions</span>
                  <div className="flex items-center gap-3">
                    {workflowType === "direct_carton" ? (
                      <button
                        onClick={handleSinglePODirectCartonSubmit}
                        disabled={
                          !selectedPONum ||
                          Object.values(directCartonQtys).every((q) => {
                            const item = q as { cartons?: string };
                            return parseInt(item.cartons || "0") <= 0;
                          })
                        }
                        className="bg-po text-white font-black px-8 py-3.5 rounded-xl shadow-lg shadow-po/30 disabled:opacity-50 hover:bg-amber-600 active:translate-y-[1px] transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs min-w-[180px]"
                      >
                        <Package className="w-4 h-4" /> Submit Direct Carton Batch
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={handleSubmit}
                          disabled={
                            !selectedPONum ||
                            Object.values(quantities).every((q) => {
                              const qtys = q as { pass: number; reject: number };
                              return qtys.pass <= 0 && qtys.reject <= 0;
                            })
                          }
                          className="bg-pass text-white font-black px-8 py-3.5 rounded-xl shadow-lg shadow-pass/30 disabled:opacity-50 hover:bg-emerald-600 active:translate-y-[1px] transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs min-w-[160px]"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Submit QC Batch
                        </button>
                        <button
                          type="button"
                          onClick={handleBulkReturn}
                          disabled={
                            !selectedPONum ||
                            Object.values(quantities).every((q) => {
                              const qtys = q as { pass: number; reject: number };
                              return qtys.pass <= 0 && qtys.reject <= 0;
                            })
                          }
                          className="bg-rose-600 text-white font-black px-8 py-3.5 rounded-xl shadow-lg shadow-rose-600/30 disabled:opacity-50 hover:bg-rose-700 active:translate-y-[1px] transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs min-w-[160px]"
                        >
                          <RotateCcw className="w-4 h-4" /> Bulk Return
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-1 space-y-6">
            <ReturnsHandoverList
              department="Finishing"
              onRefresh={() => {
                fetchPOs();
                if (selectedPONum) handlePOChange(selectedPONum);
              }}
            />

            <HandoverList
              title="Incoming from Stitching"
              table="stitch_records"
              records={incomingStitching}
              onRefresh={() => {
                fetchIncoming();
                if (selectedPONum) handlePOChange(selectedPONum);
              }}
            />

            <div className="bg-bg2 border border-bg4 rounded-3xl overflow-hidden shadow-lg border-t-4 border-t-pass">
              <div className="p-6 border-b border-bg4 bg-bg3/30 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-tight">
                      Finishing Log
                    </h3>
                    <p className="text-[9px] font-mono font-medium text-text3 mt-0.5">
                      Editable until accepted by Packing
                    </p>
                  </div>
                  <CheckCircle2 className="w-4 h-4 text-text3" />
                </div>
                {/* Filter pills */}
                <div className="flex bg-bg3 p-1 rounded-xl border border-bg4 gap-1">
                  <button
                    onClick={() => setHistoryFilter("all")}
                    className={cn(
                      "flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
                      historyFilter === "all"
                        ? "bg-bg2 text-text shadow-sm"
                        : "text-text3 hover:text-text"
                    )}
                  >
                    All Logs
                  </button>
                  <button
                    onClick={() => setHistoryFilter("qc")}
                    className={cn(
                      "flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
                      historyFilter === "qc"
                        ? "bg-pass text-white shadow-sm shadow-pass/20"
                        : "text-text3 hover:text-text"
                    )}
                  >
                    QC Only
                  </button>
                  <button
                    onClick={() => setHistoryFilter("direct_carton")}
                    className={cn(
                      "flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all",
                      historyFilter === "direct_carton"
                        ? "bg-po text-white shadow-sm shadow-po/20"
                        : "text-text3 hover:text-text"
                    )}
                  >
                    Direct Carton
                  </button>
                </div>
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
                        Type / QC
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
                    {history
                      .filter((rec: any) => {
                        if (historyFilter === "qc") return !rec.is_direct_carton;
                        if (historyFilter === "direct_carton") return rec.is_direct_carton;
                        return true;
                      })
                      .length > 0 ? (
                      history
                        .filter((rec: any) => {
                          if (historyFilter === "qc") return !rec.is_direct_carton;
                          if (historyFilter === "direct_carton") return rec.is_direct_carton;
                          return true;
                        })
                        .slice(0, 50)
                        .map((rec, i) => (
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
                            {rec.is_direct_carton ? (
                              <span className="text-[8px] font-black px-2 py-0.5 rounded uppercase bg-po/10 text-po border border-po/20 inline-flex items-center gap-1">
                                <Package className="w-2.5 h-2.5" /> Direct Ctn
                              </span>
                            ) : (
                              <span
                                className={cn(
                                  "text-[9px] font-black px-2 py-0.5 rounded uppercase",
                                  rec.result === "pass"
                                    ? "bg-pass/10 text-pass"
                                    : "bg-reject/10 text-reject",
                                )}
                              >
                                {rec.result}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right font-black text-pass text-xs">
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
                                className="w-16 bg-bg text-right px-1 border border-pass rounded outline-none focus:ring-1 focus:ring-pass"
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
                                    department="finishing"
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
                                  Handover: {rec.status}
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
                          No finishing logs found
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
                        <p className="text-[10px] font-mono text-text3 uppercase mt-1">
                          {rec.color} • {rec.size}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={cn(
                              "text-[10px] font-bold px-2 py-1 rounded uppercase",
                              rec.result === "pass"
                                ? "bg-pass/10 text-pass"
                                : "bg-reject/10 text-reject",
                            )}
                          >
                            {rec.result}
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
                            Handover: {rec.status}
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
        <div className="space-y-10">
          {/* QC Summary Card */}
          <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-6 bg-pass/5 border-b border-bg4 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tight text-pass">
                  1. QC Performance Report
                </h3>
                <p className="text-[10px] font-mono text-text3 uppercase font-bold tracking-widest mt-1">
                  Inspected aggregates by product category
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 bg-bg3 p-1.5 rounded-xl border border-bg4 shadow-inner">
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) =>
                      setDateRange((prev) => ({
                        ...prev,
                        start: e.target.value,
                      }))
                    }
                    className="bg-transparent text-xs font-black outline-none px-2"
                  />
                  <span className="text-[10px] font-black text-text3 uppercase tracking-widest">
                    To
                  </span>
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) =>
                      setDateRange((prev) => ({ ...prev, end: e.target.value }))
                    }
                    className="bg-transparent text-xs font-black outline-none px-2"
                  />
                </div>

                <button
                  onClick={() => setShowReport(!showReport)}
                  className={cn(
                    "px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg active:scale-95",
                    showReport
                      ? "bg-bg4 text-text border border-bg4"
                      : "bg-pass text-white shadow-pass/20",
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
                    className="bg-bg3 border border-bg4 rounded-xl py-3 px-6 text-xs font-bold outline-none focus:ring-1 focus:ring-pass/30"
                  />
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-bg3/30 border-b border-bg4 font-mono font-black uppercase tracking-widest">
                    <th className="p-5">Style Number</th>
                    <th className="p-5">Color</th>
                    <th className="p-5 text-center bg-pass/5">Gross Passed</th>
                    <th className="p-5 text-center bg-reject/5">
                      Gross Failed
                    </th>
                    <th className="p-5 text-center">Rejection Rate</th>
                    <th className="p-5 text-right">Total Inspected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg4">
                  {!showReport ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="p-20 text-center font-black uppercase tracking-[0.3em] text-text3"
                      >
                        Ready for query execution
                      </td>
                    </tr>
                  ) : outputStats.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="p-16 text-center text-text3 font-bold uppercase"
                      >
                        No records matching period
                      </td>
                    </tr>
                  ) : (
                    outputStats.map((stat: any, i) => {
                      const total = stat.passed + stat.rejected;
                      const rate = (stat.rejected / (total || 1)) * 100;
                      return (
                        <tr
                          key={i}
                          className="hover:bg-bg3/20 transition-colors"
                        >
                          <td className="p-5 font-black text-sm">
                            {stat.style_num}
                          </td>
                          <td className="p-5 font-bold uppercase text-text2">
                            {stat.color}
                          </td>
                          <td className="p-5 text-center font-mono font-black text-pass bg-pass/5">
                            +{stat.passed}
                          </td>
                          <td className="p-5 text-center font-mono font-black text-reject bg-reject/5">
                            -{stat.rejected}
                          </td>
                          <td className="p-5 text-center">
                            <span
                              className={cn(
                                "px-3 py-1 rounded-full font-black font-mono",
                                rate > 5
                                  ? "bg-reject/10 text-reject"
                                  : "bg-pass/10 text-pass",
                              )}
                            >
                              {rate.toFixed(1)}%
                            </span>
                          </td>
                          <td className="p-5 text-right font-black text-sm tracking-tight">
                            {total} PCS
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detailed QC Log (Pivoted) */}
          <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-6 bg-bg3/20 border-b border-bg4 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tight">
                  2. Detailed Batch History
                </h3>
                <p className="text-[10px] font-mono text-text3 uppercase font-bold tracking-widest mt-1">
                  Multi-dimensional QC log with size split
                </p>
              </div>
              <div className="relative w-full md:w-80">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text3" />
                <input
                  type="text"
                  placeholder="Global Batch Search..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full bg-bg3 border border-bg4 rounded-xl py-3 pl-12 pr-6 text-xs font-bold outline-none focus:ring-1 focus:ring-po/30 transition-all"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse border-separate border-spacing-0">
                <thead className="sticky top-0 bg-bg2 z-20">
                  <tr className="bg-bg3/80 backdrop-blur-md border-b border-bg4 uppercase">
                    <th className="p-5 font-mono font-black border-b border-bg4 sticky left-0 bg-bg2 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                      Timeline
                    </th>
                    <th className="p-5 font-mono font-black border-b border-bg4">
                      PO Metadata
                    </th>
                    <th className="p-5 font-mono font-black border-b border-bg4">
                      Product Specs
                    </th>
                    {pivotedHistory.sizes.map((s) => (
                      <th
                        key={s}
                        className="p-5 font-mono font-black text-center border-b border-bg4 min-w-[100px]"
                      >
                        {s}
                      </th>
                    ))}
                    <th className="p-5 font-mono font-black text-center border-b border-bg4 bg-bg4/30">
                      Batch Total
                    </th>
                    <th className="p-5 font-mono font-black border-b border-bg4">
                      Inspector
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg4">
                  {pivotedHistory.rows.map((row: any, i) => {
                    let batchPass = 0;
                    let batchFail = 0;
                    Object.values(row.sizes).forEach((s: any) => {
                      batchPass += s.passed;
                      batchFail += s.rejected;
                    });
                    return (
                      <tr
                        key={i}
                        className="hover:bg-bg3/10 transition-colors group"
                      >
                        <td className="p-5 font-mono text-text3 font-medium sticky left-0 bg-bg2 border-r border-bg4 group-hover:bg-bg3/10 transition-colors">
                          {fmtDate(row.date)}
                        </td>
                        <td className="p-5">
                          <p className="font-black text-po uppercase tracking-widest">
                            {row.po_number}
                          </p>
                          <span className="text-[8px] bg-bg4 px-1.5 py-0.5 rounded uppercase font-black">
                            Verified Batch
                          </span>
                        </td>
                        <td className="p-5">
                          <p className="font-black text-sm">{row.style_num}</p>
                          <p className="text-[10px] text-text3 uppercase font-black opacity-60 tracking-wider font-mono">
                            {row.color}
                          </p>
                        </td>
                        {pivotedHistory.sizes.map((s) => {
                          const sizeData = row.sizes[s];
                          if (!sizeData)
                            return (
                              <td key={s} className="p-5 text-center text-bg4">
                                —
                              </td>
                            );
                          return (
                            <td key={s} className="p-5">
                              <div className="flex flex-col items-center gap-1">
                                <span className="text-xs font-black text-pass leading-none">
                                  P {sizeData.passed}
                                </span>
                                <span className="text-[9px] font-black text-reject opacity-50">
                                  F {sizeData.rejected}
                                </span>
                              </div>
                            </td>
                          );
                        })}
                        <td className="p-5 text-center bg-bg4/10">
                          <div className="flex flex-col items-center">
                            <p className="text-sm font-black text-slate-900 dark:text-white leading-none">
                              {batchPass + batchFail}
                            </p>
                            <p className="text-[8px] font-mono text-text3 uppercase mt-1">
                              Total Inspected
                            </p>
                          </div>
                        </td>
                        <td className="p-5 font-mono text-text3 font-black text-[10px] uppercase opacity-70 tracking-widest">
                          {row.creator_name}
                        </td>
                      </tr>
                    );
                  })}
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
          currentDepartment="Finishing"
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
        currentDepartment="Finishing"
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
