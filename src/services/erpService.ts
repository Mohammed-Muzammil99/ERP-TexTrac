import { api } from './api';
export { api };
import { 
  User, 
  AuthResponse, 
  ProductionOrder, 
  POProduct, 
  CustomColumn, 
  StatusSummary,
  BulkCuttingPayload,
  SendingRecordPayload,
  StitchingRecordPayload,
  FinishingRecordPayload,
  PackingRecordPayload,
  DirectCartonPackPayload,
  ShippingRecordPayload,
  FabricRecord,
  FabricRecordPayload,
  ReturnRecord,
  ReturnRecordPayload,
  StyleConsumptionRate,
  FabricRequirementStockReportItem,
  PermissionRequest,
  PermissionRequestType,
  RequisitionData,
  WhatsAppSettings,
  PublicAppUrlConfig,
  WhatsAppRequestInfo,
  EnrichedAuditLog
} from '../types';

/**
 * ERP Service Module
 * Provides domain-specific functions for interacting with the ERP backend API.
 */

// --- Authentication ---
export const authService = {
  login: (credentials: any) => api.post<AuthResponse>('/auth/login', credentials),
  me: () => api.get<User>('/auth/me'),
};

// --- User Management ---
export const userService = {
  list: () => api.get<User[]>('/users'),
  create: (userData: any) => api.post<{ success: boolean }>('/users', userData),
  update: (id: number, userData: any) => api.put<{ success: boolean; deleted?: boolean; message?: string }>(`/users/${id}`, userData),
  delete: (id: number) => api.delete<{ success: boolean; deleted?: boolean; message?: string }>(`/users/${id}`),
  getAuditLogs: () => api.get<EnrichedAuditLog[]>('/admin/audit-logs'),
  undoAuditLog: (id: number) => api.post<{ success: boolean; message: string }>(`/admin/undo-audit-log/${id}`, {}),
};

// --- Production Orders (PO) ---
export const poService = {
  list: () => api.get<ProductionOrder[]>('/po'),
  get: (poNumber: string, buyer?: string) => api.get<ProductionOrder & { products: POProduct[] }>(`/po/${encodeURIComponent(poNumber)}${buyer ? `?buyer=${encodeURIComponent(buyer)}` : ''}`),
  create: (poData: any) => api.post<{ success: boolean }>('/po', poData),
  update: (poNumber: string, poData: any) => api.put<{ success: boolean }>(`/po/${encodeURIComponent(poNumber)}`, poData),
  delete: (poNumber: string) => api.delete<{ success: boolean }>(`/po/${encodeURIComponent(poNumber)}`),
  
  // Custom Columns
  getCustomColumns: () => api.get<CustomColumn[]>('/po/custom-columns'),
  createCustomColumn: (colData: any) => api.post<{ success: boolean }>('/po/custom-columns', colData),
  deleteCustomColumn: (key: string) => api.delete<{ success: boolean }>(`/po/custom-columns/${encodeURIComponent(key)}`),
  updateProductPriority: (id: number, priority: string) => api.patch<{ success: boolean }>(`/po/products/${id}/priority`, { priority }),
  updatePOPriority: (poNumber: string, priority: string) => api.patch<{ success: boolean }>(`/po/${encodeURIComponent(poNumber)}/priority`, { priority }),
  updatePOStatus: (poNumber: string, status: string) => api.patch<{ success: boolean }>(`/po/${encodeURIComponent(poNumber)}/status`, { status }),
  updateStyleBuyer: (styleNum?: string, buyer?: string, poNumbers?: string[]) => api.patch<{ success: boolean; updatedCount: number }>('/po/update-style-buyer', { styleNum, buyer, poNumbers }),
};

// --- Production Stages ---

