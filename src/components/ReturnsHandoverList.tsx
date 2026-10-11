import React, { useState, useEffect } from 'react';
import { returnService } from '../services/erpService';
import { ReturnRecord, Department } from '../types';
import { 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  User, 
  RefreshCw,
  AlertCircle,
  ChevronRight
} from 'lucide-react';
import { cn, fmtDate } from '../lib/utils';

interface ReturnsHandoverListProps {
  department: Department;
  onRefresh?: () => void;
}

export const ReturnsHandoverList: React.FC<ReturnsHandoverListProps> = ({ department, onRefresh }) => {
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [history, setHistory] = useState<ReturnRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');

  const fetchReturns = async () => {
    setIsLoading(true);
    try {
      const [pendingData, historyData] = await Promise.all([
        returnService.list({ to_department: department, status: 'pending' }),
        returnService.list({ to_department: department }).then(data => 
          data.filter(r => r.status !== 'pending').slice(0, 50)
        )
      ]);
      
      console.log(`[ReturnsHandover] Fetched ${pendingData.length} pending, ${historyData.length} history for ${department}`);
      setReturns(pendingData);
      setHistory(historyData);
    } catch (error) {
      console.error('Failed to fetch returns:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReturns();
  }, [department]);

  const [confirmingId, setConfirmingId] = useState<{ id: number; status: 'accepted' | 'rejected' } | null>(null);

  const handleAction = async (id: number, status: 'accepted' | 'rejected', bypassConfirm = false) => {
    console.log(`[ReturnsHandover] Action Triggered: ${status} ID ${id}, bypassConfirm: ${bypassConfirm}`);
    
    if (!bypassConfirm) {
      console.log(`[ReturnsHandover] Setting confirmation state for #${id}`);
      setConfirmingId({ id, status });
      return;
    }
    
    setConfirmingId(null);
    console.log(`[ReturnsHandover] Confirmation received. Initializing API call to /returns/${id}/status...`);
    setIsLoading(true);
    
    try {
      const response: any = await returnService.updateStatus(id, status);
      console.log(`[ReturnsHandover] API CALL COMPLETED SUCCESSFULLY:`, response);
      
      const serverStatus = response.record?.status || status;
      alert(`✅ SUCCESS\n\nReturn #${id} has been marked as ${serverStatus.toUpperCase()}. Available quantities have been adjusted.`);
      
      console.log(`[ReturnsHandover] Refreshing list...`);
      await fetchReturns();
      
      if (onRefresh) {
        console.log(`[ReturnsHandover] Triggering parent onRefresh...`);
        onRefresh();
      }
    } catch (error: any) {
      console.error(`[ReturnsHandover] API CALL FAILED for #${id}:`, error);
      
      let errorMsg = "An unexpected error occurred.";
      if (error?.response?.data?.error) {
        errorMsg = error.response.data.error;
      } else if (error instanceof Error) {
        errorMsg = error.message;
      }
      
      alert(`❌ ERROR\n\nFailed to ${status} return #${id}.\n\nReason: ${errorMsg}`);
    } finally {
      console.log(`[ReturnsHandover] Action cycle finished for #${id}`);
      setIsLoading(false);
    }
  };

  if (returns.length === 0 && history.length === 0 && !isLoading) return null;

  return (
    <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="p-4 bg-bg3/50 border-b border-bg4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setActiveTab('pending')}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-xs font-black uppercase tracking-tight",
              activeTab === 'pending' 
                ? "bg-reject text-white shadow-lg shadow-reject/20" 
                : "text-text3 hover:bg-bg4"
            )}
          >
            <RotateCcw className="w-4 h-4" />
            Pending {returns.length > 0 && `(${returns.length})`}
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-xs font-black uppercase tracking-tight",
              activeTab === 'history' 
                ? "bg-bg4 text-text" 
                : "text-text3 hover:bg-bg4"
            )}
          >
            <Clock className="w-4 h-4" />
            History
          </button>
        </div>
        <button 
          onClick={fetchReturns}
          disabled={isLoading}
          className="p-2 hover:bg-bg4 rounded-lg transition-colors text-text3"
        >
          <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
        </button>
      </div>

      <div className="divide-y divide-bg4 max-h-[400px] overflow-y-auto">
        {activeTab === 'pending' ? (
          returns.length === 0 ? (
            <div className="p-12 text-center">
              <CheckCircle2 className="w-10 h-10 text-pass/20 mx-auto mb-3" />
              <p className="text-[10px] font-mono text-text3 uppercase tracking-widest">No pending returns</p>
            </div>
          ) : (
            returns.map((ret) => (
              <div key={ret.id} className="p-4 hover:bg-bg3/20 transition-colors">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-po">{ret.po_number}</span>
                      <ChevronRight className="w-3 h-3 text-text3" />
                      <span className="text-xs font-black text-text">{ret.style_num}</span>
                    </div>
                    <span className="text-[10px] font-mono text-text3 uppercase mt-1">
                      {ret.color} / {ret.size}
                    </span>
                    <div className="flex items-center gap-2 mt-2 text-[9px] font-mono text-text3 font-bold uppercase">
                      <User className="w-3 h-3" />
                      From {ret.from_department} by {ret.creator_name || 'System'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black text-reject">-{ret.quantity}</div>
                    <div className="text-[9px] font-mono text-text3 uppercase mt-1">Units</div>
                  </div>
                </div>

                {ret.reason && (
                  <div className="mb-4 bg-bg3/50 p-2.5 rounded-xl border border-bg4">
                     <p className="text-[10px] font-bold text-text mb-1 flex items-center gap-1.5 uppercase">
                       <AlertCircle className="w-3 h-3 text-orange-500" /> Reason
                     </p>
                     <p className="text-[11px] text-text2 italic leading-relaxed pl-4.5 border-l-2 border-orange-500/30">"{ret.reason}"</p>
                  </div>
                )}

                <div className="flex gap-2">
                  {confirmingId?.id === ret.id ? (
                    <div className="flex-1 flex gap-2 animate-in zoom-in-95 duration-200">
                      <button 
                        onClick={() => handleAction(ret.id, confirmingId.status, true)}
                        disabled={isLoading}
                        className="flex-1 bg-pass text-white py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 hover:bg-pass/80"
                      >
                        {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        Confirm {confirmingId.status}
                      </button>
                      <button 
                        onClick={() => setConfirmingId(null)}
                        disabled={isLoading}
                        className="flex-none px-4 bg-bg4 text-text2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-bg5"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <button 
                        onClick={() => handleAction(ret.id, 'accepted')}
                        disabled={isLoading}
                        className="flex-1 bg-pass text-white py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-pass/20 flex items-center justify-center gap-1.5 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                      >
                        {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        Accept & Adjust
                      </button>
                      <button 
                        onClick={() => handleAction(ret.id, 'rejected')}
                        disabled={isLoading}
                        className="flex-1 bg-bg3 border border-bg4 text-text2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-reject hover:text-white hover:border-reject transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )
        ) : (
          history.length === 0 ? (
             <div className="p-12 text-center">
              <Clock className="w-10 h-10 text-text3/20 mx-auto mb-3" />
              <p className="text-[10px] font-mono text-text3 uppercase tracking-widest">No history found</p>
            </div>
          ) : (
            history.map((ret) => (
              <div key={ret.id} className="p-4 hover:bg-bg3/10 transition-colors border-l-4" style={{ borderColor: ret.status === 'accepted' ? 'var(--color-pass)' : 'var(--color-reject)' }}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-black text-po">{ret.po_number}</p>
                    <p className="text-xs font-black">{ret.style_num}</p>
                    <p className="text-[9px] font-bold text-text3 uppercase">{ret.color} • {ret.size}</p>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      "text-[9px] font-black uppercase px-2 py-0.5 rounded",
                      ret.status === 'accepted' ? "bg-pass/10 text-pass" : "bg-reject/10 text-reject"
                    )}>
                      {ret.status}
                    </p>
                    <p className="text-sm font-black mt-1">-{ret.quantity}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-bg4/50">
                   <p className="text-[8px] font-mono text-text3 uppercase">Processed {fmtDate(ret.received_at || ret.created_at)}</p>
                   <p className="text-[8px] font-mono text-text3 uppercase">by {ret.receiver_name || 'Admin'}</p>
                </div>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
};
