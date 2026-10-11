import React, { useState } from 'react';
import { storeService } from '../services/erpService';
import { ProductionOrder } from '../types';
import { Shuffle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ChangeRecordPOButtonProps {
  recordId: number;
  currentPo: string;
  department: string;
  pos: ProductionOrder[];
  onSuccess: () => void;
}

export const ChangeRecordPOButton: React.FC<ChangeRecordPOButtonProps> = ({
  recordId,
  currentPo,
  department,
  pos,
  onSuccess,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [targetPo, setTargetPo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activePOs = pos.filter(po => po.status === 'Active' && po.po_number !== currentPo);

  const handleChangePO = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!targetPo) {
      toast.error('Please select a target production order.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await storeService.changeRecordPO({
        id: recordId,
        department,
        newPoNumber: targetPo
      });
      toast.success(res.message || 'PO number updated successfully.');
      setIsOpen(false);
      onSuccess();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to update PO number.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative inline-block" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
          setTargetPo('');
        }}
        className="p-1.5 text-po hover:bg-po/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
        title="Change PO Number"
      >
        <Shuffle className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 bottom-full mb-2 z-50 w-64 bg-bg border border-bg4 rounded-xl p-3 shadow-xl text-left">
          <p className="text-[10px] font-black uppercase text-text2 tracking-wider mb-2">Change PO for this record</p>
          <div className="space-y-2">
            <select
              value={targetPo}
              onChange={(e) => setTargetPo(e.target.value)}
              className="w-full px-2 py-1.5 bg-bg2 border border-bg4 rounded-lg text-xs font-semibold text-text focus:outline-none focus:ring-1 focus:ring-po"
            >
              <option value="">-- Select PO --</option>
              {activePOs.map(po => (
                <option key={po.po_number} value={po.po_number}>
                  {po.po_number}
                </option>
              ))}
            </select>

            <div className="flex gap-1.5 justify-end">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                }}
                className="px-2 py-1 bg-bg3 hover:bg-bg4 border border-bg4 text-[9px] font-black uppercase rounded text-text3"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting || !targetPo}
                onClick={handleChangePO}
                className="flex items-center justify-center gap-1 px-2.5 py-1 bg-po hover:bg-po/90 disabled:opacity-50 text-white text-[9px] font-black uppercase rounded shadow-sm cursor-pointer"
              >
                {isSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  'Move'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