export const cuttingService = {
  list: () => api.get<any[]>('/cutting'),
  createBulk: (payload: BulkCuttingPayload) => api.post<{ success: boolean }>('/cutting/bulk', payload),
  getActivePOs: () => api.get<ProductionOrder[]>('/cutting/active-pos'),
  getPOProducts: (poNumber: string, lineNumber?: string) => api.get<{ colors: string[], products: POProduct[] }>(`/cutting/po-products/${encodeURIComponent(poNumber)}${lineNumber ? `?line_number=${lineNumber}` : ''}`),
  getCuttingPrograms: (poNumber: string) => api.get<any[]>(`/cutting-programs/${encodeURIComponent(poNumber)}`),
  getAllCuttingPrograms: () => api.get<any[]>('/cutting-programs/all'),
  getSummary: () => api.get<any[]>('/cutting/summary'),
  getConsumptionStats: (styleNum?: string) => api.get<any[]>(`/cutting/consumption-stats${styleNum ? `?style_num=${encodeURIComponent(styleNum)}` : ''}`),
  delete: (id: number) => api.delete<{ success: boolean }>(`/cutting/${id}`),
  update: (id: number, data: { quantity: number }) => api.put<{ success: boolean }>(`/cutting/${id}`, data),
};

export const sendingService = {
  list: () => api.get<any[]>('/sending'),
  create: (data: SendingRecordPayload) => api.post<{ success: boolean }>('/sending', data),
  delete: (id: number) => api.delete<{ success: boolean }>(`/sending/${id}`),
  update: (id: number, data: { quantity: number }) => api.put<{ success: boolean }>(`/sending/${id}`, data),
};

export const stitchingService = {
  list: () => api.get<any[]>('/stitching'),
  create: (data: StitchingRecordPayload) => api.post<{ success: boolean }>('/stitching', data),
  delete: (id: number) => api.delete<{ success: boolean }>(`/stitching/${id}`),
  update: (id: number, data: { quantity: number }) => api.put<{ success: boolean }>(`/stitching/${id}`, data),
};

export const finishingService = {
  list: () => api.get<any[]>('/finishing'),
  create: (data: FinishingRecordPayload) => api.post<{ success: boolean }>('/finishing', data),
  directCartonPack: (data: DirectCartonPackPayload) => api.post<{ success: boolean; count?: number }>('/finishing/direct-carton-pack', data),
  delete: (id: number) => api.delete<{ success: boolean }>(`/finishing/${id}`),
  update: (id: number, data: { quantity: number }) => api.put<{ success: boolean }>(`/finishing/${id}`, data),
};

export const packingService = {
  list: () => api.get<any[]>('/packing'),
  create: (data: PackingRecordPayload) => api.post<{ success: boolean }>('/packing', data),
  transferToStore: (ids: number[]) => api.post<{ success: boolean }>('/packing/transfer-to-store', { ids }),
  delete: (id: number) => api.delete<{ success: boolean }>(`/packing/${id}`),
  update: (id: number, data: { quantity: number }) => api.put<{ success: boolean }>(`/packing/${id}`, data),
};

export const shippingService = {
  list: () => api.get<any[]>('/shipping'),
  create: (data: ShippingRecordPayload) => api.post<{ success: boolean }>('/shipping', data),
  createBulk: (data: { items: any[]; import_from_old_stock?: boolean; dry_run?: boolean }) => 
    api.post<{ success: boolean; has_shortfall: boolean; shortfalls: any[] }>('/shipping/bulk', data),
  delete: (id: number) => api.delete<{ success: boolean }>(`/shipping/${id}`),
};

