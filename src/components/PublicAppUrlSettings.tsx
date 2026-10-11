import React, { useState, useEffect } from 'react';
import { 
  Globe, 
  ExternalLink, 
  Check, 
  Copy, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  Smartphone, 
  Sparkles, 
  Save, 
  RotateCcw,
  ShieldCheck,
  Radio,
  Server,
  Info
} from 'lucide-react';
import { publicUrlService } from '../services/erpService';
import { PublicAppUrlConfig } from '../types';
import { toast } from 'sonner';
import { cn, copyToClipboard } from '../lib/utils';

interface PublicAppUrlSettingsProps {
  className?: string;
  onSaved?: (newUrl: string) => void;
  compact?: boolean;
}

export const PublicAppUrlSettings: React.FC<PublicAppUrlSettingsProps> = ({
  className,
  onSaved,
  compact = false
}) => {
  const [config, setConfig] = useState<PublicAppUrlConfig | null>(null);
  const [urlInput, setUrlInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const fetchConfig = async () => {
    setIsLoading(true);
    try {
      const data = await publicUrlService.getConfig();
      setConfig(data);
      setUrlInput(data.public_app_url || '');
      setValidationError(null);
    } catch (err: any) {
      toast.error('Failed to load Public URL setting', { description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const validateUrl = (url: string): boolean => {
    if (!url.trim()) {
      setValidationError(null);
      return true;
    }
    const trimmed = url.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      setValidationError('URL must start with http:// or https:// (e.g. https://erp.factory.com)');
      return false;
    }
    try {
      new URL(trimmed);
      setValidationError(null);
      return true;
    } catch {
      setValidationError('Please enter a valid URL format (e.g. https://erp.company.com)');
      return false;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setUrlInput(val);
    validateUrl(val);
  };

  const handleAutoDetect = () => {
    if (typeof window !== 'undefined' && window.location.origin) {
      const detected = window.location.origin;
      setUrlInput(detected);
      validateUrl(detected);
      toast.info('Detected current browser domain', { description: detected });
    }
  };

  const handleSave = async () => {
    const cleanUrl = urlInput.trim().replace(/\/$/, '');
    if (!validateUrl(cleanUrl)) {
      toast.error('Invalid URL format', { description: validationError || 'Check your URL structure.' });
      return;
    }

    setIsSaving(true);
    try {
      const res = await publicUrlService.saveConfig(cleanUrl);
      toast.success(cleanUrl ? 'Public ERP URL Saved' : 'Public ERP URL Cleared', {
        description: res.message
      });
      await fetchConfig();
      onSaved?.(cleanUrl);
    } catch (err: any) {
      toast.error('Failed to save Public ERP URL', { description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsSaving(true);
    try {
      await publicUrlService.saveConfig('');
      setUrlInput('');
      toast.success('Reverted to dynamic domain detection');
      await fetchConfig();
      onSaved?.('');
    } catch (err: any) {
      toast.error('Failed to reset Public URL', { description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const sampleBaseUrl = urlInput.trim() || (config?.effective_base_url || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'));
  const sampleApproveUrl = `${sampleBaseUrl.replace(/\/$/, '')}/api/public/whatsapp-action?token=AUTH_TOKEN_SAMPLE_1234&action=approved`;

  return (
    <div className={cn("bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl", className)}>
      {/* Header Banner */}
      <div className="p-6 border-b border-bg4 bg-bg3/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold tracking-tight text-text flex items-center gap-2">
                Public ERP Base URL & Remote Actions
              </h3>
              <p className="text-text3 text-[10px] font-mono uppercase tracking-widest mt-0.5">
                Static Domain Routing for Remote WhatsApp Mobile Approvals
              </p>
            </div>
          </div>
        </div>

        {/* Configuration Status Pill */}
        <div className="flex items-center gap-2">
          {config?.is_configured ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-full text-xs font-bold font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              STATIC DOMAIN LOCKED
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-full text-xs font-bold font-mono">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              DYNAMIC DETECTION MODE
            </span>
          )}
        </div>
      </div>

      <div className="p-6 sm:p-8 space-y-6">
        {/* URL Input Form */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-xs font-bold font-mono text-text uppercase tracking-widest flex items-center gap-2">
              <Server className="w-3.5 h-3.5 text-po" /> Public Base URL (`PUBLIC_APP_URL`)
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAutoDetect}
                className="text-[11px] text-po hover:underline font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                title="Use current browser origin"
              >
                <Radio className="w-3 h-3" /> Auto-Detect Current ({typeof window !== 'undefined' ? window.location.host : ''})
              </button>
              {config?.is_configured && (
                <>
                  <span className="text-text3">•</span>
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={isSaving}
                    className="text-[11px] text-text3 hover:text-rose-500 font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset to Dynamic
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={urlInput}
                onChange={handleInputChange}
                placeholder="e.g. https://erp.yourfactory.com or https://tunnel.yourdomain.com"
                className={cn(
                  "w-full bg-bg3 border rounded-xl px-4 py-3 text-sm font-mono text-text transition-colors focus:outline-none",
                  validationError 
                    ? "border-rose-500/80 focus:border-rose-500" 
                    : "border-bg4 focus:border-po/80 focus:ring-1 focus:ring-po/30"
                )}
              />
            </div>
            
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || Boolean(validationError)}
              className="bg-po hover:bg-po/90 disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl transition-all shadow-lg shadow-po/20 flex items-center justify-center gap-2 uppercase tracking-wider text-xs cursor-pointer shrink-0"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> Save Static URL
                </>
              )}
            </button>
          </div>

          {validationError && (
            <p className="text-xs text-rose-500 flex items-center gap-1.5 font-medium">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {validationError}
            </p>
          )}

          <p className="text-xs text-text3 leading-relaxed">
            When configured, all remote 1-tap WhatsApp requisition and approval action URLs will strictly use this static base domain. This ensures factory managers outside the factory network on cellular 4G/5G can approve requests seamlessly.
          </p>
        </div>

        {/* Live Preview of Generated Link */}
        <div className="p-4 sm:p-5 bg-bg3/60 rounded-2xl border border-bg4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-500" />
              Sample Mobile WhatsApp 1-Click Action Link
            </span>
            <span className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-2.5 py-0.5 rounded-full font-bold border border-emerald-500/20">
              Live Preview
            </span>
          </div>

          <div className="flex items-center gap-2 p-2.5 bg-bg rounded-xl border border-bg4">
            <input
              type="text"
              readOnly
              value={sampleApproveUrl}
              className="flex-1 bg-transparent text-xs font-mono text-text2 select-all focus:outline-none truncate"
            />
            <button
              type="button"
              onClick={async () => {
                const ok = await copyToClipboard(sampleApproveUrl);
                if (ok) {
                  setCopiedLink(true);
                  toast.success('Sample action URL copied to clipboard');
                  setTimeout(() => setCopiedLink(false), 2000);
                }
              }}
              className="p-2 text-text3 hover:text-text bg-bg3 rounded-lg border border-bg4 transition-colors shrink-0 cursor-pointer"
              title="Copy sample URL"
            >
              {copiedLink ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Factory Localhost vs Outside Network Guidance */}
        {!compact && (
          <div className="p-4 sm:p-5 bg-bg rounded-2xl border border-bg4/80 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-text">
              <Info className="w-4 h-4 text-po" />
              Factory Network & Remote Manager Connectivity Guide
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-text3">
              <div className="p-3 bg-bg3/40 rounded-xl border border-bg4 space-y-1.5">
                <span className="font-bold text-text flex items-center gap-1.5 text-[11px] uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> If using `localhost` or LAN IP (192.168.x.x):
                </span>
                <p className="leading-relaxed text-[11px]">
                  Only devices inside the factory connected to the same Wi-Fi can reach the server. Outside managers on 4G will get a connection error.
                </p>
              </div>

              <div className="p-3 bg-bg3/40 rounded-xl border border-bg4 space-y-1.5">
                <span className="font-bold text-emerald-500 flex items-center gap-1.5 text-[11px] uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> If using Cloudflare Tunnel or Public Domain:
                </span>
                <p className="leading-relaxed text-[11px]">
                  Managers anywhere in the world can tap the WhatsApp link on their phone to approve stock requisitions instantly in 1 click.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
