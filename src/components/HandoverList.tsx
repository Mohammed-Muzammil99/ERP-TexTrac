import React, { useState } from 'react';
import { Handshake, Check, X, ArrowRight, Square, CheckSquare } from 'lucide-react';
import { cn, fmtDate } from '../lib/utils';
import { handoverService } from '../services/erpService';

interface HandoverProps {
  title: string;
  table: string;
  records: any[];
  onRefresh: () => void;
  statusField?: string;
  statusValue?: string;
}

export const HandoverList: React.FC<HandoverProps> = ({ 
  title, 
  table, 
  records, 
  onRefresh,
  statusField = 'status',
  statusValue = 'pending'
}) => {
  const pending = records.filter(r => r[statusField] === statusValue);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedIds.length === pending.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(pending.map(r => r.id));
    }
  };

  const handleBatchConfirm = async (action: 'accepted' | 'rejected') => {
    if (selectedIds.length === 0) return;
    try {
      await handoverService.confirm(table, selectedIds, action, statusField);
      setSelectedIds([]);
      onRefresh();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleConfirmSingle = async (id: number, action: 'accepted' | 'rejected') => {
    try {
      await handoverService.confirm(table, [id], action, statusField);
      onRefresh();
    } catch (e: any) {
      alert(e.message);
    }
  };

  if (pending.length === 0) return null;

  return (
    <div className="bg-bg2 border border-orange-500/30 rounded-2xl overflow-hidden shadow-xl animate-pulse-slow">
      <div className="p-4 bg-orange-500/10 border-b border-orange-500/20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={toggleAll}
            className="text-orange-500 hover:text-orange-400 transition-colors"
          >
            {selectedIds.length === pending.length ? (
              <CheckSquare className="w-5 h-5" />
            ) : (
              <Square className="w-5 h-5" />
            )}
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Handshake className="w-5 h-5 text-orange-500" />
              <h3 className="text-sm font-bold uppercase tracking-tight text-orange-500">{title}</h3>
            </div>
            <span className="text-[9px] font-mono text-orange-500/70 uppercase">
              {pending.length} Pending • {selectedIds.length} Selected
            </span>
          </div>
        </div>
        
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2">
            <button 
              onClick={() => handleBatchConfirm('rejected')}
              className="bg-reject text-bg text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-lg shadow-reject/20 flex items-center gap-1 uppercase"
            >
              <X className="w-3 h-3" /> Reject Batch
            </button>
            <button 
              onClick={() => handleBatchConfirm('accepted')}
              className="bg-pass text-bg text-[10px] font-bold px-3 py-1.5 rounded-lg shadow-lg shadow-pass/20 flex items-center gap-1 uppercase"
            >
              <Check className="w-3 h-3" /> Accept Batch
            </button>
          </div>
        )}
      </div>

      <div className="divide-y divide-bg4 max-h-[400px] overflow-y-auto">
        {pending.map((rec) => (
          <div 
            key={rec.id} 
            className={cn(
              "p-4 hover:bg-bg3/20 transition-colors group cursor-pointer",
              selectedIds.includes(rec.id) && "bg-orange-500/5 border-l-2 border-orange-500"
            )}
            onClick={() => toggleSelect(rec.id)}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div 
                    className={cn(
                      "shrink-0 transition-colors",
                      selectedIds.includes(rec.id) ? "text-orange-500" : "text-text3 group-hover:text-text2"
                    )}
                  >
                    {selectedIds.includes(rec.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </div>
                  <span className="text-[10px] font-mono text-po font-bold uppercase">{rec.po_number}</span>
                  <ArrowRight className="w-3 h-3 text-text3" />
                  <span className="text-[10px] font-mono text-text2 font-bold uppercase">Line {rec.line_number || 'N/A'}</span>
                </div>
                <p className="text-sm font-bold truncate">{rec.style_num}</p>
                <div className="flex items-center gap-2 text-[10px] font-mono text-text3 uppercase mt-1">
                  <span>{rec.color}</span>
                  {rec.size && (
                    <>
                      <span>•</span>
                      <span>{rec.size}</span>
                    </>
                  )}
                  {rec.fabric_name && (
                    <>
                      <span>•</span>
                      <span>{rec.fabric_name}</span>
                    </>
                  )}
                  {rec.gsm && (
                    <>
                      <span>•</span>
                      <span>{rec.gsm} GSM</span>
                    </>
                  )}
                  <span className="text-orange-500 font-black ml-2">
                    {rec.quantity !== undefined ? `QTY: ${rec.quantity}` : `QTY: ${rec.quantity_kg} KG`}
                  </span>
                </div>
                <p className="text-[9px] text-text3 font-mono mt-1 italic">Sent by: {rec.dispatcher_name || 'System'}</p>
              </div>
              
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConfirmSingle(rec.id, 'rejected');
                  }}
                  className="p-2 rounded-lg bg-reject/10 text-reject hover:bg-reject/20 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConfirmSingle(rec.id, 'accepted');
                  }}
                  className="p-2 rounded-lg bg-pass text-bg hover:bg-pass/90 transition-colors shadow-lg shadow-pass/20"
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
