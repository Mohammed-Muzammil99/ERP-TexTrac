import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, CheckCircle2, XCircle, Clock, AlertCircle, 
  Building2, LayoutDashboard, Calendar, RefreshCw, X, Shield, 
  User, Check, Filter, MessageSquare, ArrowRight, Sparkles,
  Package, Smartphone, ExternalLink, Copy, Settings, Globe, Send, Info,
  Scissors
} from 'lucide-react';
import { permissionRequestService, whatsAppService } from '../services/erpService';
import { PermissionRequest, WhatsAppRequestInfo } from '../types';
import { useSystem } from '../context/SystemContext';
import { WhatsAppSettingsModal } from './WhatsAppSettingsModal';
import { DirectPermissionGrantModal } from './DirectPermissionGrantModal';
import { copyToClipboard, dispatchWhatsApp, formatClientWhatsAppMessage, buildWhatsAppUrl } from '../lib/utils';
import { Key } from 'lucide-react';
import { toast } from 'sonner';

interface AdminApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReviewed?: () => void;
}

export const AdminApprovalModal: React.FC<AdminApprovalModalProps> = ({
  isOpen,
  onClose,
  onReviewed
}) => {
  const { refreshWorkingDate } = useSystem();
  const [requests, setRequests] = useState<PermissionRequest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all' | 'approved' | 'rejected'>('pending');
  const [typeFilter, setTypeFilter] = useState<'all' | 'old_stock_requisition' | 'cutting_consumption_correction' | 'dept_access' | 'page_access' | 'datetime_change'>('all');
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<number, string>>({});
  const [activeNoteInputId, setActiveNoteInputId] = useState<number | null>(null);

  // Direct Permission Grant Modal (Admin Will)
  const [isDirectGrantModalOpen, setIsDirectGrantModalOpen] = useState(false);

  // WhatsApp Inspection Modal & Settings Modal
  const [isWhatsAppSettingsOpen, setIsWhatsAppSettingsOpen] = useState(false);
  const [inspectingWhatsAppInfo, setInspectingWhatsAppInfo] = useState<WhatsAppRequestInfo | null>(null);
  const [loadingWhatsAppId, setLoadingWhatsAppId] = useState<number | null>(null);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [copiedApproveLink, setCopiedApproveLink] = useState(false);
  const [copiedRejectLink, setCopiedRejectLink] = useState(false);

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const data = await permissionRequestService.listAll(statusFilter === 'all' ? undefined : statusFilter);
      setRequests(data);
    } catch (err: any) {
      toast.error('Failed to load permission requests', { description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRequests();
    }
  }, [isOpen, statusFilter]);

  if (!isOpen) return null;

  const handleReview = async (id: number, decision: 'approved' | 'rejected') => {
    setReviewingId(id);
    try {
      const note = adminNotes[id] || '';
      const res = await permissionRequestService.review(id, {
        status: decision,
        admin_notes: note.trim() || undefined
      });

      toast.success(`Request #${id} ${decision.toUpperCase()} successfully!`, {
        description: res.message
      });

      // If approved a date change or permission, refresh system context
      await refreshWorkingDate();

      // Update local state
      setRequests(prev => prev.map(r => r.id === id ? { ...r, ...res.request } : r));
      setActiveNoteInputId(null);
      if (inspectingWhatsAppInfo?.request_id === id) {
        setInspectingWhatsAppInfo(null);
      }
      onReviewed?.();
    } catch (err: any) {
      toast.error(`Failed to ${decision} request`, {
        description: err.message
      });
    } finally {
      setReviewingId(null);
    }
  };

  const handleInspectWhatsApp = async (req: PermissionRequest) => {
    setLoadingWhatsAppId(req.id);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    try {
      const info = await whatsAppService.getRequestMessage(req.id);
      if (info && info.formatted_message) {
        setInspectingWhatsAppInfo(info);
      } else {
        // Fallback to client-side formatted message if backend returned partial data
        const fallbackMsg = formatClientWhatsAppMessage(req, origin);
        setInspectingWhatsAppInfo({
          request_id: req.id,
          status: req.status,
          formatted_message: fallbackMsg,
          direct_whatsapp_url: buildWhatsAppUrl(fallbackMsg),
          admin_phones: [],
          approve_url: `${origin}/api/public/whatsapp-action?request_id=${req.id}&action=approved`,
          reject_url: `${origin}/api/public/whatsapp-action?request_id=${req.id}&action=rejected`,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        });
      }
    } catch (err: any) {
      console.warn('Failed to load WhatsApp message with tokens:', err);
      const fallbackMsg = formatClientWhatsAppMessage(req, origin);
      setInspectingWhatsAppInfo({
        request_id: req.id,
        status: req.status,
        formatted_message: fallbackMsg,
        direct_whatsapp_url: buildWhatsAppUrl(fallbackMsg),
        admin_phones: [],
        approve_url: `${origin}/api/public/whatsapp-action?request_id=${req.id}&action=approved`,
        reject_url: `${origin}/api/public/whatsapp-action?request_id=${req.id}&action=rejected`,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      });
    } finally {
      setLoadingWhatsAppId(null);
    }
  };

  const filteredRequests = requests.filter(r => {
    if (typeFilter === 'all') return true;
    return r.request_type === typeFilter;
  });

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'cutting_consumption_correction':
        return <Scissors className="w-4 h-4 text-amber-500" />;
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
      case 'cutting_consumption_correction': return 'Fabric Consumption Correction';
      case 'old_stock_requisition': return 'Old Stock Requisition';
      case 'dept_access': return 'Department Access';
      case 'page_access': return 'Page & Feature Access';
      case 'datetime_change': return 'Production Date/Time Change';
      default: return type;
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
        <div 
          className="bg-bg2 border border-bg4 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 border-b border-bg4 bg-bg3/40 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-po/10 text-po flex items-center justify-center border border-po/20 shadow-inner">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-text uppercase tracking-tight">
                    Admin Approval Center
                  </h3>
                  {pendingCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-po text-white text-[10px] font-bold font-mono uppercase tracking-wider animate-pulse">
                      {pendingCount} Pending
                    </span>
                  )}
                </div>
                <p className="text-xs text-text3 font-medium">
                  Review & authorize floor stock requisitions, permissions & system date adjustments
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsDirectGrantModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-po/10 hover:bg-po/20 text-po border border-po/30 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs"
                title="Directly Grant & Assign Access Permissions to Any User"
              >
                <Key className="w-3.5 h-3.5 text-po" />
                <span>Grant User Access</span>
              </button>
              <button
                onClick={() => setIsWhatsAppSettingsOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 rounded-xl text-xs font-bold transition-all cursor-pointer"
                title="Configure WhatsApp Numbers & 1-Click Bot"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">WhatsApp Config</span>
              </button>
              <button
                onClick={fetchRequests}
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

          {/* Filter Controls Bar */}
          <div className="p-3 bg-bg border-b border-bg4 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-1.5">
              {(['pending', 'all', 'approved', 'rejected'] as const).map(status => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-tight transition-all cursor-pointer ${
                    statusFilter === status
                      ? 'bg-po text-white shadow-sm'
                      : 'text-text3 hover:text-text hover:bg-bg3'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-text3 uppercase font-mono">Type:</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                className="bg-bg3 border border-bg4 text-text text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-po font-medium"
              >
                <option value="all">All Request Types</option>
                <option value="cutting_consumption_correction">Cutting Consumption Correction</option>
                <option value="old_stock_requisition">Old Stock Requisition</option>
                <option value="dept_access">Department Access</option>
                <option value="page_access">Page Access</option>
                <option value="datetime_change">Date/Time Change</option>
              </select>
            </div>
          </div>

          {/* Requests Feed */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {isLoading && requests.length === 0 ? (
              <div className="py-12 text-center text-text3 text-xs animate-pulse">
                Loading requests for review...
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="py-16 text-center">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-text mb-1">No requests pending review</p>
                <p className="text-xs text-text3">
                  All submitted stock requisitions, department access, and date changes have been processed.
                </p>
              </div>
            ) : (
              filteredRequests.map(req => {
                const isPending = req.status === 'pending';
                const isReviewing = reviewingId === req.id;
                const hasNoteInput = activeNoteInputId === req.id;

                return (
                  <div
                    key={req.id}
                    className={`p-5 bg-bg3/70 border rounded-3xl space-y-4 transition-all shadow-sm ${
                      isPending 
                        ? (req.request_type === 'old_stock_requisition' ? 'border-emerald-500/40 shadow-emerald-500/5' : 'border-po/30 shadow-po/5') 
                        : 'border-bg4'
                    }`}
                  >
                    {/* Card Top: Requester Details & Status */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-bg4 flex items-center justify-center text-text font-black text-sm uppercase shadow-inner shrink-0">
                          {req.requester_name?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-text">{req.requester_name}</p>
                            <span className="text-xs text-text3 font-mono">(@{req.requester_username})</span>
                            <span className="px-2 py-0.5 rounded-md bg-bg4 text-[10px] uppercase font-bold text-text2">
                              {req.requester_role}
                            </span>
                          </div>
                          <p className="text-[11px] text-text3 mt-0.5">
                            Assigned Dept: <span className="font-semibold text-text2">{req.requester_department}</span> • Submitted: {new Date(req.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="p-1.5 rounded-lg bg-bg4" title={req.request_type}>
                          {getTypeIcon(req.request_type)}
                        </div>
                        <span className={`text-xs font-bold uppercase tracking-tight ${req.request_type === 'old_stock_requisition' ? 'text-emerald-500' : 'text-po'}`}>
                          {getTypeName(req.request_type)}
                        </span>
                      </div>
                    </div>

                    {/* Requested Items Highlight Box */}
                    <div className="p-4 bg-bg rounded-2xl border border-bg4 space-y-2.5">
                      {/* Cutting Consumption Correction details */}
                      {req.request_type === 'cutting_consumption_correction' && req.consumption_correction_data && (
                        <div className="space-y-3">
                          <span className="text-[10px] font-mono text-amber-500 font-bold uppercase block">
                            Requested Fabric Consumption Correction:
                          </span>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            <div className="p-2.5 rounded-xl bg-bg3 border border-bg4">
                              <span className="text-[10px] text-text3 font-mono block">PO # & Style</span>
                              <span className="text-xs font-mono font-bold text-text uppercase">
                                {req.consumption_correction_data.po_number || '-'} / {req.consumption_correction_data.style_num || '-'}
                              </span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-bg3 border border-bg4">
                              <span className="text-[10px] text-text3 font-mono block">Fabric & Color</span>
                              <span className="text-xs font-bold text-text uppercase">
                                {req.consumption_correction_data.fabric_name} ({req.consumption_correction_data.color})
                              </span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
                              <span className="text-[10px] text-red-500 font-mono block">Current Weight</span>
                              <span className="text-sm font-black font-mono text-red-500 line-through">
                                {req.consumption_correction_data.current_quantity_kg.toFixed(2)} KG
                              </span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                              <span className="text-[10px] text-amber-500 font-mono block">Corrected Weight</span>
                              <span className="text-sm font-black font-mono text-amber-500">
                                {req.consumption_correction_data.new_quantity_kg.toFixed(2)} KG
                              </span>
                            </div>
                          </div>
                          {req.consumption_correction_data.reason && (
                            <p className="text-[11px] text-text3 bg-bg3/50 p-2.5 rounded-xl border border-bg4">
                              <span className="font-bold text-amber-500 uppercase font-mono text-[10px] block mb-0.5">Supervisor Reason:</span>
                              {req.consumption_correction_data.reason}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Old Stock Requisition details */}
                      {req.request_type === 'old_stock_requisition' && req.requisition_data && (
                        <div className="space-y-3">
                          <span className="text-[10px] font-mono text-emerald-500 font-bold uppercase block">
                            Requested Garment Stock Release:
                          </span>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                            <div className="p-2.5 rounded-xl bg-bg3 border border-bg4">
                              <span className="text-[10px] text-text3 font-mono block">Style #</span>
                              <span className="text-xs font-mono font-bold text-text uppercase">{req.requisition_data.style_num}</span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-bg3 border border-bg4">
                              <span className="text-[10px] text-text3 font-mono block">Color & Size</span>
                              <span className="text-xs font-bold text-text uppercase">{req.requisition_data.color} / {req.requisition_data.size}</span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                              <span className="text-[10px] text-emerald-500 font-mono block">Quantity</span>
                              <span className="text-sm font-black font-mono text-emerald-500">{req.requisition_data.quantity} Pcs</span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-bg3 border border-bg4">
                              <span className="text-[10px] text-text3 font-mono block">Target Floor</span>
                              <span className="text-xs font-bold text-text uppercase">{req.requisition_data.target_department}</span>
                            </div>
                          </div>
                          {req.requisition_data.line_number && (
                            <p className="text-[11px] text-text3">
                              Allocated to: <span className="text-text font-bold uppercase">{req.requisition_data.line_number}</span>
                            </p>
                          )}
                        </div>
                      )}

                      {req.request_type === 'dept_access' && req.requested_items && (
                        <div>
                          <span className="text-[10px] font-mono text-text3 uppercase block mb-1">
                            Requested Department Access:
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {req.requested_items.map((dept: string, i: number) => (
                              <span key={i} className="px-2.5 py-1 rounded-xl bg-po/10 text-po border border-po/20 font-bold uppercase text-xs">
                                + {dept} Department
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {req.request_type === 'page_access' && req.requested_items && (
                        <div>
                          <span className="text-[10px] font-mono text-text3 uppercase block mb-1">
                            Requested Modules / Pages:
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {req.requested_items.map((page: string, i: number) => (
                              <span key={i} className="px-2.5 py-1 rounded-xl bg-po/10 text-po border border-po/20 font-bold uppercase text-xs">
                                + {page}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {req.request_type === 'datetime_change' && req.requested_datetime && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-mono text-text3 uppercase block">
                            Requested Working Date & Time:
                          </span>
                          <div className="p-2.5 rounded-xl bg-bg3 border border-bg4 font-mono font-bold text-sm text-po flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-po" />
                            <span>{req.requested_datetime}</span>
                          </div>
                        </div>
                      )}

                      {req.reason && (
                        <div className="pt-2 border-t border-bg4/40">
                          <span className="text-[10px] font-mono text-text3 uppercase block">User's Reason / Justification:</span>
                          <p className="text-xs text-text2 italic mt-0.5 bg-bg3/50 p-2.5 rounded-xl border border-bg4/30">
                            "{req.reason}"
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Admin Notes Input for pending review */}
                    {isPending && (
                      <div className="space-y-2">
                        {hasNoteInput ? (
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-mono text-text3 uppercase flex items-center gap-1.5">
                              <MessageSquare className="w-3 h-3 text-po" /> Admin Feedback / Note to Requester (Optional):
                            </label>
                            <input
                              type="text"
                              value={adminNotes[req.id] || ''}
                              onChange={(e) => setAdminNotes({ ...adminNotes, [req.id]: e.target.value })}
                              placeholder="e.g., Approved release for Line 1; check supervisor inventory."
                              className="w-full bg-bg border border-bg4 rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-po"
                            />
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setActiveNoteInputId(req.id)}
                            className="text-[11px] text-text3 hover:text-po flex items-center gap-1 transition-colors"
                          >
                            <MessageSquare className="w-3 h-3" /> + Add feedback note to user
                          </button>
                        )}
                      </div>
                    )}

                    {/* Card Bottom Actions */}
                    {isPending ? (
                      <div className="pt-2 border-t border-bg4 flex flex-wrap items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => handleInspectWhatsApp(req)}
                          disabled={loadingWhatsAppId === req.id}
                          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                          {loadingWhatsAppId === req.id ? 'Loading...' : 'WhatsApp 1-Click Links'}
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isReviewing}
                            onClick={() => handleReview(req.id, 'rejected')}
                            className="flex items-center gap-1.5 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Reject
                          </button>

                          <button
                            type="button"
                            disabled={isReviewing}
                            onClick={() => handleReview(req.id, 'approved')}
                            className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Approve & Execute
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-2 border-t border-bg4 flex items-center justify-between text-xs flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          {req.status === 'approved' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-500 font-bold">
                              <CheckCircle2 className="w-4 h-4" /> Approved & Injected
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-rose-500 font-bold">
                              <XCircle className="w-4 h-4" /> Declined
                            </span>
                          )}
                          <span className="text-text3 text-[11px]">
                            by {req.reviewer_name || 'Admin'} on {req.reviewed_at ? new Date(req.reviewed_at).toLocaleDateString() : ''}
                          </span>
                        </div>
                        {req.admin_notes && (
                          <span className="text-text2 italic text-[11px]">
                            Note: "{req.admin_notes}"
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* WhatsApp Message Inspector Modal */}
      {inspectingWhatsAppInfo && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-bg2 border border-bg4 rounded-3xl w-full max-w-xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-bg4 pb-4">
              <div className="flex items-center gap-2 text-emerald-500 font-bold text-sm uppercase">
                <Smartphone className="w-5 h-5" /> WhatsApp 1-Click Remote Dispatch
              </div>
              <button 
                onClick={() => setInspectingWhatsAppInfo(null)}
                className="p-1 rounded-lg text-text3 hover:text-text cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-text3">
              This structured message contains secure, single-use approval & rejection tokens for Request #{inspectingWhatsAppInfo.request_id}.
            </p>

            {/* WhatsApp Message Content Box */}
            <div className="p-4 bg-bg rounded-2xl border border-bg4 space-y-3 shadow-inner">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-emerald-500" /> WhatsApp Message Content
                </span>
                <span className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-2.5 py-0.5 rounded-full font-bold border border-emerald-500/20">
                  Single-Use Tokens Ready
                </span>
              </div>

              <div className="p-3.5 bg-bg3 rounded-xl border border-bg4 font-mono text-[11px] text-text2 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed select-all">
                {inspectingWhatsAppInfo.formatted_message}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={async () => {
                    const phone = inspectingWhatsAppInfo.admin_phones?.[0] || '';
                    await dispatchWhatsApp({
                      text: inspectingWhatsAppInfo.formatted_message,
                      phone,
                      preferWeb: false
                    });
                  }}
                  className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition-all cursor-pointer text-center"
                >
                  <Send className="w-4 h-4" />
                  Open WhatsApp (App)
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    const phone = inspectingWhatsAppInfo.admin_phones?.[0] || '';
                    await dispatchWhatsApp({
                      text: inspectingWhatsAppInfo.formatted_message,
                      phone,
                      preferWeb: true
                    });
                  }}
                  className="py-3 px-4 bg-bg3 hover:bg-bg4 text-emerald-500 border border-emerald-500/30 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer text-center"
                >
                  <Globe className="w-4 h-4" />
                  WhatsApp Web
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    const ok = await copyToClipboard(inspectingWhatsAppInfo.formatted_message);
                    if (ok) {
                      setCopiedMessage(true);
                      toast.success('WhatsApp text copied to clipboard');
                      setTimeout(() => setCopiedMessage(false), 2000);
                    }
                  }}
                  className="py-3 px-4 bg-bg3 hover:bg-bg4 text-text border border-bg4 rounded-xl text-xs font-bold uppercase flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  {copiedMessage ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  {copiedMessage ? 'Copied' : 'Copy Text'}
                </button>
              </div>
            </div>

            {/* Direct 1-Click Test Links for Admin / Simulation */}
            <div className="p-4 bg-bg3/50 border border-bg4 rounded-2xl space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-text uppercase tracking-wider flex items-center gap-2 text-[11px]">
                  <Sparkles className="w-3.5 h-3.5 text-po" /> 1-Tap Remote Mobile Links (Single-Use)
                </span>
                <span className="text-[10px] text-text3 font-mono">
                  Action Tokens
                </span>
              </div>

              <div className="space-y-2">
                {/* Approve URL */}
                <div className="flex items-center gap-2 p-2 bg-bg rounded-xl border border-emerald-500/20">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    readOnly
                    value={inspectingWhatsAppInfo.approve_url}
                    className="flex-1 bg-transparent text-[10px] font-mono text-emerald-400 select-all focus:outline-none truncate"
                  />
                  <a
                    href={inspectingWhatsAppInfo.approve_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold uppercase shrink-0 transition-colors"
                  >
                    Test Approve
                  </a>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await copyToClipboard(inspectingWhatsAppInfo.approve_url);
                      if (ok) {
                        setCopiedApproveLink(true);
                        toast.success('Approve link copied to clipboard');
                        setTimeout(() => setCopiedApproveLink(false), 2000);
                      }
                    }}
                    className="p-1 text-text3 hover:text-text shrink-0 cursor-pointer"
                    title="Copy Link"
                  >
                    {copiedApproveLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Reject URL */}
                <div className="flex items-center gap-2 p-2 bg-bg rounded-xl border border-rose-500/20">
                  <div className="w-6 h-6 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    readOnly
                    value={inspectingWhatsAppInfo.reject_url}
                    className="flex-1 bg-transparent text-[10px] font-mono text-rose-400 select-all focus:outline-none truncate"
                  />
                  <a
                    href={inspectingWhatsAppInfo.reject_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[10px] font-bold uppercase shrink-0 transition-colors"
                  >
                    Test Reject
                  </a>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await copyToClipboard(inspectingWhatsAppInfo.reject_url);
                      if (ok) {
                        setCopiedRejectLink(true);
                        toast.success('Reject link copied to clipboard');
                        setTimeout(() => setCopiedRejectLink(false), 2000);
                      }
                    }}
                    className="p-1 text-text3 hover:text-text shrink-0 cursor-pointer"
                    title="Copy Link"
                  >
                    {copiedRejectLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectingWhatsAppInfo(null)}
                className="px-6 py-2.5 bg-bg3 hover:bg-bg4 text-text rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Direct Permission Grant Modal (Admin Will) */}
      <DirectPermissionGrantModal
        isOpen={isDirectGrantModalOpen}
        onClose={() => setIsDirectGrantModalOpen(false)}
        onGranted={() => {
          fetchRequests();
          onReviewed?.();
        }}
      />

      {/* WhatsApp Configuration Modal */}
      <WhatsAppSettingsModal
        isOpen={isWhatsAppSettingsOpen}
        onClose={() => setIsWhatsAppSettingsOpen(false)}
      />
    </>
  );
};
