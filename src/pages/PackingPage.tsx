import React, { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { useSystem } from "../context/SystemContext";
import {
  packingService,
  cuttingService,
  poService,
  finishingService,
  statusService,
  returnService,
} from "../services/erpService";
import { ProductionOrder, POProduct } from "../types";
import {
  Package,
  History,
  Check,
  Search,
  RotateCcw,
  Truck,
  Edit2,
  Trash2,
  FileSpreadsheet,
} from "lucide-react";
import { cn, fmtDate, compareSizes } from "../lib/utils";
import { HandoverList } from "../components/HandoverList";
import { ReturnModal } from "../components/ReturnModal";
import { DiscardModal } from "../components/DiscardModal";
import { ReturnsHandoverList } from "../components/ReturnsHandoverList";
import { TransferToStoreList } from "../components/TransferToStoreList";
import { ChangeRecordPOButton } from "../components/ChangeRecordPOButton";
import { ConfirmModal } from "../components/ConfirmModal";

export const PackingPage: React.FC = () => {
  const { isInitialStockMode } = useSystem();
  const [pos, setPos] = useState<ProductionOrder[]>([]);
  const [selectedPONum, setSelectedPONum] = useState("");
  const [products, setProducts] = useState<POProduct[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [incomingFinishing, setIncomingFinishing] = useState<any[]>([]);
  const [quantities, setQuantities] = useState<
    Record<
      number,
      {
        toBlister: number;
        toCarton: { count: number; size: number };
      }
    >
  >({});
  const [detailedStatus, setDetailedStatus] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  // Style and Color Mix Mode State
  const [entryMode, setEntryMode] = useState<"style_color" | "single_po">("style_color");
  const [mixStyle, setMixStyle] = useState("");
  const [mixColor, setMixColor] = useState("");
  const [checkedPOs, setCheckedPOs] = useState<Record<string, boolean>>({});
  const [allActiveProducts, setAllActiveProducts] = useState<any[]>([]);
  const [mixQuantities, setMixQuantities] = useState<Record<string, { toBlister: string; toCarton: { count: string; size: string } }>>({});

  // Return Modal State
  const [returnProduct, setReturnProduct] = useState<any>(null);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);

  // Discard Modal State
  const [discardProduct, setDiscardProduct] = useState<any>(null);
  const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false);
  const [discardDepartment, setDiscardDepartment] = useState<string>("Packing - Loose");

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
      await packingService.update(id, { quantity: qty });
      setEditingId(null);
      await fetchHistory();
      if (selectedPONum) handlePOChange(selectedPONum);
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Delete this packing entry?")) {
      try {
        await packingService.delete(id);
        await fetchHistory();
        if (selectedPONum) handlePOChange(selectedPONum);
      } catch (error: any) {
        alert(error.message);
      }
    }
  };

  const [activeTab, setActiveTab] = useState<"entry" | "reports" | "transfers">("entry");
  const [packingStage, setPackingStage] = useState<"to_blister" | "to_carton">(
    "to_blister",
  );
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
      // Only show POs that have some quantity passed finishing (ready for packing) OR if in initial mode show all active
      const packablePOs = statusData.filter(
        (po) => isInitialStockMode || (po.any_passed || 0) > 0,
      );

      const formatted = packablePOs.map((po) => ({
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
    const data = await packingService.list();
    setHistory(data);
  };

  const fetchIncoming = async () => {
    const data = await finishingService.list();
    setIncomingFinishing(data);
  };

  const getProductStats = (p: any) => {
    return {
      finished: p.total_accepted_finished || 0,
      looseAvail: p.total_loose_available || 0,
      blisterAvail: p.total_blister_available || 0,
      packedPcs: p.total_accepted_packed_qty || 0,
      packedCtns: p.total_accepted_cartons || 0,
    };
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
      .filter((p) => {
        const stats = getProductStats(p);
        if (packingStage === "to_blister") {
          return isInitialStockMode || stats.looseAvail > 0;
        } else {
          return isInitialStockMode || stats.blisterAvail > 0;
        }
      })
      .map((p) => p.style_num);
    return Array.from(new Set(styles)).sort();
  }, [allActiveProducts, isInitialStockMode, packingStage]);

  const availableMixColors = useMemo(() => {
    if (!mixStyle) return [];
    const colors = allActiveProducts
      .filter((p) => {
        const stats = getProductStats(p);
        if (packingStage === "to_blister") {
          return isInitialStockMode || stats.looseAvail > 0;
        } else {
          return isInitialStockMode || stats.blisterAvail > 0;
        }
      })
      .filter((p) => p.style_num === mixStyle)
      .map((p) => p.color);
    return Array.from(new Set(colors)).sort();
  }, [allActiveProducts, isInitialStockMode, mixStyle, packingStage]);

  const matchingPOs = useMemo(() => {
    if (!mixStyle || !mixColor) return [];
    const poNums = allActiveProducts
      .filter((p) => p.style_num === mixStyle && p.color === mixColor)
      .filter((p) => {
        const stats = getProductStats(p);
        if (packingStage === "to_blister") {
          return isInitialStockMode || stats.looseAvail > 0;
        } else {
          return isInitialStockMode || stats.blisterAvail > 0;
        }
      })
      .map((p) => p.po_number);
    const uniquePOs = Array.from(new Set(poNums));
    return pos.filter((po) => uniquePOs.includes(po.po_number));
  }, [allActiveProducts, isInitialStockMode, mixStyle, mixColor, pos, packingStage]);

  useEffect(() => {
    const initialChecked: Record<string, boolean> = {};
    matchingPOs.forEach((po) => {
      initialChecked[po.po_number] = true;
    });
    setCheckedPOs(initialChecked);
    setMixQuantities({});
  }, [matchingPOs, packingStage]);

  const mixProducts = useMemo(() => {
    if (!mixStyle || !mixColor) return [];
    return allActiveProducts.filter(
      (p) =>
        p.style_num === mixStyle &&
        p.color === mixColor &&
        checkedPOs[p.po_number] &&
        (isInitialStockMode || (packingStage === "to_blister" ? getProductStats(p).looseAvail > 0 : getProductStats(p).blisterAvail > 0))
    );
  }, [allActiveProducts, mixStyle, mixColor, checkedPOs, isInitialStockMode, packingStage]);

  const mixUniqueSizes = useMemo(() => {
    const sizes = mixProducts.map((p) => p.size);
    return Array.from(new Set(sizes)).sort(compareSizes);
  }, [mixProducts]);

  const handleMixSubmit = async () => {
    const recordsToSubmit: any[] = [];

    try {
      if (packingStage === "to_blister") {
        mixUniqueSizes.forEach((size) => {
          const sizeQtyStr = mixQuantities[size]?.toBlister || "0";
          const enteredQty = parseInt(sizeQtyStr);
          if (enteredQty <= 0) return;

          if (enteredQty % 12 !== 0) {
            throw new Error(`Quantity for size ${size} must be a multiple of 12 for blister packing (Got ${enteredQty}).`);
          }

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

          let remaining = enteredQty;
          sortedProds.forEach((p, idx) => {
            const stats = getProductStats(p);
            const loose = stats.looseAvail || 0;

            const isLastProd = idx === sortedProds.length - 1;
            let allocated = isLastProd ? remaining : Math.min(remaining, loose);

            if (!isLastProd && allocated % 12 !== 0) {
              allocated = Math.floor(allocated / 12) * 12;
            }

            if (allocated > 0) {
              recordsToSubmit.push({
                po_number: p.po_number,
                product_id: p.id,
                quantity: allocated,
                packing_type: "blister",
              });
              remaining -= allocated;
            }
          });
        });
      } else {
        mixUniqueSizes.forEach((size) => {
          const qtyObj = mixQuantities[size]?.toCarton || { count: "0", size: "12" };
          const cartonCount = parseInt(qtyObj.count || "0");
          const pcsPerCarton = parseInt(qtyObj.size || "12");
          const enteredQty = cartonCount * pcsPerCarton;

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

          let remaining = enteredQty;
          sortedProds.forEach((p, idx) => {
            const stats = getProductStats(p);
            const blister = stats.blisterAvail || 0;

            const isLastProd = idx === sortedProds.length - 1;
            let allocated = isLastProd ? remaining : Math.min(remaining, blister);

            if (!isLastProd && allocated % pcsPerCarton !== 0) {
              allocated = Math.floor(allocated / pcsPerCarton) * pcsPerCarton;
            }

            if (allocated > 0) {
              const ctns = Math.ceil(allocated / pcsPerCarton);
              recordsToSubmit.push({
                po_number: p.po_number,
                product_id: p.id,
                quantity: allocated,
                packing_type: "carton",
                cartons: ctns,
                pcs_per_carton: pcsPerCarton,
              });
              remaining -= allocated;
            }
          });
        });
      }

      if (recordsToSubmit.length === 0) {
        alert("No quantities entered.");
        return;
      }

      const totalPcs = recordsToSubmit.reduce((s, r) => s + r.quantity, 0);

      setConfirmModalConfig({
        isOpen: true,
        title: "Confirm Style/Color Mix Packing Output",
        type: "success",
        confirmText: "Submit Packing Output",
        message: (
          <div className="space-y-2">
            <p>Are you sure you want to record mixed packing logs for Style <strong className="text-text font-bold">{mixStyle}</strong> and Color <strong className="text-text font-bold">{mixColor}</strong>?</p>
            <div className="p-3 bg-bg3/60 rounded-xl border border-bg4 space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-text3">Records Count:</span> <span className="font-bold text-text">{recordsToSubmit.length}</span></div>
              <div className="flex justify-between"><span className="text-text3">Total Output Quantity:</span> <span className="font-bold text-emerald-400">{totalPcs} pcs</span></div>
            </div>
          </div>
        ),
        onConfirm: async () => {
          setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
          try {
            setIsLoading(true);
            await Promise.all(recordsToSubmit.map((r) => packingService.create(r)));
            alert("Packing logs successfully recorded!");
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
    } catch (error: any) {
      alert(error.message);
    }
  };

  const fetchDetailedReport = async () => {
    try {
      const data = await statusService.getDetailedStatus(
        undefined,
        dateRange.start,
        dateRange.end,
      );
      setDetailedStatus(data);
    } catch (error) {
      console.error("Failed to fetch detailed report items", error);
    }
  };

  useEffect(() => {
    if (showReport) {
      fetchDetailedReport();
    }
  }, [dateRange, showReport]);

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

      const initialQtys: Record<
        number,
        {
          toBlister: number;
          toCarton: { count: number; size: number };
        }
      > = {};
      sortedProducts.forEach(
        (p: any) =>
          (initialQtys[p.id] = {
            toBlister: 0,
            toCarton: { count: 0, size: 12 },
          }),
      );
      setQuantities(initialQtys);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitBlister = async () => {
    try {
      const payloads = Object.entries(quantities)
        .filter(([_, q]) => (q as any).toBlister > 0)
        .map(([id, q]) => {
          const productId = parseInt(id);
          const product = products.find((p) => p.id === productId);
          const stats = getProductStats(product);
          const qty = (q as any).toBlister;

          if (!isInitialStockMode && qty > stats.looseAvail) {
            throw new Error(
              `Insufficient loose pieces for ${product?.style_num}. Available: ${stats.looseAvail}, Requested: ${qty}`,
            );
          }

          if (qty % 12 !== 0) {
            throw new Error(
              `Product ${product?.style_num} quantity must be a multiple of 12 for blister packing.`,
            );
          }
          return {
            po_number: selectedPONum,
            product_id: productId,
            quantity: qty,
            packing_type: "blister" as const,
            cartons: 0,
          };
        });

      if (payloads.length === 0) return;

      const totalQty = payloads.reduce((sum, item) => sum + item.quantity, 0);

      setConfirmModalConfig({
        isOpen: true,
        title: "Confirm Blister Packing",
        type: "info",
        confirmText: "Confirm Blister",
        message: (
          <div className="space-y-2">
            <p>Are you sure you want to move loose pieces to Blister packing for PO <strong className="text-text font-bold">{selectedPONum}</strong>?</p>
            <div className="p-3 bg-bg3/60 rounded-xl border border-bg4 space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-text3">Items count:</span> <span className="font-bold text-text">{payloads.length}</span></div>
              <div className="flex justify-between"><span className="text-text3">Total Pieces:</span> <span className="font-bold text-indigo-400">{totalQty} pcs</span></div>
              <div className="flex justify-between"><span className="text-text3">Total Blisters (dozens):</span> <span className="font-bold text-text">{totalQty / 12} Bls</span></div>
            </div>
          </div>
        ),
        onConfirm: async () => {
          setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
          try {
            setIsLoading(true);
            await Promise.all(payloads.map((p) => packingService.create(p)));
            handlePOChange(selectedPONum);
            fetchHistory();
            alert("SUCCESS: Loose pieces moved to Blister packing.");
          } catch (error: any) {
            alert(error.response?.data?.error || error.message);
          } finally {
            setIsLoading(false);
          }
        },
      });
    } catch (error: any) {
      alert(error.response?.data?.error || error.message);
    }
  };

  const handleSubmitCarton = async () => {
    try {
      const payloads = Object.entries(quantities)
        .filter(([_, q]) => (q as any).toCarton?.count > 0)
        .map(([id, q]) => {
          const productId = parseInt(id);
          const product = products.find((p) => p.id === productId);
          const stats = getProductStats(product);
          const qty = ((q as any).toCarton?.count || 0) * ((q as any).toCarton?.size || 12);

          if (!isInitialStockMode && qty > stats.blisterAvail) {
            throw new Error(
              `Insufficient blisters for ${product?.style_num}. Available: ${stats.blisterAvail} pcs (${Math.floor(stats.blisterAvail / 12)} Bls), Requested: ${qty} pcs`,
            );
          }

          return {
            po_number: selectedPONum,
            product_id: productId,
            quantity: qty,
            packing_type: "carton" as const,
            cartons: (q as any).toCarton?.count || 0,
            pcs_per_carton: (q as any).toCarton?.size || 12,
          };
        });

      if (payloads.length === 0) return;

      const totalCartons = payloads.reduce((sum, item) => sum + item.cartons, 0);
      const totalQty = payloads.reduce((sum, item) => sum + item.quantity, 0);

      setConfirmModalConfig({
        isOpen: true,
        title: "Confirm Carton Packing",
        type: "success",
        confirmText: "Confirm Carton",
        message: (
          <div className="space-y-2">
            <p>Are you sure you want to pack blisters into cartons for PO <strong className="text-text font-bold">{selectedPONum}</strong>?</p>
            <div className="p-3 bg-bg3/60 rounded-xl border border-bg4 space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-text3">Cartons count:</span> <span className="font-bold text-emerald-400">{totalCartons} Cartons</span></div>
              <div className="flex justify-between"><span className="text-text3">Total Quantity:</span> <span className="font-bold text-text">{totalQty} pcs</span></div>
            </div>
          </div>
        ),
        onConfirm: async () => {
          setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
          try {
            setIsLoading(true);
            await Promise.all(payloads.map((p) => packingService.create(p)));
            handlePOChange(selectedPONum);
            fetchHistory();
            alert("SUCCESS: Blisters moved into Cartons.");
          } catch (error: any) {
            alert(error.response?.data?.error || error.message);
          } finally {
            setIsLoading(false);
          }
        },
      });
    } catch (error: any) {
      alert(error.response?.data?.error || error.message);
    }
  };

  const handleBulkReturn = async () => {
    const payload: any[] = [];
    Object.entries(quantities).forEach(([productId, q]) => {
      let qty = 0;
      if (packingStage === "to_blister") {
        qty = (q as any).toBlister || 0;
      } else {
        qty = ((q as any).toCarton?.count || 0) * ((q as any).toCarton?.size || 12);
        if (qty <= 0) qty = (q as any).toBlister || 0;
      }
      if (qty > 0) {
        const p = products.find((prod) => prod.id === parseInt(productId));
        payload.push({
          po_number: p?.po_number || selectedPONum,
          product_id: parseInt(productId),
          from_department: "Packing" as const,
          to_department: "Finishing" as const,
          quantity: qty,
          reason: "Bulk Return to Finishing",
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
          <p>Are you sure you want to return items back to <strong className="text-text font-bold">Finishing</strong>?</p>
          <div className="p-3 bg-bg3/60 rounded-xl border border-bg4 space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-text3">PO Number:</span> <span className="font-bold text-text">{selectedPONum}</span></div>
            <div className="flex justify-between"><span className="text-text3">Items count:</span> <span className="font-bold text-text">{payload.length}</span></div>
            <div className="flex justify-between"><span className="text-text3">Total Return Quantity:</span> <span className="font-bold text-rose-400">{totalQty} pcs</span></div>
            <div className="flex justify-between"><span className="text-text3">Destination:</span> <span className="font-bold text-text">Finishing</span></div>
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
      const stats = getProductStats(p);
      const available = packingStage === "to_blister" ? stats.looseAvail : stats.blisterAvail;
      return available < 0;
    });

    if (deficits.length === 0) {
      alert(`No deficit items found for the current PO in ${packingStage === "to_blister" ? "Loose to Blister" : "Blister to Carton"} stage.`);
      return;
    }

    const groups: Record<string, { po_number: string; style_num: string; color: string; sizes: Record<string, number> }> = {};

    deficits.forEach(p => {
      const poNum = p.po_number || selectedPONum || "PO-N/A";
      const key = `${poNum}-${p.style_num}-${p.color}`;
      if (!groups[key]) {
        groups[key] = {
          po_number: poNum,
          style_num: p.style_num,
          color: p.color,
          sizes: { 'XS': 0, 'S': 0, 'M': 0, 'L': 0, 'XL': 0, '2XL': 0, '3XL': 0, '4XL': 0 }
        };
      }
      const sz = String(p.size).trim().toUpperCase();
      const stats = getProductStats(p);
      const deficitQty = Math.abs(packingStage === "to_blister" ? stats.looseAvail : stats.blisterAvail);
      if (groups[key].sizes.hasOwnProperty(sz)) {
        groups[key].sizes[sz] = deficitQty;
      }
    });

    const exportRows = Object.values(groups).map(g => {
      const row: any = {
        'PO #': g.po_number,
        'STYLE #': g.style_num,
        'COLOR': g.color
      };
      let rowTotal = 0;
      Object.entries(g.sizes).forEach(([sizeName, qty]) => {
        row[sizeName] = qty;
        rowTotal += qty;
      });
      row['Total'] = rowTotal;
      return row;
    });

    const headers = ['PO #', 'STYLE #', 'COLOR', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'Total'];
    const worksheet = XLSX.utils.json_to_sheet(exportRows, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Deficits-${packingStage}`);
    XLSX.writeFile(workbook, `Deficits_Packing_${packingStage}_${selectedPONum || 'ALL'}.xlsx`);
  };

  const handleAutoFill = () => {
    const isMoreThan2XL = (sizeStr: string): boolean => {
      const s = sizeStr.toUpperCase().trim();
      if (["3XL", "4XL", "5XL", "6XL", "7XL", "8XL"].includes(s)) return true;
      const xlMatch = s.match(/^(\d+)\s*XL$/);
      if (xlMatch) {
        const num = parseInt(xlMatch[1], 10);
        return num > 2;
      }
      if (s.endsWith("L")) {
        const xCount = (s.match(/X/g) || []).length;
        if (xCount > 2) return true;
      }
      return false;
    };

    const newQuantities = { ...quantities };
    filteredProducts.forEach((p) => {
      const stats = getProductStats(p);
      if (packingStage === "to_blister") {
        const possibleBls = Math.floor((stats.looseAvail || 0) / 12);
        newQuantities[p.id] = {
          ...newQuantities[p.id],
          toBlister: possibleBls * 12,
        };
      } else {
        const size = isMoreThan2XL(p.size) ? 12 : 24;
        const possibleCtns = Math.floor((stats.blisterAvail || 0) / size);
        newQuantities[p.id] = {
          ...newQuantities[p.id],
          toCarton: {
            count: possibleCtns,
            size: size,
          },
        };
      }
    });
    setQuantities(newQuantities);
  };

  const filteredProducts = useMemo(
    () =>
      products.filter((p) => {
        const hasInventory =
          isInitialStockMode ||
          (packingStage === "to_blister"
            ? (p.total_loose_available || 0) > 0
            : (p.total_blister_available || 0) > 0);
        const isCompleted =
          (p.total_accepted_packed_qty || 0) >=
          (p.total_accepted_finished || 0);
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
      packingStage,
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
        groups[key].sizes[sizeKey] = { qty: 0, cartons: 0 };
      }
      groups[key].sizes[sizeKey].qty += rec.quantity;
      groups[key].sizes[sizeKey].cartons += rec.cartons || 0;
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

  const filteredDetailedReport = useMemo(() => {
    if (!showReport) return [];
    return detailedStatus.filter((s) => {
      // Must have some entry inputted / actioned in packing (either blistered, cartons, or rejected in packing)
      const hasPackingInput =
        (s.total_blistered || 0) > 0 ||
        (s.total_packed || 0) > 0 ||
        (s.pack_rejected || 0) > 0;
      if (!hasPackingInput) return false;

      if (!reportSearch) return true;
      const search = reportSearch.toLowerCase();
      return (
        s.style_num.toLowerCase().includes(search) ||
        s.color.toLowerCase().includes(search) ||
        s.po_number.toLowerCase().includes(search)
      );
    });
  }, [detailedStatus, reportSearch, showReport]);

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
          qty: 0,
          cartons: 0,
          blisters: 0,
        };
      }
      stats[key].qty += h.quantity;
      if (h.packing_type === "carton") {
        stats[key].cartons += h.cartons || 0;
      } else if (h.packing_type === "blister") {
        stats[key].blisters += h.quantity / 12;
      }
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
          <div className="p-3 bg-pack/10 text-pack rounded-2xl shrink-0">
            <Package className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight uppercase">
              Packing Dept
            </h1>
            <p className="text-text3 text-[10px] font-mono uppercase tracking-[0.3em] font-medium mt-1 leading-tight">
              Export Packing & Packaging Unit
            </p>
          </div>
        </div>

        <div className="flex bg-bg2 p-1 rounded-xl border border-bg4 shadow-sm self-start lg:self-auto overflow-x-auto max-w-full">
          <button
            onClick={() => setActiveTab("entry")}
            className={cn(
              "px-4 sm:px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
              activeTab === "entry"
                ? "bg-pack text-white shadow-lg shadow-pack/20"
                : "text-text3 hover:text-text",
            )}
          >
            Packing Form
          </button>
          <button
            onClick={() => setActiveTab("reports")}
            className={cn(
              "px-4 sm:px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
              activeTab === "reports"
                ? "bg-pack text-white shadow-lg shadow-pack/20"
                : "text-text3 hover:text-text",
            )}
          >
            Packing Analytics
          </button>
          <button
            onClick={() => setActiveTab("transfers")}
            className={cn(
              "px-4 sm:px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap relative",
              activeTab === "transfers"
                ? "bg-pack text-white shadow-lg shadow-pack/20"
                : "text-text3 hover:text-text",
            )}
          >
            Store Handover
            {history.filter(
              (r) =>
                r.status === "accepted" &&
                r.store_status === "pending" &&
                r.packing_type === "carton",
            ).length > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-reject rounded-full border border-bg2 animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {activeTab === "transfers" && (
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-bg2 border border-pack rounded-3xl p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-pack" />
            <div className="flex items-center gap-4 mb-8">
              <div className="p-4 bg-pack/10 text-pack rounded-2xl relative">
                <Truck className="w-8 h-8" />
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-pack text-white text-[8px] font-black flex items-center justify-center rounded-full">
                  {
                    history.filter(
                      (r) =>
                        r.status === "accepted" &&
                        r.store_status === "pending" &&
                        r.packing_type === "carton",
                    ).length
                  }
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tight">
                  Shift to Store Form
                </h2>
                <p className="text-[10px] font-mono text-text3 uppercase tracking-[0.2em]">
                  Select verified boxes to move to Finished Goods Store
                </p>
              </div>
            </div>

            <TransferToStoreList
              records={history}
              onRefresh={() => {
                fetchHistory();
                fetchPOs();
              }}
            />
          </div>
        </div>
      )}

      {activeTab === "entry" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Entry Mode Switcher */}
            <div className="bg-bg2 border border-bg4 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight text-slate-800 dark:text-white">
                  Entry Mode
                </h3>
                <p className="text-[10px] font-mono text-text3 uppercase mt-1">
                  Choose how you want to record packing output
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
                      ? "bg-pack text-white shadow-md shadow-pack/20"
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
                      ? "bg-pack text-white shadow-md shadow-pack/20"
                      : "text-text3 hover:text-text"
                  )}
                >
                  🗃️ Single PO
                </button>
              </div>
            </div>

            {/* Packing Stage Switcher for style-color mode */}
            {entryMode === "style_color" && (
              <div className="bg-bg2 border border-bg4 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black uppercase text-slate-800 dark:text-white">
                    Packing Workflow Stage
                  </h4>
                </div>
                <div className="flex bg-bg3 p-1 rounded-xl border border-bg4 gap-1">
                  <button
                    onClick={() => {
                      setPackingStage("to_blister");
                      setMixQuantities({});
                    }}
                    className={cn(
                      "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all",
                      packingStage === "to_blister"
                        ? "bg-pass text-white shadow-lg shadow-pass/20"
                        : "text-text3 hover:text-text"
                    )}
                  >
                    Loose to Blister
                  </button>
                  <button
                    onClick={() => {
                      setPackingStage("to_carton");
                      setMixQuantities({});
                    }}
                    className={cn(
                      "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all",
                      packingStage === "to_carton"
                        ? "bg-pack text-white shadow-lg shadow-pack/20"
                        : "text-text3 hover:text-text"
                    )}
                  >
                    Blister to Carton
                  </button>
                </div>
              </div>
            )}

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
                    <button
                      onClick={handleMixSubmit}
                      disabled={
                        !mixStyle ||
                        !mixColor ||
                        (Object.values(mixQuantities) as any[]).every((q) => {
                          if (packingStage === "to_blister") {
                            return parseInt(q.toBlister || "0") <= 0;
                          } else {
                            return parseInt(q.toCarton?.count || "0") <= 0;
                          }
                        })
                      }
                      className="bg-pack text-white font-black px-12 py-4 rounded-xl shadow-xl shadow-pack/30 disabled:opacity-50 hover:bg-sky-600 transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs animate-none"
                    >
                      <Check className="w-5 h-5" /> Confirm Bulk Packing
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
                                ? "bg-bg3 border-pack text-pack shadow-sm"
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
                              className="w-4 h-4 rounded accent-pack bg-bg2 border-bg4 cursor-pointer"
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
                        Aggregate Packing Components Availability
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
                            {packingStage === "to_blister" ? (
                              <>
                                <th className="p-4 text-xs font-mono uppercase font-black text-center">Aggregate Loose Pieces Available</th>
                                <th className="p-4 text-xs font-mono uppercase font-black text-center w-64">Pack to Blister (Pcs - Multiple of 12)</th>
                              </>
                            ) : (
                              <>
                                <th className="p-4 text-xs font-mono uppercase font-black text-center">Aggregate Blisters Available (Pcs)</th>
                                <th className="p-4 text-xs font-mono uppercase font-black text-center w-48">Carton Count</th>
                                <th className="p-4 text-xs font-mono uppercase font-black text-center w-48">Pcs / Carton</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-bg4">
                          {mixUniqueSizes.map((size) => {
                            const matchingSizeProds = mixProducts.filter((p) => p.size === size);
                            const totalLooseAvail = matchingSizeProds.reduce((sum, p) => sum + (getProductStats(p).looseAvail || 0), 0);
                            const totalBlisterAvail = matchingSizeProds.reduce((sum, p) => sum + (getProductStats(p).blisterAvail || 0), 0);

                            const isMoreThan2XL = (sizeStr: string): boolean => {
                              const s = sizeStr.toUpperCase().trim();
                              if (["3XL", "4XL", "5XL", "6XL", "7XL", "8XL"].includes(s)) return true;
                              const xlMatch = s.match(/^(\d+)\s*XL$/);
                              if (xlMatch) {
                                const num = parseInt(xlMatch[1]);
                                if (num >= 3) return true;
                              }
                              return false;
                            };

                            const defaultCtnSize = isMoreThan2XL(size) ? "12" : "24";

                            return (
                              <tr key={size} className="hover:bg-bg3/20 transition-colors">
                                <td className="p-4 text-center">
                                  <span className="font-black font-mono text-sm uppercase bg-pack/10 text-pack px-2.5 py-1 rounded">
                                    {size}
                                  </span>
                                </td>
                                {packingStage === "to_blister" ? (
                                  <>
                                    <td className="p-4 text-center font-mono text-sm">{totalLooseAvail} Pcs</td>
                                    <td className="p-4">
                                      <input
                                        type="number"
                                        min="0"
                                        step="12"
                                        value={mixQuantities[size]?.toBlister || ""}
                                        onChange={(e) =>
                                          setMixQuantities({
                                            ...mixQuantities,
                                            [size]: {
                                              toBlister: e.target.value,
                                              toCarton: mixQuantities[size]?.toCarton || { count: "0", size: defaultCtnSize },
                                            },
                                          })
                                        }
                                        className="w-full bg-bg3 border border-bg4 rounded-xl p-2 text-sm font-black text-center focus:ring-1 focus:ring-pass outline-none transition-all text-pass"
                                        placeholder="0"
                                      />
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td className="p-4 text-center font-mono text-xs">{totalBlisterAvail} Pcs ({Math.floor(totalBlisterAvail / 12)} Bls)</td>
                                    <td className="p-4">
                                      <input
                                        type="number"
                                        min="0"
                                        value={mixQuantities[size]?.toCarton?.count || ""}
                                        onChange={(e) =>
                                          setMixQuantities({
                                            ...mixQuantities,
                                            [size]: {
                                              toBlister: mixQuantities[size]?.toBlister || "0",
                                              toCarton: {
                                                count: e.target.value,
                                                size: mixQuantities[size]?.toCarton?.size || defaultCtnSize,
                                              },
                                            },
                                          })
                                        }
                                        className="w-full bg-bg3 border border-bg4 rounded-xl p-2 text-sm font-black text-center focus:ring-1 focus:ring-pack outline-none transition-all text-pack"
                                        placeholder="0"
                                      />
                                    </td>
                                    <td className="p-4">
                                      <input
                                        type="number"
                                        min="1"
                                        value={mixQuantities[size]?.toCarton?.size || defaultCtnSize}
                                        onChange={(e) =>
                                          setMixQuantities({
                                            ...mixQuantities,
                                            [size]: {
                                              toBlister: mixQuantities[size]?.toBlister || "0",
                                              toCarton: {
                                                count: mixQuantities[size]?.toCarton?.count || "0",
                                                size: e.target.value,
                                              },
                                            },
                                          })
                                        }
                                        className="w-full bg-bg3 border border-bg4 rounded-xl p-2 text-sm font-black text-center focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                                        placeholder={defaultCtnSize}
                                      />
                                    </td>
                                  </>
                                )}
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

                {selectedPONum && (
                  <div className="shrink-0 flex items-center bg-bg3 p-1 rounded-xl border border-bg4 gap-1">
                    <button
                      onClick={() => setPackingStage("to_blister")}
                      className={cn(
                        "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all",
                        packingStage === "to_blister"
                          ? "bg-pass text-white shadow-lg shadow-pass/20"
                          : "text-text3 hover:text-text"
                      )}
                    >
                      Loose to Blister
                    </button>
                    <button
                      onClick={() => setPackingStage("to_carton")}
                      className={cn(
                        "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all",
                        packingStage === "to_carton"
                          ? "bg-pack text-white shadow-lg shadow-pack/20"
                          : "text-text3 hover:text-text"
                      )}
                    >
                      Blister to Carton
                    </button>
                  </div>
                )}
              </div>
            )}

            {selectedPONum && (
              <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl border-t-4 border-t-pack">
                <div className="p-4 bg-bg3/30 border-b border-bg4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <h3 className="text-sm font-black uppercase tracking-tight">
                      {packingStage === "to_blister"
                        ? "1. Loose to Blister Form"
                        : "2. Blister to Carton Form"}
                    </h3>
                    <div className="h-4 w-px bg-bg4 hidden md:block" />
                    <p className="text-[10px] font-mono text-text3 uppercase font-bold tracking-widest">
                      {filteredProducts.length} Items Found
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleAutoFill}
                      className="text-[10px] font-black uppercase px-4 py-2 rounded-lg transition-all border shadow-sm bg-indigo-600 hover:bg-indigo-700 border-indigo-600 text-white flex items-center gap-1 shrink-0 font-medium cursor-pointer"
                    >
                      ⚡ Auto Fill
                    </button>

                    <button
                      onClick={() => setShowCompleted(!showCompleted)}
                      className={cn(
                        "text-[10px] font-black uppercase px-4 py-2 rounded-lg transition-colors border shadow-sm",
                        showCompleted
                          ? "bg-bg4 border-bg4 text-text hover:bg-bg3"
                          : "bg-pack/10 border-pack/30 text-pack hover:bg-pack/20",
                      )}
                    >
                      {showCompleted ? "Hide Completed" : "Show All"}
                    </button>

                    <button
                      onClick={handleExportDeficits}
                      className="bg-bg text-[10px] font-black text-rose-500 hover:text-white hover:bg-rose-500 uppercase px-4 py-2 rounded-lg transition-all border border-rose-500/30 shadow-sm flex items-center gap-1.5 cursor-pointer"
                      title="Export negative available items as Excel to import in Old Stock"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Export Deficits
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
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-bg3/50 border-b border-bg4 text-text">
                        <th className="p-4 text-xs font-mono uppercase font-black">
                          Style No
                        </th>
                        <th className="p-4 text-xs font-mono uppercase font-black">
                          Color
                        </th>
                        <th className="p-4 text-xs font-mono uppercase font-black text-center">
                          Size
                        </th>
                        <th className="p-4 text-xs font-mono uppercase font-black text-center">
                          Required Qty
                        </th>
                        <th className="p-4 text-xs font-mono uppercase font-black text-center border-x border-bg4">
                          Available
                        </th>
                        <th className="p-4 text-xs font-mono uppercase font-black text-center">
                          {packingStage === "to_blister"
                            ? "Pack to Blister"
                            : "Pack to Carton"}
                        </th>
                        <th className="p-4 text-xs font-mono uppercase font-black w-10 text-center">
                          Return
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-bg4">
                      {filteredProducts.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-16 text-center">
                            <Package className="w-12 h-12 text-text3/20 mx-auto mb-4" />
                            <p className="text-text3 text-xs font-mono uppercase tracking-[0.2em] font-medium">
                              No pending packing found
                            </p>
                          </td>
                        </tr>
                      ) : (
                        filteredProducts.map((p) => {
                          const stats = getProductStats(p);
                          if (
                            !showCompleted &&
                            !isInitialStockMode &&
                            packingStage === "to_blister" &&
                            stats.looseAvail <= 0
                          )
                            return null;
                          if (
                            !showCompleted &&
                            !isInitialStockMode &&
                            packingStage === "to_carton" &&
                            stats.blisterAvail <= 0
                          )
                            return null;

                          return (
                            <tr
                              key={p.id}
                              className="hover:bg-bg3/10 transition-colors border-b border-bg4/50"
                            >
                              <td className="p-4">
                                <p className="font-black text-sm tracking-tight">
                                  {p.style_num}
                                </p>
                              </td>
                              <td className="p-4 font-bold text-xs text-text2 uppercase tracking-tight">
                                {p.color}
                              </td>
                              <td className="p-4 text-center font-mono font-black text-xs text-text2 outline-none">
                                {p.size}
                              </td>
                              <td className="p-4 text-center font-mono text-sm">
                                {p.qty || 0}
                              </td>

                              <td className="p-4 border-x border-bg4 bg-bg3/5">
                                {packingStage === "to_blister" ? (
                                  <div className="bg-bg3 rounded p-1.5 text-center border border-bg4/50 max-w-[110px] mx-auto">
                                    <div className="text-text3 uppercase font-black text-[9px] mb-1">
                                      Max Blisters
                                    </div>
                                    <div
                                      className={cn(
                                        "text-sm font-black text-pass",
                                      )}
                                    >
                                      {Math.floor((stats.looseAvail || 0) / 12)}{" "}
                                      <span className="text-[10px]">BLS</span>
                                    </div>
                                    <div className="text-[8px] font-bold text-text3">
                                      ({stats.looseAvail || 0} Pcs Avail)
                                    </div>
                                  </div>
                                ) : (
                                  <div className="bg-bg3 rounded p-1.5 text-center border border-bg4/50 max-w-[110px] mx-auto">
                                    <div className="text-text3 uppercase font-black text-[9px] mb-1">
                                      Blister Avail
                                    </div>
                                    <div
                                      className={cn(
                                        "text-sm font-black text-pack",
                                      )}
                                    >
                                      {Math.floor(
                                        (stats.blisterAvail || 0) / 12,
                                      )}{" "}
                                      <span className="text-[10px]">BLS</span>
                                    </div>
                                    <div className="text-[8px] font-bold text-text3">
                                      ({stats.blisterAvail || 0} Pcs)
                                    </div>
                                  </div>
                                )}
                              </td>

                              <td className="p-4">
                                {packingStage === "to_blister" ? (
                                  <div className="flex flex-col gap-1 w-32 mx-auto">
                                    <div className="relative">
                                      <input
                                        type="number"
                                        min="1"
                                        placeholder="0"
                                        value={
                                          Math.floor(
                                            (quantities[p.id]?.toBlister || 0) /
                                              12,
                                          ) || ""
                                        }
                                        onChange={(e) => {
                                          const bls =
                                            parseInt(e.target.value) || 0;
                                          setQuantities({
                                            ...quantities,
                                            [p.id]: {
                                              ...quantities[p.id],
                                              toBlister: bls * 12,
                                            },
                                          });
                                        }}
                                        className={cn(
                                          "w-full bg-bg3 border border-bg4 rounded-xl p-2 text-xs font-black text-center focus:ring-1 outline-none transition-all",
                                          (quantities[p.id]?.toBlister || 0) >
                                            stats.looseAvail
                                            ? "border-reject text-reject shadow-[0_0_10px_rgba(239,68,68,0.2)]"
                                            : "focus:border-pass focus:ring-pass/20",
                                        )}
                                      />
                                      <span className="absolute -top-1.5 left-2 bg-bg2 px-1 text-[7px] font-black text-pass uppercase tracking-widest border border-bg4 rounded shadow-sm">
                                        No of Blisters
                                      </span>
                                    </div>
                                    <div className="text-[9px] text-center font-mono text-text3 font-medium">
                                      Total: {quantities[p.id]?.toBlister || 0}{" "}
                                      Pcs
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-2 w-48 mx-auto">
                                    <div className="flex gap-1.5">
                                      <div className="relative flex-1">
                                        <select
                                          value={
                                            quantities[p.id]?.toCarton?.size ||
                                            12
                                          }
                                          onChange={(e) => {
                                            const sz =
                                              parseInt(e.target.value) || 12;
                                            setQuantities({
                                              ...quantities,
                                              [p.id]: {
                                                ...quantities[p.id],
                                                toCarton: {
                                                  ...(quantities[p.id]?.toCarton || { count: 0, size: 12 }),
                                                  size: sz,
                                                },
                                              },
                                            });
                                          }}
                                          className="w-full bg-bg3 border border-bg4 rounded-xl p-2 text-[10px] font-black outline-none focus:ring-1 focus:ring-pack/20 transition-all h-[34px] appearance-none text-center"
                                        >
                                          {[
                                            12, 24, 36, 48, 60, 72, 84, 96, 120,
                                          ].map((v) => (
                                            <option key={v} value={v}>
                                              {v} Pcs ({v / 12} Bls) / Ctn
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="relative flex-1">
                                        <input
                                          type="number"
                                          min="0"
                                          placeholder="Ctns"
                                          value={
                                            quantities[p.id]?.toCarton?.count === undefined
                                              ? ""
                                              : quantities[p.id]?.toCarton?.count === 0
                                                ? ""
                                                : quantities[p.id]?.toCarton?.count
                                          }
                                          onChange={(e) => {
                                            const ctns =
                                              parseInt(e.target.value) || 0;
                                            setQuantities({
                                              ...quantities,
                                              [p.id]: {
                                                ...quantities[p.id],
                                                toCarton: {
                                                  ...(quantities[p.id]?.toCarton || { count: 0, size: 12 }),
                                                  count: ctns,
                                                },
                                              },
                                            });
                                          }}
                                          className={cn(
                                            "w-full bg-bg3 border border-bg4 rounded-xl p-2 text-xs font-black text-center focus:ring-1 outline-none transition-all",
                                            ((quantities[p.id]?.toCarton?.count || 0) *
                                              (quantities[p.id]?.toCarton?.size || 12) ||
                                              0) > stats.blisterAvail
                                              ? "border-reject text-reject shadow-[0_0_10px_rgba(239,68,68,0.2)]"
                                              : "focus:border-pack focus:ring-pack/20",
                                          )}
                                        />
                                        <span className="absolute -top-1.5 left-2 bg-bg2 px-1 text-[7px] font-black text-pack uppercase tracking-widest border border-bg4 rounded shadow-sm">
                                          No of Ctns
                                        </span>
                                      </div>
                                    </div>
                                    <div className="text-[9px] text-center font-mono text-text3 font-medium">
                                      Req:{" "}
                                      {(quantities[p.id]?.toCarton?.count || 0) *
                                        (quantities[p.id]?.toCarton?.size || 12)}{" "}
                                      Pcs (
                                      {Math.floor(
                                        ((quantities[p.id]?.toCarton?.count || 0) *
                                          (quantities[p.id]?.toCarton?.size || 12)) /
                                          12,
                                      )}{" "}
                                      Bls)
                                    </div>
                                  </div>
                                )}
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
                                        available_qty: Math.max(
                                          0,
                                          packingStage === "to_blister"
                                            ? (p as any).total_loose_available || 0
                                            : (p as any).total_blister_available || (p as any).total_loose_available || 0
                                        ),
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
                                      const isLoose = packingStage === "to_blister";
                                      const avail = isLoose ? (stats.looseAvail || 0) : (stats.blisterAvail || 0);
                                      setDiscardDepartment(isLoose ? "Packing - Loose" : "Packing - Blister");
                                      setDiscardProduct({
                                        po_number: p.po_number,
                                        product_id: p.id,
                                        style_num: p.style_num,
                                        color: p.color,
                                        size: p.size,
                                        available_qty: avail,
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

                <div className="p-6 bg-bg3/30 border-t border-bg4 flex items-center justify-between">
                  <span className="text-xs font-bold text-text3 uppercase">Batch Actions</span>
                  <div className="flex items-center gap-3">
                    {packingStage === "to_blister" ? (
                      <button
                        onClick={handleSubmitBlister}
                        disabled={
                          !selectedPONum ||
                          Object.values(quantities).every(
                            (q) => (q as any).toBlister <= 0,
                          )
                        }
                        className="bg-pass text-white font-black px-8 py-3.5 rounded-xl shadow-xl shadow-pass/30 disabled:opacity-50 hover:bg-green-600 transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs min-w-[200px]"
                      >
                        <Check className="w-5 h-5" /> Confirm Blister Packing
                      </button>
                    ) : (
                      <button
                        onClick={handleSubmitCarton}
                        disabled={
                          !selectedPONum ||
                          Object.values(quantities).every(
                            (q) => (q as any).toCarton.count <= 0,
                          )
                        }
                        className="bg-pack text-white font-black px-8 py-3.5 rounded-xl shadow-xl shadow-pack/30 disabled:opacity-50 hover:bg-sky-600 transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs min-w-[200px]"
                      >
                        <Check className="w-5 h-5" /> Confirm Carton Packing
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleBulkReturn}
                      disabled={
                        !selectedPONum ||
                        Object.values(quantities).every((q) => {
                          if (packingStage === "to_blister") return ((q as any).toBlister || 0) <= 0;
                          return ((q as any).toCarton?.count || 0) <= 0 && ((q as any).toBlister || 0) <= 0;
                        })
                      }
                      className="bg-rose-600 text-white font-black px-8 py-3.5 rounded-xl shadow-xl shadow-rose-600/30 disabled:opacity-50 hover:bg-rose-700 transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs min-w-[160px]"
                    >
                      <RotateCcw className="w-5 h-5" /> Bulk Return
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-1 space-y-6">
            <ReturnsHandoverList
              department="Packing"
              onRefresh={() => {
                fetchPOs();
                if (selectedPONum) handlePOChange(selectedPONum);
              }}
            />

            <TransferToStoreList
              records={history}
              onRefresh={() => {
                fetchHistory();
                if (selectedPONum) handlePOChange(selectedPONum);
              }}
            />

            <HandoverList
              title="Carton QC (Internal)"
              table="pack_records"
              records={history.filter(
                (r) => r.packing_type === "carton" && r.status === "pending",
              )}
              onRefresh={() => {
                fetchHistory();
                if (selectedPONum) handlePOChange(selectedPONum);
              }}
            />

            <HandoverList
              title="Blister QC (Internal)"
              table="pack_records"
              records={history.filter(
                (r) => r.packing_type === "blister" && r.status === "pending",
              )}
              onRefresh={() => {
                fetchHistory();
                if (selectedPONum) handlePOChange(selectedPONum);
              }}
            />

            <HandoverList
              title="Incoming from Finishing"
              table="finish_records"
              records={incomingFinishing.filter((r) => r.result === "pass")}
              onRefresh={() => {
                fetchIncoming();
                if (selectedPONum) handlePOChange(selectedPONum);
              }}
            />

            <div className="bg-bg2 border border-bg4 rounded-3xl overflow-hidden shadow-lg border-t-4 border-t-pack">
              <div className="p-6 border-b border-bg4 bg-bg3/30 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-tight">
                    Recent Packing Logs
                  </h3>
                  <p className="text-[9px] font-mono font-medium text-text3 mt-0.5">
                    Editable until transferred or accepted
                  </p>
                </div>
                <History className="w-4 h-4 text-text3" />
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
                        Type
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
                      history.slice(0, 50).map((rec, i) => {
                        const isEditable =
                          rec.status === "pending" &&
                          rec.store_status === "pending";
                        return (
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
                              <span className="bg-pack/5 border border-pack/20 text-pack text-[9px] font-black px-2 py-0.5 rounded uppercase">
                                {rec.packing_type || "loose"}
                              </span>
                            </td>
                            <td className="p-3 text-right font-black text-pack text-xs">
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
                                  className="w-16 bg-bg text-right px-1 border border-pack rounded outline-none focus:ring-1 focus:ring-pack animate-pulse"
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
                                ) : isEditable ? (
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
                                      department="packing"
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
                                    {rec.status}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan={6}
                          className="p-4 text-center text-[10px] font-mono text-text3"
                        >
                          No packing logs found
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
                        <p className="font-mono text-[9px] text-po font-black mb-1 uppercase tracking-widest">
                          {rec.po_number}
                        </p>
                        <p className="text-sm font-black text-text1">
                          {rec.style_num}
                        </p>
                        <p className="text-[10px] font-mono text-text3 font-bold uppercase">
                          {rec.color} • {rec.size} •{" "}
                          {rec.packing_type || "loose"}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          <p className="text-lg font-black text-pack tracking-tight">
                            +{rec.quantity}
                          </p>
                          <span className="text-[9px] font-black text-text3 uppercase bg-bg4 px-2 py-0.5 rounded shadow-sm">
                            {rec.packing_type === "carton"
                              ? `${rec.cartons} CARTONS`
                              : rec.packing_type === "blister"
                                ? `${rec.quantity / 12} BLISTERS`
                                : "LOOSE PCS"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] font-mono text-text3 text-right uppercase font-bold tracking-widest">
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
          {/* Packing Summary Card */}
          <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-6 bg-pack/5 border-b border-bg4 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tight text-pack">
                  1. Packing Output Summary
                </h3>
                <p className="text-[10px] font-mono text-text3 uppercase font-bold tracking-widest mt-1">
                  Total volume shipped by style/color
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
                  onClick={() => {
                    if (!showReport) fetchDetailedReport();
                    setShowReport(!showReport);
                  }}
                  className={cn(
                    "px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg active:scale-95",
                    showReport
                      ? "bg-bg4 text-text border border-bg4"
                      : "bg-pack text-white shadow-pack/20",
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
                    className="bg-bg3 border border-bg4 rounded-xl py-3 px-6 text-xs font-bold outline-none focus:ring-1 focus:ring-pack/30"
                  />
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-bg3/30 border-b border-bg4 font-mono font-black uppercase tracking-widest">
                    <th className="p-5">Style Batch</th>
                    <th className="p-5">Color / Size</th>
                    <th className="p-5 text-center bg-pass/5 text-pass border-l border-bg4">
                      Loose Form
                    </th>
                    <th className="p-5 text-center bg-pack/5 text-pack border-l border-bg4">
                      Blister Form
                    </th>
                    <th className="p-5 text-center bg-po/5 text-po border-l border-bg4">
                      In Cartons
                    </th>
                    <th className="p-5 text-center border-l border-bg4 bg-bg3/50 text-text3">
                      Order Qty
                    </th>
                    <th className="p-5 text-center border-l border-bg4 bg-pass/10 text-pass">
                      Total Produced
                    </th>
                    <th className="p-5 text-right border-l border-bg4">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg4">
                  {!showReport ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="p-20 text-center font-black uppercase tracking-[0.3em] text-text3"
                      >
                        Ready for Report Generation
                      </td>
                    </tr>
                  ) : filteredDetailedReport.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="p-16 text-center text-text3 font-bold uppercase"
                      >
                        No data matching filters
                      </td>
                    </tr>
                  ) : (
                    filteredDetailedReport
                      .filter((s) => {
                        if (!reportSearch) return true;
                        const search = reportSearch.toLowerCase();
                        return (
                          s.style_num.toLowerCase().includes(search) ||
                          s.color.toLowerCase().includes(search) ||
                          s.po_number.toLowerCase().includes(search)
                        );
                      })
                      .map((stat: any, i) => {
                        return (
                          <tr
                            key={i}
                            className="hover:bg-bg3/20 transition-colors border-b border-bg4 last:border-0 font-mono font-black uppercase text-center"
                          >
                            <td className="p-5 text-left font-black text-sm normal-case font-sans">
                              {stat.style_num}
                            </td>
                            <td className="p-5 text-left font-bold uppercase text-text2 font-sans px-2">
                              {stat.color}{" "}
                              {stat.size && (
                                <span className="text-[10px] text-text3 ml-1">
                                  / {stat.size}
                                </span>
                              )}
                            </td>
                            <td className="p-5 text-pass bg-pass/5">
                              {stat.loose_available || "—"}
                            </td>
                            <td className="p-5 text-pack bg-pack/5 border-l border-bg4">
                              <div>{stat.blister_available || "—"}</div>
                              {stat.blister_available > 0 && (
                                <div className="text-[9px] opacity-60 font-sans tracking-normal font-bold">
                                  ({Math.floor(stat.blister_available / 12)}{" "}
                                  Bliss)
                                </div>
                              )}
                            </td>
                            <td className="p-5 text-po bg-po/5 border-l border-bg4">
                              <div>{stat.total_packed || "—"}</div>
                              {stat.carton_count > 0 && (
                                <div className="text-[9px] opacity-60 font-sans tracking-normal font-bold">
                                  ({stat.carton_count} Ctns)
                                </div>
                              )}
                            </td>
                            <td className="p-5 text-text3 border-l border-bg4 bg-bg3/10 font-bold">
                              {stat.order_qty || "—"}
                            </td>
                            <td className="p-5 text-pass border-l border-bg4 bg-pass/10 font-bold">
                              {(stat.loose_available || 0) +
                                (stat.blister_available || 0) +
                                (stat.total_packed || 0) || "—"}
                            </td>
                            <td className="p-5 text-right font-black text-sm tracking-tight text-pass shadow-pass/10 border-l border-bg4 font-sans">
                              READY FOR DISPATCH
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detailed Packing Log (Pivoted) */}
          <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-6 bg-bg3/20 border-b border-bg4 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tight">
                  2. Detailed Dimensional Log
                </h3>
                <p className="text-[10px] font-mono text-text3 uppercase font-bold tracking-widest mt-1">
                  Multi-sized packing matrix by batch
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
                        {s} (Pcs)
                      </th>
                    ))}
                    <th className="p-5 font-mono font-black text-center border-b border-bg4 bg-bg4/30">
                      Total Qty
                    </th>
                    <th className="p-5 font-mono font-black border-b border-bg4">
                      Supervisor
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg4">
                  {pivotedHistory.rows.map((row: any, i) => {
                    let batchQty = 0;
                    let batchCtns = 0;
                    Object.values(row.sizes).forEach((s: any) => {
                      batchQty += s.qty;
                      batchCtns += s.cartons;
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
                            Shipment Batch
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
                                <span className="text-xs font-black text-pack leading-none">
                                  {sizeData.qty}
                                </span>
                                <span className="text-[9px] font-black text-text3 opacity-50">
                                  {sizeData.cartons} C
                                </span>
                              </div>
                            </td>
                          );
                        })}
                        <td className="p-5 text-center bg-bg4/10">
                          <div className="flex flex-col items-center">
                            <p className="text-sm font-black text-slate-900 dark:text-white leading-none">
                              {batchQty}
                            </p>
                            <p className="text-[8px] font-mono text-text3 uppercase mt-1">
                              {batchCtns} Ctns Total
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
          currentDepartment="Packing"
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
        currentDepartment={discardDepartment}
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
