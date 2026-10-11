export type Role = 'admin' | 'supervisor' | 'operator' | 'viewer' | 'Admin' | string;
export type Department = 'Admin' | 'Cutting' | 'Stitching' | 'Finishing' | 'Packing' | 'Shipping' | 'Quality' | string;


export interface User {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  department: Department;
  allowed_pages?: string[] | null;
  allowed_departments?: string[] | null;
  can_change_time?: boolean | number;
  is_active: boolean;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  id?: number;
  username?: string;
  role: Role;
  department: Department;
  full_name: string;
  allowed_pages?: string[] | null;
  allowed_departments?: string[] | null;
  can_change_time?: boolean | number;
}

export interface ProductionOrder {
  id: number;
  po_number: string;
  buyer: string;
  season: string;
  floor: string;
  delivery_date: string;
  priority: 'Normal' | 'Urgent' | 'Low';
  status: 'Active' | 'Draft' | 'On Hold';
  remarks: string;
  total_qty: number;
  total_value: number;
  product_count?: number;
  styles?: string;
  style_num?: string;
  colors?: string;
  sizes?: string;
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

export interface POProduct {
  id: number;
  po_number: string;
  line_num: string;
  style_num: string;
  item_num: string;
  description: string;
  color: string;
  size: string;
  size_ratio: string;
  qty: number;
  original_qty?: number;
  unit_price: number;
  total_value: number;
  fabric_type: string;
  gsm: string;
  country: string;
  ship_mode: string;
  priority?: 'Normal' | 'Urgent' | 'Low';
  custom_data: string; // JSON
  sort_order: number;
  product_id?: number;
  
