import React, { useState, useEffect } from 'react';
import { discardService } from '../services/erpService';
import { 
  Trash2, 
  XCircle, 
  AlertTriangle 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

interface DiscardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  product: {
    po_number: string;
    product_id: number;
    style_num: string;
    color: string;
    size: string;
    available_qty: number;
  } | null;
  currentDepartment: string;
}

export const DiscardModal: React.FC<DiscardModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess, 
  product, 
  currentDepartment 
}) => {
  const [quantity, setQuantity] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setQuantity(0);
      setReason('');
    }
  }, [isOpen]);

  if (!product) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quantity <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }

    if (quantity > product.available_qty) {
      const confirmProceed = window.confirm(
        `Warning: Discard quantity (${quantity}) exceeds available quantity (${product.available_qty}). Proceed anyway?`
      );
      if (!confirmProceed) return;
    }

    setIsLoading(true);
    try {
      await discardService.create({
        po_number: product.po_number,
        product_id: product.product_id,
        department: currentDepartment,
        quantity,
        reason
      });
      toast.success('Items discarded successfully', {
        description: `${quantity} items from ${product.style_num} (${product.color}) will no longer proceed to downstream departments.`
      });
      onSuccess?.();
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to discard items');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-lg bg-bg2 border border-bg4 rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-bg4 bg-bg/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-reject/10 rounded-xl text-reject">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight text-text">PARTIAL DISCARD</h3>
                    <p className="text-[10px] text-text3 font-mono uppercase tracking-widest mt-0.5">From {currentDepartment} Dept</p>
                  </div>
                </div>
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-bg3 rounded-xl transition-colors text-text3"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 bg-bg3/30 border-b border-bg4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[9px] font-mono text-text3 uppercase font-black">PO / Style</span>
                  <p className="text-xs font-black text-text">{product.po_number} - {product.style_num}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] font-mono text-text3 uppercase font-black">Color / Size</span>
                  <p className="text-xs font-black text-text">{product.color} / {product.size}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[9px] font-mono text-text3 uppercase font-black">Holding Qty</span>
                  <p className="text-xs font-black text-reject">{product.available_qty.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-text3 uppercase font-mono px-1">Quantity to Discard*</label>
                <input
                  type="number"
                  required
                  min="1"
                  max={product.available_qty}
                  value={quantity || ''}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                  placeholder="Enter quantity to permanently discard"
                  className="w-full bg-bg3 border border-bg4 rounded-xl py-3 px-4 text-xs font-black focus:ring-1 focus:ring-reject/20 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-text3 uppercase font-mono px-1">Reason for Discard*</label>
                <textarea
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Fabric tearing, stitching defect, blister deformation, etc."
                  rows={3}
                  className="w-full bg-bg3 border border-bg4 rounded-xl py-3 px-4 text-xs font-black focus:ring-1 focus:ring-reject/20 outline-none transition-all resize-none"
                />
              </div>

              <div className="p-4 bg-reject/[0.03] border border-reject/10 rounded-2xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-reject shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-reject uppercase">Permanent Discard Warning</p>
                  <p className="text-[10px] text-text3 leading-relaxed">
                    Once items are discarded from {currentDepartment}, they are permanently subtracted from active inventory. They will <strong>not</strong> go to any preceding or downstream department, including packing as blister or loose forms.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 bg-bg3 hover:bg-bg4 border border-bg4 text-text text-xs font-black py-3.5 rounded-xl transition-all uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 bg-reject hover:bg-reject/90 text-white text-xs font-black py-3.5 rounded-xl transition-all uppercase tracking-wider shadow-lg shadow-reject/20 disabled:opacity-50"
                >
                  {isLoading ? 'Discarding...' : 'Confirm Discard'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