export const storeService = {
  getStock: (startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const queryString = params.toString();
    return api.get<any[]>(`/store/stock${queryString ? `?${queryString}` : ''}`);
  },
  bulkUpdate: (department: string, records: any[]) => 
    api.post<{ success: boolean; count: number; message: string }>('/store/bulk-update', { department, records }),
  getUnallocated: () => api.get<{ unallocated: any[] }>('/store/unallocated'),
  reallocate: (payload: { style: string; color: string; size: string; department: string; quantity: number; targetPoNumber: string }) =>
    api.post<{ success: boolean; message: string }>('/store/reallocate', payload),
  autoAllocateBulk: (payload: { items: any[] }) =>
    api.post<{ success: boolean; results: any[]; message: string }>('/store/auto-allocate', payload),
  changeRecordPO: (payload: { id: number; department: string; newPoNumber: string }) =>
    api.post<{ success: boolean; message: string }>('/store/change-record-po', payload),
  reallocateCartonFIFO: (payload: { style: string; color: string; size: string; current_po: string; quantity?: number }) =>
    api.post<{ success: boolean; targetPoNumber: string; reallocatedQty: number; message: string }>('/store/reallocate-carton-fifo', payload),
  reallocateCartonFIFOMaster: () =>
    api.post<{ success: boolean; reallocatedCount: number; totalReallocatedQty: number; message: string }>('/store/reallocate-carton-fifo-master', {}),
  deleteStoreData: (payload: { department: string; po_number?: string; style_num: string; color: string; size?: string; packing_type?: string }) =>
    api.post<{ success: boolean; message: string }>('/store/delete', payload),
  deleteStoreDataBulk: (payload: { department: string; items: Array<{ po_number?: string; style_num: string; color: string; size?: string; packing_type?: string }> }) =>
    api.post<{ success: boolean; message: string }>('/store/bulk-delete', payload),
  adjustCartonSize: (payload: { product_id: number; po_number: string; pcs_per_carton: number }) =>
    api.post<{ success: boolean; message: string }>('/store/adjust-carton-size', payload),
};

export const returnService = {
  list: (params?: { to_department?: string; from_department?: string; status?: string }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      if (params.to_department) searchParams.append('to_department', params.to_department);
      if (params.from_department) searchParams.append('from_department', params.from_department);
      if (params.status) searchParams.append('status', params.status);
    }
    const queryString = searchParams.toString();
    return api.get<ReturnRecord[]>(`/returns${queryString ? `?${queryString}` : ''}`);
  },
  create: (data: ReturnRecordPayload) => 
    api.post<{ success: boolean; id: number }>('/returns', data),
  createBulk: (items: ReturnRecordPayload[]) =>
    api.post<{ success: boolean }>('/returns/bulk', { items }),
  updateStatus: (id: number, status: 'accepted' | 'rejected') => 
    api.put<{ success: boolean }>(`/returns/${id}/status`, { status }),
};

