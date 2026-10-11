import React, { useState } from 'react';
import { ReturnRecordPayload, Department, POProduct } from '../types';
import { returnService } from '../services/erpService';
import { 
  RotateCcw, 
  XCircle, 
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ConfirmModal } from './ConfirmModal';
import { toast } from 'sonner';

interface ReturnModalProps {
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
  };
  currentDepartment: Department;
}

const DEPARTMENTS: Department[] = ['Cutting', 'Stitching', 'Finishing', 'Packing', 'Shipping', 'Quality'];

export const ReturnModal: React.FC<ReturnModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess, 
  product, 
  currentDepartment 
}) => {
  const promptMap: Record<string, string> = {
    'Packing': 'Finishing',
    'Finishing': 'Stitching',
    'Stitching': 'Feeding',
    'Feeding': 'Cutting'
  };

  const expectedToDept = promptMap[currentDepartment] || '';
  const [toDept, setToDept] = useState<Department | ''>(expectedToDept);
  const [quantity, setQuantity] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  React.useEffect(() => {
    setToDept(expectedToDept);
  }, [currentDepartment, expectedToDept]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!toDept || quantity <= 0) {
      toast.error('Please fill all required fields');
      return;
    }
    setShowConfirm(true);
  };

  const executeReturnSubmit = async () => {
    setIsLoading(true);
    try {
      await returnService.create({
        po_number: product.po_number,
        product_id: product.product_id,
        from_department: currentDepartment,
        to_department: toDept as Department,
        quantity,
        reason
      });
      toast.success('Return request initiated successfully');
      setShowConfirm(false);
      onSuccess?.();
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Failed to initiate return');
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
                  <div className="p-2 bg-po/10 rounded-xl text-po">
                    <RotateCcw className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight text-text">INITIATE RETURN</h3>
                    <p className="text-[10px] text-text3 font-mono uppercase tracking-widest mt-0.5">From {currentDepartment}</p>
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
                  <span className="text-[9px] font-mono text-text3 uppercase font-black">Avail. Qty</span>
                  <p className="text-xs font-black text-po">{product.available_qty.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-text3 uppercase font-mono px-1">Destination Department*</label>
                <select
                  required
                  value={toDept}
                  onChange={(e) => setToDept(e.target.value as Department)}
                  disabled={true}
                  className="w-full bg-bg3 border border-bg4 rounded-xl py-3 px-4 text-xs font-black focus:ring-1 focus:ring-po/20 outline-none transition-all appearance-none disabled:opacity-75 cursor-not-allowed"
                >
                  {expectedToDept ? (
                    <option value={expectedToDept}>{expectedToDept} (Immediate Previous)</option>
                  ) : (
                    <option value="">N/A (First department)</option>
                  )}
                </select>
                {expectedToDept && (
                  <p className="text-[10px] text-text3/70 px-1 italic">
                    Return is locked to the immediate previous department.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-text3 uppercase font-mono px-1">Quantity to Return*</label>
                <input 
                  type="number"
                  required
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  placeholder="Enter quantity"
                  className="w-full bg-bg3 border border-bg4 rounded-xl py-3 px-4 text-xs font-black focus:ring-1 focus:ring-po/20 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-text3 uppercase font-mono px-1">Reason / Context*</label>
                <textarea 
                  required
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Describe the issue..."
                  className="w-full bg-bg3 border border-bg4 rounded-xl py-3 px-4 text-xs font-black focus:ring-1 focus:ring-po/20 outline-none transition-all resize-none"
                />
              </div>

              <div className="flex gap-4 pt-2">
                <button 
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-6 py-3.5 rounded-xl border border-bg4 text-xs font-black uppercase text-text3 hover:bg-bg3 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 bg-po text-white px-6 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-po/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {isLoading ? 'INITIATING...' : 'CONFIRM RETURN'}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </motion.div>

          <ConfirmModal
            isOpen={showConfirm}
            title="Confirm Return Submission"
            type="warning"
            confirmText="Yes, Submit Return"
            cancelText="Go Back"
            isLoading={isLoading}
            onConfirm={executeReturnSubmit}
            onCancel={() => setShowConfirm(false)}
            message={
              <div className="space-y-2">
                <p>Are you sure you want to initiate this return request?</p>
                <div className="p-3 bg-bg3 rounded-xl border border-bg4 font-mono text-xs space-y-1">
                  <div><strong>PO #:</strong> {product.po_number}</div>
                  <div><strong>Style:</strong> {product.style_num}</div>
                  <div><strong>Color/Size:</strong> {product.color} / {product.size}</div>
                  <div><strong>From:</strong> {currentDepartment} &rarr; <strong>To:</strong> {toDept}</div>
                  <div><strong>Return Quantity:</strong> <span className="text-po font-black">{quantity} pcs</span></div>
                  {reason && <div className="text-[10px] text-text3 pt-1 border-t border-bg4"><strong>Reason:</strong> {reason}</div>}
                </div>
              </div>
            }
          />
        </div>
      )}
    </AnimatePresence>
  );
};
