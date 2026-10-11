import express from 'express';
import { db, logAudit } from '../db';
import { authenticateToken, isAdmin } from '../middleware';
import { 
  getOrGenerateTokens, 
  formatWhatsAppMessage, 
  processRemoteWhatsAppAction, 
  renderActionHtml 
} from '../whatsapp';

const router = express.Router();

// Helper to determine the application's base URL (live public domain)
const getBaseUrl = (req: express.Request) => {
  // 1. Check custom setting in db if configured
  try {
    const customUrlRow: any = db.prepare("SELECT value FROM system_settings WHERE key = 'public_app_url'").get();
    if (customUrlRow && customUrlRow.value && customUrlRow.value.trim().startsWith('http')) {
      return customUrlRow.value.trim().replace(/\/$/, '');
    }
  } catch {}

  // 2. Query param origin
  const queryOrigin = req.query.origin as string;
  if (queryOrigin && queryOrigin.startsWith('http')) {
    return queryOrigin.replace(/\/$/, '');
  }

  // 3. Custom headers sent by our React frontend or reverse proxy
  const appUrlHeader = (req.get('x-app-url') || req.get('x-origin')) as string;
  if (appUrlHeader && appUrlHeader.startsWith('http')) {
    return appUrlHeader.replace(/\/$/, '');
  }

  const originHeader = req.get('origin');
  if (originHeader && originHeader.startsWith('http')) {
    return originHeader.replace(/\/$/, '');
  }

  const refererHeader = req.get('referer');
  if (refererHeader && refererHeader.startsWith('http')) {
    try {
      const u = new URL(refererHeader);
      return `${u.protocol}//${u.host}`;
    } catch {}
  }

  const forwardedHost = req.get('x-forwarded-host');
  const forwardedProto = req.get('x-forwarded-proto') || 'https';
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  return `${protocol}://${host}`;
};

// 1. PUBLIC ENDPOINT: 1-Click WhatsApp Remote Action
// Supports token (e.g. ?token=abc&action=approved) AND direct request_id (e.g. ?request_id=19&action=approved)
router.get(['/public/whatsapp-action', '/api/public/whatsapp-action', '/whatsapp-action', '/api/whatsapp-action'], (req, res) => {
  const token = (req.query.token as string) || '';
  const action = (req.query.action as string) || 'approved';
  const reqIdStr = (req.query.request_id || req.query.id || '') as string;
  const requestId = reqIdStr ? parseInt(reqIdStr, 10) : undefined;
  const clientIp = req.ip || (req.headers['x-forwarded-for'] as string) || '';

  const result = processRemoteWhatsAppAction({
    token,
    requestId,
    action,
    ipAddress: clientIp
  });
  const html = renderActionHtml(result);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(result.success ? 200 : 400).send(html);
});