  // Aggregated fields
  total_cut?: number;
  total_accepted_cut?: number;
  total_sent?: number;
  total_accepted_sent?: number;
  total_stitched?: number;
  total_passed?: number;
  total_rejected?: number;
  total_packed?: number;
  total_accepted_packed_qty?: number;
  total_accepted_blister_qty?: number;
  total_loose_available?: number;
  total_blister_available?: number;
  total_accepted_finished?: number;
  total_shipped?: number;
  planned_qty?: number;
  [key: string]: any;
}

export interface CustomColumn {
  id: number;
  key: string;
  label: string;
  col_type: 'text' | 'number' | 'date';
  sort_order: number;
}

export interface StatusSummary {
  total_po_qty: number;
  total_orders: number;
  total_cut: number;
  total_sent: number;
  total_stitched: number;
  total_passed: number;
  total_rejected: number;
  total_packed: number;
  total_blistered?: number;
  total_shipped: number;
  total_returns?: number;
  total_wip?: number;
  total_pressed?: number;
}

// Request Payloads
export interface CreatePOResponse {
  success: boolean;
}

export interface CuttingRecordPayload {
  po_number: string;
  product_id: number;
  quantity: number;
}

export interface SendingRecordPayload {
  po_number: string;
  product_id: number;
  quantity: number;
  line_number: string;
}

export interface StitchingRecordPayload {
  po_number: string;
  product_id: number;
  quantity: number;
  line_number: string;
}

export interface FinishingRecordPayload {
  po_number: string;
  product_id: number;
  quantity: number;
  result: 'pass' | 'reject';
}

export interface PackingRecordPayload {
  po_number: string;
  product_id: number;
  quantity: number;
  cartons: number;
  packing_type?: 'loose' | 'blister' | 'carton';
  pcs_per_carton?: number;
  is_direct_carton?: boolean | number;
}

export interface DirectCartonPackPayload {
  po_number?: string;
  product_id?: number;
  cartons?: number;
  pcs_per_carton?: number;
  quantity?: number;
  items?: {
    po_number: string;
    product_id: number;
    cartons: number;
    pcs_per_carton: number;
    quantity: number;
  }[];
}

export interface ShippingRecordPayload {
  po_number: string;
  product_id: number;
  style_num?: string;
  quantity: number;
  sscc?: string;
  item_num?: string;
  line_num?: string;
  color?: string;
  size?: string;
  pieces_per_carton?: number;
  cartons?: number;
}

export interface FabricRecord {
  id: number;
  po_number: string;
  style_num?: string;
  batch_id?: string;
  fabric_name?: string;
  gsm?: number;
  record_type: 'inhouse' | 'issue' | 'return' | 'consumption';
  color: string;
  quantity_kg: number;
  status: 'pending' | 'accepted' | 'rejected';
  received_by?: number;
  received_at?: string;
  recorder_name?: string;
  created_at: string;
}

export interface FabricRecordPayload {
  po_number: string;
  style_num?: string;
  batch_id?: string;
  fabric_name?: string;
  gsm?: number;
  record_type: 'inhouse' | 'issue' | 'return' | 'consumption';
  color: string;
  quantity_kg: number;
  bypass_fabric_check?: boolean;
}

export interface BulkCuttingPayload {
  records: CuttingRecordPayload[];
  fabric_consumption: FabricRecordPayload[];
  bypass_fabric_check?: boolean;
}

export interface ReturnRecord {
  id: number;
  po_number: string;
  product_id: number;
  from_department: string;
  to_department: string;
  quantity: number;
  reason?: string;
  status: 'pending' | 'accepted' | 'rejected';
  line_number?: string;
  created_by: number;
  created_at: string;
  received_by?: number;
  received_at?: string;
  style_num: string;
  color: string;
  size: string;
  buyer: string;
  creator_name?: string;
  receiver_name?: string;
}

export interface ReturnRecordPayload {
  po_number: string;
  product_id: number;
  from_department: string;
  to_department: string;
  quantity: number;
  reason?: string;
  line_number?: string;
}

export interface StyleConsumptionRate {
  id: number;
  style_num: string;
  fabric_type: string;
  expected_consumption: number;
  greige_consumption?: number;
  process_loss_pct?: number;
  created_at: string;
  [key: string]: any;
}

export interface FabricRequirementStockReportItem {
  buyer: string;
  style: string;
  color: string;
  fabric_type: string;
  buyer_gsm: string;
  gsm_number: number | null;
  target_cut_pcs: number;
  expected_consumption: number;
  current_stock_kg: number;
  required_kg: number;
  net_needed_kg: number;
  excess_kg: number;
  status: 'SHORTAGE' | 'COVERED' | 'EXTREME_EXCESS';
}

export type PermissionRequestType = 'dept_access' | 'page_access' | 'datetime_change' | 'old_stock_requisition' | 'cutting_consumption_correction';
export type PermissionRequestStatus = 'pending' | 'approved' | 'rejected';

export interface CuttingConsumptionCorrectionData {
  fabric_record_id: number;
  po_number: string;
  style_num: string;
  color: string;
  fabric_name?: string;
  gsm?: number;
  old_quantity_kg: number;
  new_quantity_kg: number;
  diff_kg: number;
  reason?: string;
  date?: string;
  total_pcs?: number;
}

export interface RequisitionData {
  po_number?: string;
  style_num: string;
  color: string;
  size: string;
  quantity: number;
  target_department: 'feeding' | 'stitching' | 'finishing' | 'packing' | 'carton';
  line_number?: string;
  cartons?: number;
  pcs_per_carton?: number;
  reason?: string;
}

export interface PermissionRequest {
  id: number;
  user_id: number;
  request_type: PermissionRequestType;
  requested_items: string[] | any | null;
  requested_datetime: string | null;
  requisition_data?: RequisitionData | null;
  consumption_correction_data?: CuttingConsumptionCorrectionData | null;
  reason?: string;
  status: PermissionRequestStatus;
  reviewed_by?: number | null;
  reviewed_at?: string | null;
  admin_notes?: string | null;
  created_at: string;
  requester_name?: string;
  requester_username?: string;
  requester_role?: string;
  requester_department?: string;
  requester_allowed_pages?: string[] | null;
  requester_allowed_departments?: string[] | null;
  reviewer_name?: string;
}

export interface WhatsAppSettings {
  admin_phones: string;
  enabled: boolean;
  auto_dispatch: boolean;
  public_app_url?: string;
}

export interface PublicAppUrlConfig {
  public_app_url: string;
  is_configured: boolean;
  effective_base_url: string;
}

export interface WhatsAppRequestInfo {
  request_id: number;
  status: string;
  formatted_message: string;
  direct_whatsapp_url: string;
  admin_phones: string[];
  approve_url: string;
  reject_url: string;
  expires_at: string;
}

export interface AuditLogChange {
  field: string;
  label: string;
  old_value: any;
  new_value: any;
  diff?: string;
}

export interface EnrichedAuditLog {
  id: number;
  user_id: number;
  operator_name: string;
  username: string;
  user_role: string;
  user_department: string;
  department: string;
  action: string;
  human_action: string;
  table_name: string;
  record_id: string;
  po_number: string | null;
  buyer: string | null;
  style_num: string | null;
  color: string | null;
  size: string | null;
  line_number: string | null;
  quantity: number | null;
  cartons: number | null;
  pcs_per_carton: number | null;
  packing_type: string | null;
  summary_sentence: string;
  changes: AuditLogChange[];
  old_value: any;
  new_value: any;
  ip_address: string;
  created_at: string;
  is_undone: number;
  can_undo: boolean;
}


