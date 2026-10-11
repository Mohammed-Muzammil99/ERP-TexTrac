import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const sizeOrder = [
  '3XS', 'XXXS', '2XS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL'
];

export function compareSizes(a: string | number, b: string | number): number {
  const normA = String(a).toUpperCase().trim();
  const normB = String(b).toUpperCase().trim();
  
  const numA = parseFloat(normA);
  const numB = parseFloat(normB);
  if (!isNaN(numA) && !isNaN(numB)) {
    return numA - numB;
  }
  
  const indexA = sizeOrder.indexOf(normA);
  const indexB = sizeOrder.indexOf(normB);
  
  if (indexA !== -1 && indexB !== -1) {
    return indexA - indexB;
  }
  
  if (indexA !== -1) return -1;
  if (indexB !== -1) return 1;
  
  return normA.localeCompare(normB, undefined, { numeric: true, sensitivity: 'base' });
}

export function fmtDate(iso: string | Date | number) {
  if (!iso) return '-';
  try {
    let dateObj: Date;
    if (typeof iso === 'string') {
      const cleaned = iso.trim();
      
      // Handle standard ISO & SQLite dates starting with YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
        const datePart = cleaned.substring(0, 10);
        const parts = datePart.split('-');
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        
        let hasTime = false;
        let hour = 0;
        let minute = 0;
        let second = 0;
        
        const timeMatch = cleaned.match(/[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
        if (timeMatch) {
          hour = parseInt(timeMatch[1], 10);
          minute = parseInt(timeMatch[2], 10);
          second = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
          if (hour !== 0 || minute !== 0 || second !== 0) {
            hasTime = true;
          }
        }
        
        // Build as local date to prevent timezone shift by browser
        dateObj = new Date(year, month, day, hour, minute, second);
        
        if (hasTime) {
          return dateObj.toLocaleString('en-PK', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          });
        } else {
          return dateObj.toLocaleDateString('en-PK', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          });
        }
      }
      
      dateObj = new Date(cleaned);
    } else {
      dateObj = new Date(iso);
    }

    if (isNaN(dateObj.getTime())) {
      return String(iso);
    }

    return dateObj.toLocaleString('en-PK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (e) {
    return String(iso);
  }
}

import { toast } from 'sonner';

export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Try modern navigator.clipboard
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard failed, falling back to execCommand:', err);
    }
  }

  // 2. Fallback: temporary textarea + execCommand
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('All clipboard copy attempts failed:', err);
    return false;
  }
}

export function buildWhatsAppUrl(text: string, phone?: string, isWeb = false): string {
  const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
  const encodedText = encodeURIComponent(text || '');

  if (isWeb) {
    return cleanPhone
      ? `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`
      : `https://web.whatsapp.com/send?text=${encodedText}`;
  }

  if (cleanPhone) {
    return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
  }
  return `https://api.whatsapp.com/send?text=${encodedText}`;
}

