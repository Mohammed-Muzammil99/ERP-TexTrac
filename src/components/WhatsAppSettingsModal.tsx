import React, { useState, useEffect } from 'react';
import { 
  Phone, Send, CheckCircle2, AlertCircle, RefreshCw, X, Shield, 
  Smartphone, ExternalLink, Key, Copy, Check, MessageSquare, Radio, HelpCircle
} from 'lucide-react';
import { whatsAppService } from '../services/erpService';
import { WhatsAppSettings } from '../types';
import { copyToClipboard, dispatchWhatsApp } from '../lib/utils';
import { toast } from 'sonner';

interface WhatsAppSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WhatsAppSettingsModal: React.FC<WhatsAppSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [settings, setSettings] = useState<WhatsAppSettings>({
    admin_phones: '',
    enabled: true,
    auto_dispatch: true
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const webhookUrl = `${window.location.origin}/api/whatsapp/webhook`;

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const data = await whatsAppService.getSettings();
      setSettings(data);
      if (data.admin_phones) {
        const firstPhone = data.admin_phones.split(',')[0].trim();
        setTestPhone(firstPhone);
      }
    } catch (err: any) {
      toast.error('Failed to load WhatsApp settings', { description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await whatsAppService.saveSettings(settings);
      toast.success('WhatsApp Remote Approval settings saved successfully!');
      onClose();
    } catch (err: any) {
      toast.error('Failed to save WhatsApp settings', { description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!testPhone.trim()) {
      toast.error('Please provide a test phone number with country code (e.g. +919876543210)');
      return;
    }

    setIsSendingTest(true);
    try {
      const res = await whatsAppService.sendTest(testPhone.trim());
      toast.success('Test message link prepared!');
      await dispatchWhatsApp({
        text: '🔔 *Test WhatsApp Notification from Production ERP*',
        url: res.direct_url
      });
    } catch (err: any) {
      toast.error('Failed to generate test message', { description: err.message });
    } finally {
      setIsSendingTest(false);
    }
  };

  const copyWebhook = async () => {
    const ok = await copyToClipboard(webhookUrl);
    if (ok) {
      setCopiedWebhook(true);
      toast.success('Webhook URL copied to clipboard');
      setTimeout(() => setCopiedWebhook(false), 2000);
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
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20 shadow-inner">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-text uppercase tracking-tight">
                  WhatsApp Remote Approvals
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[10px] font-mono font-bold uppercase">
                  1-Click Mobile Actions
                </span>
              </div>
              <p className="text-xs text-text3 font-medium">
                Enable Admins to approve/reject stock requisitions & permissions directly from WhatsApp
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

        {/* Content */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Feature Overview */}
          <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl space-y-2 text-xs text-text2">
            <div className="flex items-center gap-2 text-emerald-500 font-bold uppercase tracking-wider">
              <Radio className="w-4 h-4 animate-pulse" /> How WhatsApp Remote Approvals Work
            </div>
            <ul className="list-disc list-inside space-y-1 text-text3 text-[11px] leading-relaxed">
              <li>When a supervisor submits an <strong>Old Stock Requisition</strong> or <strong>Permission Request</strong>, a formatted message with secure, single-use 1-click links is created.</li>
              <li>Admin taps <strong>✅ 1-Click Approve</strong> or <strong>❌ Reject</strong> in WhatsApp on their smartphone.</li>
              <li>The system securely executes the stock allocation and updates audit logs with the verified real-time timestamp without requiring the Admin to log in to the ERP.</li>
            </ul>
          </div>

          {/* Admin Phone Numbers */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-text uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-emerald-500" /> Admin WhatsApp Phone Numbers
              </span>
              <span className="text-[10px] font-normal text-text3 font-mono">Include country code</span>
            </label>
            <input
              type="text"
              value={settings.admin_phones}
              onChange={(e) => setSettings({ ...settings, admin_phones: e.target.value })}
              placeholder="e.g. +919876543210, +919123456780"
              className="w-full bg-bg3 border border-bg4 rounded-xl px-4 py-3 text-xs text-text focus:outline-none focus:border-emerald-500 font-mono transition-colors"
            />
            <p className="text-[11px] text-text3">
              Comma-separated numbers that receive stock & access requests on WhatsApp.
            </p>
          </div>

          {/* Public ERP Domain (For WhatsApp 1-Click Links) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-emerald-500" /> Public ERP Base URL (Domain)
              </label>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, public_app_url: window.location.origin })}
                className="text-[10px] text-emerald-500 hover:text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" /> Auto-Detect Current ({window.location.host})
              </button>
            </div>
            <input
              type="text"
              value={settings.public_app_url || ''}
              onChange={(e) => setSettings({ ...settings, public_app_url: e.target.value })}
              placeholder={`e.g. ${window.location.origin}`}
              className="w-full bg-bg3 border border-bg4 rounded-xl px-4 py-3 text-xs text-text focus:outline-none focus:border-emerald-500 font-mono transition-colors"
            />
            <p className="text-[11px] text-text3">
              Used inside WhatsApp messages so admins clicking on their smartphones reach this live deployment directly. (Defaults to browser URL if left blank).
            </p>
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-bg3/60 border border-bg4 rounded-2xl flex items-center justify-between">
              <div className="pr-3">
                <p className="text-xs font-bold text-text uppercase">Enable WhatsApp Remote Review</p>
                <p className="text-[10px] text-text3 mt-0.5">Generate 1-click token links for requests</p>
              </div>
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                className="w-5 h-5 accent-emerald-500 rounded cursor-pointer"
              />
            </div>

            <div className="p-4 bg-bg3/60 border border-bg4 rounded-2xl flex items-center justify-between">
              <div className="pr-3">
                <p className="text-xs font-bold text-text uppercase">Auto-Dispatch Notifications</p>
                <p className="text-[10px] text-text3 mt-0.5">Prompt WhatsApp share link on submission</p>
              </div>
              <input
                type="checkbox"
                checked={settings.auto_dispatch}
                onChange={(e) => setSettings({ ...settings, auto_dispatch: e.target.checked })}
                className="w-5 h-5 accent-emerald-500 rounded cursor-pointer"
              />
            </div>
          </div>

          {/* Webhook Endpoint (For Meta Cloud API / Twilio Two-Way SMS) */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-2">
              <Key className="w-4 h-4 text-emerald-500" /> Incoming WhatsApp Webhook (Two-Way Bot)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={webhookUrl}
                className="flex-1 bg-bg3 border border-bg4 rounded-xl px-3 py-2 text-xs font-mono text-text3 select-all focus:outline-none"
              />
              <button
                type="button"
                onClick={copyWebhook}
                className="px-3.5 py-2 bg-bg3 hover:bg-bg4 text-text border border-bg4 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedWebhook ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-[11px] text-text3">
              Configure this webhook in Twilio or Meta WhatsApp Cloud API to enable replying with <code className="bg-bg3 px-1 py-0.5 rounded text-emerald-400">APPROVE [ID]</code> directly.
            </p>
          </div>

          {/* Test Message Dispatcher */}
          <div className="p-4 bg-bg rounded-2xl border border-bg4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-500" /> Test WhatsApp Connection
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="+919876543210"
                className="flex-1 bg-bg3 border border-bg4 rounded-xl px-3 py-2 text-xs text-text font-mono focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={handleSendTest}
                disabled={isSendingTest}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                {isSendingTest ? 'Opening...' : 'Send Test Link'}
              </button>
            </div>
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
              disabled={isSaving}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