export const fabricService = {
  list: () => api.get<FabricRecord[]>('/fabric'),
  create: (data: FabricRecordPayload) => api.post<{ success: boolean }>('/fabric', data),
  createBulk: (records: FabricRecordPayload[]) => api.post<{ success: boolean }>('/fabric/bulk', { records }),
  delete: (id: number) => api.delete<{ success: boolean }>(`/fabric/${id}`),
  update: (id: number, data: { quantity_kg: number }) => api.put<{ success: boolean }>(`/fabric/${id}`, data),
  
  // Fabric Types API
  getTypes: () => api.get<{ id: number; name: string }[]>('/fabric-types'),
  createType: (name: string) => api.post<{ success: boolean }>('/fabric-types', { name }),
  updateType: (id: number, name: string) => api.put<{ success: boolean }>(`/fabric-types/${id}`, { name }),
  deleteType: (id: number) => api.delete<{ success: boolean }>(`/fabric-types/${id}`),

  // Buyer GSM Rules API
  getRules: () => api.get<{ id: number; buyer: string; fabric_type: string; gsm: number }[]>('/buyer-gsm-rules'),
  createRule: (rule: { buyer: string; fabric_type: string; gsm: number }) => api.post<{ success: boolean }>('/buyer-gsm-rules', rule),
  deleteRule: (id: number) => api.delete<{ success: boolean }>(`/buyer-gsm-rules/${id}`),

  // Style Consumption Rates API
  getConsumptionRates: () => api.get<StyleConsumptionRate[]>('/style-consumption-rates'),
  createConsumptionRate: (rate: { style_num: string; fabric_type: string; greige_consumption?: number; process_loss_pct?: number; expected_consumption?: number }) => api.post<{ success: boolean; greige_consumption?: number; process_loss_pct?: number; expected_consumption?: number }>('/style-consumption-rates', rate),
  createConsumptionRateBulk: (rates: { style_num: string; fabric_type: string; greige_consumption?: number; process_loss_pct?: number; expected_consumption?: number }[]) => api.post<{ success: boolean; count: number }>('/style-consumption-rates/bulk', { rates }),
  updateConsumptionLossPct: (payload: { ids?: number[]; style_nums?: string[]; process_loss_pct: number }) => api.post<{ success: boolean; updatedCount: number }>('/style-consumption-rates/update-loss-pct', payload),
  deleteConsumptionRate: (id: number) => api.delete<{ success: boolean }>(`/style-consumption-rates/${id}`),
  getStyleRequirementSummary: (styleNum: string, poNumber?: string, color?: string, extraPct?: number) => {
    const params = new URLSearchParams();
    if (poNumber) params.append('po_number', poNumber);
    if (color) params.append('color', color);
    if (extraPct !== undefined) params.append('extra_pct', String(extraPct));
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return api.get<{
      style_num: string;
      po_number: string;
      color: string;
      buyers: string[];
      total_order_qty: number;
      total_already_cut_qty: number;
      total_remaining_cut_qty: number;
      fabric_requirements: {
        id: number;
        fabric_type: string;
        expected_consumption: number;
        buyer_gsm: number | null;
        required_kg: number;
        current_store_stock_kg: number;
        net_needed_kg: number;
      }[];
    }>(`/style-requirement-summary/${encodeURIComponent(styleNum)}${queryStr}`);
  },
  getRequirementStockReport: (extraPct?: number) => {
    const queryStr = extraPct !== undefined ? `?extra_pct=${extraPct}` : '';
    return api.get<FabricRequirementStockReportItem[]>(`/reports/fabric-requirement-stock${queryStr}`);
  },
};

export const handoverService = {
  confirm: (table: string, ids: number[], action: 'accepted' | 'rejected', statusField?: string) => 
    api.post<{ success: boolean }>('/handovers/confirm', { table, ids, action, statusField }),
};

// --- Dashboard & Status ---
export const statusService = {
  getSummary: (date?: string, hour?: string) => {
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (hour) params.append('hour', hour);
    const qs = params.toString();
    return api.get<StatusSummary>(`/status/summary${qs ? `?${qs}` : ''}`);
  },
  getPOStatus: (date?: string) => api.get<any[]>(`/status/pos${date ? `?date=${date}` : ''}`),
  getDetailedStatus: (date?: string, startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const queryString = params.toString();
    return api.get<any[]>(`/status/detailed${queryString ? `?${queryString}` : ''}`);
  },
  getStitchingLines: (date?: string) => api.get<any[]>(`/status/stitching-lines${date ? `?date=${date}` : ''}`),
  getStitchingLinesDashboard: (date?: string) => api.get<any>(`/status/stitching-lines-dashboard${date ? `?date=${date}` : ''}`),
  getStitchingLineConfigs: (date?: string) => api.get<any>(`/status/stitching-line-configs${date ? `?date=${date}` : ''}`),
  saveStitchingLineConfigs: (payload: { date: string, configs: any[] }) => api.post<any>('/status/stitching-line-configs', payload),
  getDailyCutting: () => api.get<{date: string, total: number}[]>('/status/daily-cutting'),
  updateEstDate: (productId: number, estDate: string | null) => api.put<{ success: boolean }>('/status/update-est-date', { product_id: productId, est_date: estDate }),
  getAnalytics: (date?: string) => api.get<any>(`/status/analytics${date ? `?date=${date}` : ''}`),
  getHourlyReportOneView: (date?: string) => api.get<any>(`/status/hourly-report-oneview${date ? `?date=${date}` : ''}`),
  getHourlySlotBreakdown: (params: { date: string; rowId: string; hourPart: string }) => 
    api.get<any>(`/status/hourly-slot-breakdown?date=${encodeURIComponent(params.date)}&rowId=${encodeURIComponent(params.rowId)}&hourPart=${encodeURIComponent(params.hourPart)}`),
  moveHourlySlotRecord: (payload: { table: string; recordId: number; targetDate: string; targetHour: string; moveQty?: number }) => 
    api.post<any>('/status/hourly-slot-move', payload),
};