// 2. TWO-WAY WEBHOOK ENDPOINT: Twilio / Meta WhatsApp Inbound Message Webhook
// Enables texting "APPROVE 15" or "REJECT 15" directly to the WhatsApp Bot
router.post(['/whatsapp/webhook', '/api/whatsapp/webhook'], (req, res) => {
  try {
    const body = req.body || {};
    const messageText = (body.Body || body.message || body.text || '').trim();
    const fromPhone = (body.From || body.sender || '').replace('whatsapp:', '');

    console.log(`[WhatsApp Webhook] Received message from ${fromPhone}: "${messageText}"`);

    // Match patterns like "APPROVE 12" or "REJECT 12" or "OK 12"
    const match = messageText.match(/^(approve|reject|ok|yes|no)\s*#?(\d+)/i);
    if (match) {
      const decisionWord = match[1].toLowerCase();
      const requestId = parseInt(match[2], 10);
      const isApproved = ['approve', 'ok', 'yes'].includes(decisionWord);

      const tokens = getOrGenerateTokens(requestId);
      const targetToken = isApproved ? tokens.approveToken : tokens.rejectToken;

      const actionResult = processRemoteWhatsAppAction(targetToken, `WhatsApp Webhook (${fromPhone})`);

      if (actionResult.success) {
        return res.status(200).send(`
          <Response>
            <Message>✅ Request #${requestId} was ${actionResult.action.toUpperCase()} successfully. System records updated.</Message>
          </Response>
        `);
      } else {
        return res.status(200).send(`
          <Response>
            <Message>⚠️ Request #${requestId} failed: ${actionResult.message}</Message>
          </Response>
        `);
      }
    }

    // Default help response
    res.status(200).send(`
      <Response>
        <Message>🤖 Garment ERP Bot: To review a request, reply with "APPROVE [RequestID]" or "REJECT [RequestID]" (e.g. APPROVE 42).</Message>
      </Response>
    `);
  } catch (err: any) {
    console.error('WhatsApp Webhook Error:', err);
    res.status(500).json({ error: 'Webhook processing error', message: err.message });
  }
});

// 3. GET WHATSAPP SETTINGS (Admin Only)
router.get(['/whatsapp/settings', '/api/whatsapp/settings'], authenticateToken, isAdmin, (req, res) => {
  try {
    const phonesRow: any = db.prepare("SELECT value FROM system_settings WHERE key = 'whatsapp_admin_phones'").get();
    const enabledRow: any = db.prepare("SELECT value FROM system_settings WHERE key = 'whatsapp_enabled'").get();
    const autoDispatchRow: any = db.prepare("SELECT value FROM system_settings WHERE key = 'whatsapp_auto_dispatch'").get();
    const publicUrlRow: any = db.prepare("SELECT value FROM system_settings WHERE key = 'public_app_url'").get();

    res.json({
      admin_phones: phonesRow ? phonesRow.value : '',
      enabled: enabledRow ? enabledRow.value === '1' : true,
      auto_dispatch: autoDispatchRow ? autoDispatchRow.value === '1' : true,
      public_app_url: publicUrlRow ? publicUrlRow.value : '',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch WhatsApp settings', message: err.message });
  }
});

// 3B. DEDICATED PUBLIC_APP_URL ENDPOINTS (Admin Only)
router.get(['/settings/public-url', '/api/settings/public-url'], authenticateToken, (req, res) => {
  try {
    const publicUrlRow: any = db.prepare("SELECT value FROM system_settings WHERE key = 'public_app_url'").get();
    const configuredUrl = publicUrlRow && publicUrlRow.value ? publicUrlRow.value.trim() : '';
    const dynamicBaseUrl = getBaseUrl(req);

    res.json({
      public_app_url: configuredUrl,
      is_configured: Boolean(configuredUrl && configuredUrl.startsWith('http')),
      effective_base_url: dynamicBaseUrl,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch Public App URL configuration', message: err.message });
  }
});

router.post(['/settings/public-url', '/api/settings/public-url'], authenticateToken, isAdmin, (req: any, res) => {
  const { public_app_url } = req.body;
  const cleanUrl = String(public_app_url || '').trim().replace(/\/$/, '');

  if (cleanUrl && !cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    return res.status(400).json({ 
      error: 'Invalid URL format. Public URL must begin with http:// or https:// (e.g. https://erp.yourcompany.com)' 
    });
  }

  try {
    const prevRow: any = db.prepare("SELECT value FROM system_settings WHERE key = 'public_app_url'").get();
    const prevVal = prevRow ? prevRow.value : null;

    db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('public_app_url', ?)").run(cleanUrl);

    logAudit(req.user.id, 'SET_PUBLIC_APP_URL', 'system_settings', 'public_app_url', {
      previous_url: prevVal
    }, {
      new_url: cleanUrl,
      is_configured: Boolean(cleanUrl)
    });

    res.json({ 
      success: true, 
      message: cleanUrl ? 'Public ERP URL saved successfully. Remote WhatsApp links will use this domain.' : 'Public ERP URL cleared. System reverted to dynamic detection.',
      public_app_url: cleanUrl,
      is_configured: Boolean(cleanUrl)
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save Public App URL', message: err.message });
  }
});

// 4. UPDATE WHATSAPP SETTINGS (Admin Only)
router.post(['/whatsapp/settings', '/api/whatsapp/settings'], authenticateToken, isAdmin, (req: any, res) => {
  const { admin_phones, enabled, auto_dispatch, public_app_url } = req.body;

  try {
    const setSetting = (key: string, val: string) => {
      db.prepare("INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)").run(key, val);
    };

    if (admin_phones !== undefined) setSetting('whatsapp_admin_phones', String(admin_phones).trim());
    if (enabled !== undefined) setSetting('whatsapp_enabled', enabled ? '1' : '0');
    if (auto_dispatch !== undefined) setSetting('whatsapp_auto_dispatch', auto_dispatch ? '1' : '0');
    if (public_app_url !== undefined) setSetting('public_app_url', String(public_app_url).trim());

    logAudit(req.user.id, 'UPDATE_WHATSAPP_SETTINGS', 'system_settings', 'whatsapp_config', null, {
      admin_phones,
      enabled,
      auto_dispatch,
      public_app_url
    });

    res.json({ success: true, message: 'WhatsApp configuration saved successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update WhatsApp settings', message: err.message });
  }
});

// 5. GET FORMATTED WHATSAPP MESSAGE & DIRECT LINK FOR A REQUEST
router.get(['/whatsapp/request-message/:id', '/api/whatsapp/request-message/:id'], (req, res) => {
  const requestId = parseInt(req.params.id, 10);
  if (isNaN(requestId) || requestId <= 0) {
    return res.status(400).json({ error: 'Invalid request ID provided' });
  }

  try {
    const request: any = db.prepare(`
      SELECT 
        pr.*,
        u.username as requester_username,
        u.full_name as requester_name,
        u.role as requester_role,
        u.department as requester_department
      FROM permission_requests pr
      LEFT JOIN users u ON pr.user_id = u.id
      WHERE pr.id = ?
    `).get(requestId);

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const baseUrl = getBaseUrl(req);
    const tokens = getOrGenerateTokens(requestId);
    const formattedText = formatWhatsAppMessage(request, baseUrl, tokens);

    // Get admin phones
    const phonesRow: any = db.prepare("SELECT value FROM system_settings WHERE key = 'whatsapp_admin_phones'").get();
    const adminPhones = phonesRow && phonesRow.value ? phonesRow.value.split(',').map((p: string) => p.trim()).filter(Boolean) : [];
    const targetPhone = adminPhones.length > 0 ? adminPhones[0].replace(/[^0-9]/g, '') : '';

    // Direct WhatsApp click-to-chat URL
    const directWaUrl = targetPhone 
      ? `https://wa.me/${targetPhone}?text=${encodeURIComponent(formattedText)}`
      : `https://wa.me/?text=${encodeURIComponent(formattedText)}`;

    res.json({
      request_id: requestId,
      status: request.status,
      formatted_message: formattedText,
      direct_whatsapp_url: directWaUrl,
      admin_phones: adminPhones,
      approve_url: `${baseUrl}/api/public/whatsapp-action?token=${tokens.approveToken}&action=approved`,
      reject_url: `${baseUrl}/api/public/whatsapp-action?token=${tokens.rejectToken}&action=rejected`,
      expires_at: tokens.expiresAt
    });
  } catch (err: any) {
    console.error('Error generating WhatsApp request message:', err);
    res.status(500).json({ error: 'Failed to generate WhatsApp message', message: err.message });
  }
});

// 6. SEND TEST WHATSAPP MESSAGE
router.post(['/whatsapp/send-test', '/api/whatsapp/send-test'], authenticateToken, isAdmin, (req, res) => {
  const { phone_number } = req.body;
  const baseUrl = getBaseUrl(req);

  const cleanPhone = String(phone_number || '').replace(/[^0-9]/g, '');
  const sampleMsg = `🧪 *GARMENT ERP - WHATSAPP INTEGRATION TEST*\n────────────────────────────\n✅ System connection is active.\n⏰ Verified at: ${new Date().toLocaleTimeString()}\n────────────────────────────\nAdmins can receive real-time 1-click stock & permission requests on this number.`;

  const waLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(sampleMsg)}` : `https://wa.me/?text=${encodeURIComponent(sampleMsg)}`;

  res.json({
    success: true,
    message: 'Test message prepared successfully',
    direct_url: waLink,
    sample_text: sampleMsg
  });
});

export default router;
