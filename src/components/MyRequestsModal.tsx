import React, { useState, useEffect } from 'react';
import { 
  History, CheckCircle2, XCircle, Clock, AlertCircle, 
  Building2, LayoutDashboard, Calendar, RefreshCw, X, Shield, ChevronRight,
  Package, Smartphone, MessageSquare, ExternalLink
} from 'lucide-react';
import { permissionRequestService, whatsAppService } from '../services/erpService';
import { PermissionRequest, WhatsAppRequestInfo } from '../types';
import { useAuth } from '../context/AuthContext';
import { useSystem } from '../context/SystemContext';
import { toast } from 'sonner';

interface MyRequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRequestNew: () => void;
}

export const MyRequestsModal: React.FC<MyRequestsModalProps> = ({
  isOpen,
  onClose,
  onRequestNew
}) => {
  const { refreshUser } = useAuth();
  const { refreshWorkingDate } = useSystem();
  const [requests, setRequests] = useState<PermissionRequest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [resendingId, setResendingId] = useState<number | null>(null);

  const fetchMyRequests = async () => {
    setIsLoading(true);
    try {
      const data = await permissionRequestService.listMy();
      setRequests(data);
      // Also refresh current session state in case a request was recently approved
      await refreshUser();
      await refreshWorkingDate();
    } catch (err: any) {
      toast.error('Failed to load your requests', { description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMyRequests();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredRequests = requests.filter(r => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" /> Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5" /> Rejected
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse">
            <Clock className="w-3.5 h-3.5" /> Pending Admin Review
          </span>
        );
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'old_stock_requisition':
        return <Package className="w-4 h-4 text-emerald-500" />;
      case 'dept_access':
        return <Building2 className="w-4 h-4 text-po" />;
      case 'page_access':
        return <LayoutDashboard className="w-4 h-4 text-po" />;
      case 'datetime_change':
        return <Calendar className="w-4 h-4 text-po" />;
      default:
        return <Shield className="w-4 h-4 text-po" />;
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'old_stock_requisition': return 'Old Stock Requisition';
      case 'dept_access': return 'Department Access';
      case 'page_access': return 'Page & Module Access';
      case 'datetime_change': return 'Production Date/Time Change';
      default: return type;
    }
  };

  const handleOpenWhatsApp = async (id: number) => {
    setResendingId(id);
    try {
      const info = await whatsAppService.getRequestMessage(id);
      window.open(info.direct_whatsapp_url, '_blank');
    } catch (err: any) {
      toast.error('Failed to prepare WhatsApp message', { description: err.message });
    } finally {
      setResendingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-bg2 border border-bg4 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-bg4 bg-bg3/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-po/10 text-po flex items-center justify-center border border-po/20 shadow-inner">
              <History className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-text uppercase tracking-tight flex items-center gap-2">
                My Permission & Stock Requests
              </h3>
              <p className="text-xs text-text3 font-medium">
                Track status and admin decisions for stock requisitions & authorizations
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchMyRequests}
              disabled={isLoading}
              className="p-2 rounded-xl text-text3 hover:text-text hover:bg-bg4 transition-colors"
              title="Refresh requests"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button 
              onClick={onClose}
              className="p-2 rounded-xl text-text3 hover:text-text hover:bg-bg4 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Filters */}
        <div className="p-3 bg-bg border-b border-bg4 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5">
            {(['all', 'pending', 'approved', 'rejected'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-tight transition-all cursor-pointer ${
                  filter === tab
                    ? 'bg-po text-white shadow-sm'
                    : 'text-text3 hover:text-text hover:bg-bg3'
                }`}
              >
                {tab} ({requests.filter(r => tab === 'all' || r.status === tab).length})
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              onClose();
              onRequestNew();
            }}
            className="px-3 py-1.5 bg-bg3 hover:bg-bg4 text-po hover:text-po/90 border border-po/20 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
          >
            + New Request
          </button>
        </div>

        {/* Requests List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3.5">
          {isLoading && requests.length === 0 ? (
            <div className="py-12 text-center text-text3 text-xs animate-pulse">
              Loading your requests...
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-12 h-12 rounded-2xl bg-bg3 text-text3 flex items-center justify-center mx-auto mb-3">
                <AlertCircle className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-text mb-1">No requests found</p>
              <p className="text-xs text-text3 mb-4">
                You have not submitted any stock requisitions or permission requests in this category.
              </p>
              <button
                onClick={() => {
                  onClose();
                  onRequestNew();
                }}
                className="px-4 py-2 bg-po text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md shadow-po/10 cursor-pointer"
              >
                Create Request
              </button>
            </div>
          ) : (
            filteredRequests.map(req => (
              <div
                key={req.id}
                className="p-4 bg-bg3/60 border border-bg4 rounded-2xl space-y-3 hover:border-text3/30 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-bg4 shrink-0">
                      {getTypeIcon(req.request_type)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className={`text-xs font-bold uppercase ${req.request_type === 'old_stock_requisition' ? 'text-emerald-500' : 'text-text'}`}>
                          {getTypeName(req.request_type)}
                        </p>
                        <span className="text-[10px] font-mono text-text3">#{req.id}</span>
                      </div>
                      <p className="text-[11px] text-text3">
                        Submitted: {new Date(req.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(req.status)}
                </div>

                {/* Requested Details Content */}
                <div className="p-3 bg-bg/80 rounded-xl border border-bg4/50 space-y-2 text-xs">
                  {req.request_type === 'old_stock_requisition' && req.requisition_data && (
                    <div className="space-y-1.5">
                      <span className="text-emerald-500 text-[10px] uppercase font-mono font-bold block">
                        Old Stock Requisition Spec:
                      </span>
                      <div className="flex flex-wrap gap-2 text-xs font-mono">
                        <span className="px-2 py-0.5 rounded-lg bg-bg3 border border-bg4 font-bold uppercase text-text">
                          Style: {req.requisition_data.style_num}
                        </span>
                        <span className="px-2 py-0.5 rounded-lg bg-bg3 border border-bg4 uppercase text-text">
                          Color: {req.requisition_data.color}
                        </span>
                        <span className="px-2 py-0.5 rounded-lg bg-bg3 border border-bg4 uppercase text-text">
                          Size: {req.requisition_data.size}
                        </span>
                        <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-bold">
                          Qty: {req.requisition_data.quantity} Pcs
                        </span>
                        <span className="px-2 py-0.5 rounded-lg bg-bg3 border border-bg4 uppercase text-text3">
                          Dest: {req.requisition_data.target_department} {req.requisition_data.line_number || ''}
                        </span>
                      </div>
                    </div>
                  )}

                  {req.request_type === 'dept_access' && req.requested_items && (
                    <div>
                      <span className="text-text3 text-[10px] uppercase font-mono block mb-1">Requested Departments:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {req.requested_items.map((dept: string, i: number) => (
                          <span key={i} className="px-2 py-0.5 rounded-md bg-po/10 text-po border border-po/20 font-bold uppercase text-[11px]">
                            {dept}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {req.request_type === 'page_access' && req.requested_items && (
                    <div>
                      <span className="text-text3 text-[10px] uppercase font-mono block mb-1">Requested Modules / Pages:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {req.requested_items.map((page: string, i: number) => (
                          <span key={i} className="px-2 py-0.5 rounded-md bg-po/10 text-po border border-po/20 font-bold uppercase text-[11px]">
                            {page}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {req.request_type === 'datetime_change' && req.requested_datetime && (
                    <div>
                      <span className="text-text3 text-[10px] uppercase font-mono block mb-0.5">Proposed Date & Time:</span>
                      <p className="font-mono text-po font-bold text-xs">{req.requested_datetime}</p>
                    </div>
                  )}

                  {req.reason && (
                    <div className="pt-1 border-t border-bg4/40">
                      <span className="text-text3 text-[10px] uppercase font-mono block">Justification:</span>
                      <p className="text-text2 italic text-xs mt-0.5">"{req.reason}"</p>
                    </div>
                  )}
                </div>

                {/* Pending Actions (Resend WhatsApp link) */}
                {req.status === 'pending' && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenWhatsApp(req.id)}
                      disabled={resendingId === req.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      {resendingId === req.id ? 'Loading...' : 'Send / Remind via WhatsApp'}
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Admin Feedback */}
                {req.status !== 'pending' && (
                  <div className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 ${
                    req.status === 'approved' 
                      ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' 
                      : 'bg-rose-500/5 border-rose-500/20 text-rose-600 dark:text-rose-400'
                  }`}>
                    {req.status === 'approved' ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                    ) : (
                      <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                    )}
                    <div>
                      <p className="font-bold">
                        {req.status === 'approved' ? 'Request Approved & Stock Released' : 'Request Declined'} 
                        {req.reviewer_name && <span className="font-normal"> ({req.reviewer_name})</span>}
                        {req.reviewed_at && <span className="text-[10px] font-normal opacity-80"> • {new Date(req.reviewed_at).toLocaleString()}</span>}
                      </p>
                      {req.admin_notes && (
                        <p className="text-xs mt-0.5 italic text-text">Notes: "{req.admin_notes}"</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
