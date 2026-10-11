import React, { useState } from 'react';
import { Truck, Check, Square, CheckSquare, ArrowRight, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { packingService } from '../services/erpService';

interface TransferProps {
  records: any[];
  onRefresh: () => void;
}

export const TransferToStoreList: React.FC<TransferProps> = ({ records, onRefresh }) => {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isTransferring, setIsTransferring] = useState(false);

  const pendingTransfer = records.filter(r => r.status === 'accepted' && r.store_status === 'pending' && r.packing_type === 'carton');

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedIds.length === pendingTransfer.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(pendingTransfer.map(r => r.id));
    }
  };

  const handleTransfer = async () => {
    if (selectedIds.length === 0) return;
    setIsTransferring(true);
    try {
      await packingService.transferToStore(selectedIds);
      setSelectedIds([]);
      onRefresh();
      alert(`SUCCESS: ${selectedIds.length} Cartons shifted to Store.`);
    } catch (e: any) {
      alert(e.response?.data?.error || e.message);
    } finally {
      setIsTransferring(false);
    }
  };

  const handleDeleteCarton = async (id: number) => {
    if (!confirm('Are you sure you want to delete this carton record? This will cancel and remove this carton pack.')) {
      return;
    }
    try {
      await packingService.delete(id);
      setSelectedIds(prev => prev.filter(i => i !== id));
      onRefresh();
      alert('Carton record removed successfully.');
    } catch (e: any) {
      alert(e.response?.data?.error || e.message);
    }
  };

  if (pendingTransfer.length === 0) return null;

  return (
    <div className="bg-bg2 border border-pack rounded-2xl overflow-hidden shadow-xl">
      <div className="p-4 bg-pack/10 border-b border-pack/20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={toggleAll}
            className="text-pack hover:text-pack/80 transition-colors"
          >
            {selectedIds.length === pendingTransfer.length && pendingTransfer.length > 0 ? (
              <CheckSquare className="w-5 h-5" />
            ) : (
              <Square className="w-5 h-5" />
            )}
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-pack" />
              <h3 className="text-sm font-bold uppercase tracking-tight text-pack">Shift to Store</h3>
            </div>
            <span className="text-[9px] font-mono text-pack/70 uppercase">
              {pendingTransfer.length} Ready • {selectedIds.length} Selected
            </span>
          </div>
        </div>
        
        {selectedIds.length > 0 && (
          <button 
            onClick={handleTransfer}
            disabled={isTransferring}
            className={cn(
              "bg-pack text-white text-[10px] font-bold px-4 py-2 rounded-lg shadow-lg shadow-pack/20 flex items-center gap-2 uppercase transition-all active:scale-95",
              isTransferring && "opacity-50 cursor-not-allowed"
            )}
          >
            {isTransferring ? 'Processing...' : (
              <><Truck className="w-3.5 h-3.5" /> Shift to Store</>
            )}
          </button>
        )}
      </div>

      <div className="divide-y divide-bg4 max-h-[300px] overflow-y-auto">
        {pendingTransfer.map((rec) => (
          <div 
            key={rec.id} 
            className={cn(
              "p-4 hover:bg-bg3/20 transition-colors group cursor-pointer",
              selectedIds.includes(rec.id) && "bg-pack/5 border-l-2 border-pack"
            )}
            onClick={() => toggleSelect(rec.id)}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div 
                    className={cn(
                      "shrink-0 transition-colors",
                      selectedIds.includes(rec.id) ? "text-pack" : "text-text3 group-hover:text-text2"
                    )}
                  >
                    {selectedIds.includes(rec.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </div>
                  <span className="text-[10px] font-mono text-po font-bold uppercase">{rec.po_number}</span>
                  <ArrowRight className="w-3 h-3 text-text3" />
                  <span className="text-[10px] font-mono text-text2 font-bold uppercase">{rec.style_num}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono text-text3 uppercase">
                  <span>{rec.color} • {rec.size}</span>
                  <span className="text-pack font-black ml-auto">
                    {rec.cartons} CTNS ({rec.quantity} PCS)
                  </span>
                </div>
              </div>
              
              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <button 
                  onClick={() => handleDeleteCarton(rec.id)}
                  className="p-2 rounded-lg transition-colors border bg-bg3 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border-bg4"
                  title="Delete/Cancel Carton"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => toggleSelect(rec.id)}
                  className={cn(
                    "p-2 rounded-lg transition-colors border",
                    selectedIds.includes(rec.id) ? "bg-pack text-white border-pack" : "bg-bg3 text-text3 border-bg4"
                  )}
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