// --- Settings ---
export const settingsService = {
  getWorkingDate: () => api.get<{ working_date: string }>('/settings/working-date'),
  setWorkingDate: (date: string) => api.post<{ success: boolean }>('/settings/working-date', { working_date: date }),
  setWorkingTime: (timeOrDateTime: string | { time?: string; working_date?: string }) => 
    api.post<{ success: boolean; working_date: string; message: string }>('/settings/working-time', 
      typeof timeOrDateTime === 'string' 
        ? (timeOrDateTime.includes('-') ? { working_date: timeOrDateTime } : { time: timeOrDateTime }) 
        : timeOrDateTime
    ),
};

// --- Permission & Date Change Requests ---
export const permissionRequestService = {
  create: (data: { 
    request_type: PermissionRequestType; 
    requested_items?: string[] | any; 
    requested_datetime?: string; 
    requisition_data?: RequisitionData;
    reason?: string 
  }) => api.post<{ success: boolean; id: number }>('/permission-requests', data),
  listMy: () => api.get<PermissionRequest[]>('/permission-requests/my'),
  listAll: (status?: string) => api.get<PermissionRequest[]>(`/permission-requests${status ? `?status=${status}` : ''}`),
  getPendingCount: () => api.get<{ count: number; my_pending_count: number }>('/permission-requests/pending-count'),
  review: (id: number, data: { status: 'approved' | 'rejected'; admin_notes?: string }) => 
    api.post<{ success: boolean; message: string; request: PermissionRequest }>(`/permission-requests/${id}/review`, data),
};

// --- WhatsApp Remote Approval Service ---
export const whatsAppService = {
  getSettings: () => api.get<WhatsAppSettings>('/whatsapp/settings'),
  saveSettings: (data: Partial<WhatsAppSettings>) => api.post<{ success: boolean; message: string }>('/whatsapp/settings', data),
  getRequestMessage: (id: number) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return api.get<WhatsAppRequestInfo>(`/whatsapp/request-message/${id}?origin=${encodeURIComponent(origin)}`);
  },
  sendTest: (phone_number: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return api.post<{ success: boolean; direct_url: string; sample_text: string }>('/whatsapp/send-test', { phone_number, origin });
  },
};

// --- System Public URL Service ---
export const publicUrlService = {
  getConfig: async (): Promise<PublicAppUrlConfig> => {
    try {
      return await api.get<PublicAppUrlConfig>('/settings/public-url');
    } catch (err: any) {
      // Fallback for older local server instances: retrieve from /whatsapp/settings
      try {
        const wa = await api.get<WhatsAppSettings>('/whatsapp/settings');
        const url = wa.public_app_url || '';
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        return {
          public_app_url: url,
          is_configured: Boolean(url && url.startsWith('http')),
          effective_base_url: url || origin
        };
      } catch {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        return {
          public_app_url: '',
          is_configured: false,
          effective_base_url: origin
        };
      }
    }
  },
  saveConfig: async (public_app_url: string) => {
    try {
      return await api.post<{ success: boolean; message: string; public_app_url: string; is_configured: boolean }>('/settings/public-url', { public_app_url });
    } catch (err: any) {
      // Fallback for local servers: persist via /whatsapp/settings
      try {
        const wa = await api.get<WhatsAppSettings>('/whatsapp/settings').catch(() => ({ admin_phones: '', enabled: true, auto_dispatch: true }));
        await api.post<{ success: boolean; message: string }>('/whatsapp/settings', {
          ...wa,
          public_app_url
        });
        return {
          success: true,
          message: public_app_url ? 'Public ERP URL saved successfully.' : 'Public ERP URL cleared.',
          public_app_url,
          is_configured: Boolean(public_app_url && public_app_url.startsWith('http'))
        };
      } catch (fallbackErr: any) {
        throw err;
      }
    }
  },
};

