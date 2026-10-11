import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, Clock, Building2, LayoutDashboard, Send, X, 
  CheckCircle2, AlertCircle, Info, Calendar, Sparkles, HelpCircle,
  Package, Smartphone, ExternalLink, Copy, Check, MessageSquare, Globe
} from 'lucide-react';
import { permissionRequestService, departmentService, customFormService, whatsAppService } from '../services/erpService';
import { useAuth } from '../context/AuthContext';
import { useSystem } from '../context/SystemContext';
import { SYSTEM_PAGES, SystemPageDef } from './PermissionsManager';
import { PermissionRequestType, WhatsAppRequestInfo } from '../types';
import { copyToClipboard, dispatchWhatsApp } from '../lib/utils';
import { toast } from 'sonner';

const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];

interface RequestAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialType?: PermissionRequestType;
  initialItem?: string; // e.g. a specific page id or department name
  onSubmitted?: () => void;
}

export const RequestAccessModal: React.FC<RequestAccessModalProps> = ({
  isOpen,
  onClose,
  initialType = 'dept_access',
  initialItem,
  onSubmitted
}) => {
  const { user } = useAuth();
  const { workingDate } = useSystem();

  const [requestType, setRequestType] = useState<PermissionRequestType>(initialType);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [requestedDateTime, setRequestedDateTime] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [availableDepts, setAvailableDepts] = useState<{ id: number; name: string }[]>([]);

  // Old Stock Requisition Form State
  const [reqStyle, setReqStyle] = useState('');
  const [reqColor, setReqColor] = useState('');
  const [reqSize, setReqSize] = useState('M');
  const [reqQuantity, setReqQuantity] = useState('');
  const [reqTargetDept, setReqTargetDept] = useState<'feeding' | 'stitching' | 'finishing' | 'packing' | 'carton'>('finishing');
  const [reqLineNumber, setReqLineNumber] = useState('LINE 1');
  const [reqCartons, setReqCartons] = useState('');
  const [reqPcsPerCarton, setReqPcsPerCarton] = useState('');
  const [reqPoNumber, setReqPoNumber] = useState('');

  // Autocomplete data
  const [fetchableSources, setFetchableSources] = useState<{
    styles: string[];
    colors: string[];
    pos: { po_number: string; buyer: string }[];
  }>({ styles: [], colors: [], pos: [] });

  // Post-submission WhatsApp prompt state
  const [submittedWhatsAppInfo, setSubmittedWhatsAppInfo] = useState<WhatsAppRequestInfo | null>(null);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [copiedApproveLink, setCopiedApproveLink] = useState(false);
  const [copiedRejectLink, setCopiedRejectLink] = useState(false);
  const [currentRequestStatus, setCurrentRequestStatus] = useState<string>('pending');
  const [isAdminQuickApproving, setIsAdminQuickApproving] = useState(false);

  // Poll request status in background when post-submission card is open
  useEffect(() => {
    if (!submittedWhatsAppInfo || currentRequestStatus !== 'pending') return;

    const interval = setInterval(async () => {
      try {
        const myReqs = await permissionRequestService.listMy();
        const thisReq = myReqs.find(r => r.id === submittedWhatsAppInfo.request_id);
        if (thisReq && thisReq.status !== 'pending') {
          setCurrentRequestStatus(thisReq.status);
          if (thisReq.status === 'approved') {
            toast.success(`Request #${thisReq.id} has been APPROVED!`, {
              description: 'Stock has been automatically allocated.'
            });
            onSubmitted?.();
          } else if (thisReq.status === 'rejected') {
            toast.error(`Request #${thisReq.id} was REJECTED.`);
            onSubmitted?.();
          }
        }
      } catch (err) {
        console.warn('Status poll error:', err);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [submittedWhatsAppInfo, currentRequestStatus, onSubmitted]);

  // Sync initial state when modal opens
  useEffect(() => {
    if (isOpen) {
      setRequestType(initialType);
      setReason('');
      setSubmittedWhatsAppInfo(null);
      setCurrentRequestStatus('pending');
      
      if (initialType === 'page_access' && initialItem) {
        setSelectedPages([initialItem]);
        setSelectedDepts([]);
      } else if (initialType === 'dept_access' && initialItem) {
        setSelectedDepts([initialItem]);
        setSelectedPages([]);
      } else {
        setSelectedPages([]);
        setSelectedDepts([]);
      }

      // Default requested datetime to current working date or local ISO
      if (workingDate) {
        const d = new Date(workingDate);
        setRequestedDateTime(d.toISOString().slice(0, 16));
      } else {
        const now = new Date();
        const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        setRequestedDateTime(localIso);
      }

      // Load sources for old stock autocomplete
      customFormService.getFetchableSources().then(res => {
        setFetchableSources({
          styles: res.styles || [],
          colors: res.colors || [],
          pos: res.pos || []
        });
      }).catch(console.error);
    }
  }, [isOpen, initialType, initialItem, workingDate]);

  // Load active system departments
  useEffect(() => {
    if (isOpen) {
      departmentService.list().then(res => {
        setAvailableDepts(res);
      }).catch(err => {
        console.warn('Failed to load departments:', err);
        setAvailableDepts([
          { id: 1, name: 'Cutting' },
          { id: 2, name: 'Stitching' },
          { id: 3, name: 'Finishing' },
          { id: 4, name: 'Packing' },
          { id: 5, name: 'Store' },
          { id: 6, name: 'Shipping' },
          { id: 7, name: 'Quality' },
          { id: 8, name: 'Admin' }
        ]);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleDept = (deptName: string) => {
    setSelectedDepts(prev => 
      prev.includes(deptName) ? prev.filter(d => d !== deptName) : [...prev, deptName]
    );
  };

  const togglePage = (pageId: string) => {
    setSelectedPages(prev => 
      prev.includes(pageId) ? prev.filter(p => p !== pageId) : [...prev, pageId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (requestType === 'dept_access' && selectedDepts.length === 0) {
      toast.error('Please select at least one department to request access for');
      return;
    }

    if (requestType === 'page_access' && selectedPages.length === 0) {
      toast.error('Please select at least one page or module to request access for');
      return;
    }

    if (requestType === 'datetime_change' && !requestedDateTime) {
      toast.error('Please select a valid date and time to request');
      return;
    }

    if (requestType === 'old_stock_requisition') {
      if (!reqStyle.trim() || !reqColor.trim() || !reqQuantity) {
        toast.error('Please specify the Style, Color, and Quantity requested from Old Stock');
        return;
      }
      const qtyNum = parseInt(reqQuantity, 10);
      if (isNaN(qtyNum) || qtyNum <= 0) {
        toast.error('Quantity must be a positive integer');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      let formattedDate: string | undefined = undefined;
      if (requestType === 'datetime_change' && requestedDateTime) {
        formattedDate = requestedDateTime.replace('T', ' ') + (requestedDateTime.length === 16 ? ':00' : '');
      }

      const res = await permissionRequestService.create({
        request_type: requestType,
        requested_items: requestType === 'dept_access' ? selectedDepts : (requestType === 'page_access' ? selectedPages : undefined),
        requested_datetime: formattedDate,
        requisition_data: requestType === 'old_stock_requisition' ? {
          style_num: reqStyle.trim(),
          color: reqColor.trim(),
          size: reqSize,
          quantity: parseInt(reqQuantity, 10),
          target_department: reqTargetDept,
          line_number: ['stitching', 'finishing'].includes(reqTargetDept) ? reqLineNumber : undefined,
          cartons: reqTargetDept === 'carton' && reqCartons ? parseInt(reqCartons, 10) : undefined,
          pcs_per_carton: reqTargetDept === 'carton' && reqPcsPerCarton ? parseInt(reqPcsPerCarton, 10) : undefined,
          po_number: reqPoNumber.trim() || undefined,
          reason: reason.trim() || undefined
        } : undefined,
        reason: reason.trim()
      });

      toast.success('Request submitted successfully!', {
        description: 'WhatsApp 1-click approval notification generated for Admin.'
      });

      // Fetch WhatsApp formatted message and links
      try {
        const waInfo = await whatsAppService.getRequestMessage(res.id);
        setSubmittedWhatsAppInfo(waInfo);
      } catch (waErr) {
        console.warn('Could not load WhatsApp dispatch info:', waErr);
        onSubmitted?.();
        onClose();
      }

      onSubmitted?.();
    } catch (err: any) {
      toast.error('Failed to submit request', {
        description: err.message || 'Please check your connection and try again.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyMessageText = async () => {
    if (submittedWhatsAppInfo?.formatted_message) {
      const ok = await copyToClipboard(submittedWhatsAppInfo.formatted_message);
      if (ok) {
        setCopiedMessage(true);
        toast.success('WhatsApp text copied to clipboard!', {
          description: 'You can paste (Ctrl+V) directly into WhatsApp chat.'
        });
        setTimeout(() => setCopiedMessage(false), 2000);
      } else {
        toast.error('Failed to copy text to clipboard');
      }
    }
  };

  const handleSendWhatsApp = async (preferWeb: boolean = false) => {
    if (!submittedWhatsAppInfo) return;
    const phone = submittedWhatsAppInfo.admin_phones?.[0] || '';
    const text = submittedWhatsAppInfo.formatted_message || '';
    await dispatchWhatsApp({
      text,
      phone,
      preferWeb
    });
  };

  const isLocalEnv = submittedWhatsAppInfo?.approve_url?.includes('localhost') || 
                     submittedWhatsAppInfo?.approve_url?.includes('127.0.0.1');

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
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-text uppercase tracking-tight flex items-center gap-2">
                Request Permission / Stock Requisition
              </h3>
              <p className="text-xs text-text3 font-medium">
                Submit an authorized request with instant WhatsApp 1-click remote approval
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl text-text3 hover:text-text hover:bg-bg4 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Successful WhatsApp Submission Card View */}
        {submittedWhatsAppInfo ? (
          <div className="p-6 space-y-5 flex-1 overflow-y-auto">
            {/* Status Header Banner */}
            {currentRequestStatus === 'approved' ? (
              <div className="p-5 bg-emerald-500/15 border-2 border-emerald-500/40 rounded-3xl text-center space-y-2 animate-in zoom-in-95">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h4 className="text-base font-bold text-emerald-500 uppercase tracking-tight">
                  Request #{submittedWhatsAppInfo.request_id} APPROVED & EXECUTED!
                </h4>
                <p className="text-xs text-text2 max-w-md mx-auto">
                  The requisition has been approved and the garments have been injected into the target department inventory.
                </p>
              </div>
            ) : currentRequestStatus === 'rejected' ? (
              <div className="p-5 bg-rose-500/15 border-2 border-rose-500/40 rounded-3xl text-center space-y-2 animate-in zoom-in-95">
                <div className="w-12 h-12 rounded-2xl bg-rose-500 text-white flex items-center justify-center mx-auto shadow-lg shadow-rose-500/30">
                  <AlertCircle className="w-7 h-7" />
                </div>
                <h4 className="text-base font-bold text-rose-500 uppercase tracking-tight">
                  Request #{submittedWhatsAppInfo.request_id} Was Declined
                </h4>
                <p className="text-xs text-text2 max-w-md mx-auto">
                  The admin has marked this request as rejected.
                </p>
              </div>
            ) : (
              <div className="p-5 bg-emerald-500/10 border border-emerald-500/30 rounded-3xl text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
                  <Smartphone className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-tight">
                  WhatsApp 1-Click Approval Request #{submittedWhatsAppInfo.request_id} Created
                </h4>
                <p className="text-xs text-text3 max-w-md mx-auto">
                  Send this notification to the Administrator. They can approve or reject the request with 1 tap directly on their smartphone without logging into the software.
                </p>
              </div>
            )}

            {/* WhatsApp Message Preview */}
            <div className="p-4 bg-bg rounded-2xl border border-bg4 space-y-3 shadow-inner">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-emerald-500" /> WhatsApp Message Content
                </span>
                <span className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-2.5 py-0.5 rounded-full font-bold border border-emerald-500/20">
                  Single-Use Tokens Ready
                </span>
              </div>

              <div className="p-3.5 bg-bg3 rounded-xl border border-bg4 font-mono text-[11px] text-text2 whitespace-pre-wrap max-h-44 overflow-y-auto leading-relaxed select-all">
                {submittedWhatsAppInfo.formatted_message}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => handleSendWhatsApp(false)}
                  className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition-all cursor-pointer text-center"
                >
                  <Send className="w-4 h-4" />
                  Open WhatsApp (App)
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => handleSendWhatsApp(true)}
                  className="py-3 px-4 bg-bg3 hover:bg-bg4 text-emerald-500 border border-emerald-500/30 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer text-center"
                >
                  <Globe className="w-4 h-4" />
                  WhatsApp Web
                </button>

                <button
                  type="button"
                  onClick={copyMessageText}
                  className="py-3 px-4 bg-bg3 hover:bg-bg4 text-text border border-bg4 rounded-xl text-xs font-bold uppercase flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  {copiedMessage ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  {copiedMessage ? 'Copied' : 'Copy Text'}
                </button>
              </div>
            </div>

            {/* Local Environment Notice */}
            {isLocalEnv && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-2.5 text-xs text-amber-600 dark:text-amber-400">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">Local Development Host Detected ({window.location.host})</p>
                  <p className="text-[11px] text-text3 leading-relaxed">
                    1-Click links use your local server address. For external phone WhatsApp taps, configure a Public URL in Settings, or use the instant test buttons below.
                  </p>
                </div>
              </div>
            )}

            {/* Direct 1-Click Test Links for Admin / Simulation */}
            <div className="p-4 bg-bg3/50 border border-bg4 rounded-2xl space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-text uppercase tracking-wider flex items-center gap-2 text-[11px]">
                  <Sparkles className="w-3.5 h-3.5 text-po" /> 1-Tap Remote Mobile Links (Single-Use)
                </span>
                <span className="text-[10px] text-text3 font-mono">
                  {isLocalEnv ? 'Localhost Action Token' : 'Live Cloud URL'}
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
                    value={submittedWhatsAppInfo.approve_url}
                    className="flex-1 bg-transparent text-[10px] font-mono text-emerald-400 select-all focus:outline-none truncate"
                  />
                  <a
                    href={submittedWhatsAppInfo.approve_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold uppercase shrink-0 transition-colors"
                  >
                    Test Approve
                  </a>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await copyToClipboard(submittedWhatsAppInfo.approve_url);
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
                    value={submittedWhatsAppInfo.reject_url}
                    className="flex-1 bg-transparent text-[10px] font-mono text-rose-400 select-all focus:outline-none truncate"
                  />
                  <a
                    href={submittedWhatsAppInfo.reject_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[10px] font-bold uppercase shrink-0 transition-colors"
                  >
                    Test Reject
                  </a>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await copyToClipboard(submittedWhatsAppInfo.reject_url);
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

              {/* Admin direct in-app quick approval if user is admin */}
              {user?.role === 'admin' && currentRequestStatus === 'pending' && (
                <div className="pt-2 border-t border-bg4 flex items-center justify-between">
                  <span className="text-[11px] text-text3">Logged in as Administrator:</span>
                  <button
                    type="button"
                    disabled={isAdminQuickApproving}
                    onClick={async () => {
                      setIsAdminQuickApproving(true);
                      try {
                        await permissionRequestService.review(submittedWhatsAppInfo.request_id, {
                          status: 'approved',
                          admin_notes: 'Approved directly from in-app requisition screen'
                        });
                        setCurrentRequestStatus('approved');
                        toast.success('Approved successfully in-app!');
                        onSubmitted?.();
                      } catch (err: any) {
                        toast.error('Failed to approve', { description: err.message });
                      } finally {
                        setIsAdminQuickApproving(false);
                      }
                    }}
                    className="px-3 py-1.5 bg-po hover:bg-po/90 text-white rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                  >
                    {isAdminQuickApproving ? 'Approving...' : 'Admin Quick Approve In-App'}
                  </button>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 bg-bg3 hover:bg-bg4 text-text rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Close Window
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Tab Navigation */}
            <div className="p-3 bg-bg border-b border-bg4 grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setRequestType('old_stock_requisition')}
                className={`flex items-center justify-center gap-2 py-2.5 px-2.5 rounded-xl text-xs font-bold uppercase tracking-tight transition-all cursor-pointer ${
                  requestType === 'old_stock_requisition'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                    : 'text-text2 hover:text-text hover:bg-bg3'
                }`}
              >
                <Package className="w-4 h-4" />
                <span>Old Stock</span>
              </button>

              <button
                type="button"
                onClick={() => setRequestType('dept_access')}
                className={`flex items-center justify-center gap-2 py-2.5 px-2.5 rounded-xl text-xs font-bold uppercase tracking-tight transition-all cursor-pointer ${
                  requestType === 'dept_access'
                    ? 'bg-po text-white shadow-md shadow-po/20'
                    : 'text-text2 hover:text-text hover:bg-bg3'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>Dept Access</span>
              </button>

              <button
                type="button"
                onClick={() => setRequestType('page_access')}
                className={`flex items-center justify-center gap-2 py-2.5 px-2.5 rounded-xl text-xs font-bold uppercase tracking-tight transition-all cursor-pointer ${
                  requestType === 'page_access'
                    ? 'bg-po text-white shadow-md shadow-po/20'
                    : 'text-text2 hover:text-text hover:bg-bg3'
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Page Access</span>
              </button>

              <button
                type="button"
                onClick={() => setRequestType('datetime_change')}
                className={`flex items-center justify-center gap-2 py-2.5 px-2.5 rounded-xl text-xs font-bold uppercase tracking-tight transition-all cursor-pointer ${
                  requestType === 'datetime_change'
                    ? 'bg-po text-white shadow-md shadow-po/20'
                    : 'text-text2 hover:text-text hover:bg-bg3'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>Date & Time</span>
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* User Profile Context */}
              <div className="p-3.5 bg-bg3/60 border border-bg4 rounded-2xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-bg4 flex items-center justify-center font-bold text-text uppercase">
                    {user?.full_name?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <p className="font-bold text-text">{user?.full_name} <span className="text-text3 font-normal">(@{user?.username})</span></p>
                    <p className="text-text3 text-[11px]">Primary Dept: <span className="text-po font-semibold">{user?.department}</span> • Role: <span className="uppercase font-semibold">{user?.role}</span></p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 text-[10px] font-mono text-emerald-500 font-bold uppercase">
                    <Smartphone className="w-3 h-3" /> WhatsApp Enabled
                  </span>
                </div>
              </div>

              {/* 1. Old Stock Requisition Section */}
              {requestType === 'old_stock_requisition' && (
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl text-xs text-text2 space-y-1">
                    <p className="font-bold text-emerald-500 flex items-center gap-1.5 uppercase">
                      <Package className="w-4 h-4" /> Controlled Stock Release Workflow
                    </p>
                    <p className="text-text3 text-[11px]">
                      Specify the garment item and quantity needed. Upon Admin WhatsApp 1-Click approval, it will be automatically injected into your target department inventory.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Style Num */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-text uppercase tracking-wider">Style # / Code *</label>
                      <input
                        type="text"
                        list="avail-styles"
                        value={reqStyle}
                        onChange={(e) => setReqStyle(e.target.value)}
                        placeholder="e.g. ST-2024-V"
                        className="w-full bg-bg3 border border-bg4 rounded-xl px-3.5 py-2.5 text-xs text-text focus:outline-none focus:border-emerald-500 uppercase font-mono font-bold"
                        required
                      />
                      <datalist id="avail-styles">
                        {fetchableSources.styles.map((s, i) => <option key={i} value={s} />)}
                      </datalist>
                    </div>

                    {/* Color */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-text uppercase tracking-wider">Color *</label>
                      <input
                        type="text"
                        list="avail-colors"
                        value={reqColor}
                        onChange={(e) => setReqColor(e.target.value)}
                        placeholder="e.g. Black / Navy"
                        className="w-full bg-bg3 border border-bg4 rounded-xl px-3.5 py-2.5 text-xs text-text focus:outline-none focus:border-emerald-500 uppercase font-mono"
                        required
                      />
                      <datalist id="avail-colors">
                        {fetchableSources.colors.map((c, i) => <option key={i} value={c} />)}
                      </datalist>
                    </div>

                    {/* Size */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-text uppercase tracking-wider">Size *</label>
                      <div className="flex flex-wrap gap-1.5">
                        {SIZES.map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => setReqSize(sz)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                              reqSize === sz
                                ? 'bg-emerald-600 text-white shadow-md'
                                : 'bg-bg3 border border-bg4 text-text hover:border-text3'
                            }`}
                          >
                            {sz}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Quantity */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-text uppercase tracking-wider">Quantity (Pcs) *</label>
                      <input
                        type="number"
                        min="1"
                        value={reqQuantity}
                        onChange={(e) => setReqQuantity(e.target.value)}
                        placeholder="e.g. 50"
                        className="w-full bg-bg3 border border-bg4 rounded-xl px-3.5 py-2.5 text-xs text-text focus:outline-none focus:border-emerald-500 font-mono font-bold"
                        required
                      />
                    </div>

                    {/* Target Department Store */}
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-xs font-bold text-text uppercase tracking-wider">Target Floor Department Store *</label>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {[
                          { id: 'feeding', label: 'Feeding Store' },
                          { id: 'stitching', label: 'Stitching Floor' },
                          { id: 'finishing', label: 'Finishing Floor' },
                          { id: 'packing', label: 'Packing Store' },
                          { id: 'carton', label: 'Carton Store' },
                        ].map(d => (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => setReqTargetDept(d.id as any)}
                            className={`py-2 px-2 text-center rounded-xl text-xs font-bold uppercase transition-all cursor-pointer ${
                              reqTargetDept === d.id
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'bg-bg3 border border-bg4 text-text hover:border-text3'
                            }`}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Line Number for Stitching/Finishing */}
                    {['stitching', 'finishing'].includes(reqTargetDept) && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-text uppercase tracking-wider">Line Number</label>
                        <select
                          value={reqLineNumber}
                          onChange={(e) => setReqLineNumber(e.target.value)}
                          className="w-full bg-bg3 border border-bg4 rounded-xl px-3.5 py-2.5 text-xs text-text focus:outline-none focus:border-emerald-500"
                        >
                          {['LINE 1', 'LINE 2', 'LINE 3', 'LINE 4', 'LINE 5', 'SAMPLE LINE'].map(l => (
                            <option key={l} value={l}>{l}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Specific PO Number (Optional) */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-text uppercase tracking-wider">Target PO # (Optional)</label>
                      <input
                        type="text"
                        list="avail-pos"
                        value={reqPoNumber}
                        onChange={(e) => setReqPoNumber(e.target.value)}
                        placeholder="Leave blank for auto-generated Virtual PO"
                        className="w-full bg-bg3 border border-bg4 rounded-xl px-3.5 py-2.5 text-xs text-text focus:outline-none focus:border-emerald-500 font-mono"
                      />
                      <datalist id="avail-pos">
                        {fetchableSources.pos.map((p, i) => (
                          <option key={i} value={p.po_number}>{p.po_number} ({p.buyer})</option>
                        ))}
                      </datalist>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. Department Access Selection */}
              {requestType === 'dept_access' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-po" /> Select Department(s) Needed
                    </label>
                    <span className="text-[11px] text-text3">
                      {selectedDepts.length} selected
                    </span>
                  </div>
                  <p className="text-xs text-text3">
                    Choose the factory department workflows you require access to operate in:
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                    {availableDepts.map((d) => {
                      const isCurrent = user?.department === d.name || (user?.allowed_departments && user.allowed_departments.includes(d.name));
                      const isSelected = selectedDepts.includes(d.name);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => !isCurrent && toggleDept(d.name)}
                          disabled={isCurrent}
                          className={`p-3 rounded-2xl border text-left flex items-center justify-between transition-all ${
                            isCurrent 
                              ? 'bg-bg3/30 border-bg4 text-text3 opacity-60 cursor-not-allowed'
                              : isSelected
                                ? 'bg-po/10 border-po text-po shadow-sm'
                                : 'bg-bg3 border-bg4 text-text hover:border-text3/40'
                          }`}
                        >
                          <div className="truncate pr-2">
                            <p className="text-xs font-bold uppercase truncate">{d.name}</p>
                            <p className="text-[10px] text-text3">
                              {isCurrent ? 'Already Granted' : 'Request Access'}
                            </p>
                          </div>
                          {isCurrent ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          ) : isSelected ? (
                            <div className="w-4 h-4 rounded-md bg-po text-white flex items-center justify-center shrink-0">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </div>
                          ) : (
                            <div className="w-4 h-4 rounded-md border border-bg4 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. Page Access Selection */}
              {requestType === 'page_access' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-2">
                      <LayoutDashboard className="w-4 h-4 text-po" /> Select Page(s) & Features
                    </label>
                    <span className="text-[11px] text-text3">
                      {selectedPages.length} selected
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto p-1">
                    {SYSTEM_PAGES.map((page) => {
                      const isCurrent = user?.allowed_pages && user.allowed_pages.includes(page.id);
                      const isSelected = selectedPages.includes(page.id);
                      const PageIcon = page.icon;

                      return (
                        <button
                          key={page.id}
                          type="button"
                          onClick={() => !isCurrent && togglePage(page.id)}
                          disabled={isCurrent}
                          className={`p-3 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                            isCurrent 
                              ? 'bg-bg3/30 border-bg4 text-text3 opacity-60 cursor-not-allowed'
                              : isSelected
                                ? 'bg-po/10 border-po text-po shadow-sm'
                                : 'bg-bg3 border-bg4 text-text hover:border-text3/40'
                          }`}
                        >
                          <div className={`p-2 rounded-xl shrink-0 ${isSelected ? 'bg-po text-white' : 'bg-bg4 text-text2'}`}>
                            <PageIcon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold uppercase truncate">{page.label}</p>
                              {isCurrent ? (
                                <span className="text-[10px] text-emerald-500 font-bold">Active</span>
                              ) : isSelected ? (
                                <span className="text-[10px] text-po font-bold">Selected</span>
                              ) : null}
                            </div>
                            <p className="text-[10px] text-text3 line-clamp-1 mt-0.5">{page.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 4. Date & Time Selection */}
              {requestType === 'datetime_change' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-2">
                      <Clock className="w-4 h-4 text-po" /> Requested Production Working Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      value={requestedDateTime}
                      onChange={(e) => setRequestedDateTime(e.target.value)}
                      className="w-full bg-bg3 border border-bg4 rounded-2xl p-3.5 text-sm font-mono font-bold text-text focus:outline-none focus:border-po transition-colors"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Justification / Reason */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-2">
                  <Info className="w-4 h-4 text-po" /> Justification / Operational Reason
                </label>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Required for urgent order replenishment; supervisor on floor needs stock."
                  className="w-full bg-bg3 border border-bg4 rounded-2xl p-3 text-xs text-text placeholder:text-text3/50 focus:outline-none focus:border-po transition-colors resize-none"
                  required
                />
              </div>

              {/* Footer Actions */}
              <div className="pt-2 flex items-center justify-end gap-3 border-t border-bg4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 bg-bg3 hover:bg-bg4 text-text2 hover:text-text rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`flex items-center gap-2 px-6 py-2.5 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg transition-all disabled:opacity-50 cursor-pointer ${
                    requestType === 'old_stock_requisition' 
                      ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20' 
                      : 'bg-po hover:bg-po/90 shadow-po/20'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  {isSubmitting ? 'Submitting...' : 'Submit Request with WhatsApp'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