export async function dispatchWhatsApp(options: {
  text: string;
  phone?: string;
  url?: string;
  preferWeb?: boolean;
}): Promise<void> {
  const { text, phone, url, preferWeb } = options;

  // Always copy message to clipboard first so the user can easily paste if WhatsApp doesn't prefill
  if (text) {
    const copied = await copyToClipboard(text);
    if (copied) {
      toast.success('Message text copied to clipboard!', {
        description: 'You can paste (Ctrl+V) directly into your WhatsApp chat.'
      });
    }
  }

  const targetUrl = url || buildWhatsAppUrl(text, phone, preferWeb);

  // Open the link safely
  try {
    const newWindow = window.open(targetUrl, '_blank', 'noopener,noreferrer');
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      const a = document.createElement('a');
      a.href = targetUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } catch (err) {
    console.warn('Direct window.open blocked, using anchor fallback:', err);
    const a = document.createElement('a');
    a.href = targetUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

export function formatClientWhatsAppMessage(
  request: any,
  baseUrl = typeof window !== 'undefined' ? window.location.origin : '',
  tokens?: { approveToken?: string; rejectToken?: string }
): string {
  const requestId = request.id || request.request_id || 1;
  const requesterName = request.requester_name || request.full_name || 'Floor Supervisor';
  const username = request.requester_username || request.username || 'user';
  const requesterRole = (request.requester_role || request.role || 'Supervisor').toUpperCase();
  const requesterDept = request.requester_department || request.department || 'Production';

  const cleanBase = (baseUrl || '').replace(/\/$/, '');
  const approveUrl = tokens?.approveToken
    ? `${cleanBase}/api/public/whatsapp-action?token=${tokens.approveToken}&action=approved`
    : `${cleanBase}/api/public/whatsapp-action?request_id=${requestId}&action=approved`;
  const rejectUrl = tokens?.rejectToken
    ? `${cleanBase}/api/public/whatsapp-action?token=${tokens.rejectToken}&action=rejected`
    : `${cleanBase}/api/public/whatsapp-action?request_id=${requestId}&action=rejected`;

  const realTimeStr = new Date().toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  let message = `📦 *GARMENT ERP - APPROVAL REQUEST #${requestId}*\n`;
  message += `────────────────────────────\n`;
  message += `👤 *Requester:* ${requesterName} (@${username})\n`;
  message += `👔 *Role & Dept:* ${requesterRole} (${requesterDept})\n`;
  message += `⏰ *Requested At:* ${realTimeStr}\n`;

  if (request.request_type === 'old_stock_requisition') {
    let reqData: any = null;
    if (request.requisition_data) {
      try {
        reqData = typeof request.requisition_data === 'string' ? JSON.parse(request.requisition_data) : request.requisition_data;
      } catch {
        reqData = null;
      }
    }
    if (!reqData && request.requested_items) {
      try {
        reqData = typeof request.requested_items === 'string' ? JSON.parse(request.requested_items) : request.requested_items;
      } catch {
        reqData = null;
      }
    }

    message += `🏬 *Request Type:* ⚠️ *OLD STOCK ALLOCATION*\n`;
    message += `🎯 *Target Store:* ${(reqData?.target_department || 'Store').toUpperCase()}${reqData?.line_number ? ` (${reqData.line_number})` : ''}\n`;
    message += `🧵 *Garment Specs:*\n`;
    message += `  • *Style:* ${reqData?.style_num || 'N/A'}\n`;
    message += `  • *Color:* ${reqData?.color || 'N/A'}\n`;
    message += `  • *Size:* ${reqData?.size || 'N/A'}\n`;
    message += `  • *Quantity:* ${reqData?.quantity ? Number(reqData.quantity).toLocaleString() : '0'} pcs\n`;
    if (reqData?.po_number) {
      message += `  • *Target PO:* ${reqData.po_number}\n`;
    }
    if (reqData?.cartons) {
      message += `  • *Cartons:* ${reqData.cartons} ctns (${reqData.pcs_per_carton || '-'} pcs/ctn)\n`;
    }
  } else if (request.request_type === 'dept_access') {
    let depts = request.requested_items;
    if (typeof depts === 'string') {
      try { depts = JSON.parse(depts); } catch { depts = [depts]; }
    }
    message += `🏬 *Request Type:* Department Access\n`;
    message += `🔑 *Requested Depts:* ${Array.isArray(depts) ? depts.join(', ') : depts || 'N/A'}\n`;
  } else if (request.request_type === 'page_access') {
    let pages = request.requested_items;
    if (typeof pages === 'string') {
      try { pages = JSON.parse(pages); } catch { pages = [pages]; }
    }
    message += `📑 *Request Type:* Page & Feature Access\n`;
    message += `🔑 *Requested Pages:* ${Array.isArray(pages) ? pages.join(', ') : pages || 'N/A'}\n`;
  } else if (request.request_type === 'datetime_change') {
    message += `🕒 *Request Type:* System Date & Time Shift\n`;
    message += `📅 *Target DateTime:* ${request.requested_datetime || 'N/A'}\n`;
  }

  if (request.reason) {
    message += `📝 *Reason:* "${request.reason}"\n`;
  }

  message += `────────────────────────────\n`;
  message += `⚡ *1-TAP REMOTE MOBILE ACTIONS:*\n\n`;
  message += `✅ *APPROVE REQUEST:*\n${approveUrl}\n\n`;
  message += `❌ *REJECT REQUEST:*\n${rejectUrl}\n`;
  message += `────────────────────────────\n`;
  message += `_Links are single-use and expire in 24 hours._`;

  return message;
}