// --- Colors ---
export const colorService = {
  list: () => api.get<{ id: number; name: string }[]>('/colors'),
  create: (name: string) => api.post<{ success: boolean }>('/colors', { name }),
  delete: (id: number) => api.delete<{ success: boolean }>(`/colors/${id}`),
};

// --- Departments ---
export const departmentService = {
  list: () => api.get<{ id: number; name: string; is_system: number; created_at: string }[]>('/departments'),
  create: (name: string) => api.post<{ success: boolean; name: string }>('/departments', { name }),
};

// --- Custom Forms & Dynamic Workstations ---
export interface CustomFieldSchema {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'fetched_po' | 'fetched_color' | 'fetched_style';
  required: boolean;
}

export interface CustomForm {
  id: number;
  form_name: string;
  department_name: string;
  schema: CustomFieldSchema[];
  created_at: string;
  submission_count: number;
}

export interface SubmissionRow {
  id: number;
  created_at: string;
  creator_name: string;
  values: Record<string, string | number>;
}

export const customFormService = {
  list: () => api.get<CustomForm[]>('/custom-forms'),
  create: (data: { form_name: string; department_name: string; schema: CustomFieldSchema[] }) =>
    api.post<{ success: boolean; id: number }>('/custom-forms', data),
  delete: (id: number) => api.delete<{ success: boolean }>(`/custom-forms/${id}`),
  getSubmissions: (id: number) =>
    api.get<{ form: CustomForm; submissions: SubmissionRow[] }>([`/custom-forms`, id, 'data'].join('/')),
  submitData: (id: number, values: Record<string, string | number>) =>
    api.post<{ success: boolean }>([`/custom-forms`, id, 'data'].join('/'), { values }),
  getFetchableSources: () =>
    api.get<{
      pos: { po_number: string; buyer: string }[];
      styles: string[];
      colors: string[];
      operators: { id: number; full_name: string; role: string; department: string }[];
    }>('/custom-forms-fetchable-sources'),
};

// --- SQA Testing & Diagnostics ---
export const sqaService = {
  getTables: () => api.get<any[]>('/sqa/tables'),
  getTableData: (table: string, limit?: number) => api.get<any[]>(`/sqa/table-data?table=${table}&limit=${limit || 150}`),
  runAutoTest: (keepTestData: boolean) => api.post<{ success: boolean; test_po: string; logs: string[]; steps: any[]; duration: number }>('/sqa/run-auto-test', { keepTestData }),
};

// --- Old Stock Store Service ---
export const oldStockService = {
  list: () => api.get<any[]>('/old-stock'),
  create: (data: {
    po_number?: string;
    style_num: string;
    color: string;
    size: string;
    quantity: number;
    target_department: 'cutting' | 'feeding' | 'stitching' | 'finishing' | 'packing' | 'carton';
    line_number?: string;
  }) => api.post<{ success: boolean; message: string }>('/old-stock', data),
  delete: (department: string, id: number) => api.delete<{ success: boolean; message: string }>(`/old-stock/${department}/${id}`),
};

// --- Discard Service ---
export const discardService = {
  list: () => api.get<any[]>('/discards'),
  create: (data: {
    po_number: string;
    product_id: number;
    department: string;
    quantity: number;
    reason?: string;
  }) => api.post<{ success: boolean }>('/discards', data),
  delete: (id: number) => api.delete<{ success: boolean }>(`/discards/${id}`),
};

// --- Press Service ---
export const pressService = {
  list: () => api.get<any[]>('/press'),
  create: (pcs_pressed: number) => api.post<{ success: boolean }>('/press', { pcs_pressed }),
  delete: (id: number) => api.delete<{ success: boolean }>(`/press/${id}`),
};



