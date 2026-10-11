import React, { useState, useEffect } from 'react';
import { 
  customFormService, 
  departmentService, 
  CustomFieldSchema, 
  CustomForm, 
  SubmissionRow 
} from '../services/erpService';
import { useAuth } from '../context/AuthContext';
import { 
  Layers, 
  Plus, 
  Trash2, 
  Check, 
  FileSpreadsheet, 
  BarChart4, 
  FileText, 
  Calendar, 
  SlidersHorizontal, 
  Database, 
  Share2, 
  AlertTriangle,
  User,
  PlusCircle,
  HelpCircle,
  Activity,
  ChevronRight
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  LineChart, 
  Line, 
  AreaChart, 
  Area 
} from 'recharts';

export const CustomDeptsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState<'workstation' | 'reports' | 'builder'>('workstation');
  const [departments, setDepartments] = useState<string[]>([]);
  const [customForms, setCustomForms] = useState<CustomForm[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [selectedFormId, setSelectedFormId] = useState<number | null>(null);
  const [selectedForm, setSelectedForm] = useState<CustomForm | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  
  // Dynamic Sources for Dropdowns
  const [sources, setSources] = useState<{
    pos: { po_number: string; buyer: string }[];
    styles: string[];
    colors: string[];
    operators: { id: number; full_name: string; role: string; department: string }[];
  }>({ pos: [], styles: [], colors: [], operators: [] });

  // Workspace form state
  const [formValues, setFormValues] = useState<Record<string, string | number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Form Builder state
  const [newFormName, setNewFormName] = useState('');
  const [newFormDept, setNewFormDept] = useState('');
  const [builderFields, setBuilderFields] = useState<CustomFieldSchema[]>([
    { key: 'po_number', label: 'Production Order', type: 'fetched_po', required: true }
  ]);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<CustomFieldSchema['type']>('text');
  const [newFieldRequired, setNewFieldRequired] = useState(false);

  // Reports analysis state
  const [groupByField, setGroupByField] = useState<string>('');
  const [chartType, setChartType] = useState<'bar' | 'line' | 'area'>('bar');
  const [sumField, setSumField] = useState<string>('count');

  useEffect(() => {
    fetchMetadata();
    // Pre-select user's own department if they have one (bypass for Admin and universal supervisor 'All')
    if (user?.department && user.department !== 'Admin' && String(user.department).toLowerCase() !== 'all') {
      setSelectedDept(user.department);
    }
  }, [user]);

  useEffect(() => {
    if (selectedDept && customForms.length > 0) {
      // Find dynamic forms for selected department
      const deptForms = customForms.filter(f => f.department_name === selectedDept);
      if (deptForms.length > 0) {
        setSelectedFormId(deptForms[0].id);
      } else {
        setSelectedFormId(null);
        setSelectedForm(null);
        setSubmissions([]);
      }
    }
  }, [selectedDept, customForms]);

  useEffect(() => {
    if (selectedFormId !== null) {
      fetchFormSubmissions(selectedFormId);
    } else {
      setSelectedForm(null);
      setSubmissions([]);
    }
  }, [selectedFormId]);

  const fetchMetadata = async () => {
    setIsLoading(true);
    try {
      const [deptsData, formsData, sourcesData] = await Promise.all([
        departmentService.list(),
        customFormService.list(),
        customFormService.getFetchableSources()
      ]);

      const deptNames = deptsData.map(d => d.name);
      setDepartments(deptNames);
      setCustomForms(formsData);
      setSources(sourcesData);

      if (deptNames.length > 0 && !selectedDept) {
        setSelectedDept(deptNames[0]);
      }
      if (!newFormDept && deptNames.length > 0) {
        setNewFormDept(deptNames[0]);
      }
    } catch (error) {
      console.error('Failed to load metadata:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFormSubmissions = async (formId: number) => {
    try {
      const resp = await customFormService.getSubmissions(formId);
      setSelectedForm(resp.form);
      setSubmissions(resp.submissions);
      
      // Initialize submission form values
      const initialFormState: Record<string, string | number> = {};
      resp.form.schema.forEach(field => {
        if (field.type === 'fetched_po' && sources.pos.length > 0) {
          initialFormState[field.key] = sources.pos[0].po_number;
        } else if (field.type === 'fetched_color' && sources.colors.length > 0) {
          initialFormState[field.key] = sources.colors[0];
        } else if (field.type === 'fetched_style' && sources.styles.length > 0) {
          initialFormState[field.key] = sources.styles[0];
        } else {
          initialFormState[field.key] = '';
        }
      });
      setFormValues(initialFormState);

      // Default grouping field for reports
      if (resp.form.schema.length > 0) {
        setGroupByField(resp.form.schema[0].key);
      }
    } catch (err) {
      console.error('Failed to load submissions:', err);
    }
  };

  const handleAddFieldToBuilder = () => {
    if (!newFieldLabel.trim()) {
      alert('Field label is required');
      return;
    }
    const key = newFieldLabel.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    if (builderFields.some(f => f.key === key)) {
      alert('A field with a similar label or key already exists');
      return;
    }

    setBuilderFields([
      ...builderFields,
      {
        key,
        label: newFieldLabel.trim(),
        type: newFieldType,
        required: newFieldRequired
      }
    ]);
    setNewFieldLabel('');
    setNewFieldType('text');
    setNewFieldRequired(false);
  };

  const handleRemoveFieldFromBuilder = (index: number) => {
    setBuilderFields(builderFields.filter((_, i) => i !== index));
  };

  const handleCreateForm = async () => {
    if (!newFormName.trim()) {
      alert('Please specify a Form Name');
      return;
    }
    if (builderFields.length === 0) {
      alert('At least one field or column must be added to build a form table');
      return;
    }

    try {
      setIsSubmitting(true);
      await customFormService.create({
        form_name: newFormName.trim(),
        department_name: newFormDept,
        schema: builderFields
      });
      alert(`Success: Smart Workstation Form "${newFormName}" saved for department "${newFormDept}"!`);
      setNewFormName('');
      setBuilderFields([{ key: 'po_number', label: 'Production Order', type: 'fetched_po', required: true }]);
      fetchMetadata();
    } catch (e: any) {
      alert(e.message || 'Failed to create form schema');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteForm = async (id: number, name: string) => {
    if (!window.confirm(`Warning: Are you sure you want to delete form "${name}" and all of its submitted data log lines? This action is IRREVERSIBLE.`)) {
      return;
    }
    try {
      await customFormService.delete(id);
      alert('Form deleted successfully');
      fetchMetadata();
    } catch (e: any) {
      alert('Failed to delete form: ' + e.message);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFormId) return;

    // Validate inputs
    for (const field of selectedForm!.schema) {
      const val = formValues[field.key];
      if (field.required && (val === undefined || val === null || String(val).trim() === '')) {
        alert(`Validation Error: "${field.label}" is a required field.`);
        return;
      }
    }

    try {
      setIsSubmitting(true);
      await customFormService.submitData(selectedFormId, formValues);
      
      // Keep fetched dropdowns but reset user texts and numbers
      const resetValues: Record<string, string | number> = { ...formValues };
      selectedForm!.schema.forEach(field => {
        if (field.type !== 'fetched_po' && field.type !== 'fetched_color' && field.type !== 'fetched_style') {
          resetValues[field.key] = '';
        }
      });
      setFormValues(resetValues);

      alert('Information entry logged successfully!');
      fetchFormSubmissions(selectedFormId);
    } catch (err: any) {
      alert(err.message || 'Submission failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Build Aggregated Report Data
  const getAggregatedReportData = () => {
    if (!selectedForm || submissions.length === 0 || !groupByField) return [];

    const labelMap: Record<string, string> = {};
    const schemaField = selectedForm.schema.find(f => f.key === groupByField);
    
    const aggregates: Record<string, { label: string; count: number; sum: number }> = {};

    submissions.forEach(sub => {
      let rawVal = sub.values[groupByField];
      let strVal = rawVal !== undefined && rawVal !== null ? String(rawVal) : 'N/A';
      if (strVal.trim() === '') strVal = 'Empty';

      if (!aggregates[strVal]) {
        aggregates[strVal] = { label: strVal, count: 0, sum: 0 };
      }

      aggregates[strVal].count += 1;

      // Summing logic (only if we have numeric custom column selected)
      if (sumField !== 'count') {
        const numericVal = parseFloat(String(sub.values[sumField] || 0));
        if (!isNaN(numericVal)) {
          aggregates[strVal].sum += numericVal;
        }
      }
    });

    return Object.values(aggregates).map(item => ({
      name: item.label,
      "Log Count": item.count,
      "Sum total": Math.round(item.sum * 100) / 100,
      value: sumField === 'count' ? item.count : item.sum
    }));
  };

  const reportData = getAggregatedReportData();
  const numericFieldsInForm = selectedForm?.schema.filter(f => f.type === 'number') || [];
  const deptForms = customForms.filter(f => f.department_name === selectedDept);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-bg4 pb-6">
        <div>
          <h2 className="text-2xl sm:text-4xl font-black tracking-tighter flex items-center gap-4 uppercase text-text">
            <Layers className="w-10 h-10 text-po" />
            Dynamic Workstations
          </h2>
          <p className="text-text3 text-xs font-mono uppercase tracking-[0.2em] mt-2">
            Dynamic Department Form Builder & Custom Analysis Sandbox
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex bg-bg2 p-1.5 rounded-2xl border border-bg4 shrink-0">
          <button
            onClick={() => setActiveTab('workstation')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'workstation'
                ? 'bg-po text-white shadow-md'
                : 'text-text3 hover:text-text'
            }`}
          >
            Workstations
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'reports'
                ? 'bg-po text-white shadow-md'
                : 'text-text3 hover:text-text'
            }`}
          >
            Customized Reports
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab('builder')}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                activeTab === 'builder'
                  ? 'bg-po text-white shadow-md'
                  : 'text-text3 hover:text-text'
              }`}
            >
              🛠️ Form Builder
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="h-48 flex items-center justify-center">
          <p className="text-sm font-mono tracking-widest text-text3 animate-pulse">SYNCHRONIZING SCHEMAS...</p>
        </div>
      ) : (
        <>
          {/* ==================== TAB 1: ACTIVE WORKSTATION SUBMISSIONS ==================== */}
          {activeTab === 'workstation' && (
            <div className="space-y-6">
              {/* Selector Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-bg2 p-4 border border-bg4 rounded-2xl">
                <div>
                  <label className="text-[10px] font-mono text-text3 uppercase tracking-widest block mb-1">Select Department</label>
                  <select
                    value={selectedDept}
                    onChange={e => setSelectedDept(e.target.value)}
                    className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold text-text focus:border-po focus:ring-1 focus:ring-po"
                  >
                    {departments.map((deptName) => (
                      <option key={deptName} value={deptName}>
                        {deptName} (Custom Workspace)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-text3 uppercase tracking-widest block mb-1">Select Custom Dynamic Form</label>
                  {deptForms.length > 0 ? (
                    <select
                      value={selectedFormId || ''}
                      onChange={e => setSelectedFormId(Number(e.target.value))}
                      className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold text-text focus:border-po focus:ring-1 focus:ring-po"
                    >
                      {deptForms.map(form => (
                        <option key={form.id} value={form.id}>
                          {form.form_name} ({form.schema.length} custom columns)
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="w-full bg-bg3 text-text3 italic rounded-xl p-3 text-xs flex items-center gap-2 border border-dashed border-bg4">
                      <HelpCircle className="w-4 h-4 text-po" />
                      No customized forms built for {selectedDept} department yet.
                    </div>
                  )}
                </div>
              </div>

              {selectedForm ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Submission Form Card */}
                  <div className="lg:col-span-1 bg-bg2 border border-bg4 rounded-2xl p-6 h-fit space-y-4">
                    <div className="border-b border-bg4 pb-4">
                      <h3 className="text-sm font-black text-text uppercase tracking-wider flex items-center gap-2">
                        <Activity className="w-4 h-4 text-po" />
                        {selectedForm.form_name} Input Log
                      </h3>
                      <p className="text-[10px] text-text3 font-mono mt-1 uppercase tracking-wider">{selectedForm.department_name} Workstation</p>
                    </div>

                    <form onSubmit={handleFormSubmit} className="space-y-4">
                      {selectedForm.schema.map((field) => (
                        <div key={field.key} className="space-y-1">
                          <label className="text-[10px] font-mono text-text2 uppercase tracking-wider flex items-center gap-1">
                            {field.label}
                            {field.required && <span className="text-reject font-bold">*</span>}
                          </label>

                          {/* Render dynamic fetched PO select */}
                          {field.type === 'fetched_po' && (
                            <select
                              value={formValues[field.key] || ''}
                              onChange={e => setFormValues({ ...formValues, [field.key]: e.target.value })}
                              className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-xs font-bold text-text"
                            >
                              {sources.pos.map(po => (
                                <option key={po.po_number} value={po.po_number}>
                                  {po.po_number} [{po.buyer}]
                                </option>
                              ))}
                              {sources.pos.length === 0 && <option value="">No Active POs Found</option>}
                            </select>
                          )}

                          {/* Render dynamic fetched Color select */}
                          {field.type === 'fetched_color' && (
                            <select
                              value={formValues[field.key] || ''}
                              onChange={e => setFormValues({ ...formValues, [field.key]: e.target.value })}
                              className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-xs font-bold text-text"
                            >
                              {sources.colors.map(col => (
                                <option key={col} value={col}>{col}</option>
                              ))}
                              {sources.colors.length === 0 && <option value="">No Colors Configured</option>}
                            </select>
                          )}

                          {/* Render dynamic fetched Style select */}
                          {field.type === 'fetched_style' && (
                            <select
                              value={formValues[field.key] || ''}
                              onChange={e => setFormValues({ ...formValues, [field.key]: e.target.value })}
                              className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-xs font-bold text-text"
                            >
                              {sources.styles.map(sty => (
                                <option key={sty} value={sty}>{sty}</option>
                              ))}
                              {sources.styles.length === 0 && <option value="">No Styles Register</option>}
                            </select>
                          )}

                          {/* Render standard input types */}
                          {field.type === 'text' && (
                            <input
                              type="text"
                              required={field.required}
                              placeholder={`Enter ${field.label.toLowerCase()}`}
                              value={formValues[field.key] || ''}
                              onChange={e => setFormValues({ ...formValues, [field.key]: e.target.value })}
                              className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-xs font-bold text-text placeholder:opacity-50"
                            />
                          )}

                          {/* Render number input types */}
                          {field.type === 'number' && (
                            <input
                              type="number"
                              required={field.required}
                              step="any"
                              placeholder="0.00"
                              value={formValues[field.key] !== undefined ? formValues[field.key] : ''}
                              onChange={e => setFormValues({ ...formValues, [field.key]: e.target.value === '' ? '' : Number(e.target.value) })}
                              className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-xs font-mono font-bold text-text placeholder:opacity-50"
                            />
                          )}

                          {/* Render date input types */}
                          {field.type === 'date' && (
                            <input
                              type="date"
                              required={field.required}
                              value={formValues[field.key] || ''}
                              onChange={e => setFormValues({ ...formValues, [field.key]: e.target.value })}
                              className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-xs font-bold text-text"
                            />
                          )}
                        </div>
                      ))}

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full bg-po text-white font-black py-3 rounded-xl shadow-lg hover:bg-red-600 transition-all uppercase tracking-widest text-xs disabled:opacity-50 mt-2"
                      >
                        {isSubmitting ? 'Logging Submission...' : 'Log Form Data'}
                      </button>
                    </form>
                  </div>

                  {/* Submission Log Table */}
                  <div className="lg:col-span-2 space-y-4">
                    <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
                      <div className="p-4 bg-bg3/50 border-b border-bg4 flex items-center justify-between">
                        <h4 className="text-xs font-black uppercase tracking-wider text-text flex items-center gap-2">
                          <FileSpreadsheet className="w-4 h-4 text-po" />
                          Submissions Log Grid ({submissions.length} rows)
                        </h4>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                          <thead>
                            <tr className="bg-bg3/30 border-b border-bg4 text-left">
                              <th className="p-3 text-[9px] font-black uppercase text-text3 tracking-wider">Date & Submitter</th>
                              {selectedForm.schema.map(cell => (
                                <th key={cell.key} className="p-3 text-[9px] font-black uppercase text-text3 tracking-wider">
                                  {cell.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-bg4">
                            {submissions.map((sub) => (
                              <tr key={sub.id} className="hover:bg-bg3/10 transition-all text-xs font-bold">
                                <td className="p-3">
                                  <div className="flex flex-col">
                                    <span className="text-text font-mono text-[10px]">
                                      {new Date(sub.created_at).toLocaleDateString()} {new Date(sub.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <span className="text-[9px] text-text3 uppercase mt-0.5">{sub.creator_name}</span>
                                  </div>
                                </td>
                                {selectedForm.schema.map(cell => {
                                  const rawVal = sub.values[cell.key];
                                  const displayStr = rawVal !== undefined && rawVal !== null ? String(rawVal) : '-';
                                  return (
                                    <td key={cell.key} className="p-3 font-medium text-text2">
                                      {cell.type === 'number' ? (
                                        <span className="font-mono text-xs text-text">{displayStr}</span>
                                      ) : (
                                        displayStr
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                            {submissions.length === 0 && (
                              <tr>
                                <td colSpan={selectedForm.schema.length + 1} className="p-8 text-center text-xs text-text3 italic">
                                  No transaction log submissions posted for this workstation form schema yet.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-bg2 border border-bg4 rounded-2xl p-12 text-center max-w-lg mx-auto space-y-4">
                  <Database className="w-12 h-12 text-po mx-auto" strokeWidth={1} />
                  <h4 className="text-sm font-bold uppercase text-text">Select Department Workspace Above</h4>
                  <p className="text-xs text-text3">
                    If you has assigned custom departments or designed dynamic forms, select them using the dropdowns above to access interactive workstations.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ==================== TAB 2: INTERACTIVE CUSTOMIZED REPORTS ==================== */}
          {activeTab === 'reports' && (
            <div className="space-y-6">
              {/* Form select for Reports */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-bg2 p-4 border border-bg4 rounded-2xl">
                <div className="md:col-span-2">
                  <label className="text-[10px] font-mono text-text3 uppercase tracking-widest block mb-1">Select Custom Workstation Form</label>
                  <select
                    value={selectedFormId || ''}
                    onChange={e => setSelectedFormId(Number(e.target.value))}
                    className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold text-text focus:border-po focus:ring-1 focus:ring-po"
                  >
                    <option value="">-- Choose Custom Form --</option>
                    {customForms.map(form => (
                      <option key={form.id} value={form.id}>
                        {form.department_name} &raquo; {form.form_name}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedForm && (
                  <>
                    <div>
                      <label className="text-[10px] font-mono text-text3 uppercase tracking-widest block mb-1">Group Analysis By</label>
                      <select
                        value={groupByField}
                        onChange={e => setGroupByField(e.target.value)}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold text-text focus:border-po focus:ring-1 focus:ring-po"
                      >
                        {selectedForm.schema.map(f => (
                          <option key={f.key} value={f.key}>{f.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono text-text3 uppercase tracking-widest block mb-1">Calculation Metric</label>
                      <select
                        value={sumField}
                        onChange={e => setSumField(e.target.value)}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-sm font-bold text-text focus:border-po focus:ring-1 focus:ring-po"
                      >
                        <option value="count">Count (Total Entries Count)</option>
                        {numericFieldsInForm.map(f => (
                          <option key={f.key} value={f.key}>Sum: {f.label}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>

              {selectedForm && submissions.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Aggregation Data Table Grid */}
                  <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden h-fit shadow-xl">
                    <div className="p-4 bg-bg3/50 border-b border-bg4">
                      <h4 className="text-xs font-black uppercase tracking-wider text-text flex items-center gap-2">
                        <SlidersHorizontal className="w-4 h-4 text-po" />
                        Analysis Summary
                      </h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-bg3/30 border-b border-bg4 text-left">
                            <th className="p-3 text-[9px] font-black uppercase text-text3 tracking-wider">Grouped Term</th>
                            <th className="p-3 text-[9px] font-black uppercase text-text3 tracking-wider text-right">Raw Entries</th>
                            {sumField !== 'count' && (
                              <th className="p-3 text-[9px] font-black uppercase text-text3 tracking-wider text-right">Sum total</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-bg4 text-xs font-bold">
                          {reportData.map((row, idx) => (
                            <tr key={idx} className="hover:bg-bg3/5">
                              <td className="p-3 text-text font-mono">{row.name}</td>
                              <td className="p-3 text-right text-text2 font-mono">{row["Log Count"]}</td>
                              {sumField !== 'count' && (
                                <td className="p-3 text-right text-po font-mono">{row["Sum total"]}</td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* dynamic graphics chart block */}
                  <div className="lg:col-span-2 bg-bg2 border border-bg4 rounded-2xl p-6 shadow-xl space-y-4">
                    <div className="flex items-center justify-between border-b border-bg4 pb-4">
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-text flex items-center gap-2">
                          <BarChart4 className="w-4 h-4 text-po" />
                          Customized Dynamic Chart Graphics
                        </h4>
                        <p className="text-[9px] text-text3 uppercase mt-1">Showing {sumField === 'count' ? 'Count (Total Entries)' : `Sum of ${selectedForm.schema.find(f => f.key === sumField)?.label}`}</p>
                      </div>

                      {/* Chart selectors */}
                      <div className="flex bg-bg3 rounded-xl border border-bg4 p-1">
                        <button
                          onClick={() => setChartType('bar')}
                          className={`px-3 py-1 text-[10px] font-black uppercase rounded ${
                            chartType === 'bar' ? 'bg-po text-white' : 'text-text3'
                          }`}
                        >
                          Bar
                        </button>
                        <button
                          onClick={() => setChartType('line')}
                          className={`px-3 py-1 text-[10px] font-black uppercase rounded ${
                            chartType === 'line' ? 'bg-po text-white' : 'text-text3'
                          }`}
                        >
                          Line
                        </button>
                        <button
                          onClick={() => setChartType('area')}
                          className={`px-3 py-1 text-[10px] font-black uppercase rounded ${
                            chartType === 'area' ? 'bg-po text-white' : 'text-text3'
                          }`}
                        >
                          Area
                        </button>
                      </div>
                    </div>

                    {/* Chart Container wrapper */}
                    <div className="h-72 w-full pt-4">
                      <ResponsiveContainer width="100%" height="100%">
                        {chartType === 'bar' ? (
                          <BarChart data={reportData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                            <XAxis dataKey="name" stroke="#888888" fontSize={9} fontWeight="bold" />
                            <YAxis stroke="#888888" fontSize={9} />
                            <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '12px' }} itemStyle={{ color: '#ffffff', fontSize: '12px' }} />
                            <Bar dataKey="value" name={sumField === 'count' ? 'Entries Count' : 'Aggregated Total'} fill="#e11d48" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        ) : chartType === 'line' ? (
                          <LineChart data={reportData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                            <XAxis dataKey="name" stroke="#888888" fontSize={9} fontWeight="bold" />
                            <YAxis stroke="#888888" fontSize={9} />
                            <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '12px' }} itemStyle={{ color: '#ffffff', fontSize: '12px' }} />
                            <Line type="monotone" dataKey="value" name={sumField === 'count' ? 'Entries Count' : 'Aggregated Total'} stroke="#e11d48" strokeWidth={3} />
                          </LineChart>
                        ) : (
                          <AreaChart data={reportData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                            <XAxis dataKey="name" stroke="#888888" fontSize={9} fontWeight="bold" />
                            <YAxis stroke="#888888" fontSize={9} />
                            <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '12px' }} itemStyle={{ color: '#ffffff', fontSize: '12px' }} />
                            <defs>
                              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#e11d48" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="#e11d48" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <Area type="monotone" dataKey="value" name={sumField === 'count' ? 'Entries Count' : 'Aggregated Total'} stroke="#e11d48" fillOpacity={1} fill="url(#colorValue)" strokeWidth={2} />
                          </AreaChart>
                        )}
                      </ResponsiveContainer>
                    </div>

                    <p className="text-[10px] text-center italic text-text3">
                      * Realtime graphics recalculates values dynamically as new submissions are recorded on workstation layouts.
                    </p>
                  </div>
                </div>
              ) : selectedForm ? (
                <div className="bg-bg2 border border-bg4 rounded-2xl p-12 text-center max-w-sm mx-auto space-y-3">
                  <Activity className="w-10 h-10 text-po mx-auto" />
                  <h4 className="text-xs uppercase font-black text-text">No Submissions Recorded</h4>
                  <p className="text-[11px] text-text3">
                    There are no dynamic submission rows logged for this form template yet. Submit some workstation items first.
                  </p>
                </div>
              ) : (
                <div className="bg-bg2 border border-bg4 rounded-2xl p-12 text-center max-w-sm mx-auto space-y-3">
                  <BarChart4 className="w-10 h-10 text-po mx-auto" />
                  <h4 className="text-xs uppercase font-black text-text">Select Custom Form Schema First</h4>
                  <p className="text-[11px] text-text3">
                    Choose one custom form and table schema from the selectors above to visualize metrics and group distributions.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ==================== TAB 3: SMART FIELD & SCHEMA BUILDER (ADMIN ONLY) ==================== */}
          {activeTab === 'builder' && isAdmin && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Form generator tool */}
                <div className="bg-bg2 border border-bg4 rounded-2xl p-6 shadow-xl space-y-5 h-fit">
                  <div className="border-b border-bg4 pb-3">
                    <h3 className="font-black uppercase tracking-tight text-text text-sm flex items-center gap-2">
                      <PlusCircle className="w-5 h-5 text-po" />
                      Add Custom Form Template
                    </h3>
                    <p className="text-[10px] text-text3 font-mono mt-1">Design schema columns and deploy dynamic workstation tables</p>
                  </div>

                  <div className="space-y-4">
                    {/* Basic Form metadata */}
                    <div>
                      <label className="text-[10px] font-mono text-text3 uppercase tracking-widest">Department Assignment</label>
                      <select
                        value={newFormDept}
                        onChange={e => setNewFormDept(e.target.value)}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-xs font-bold text-text mt-1"
                      >
                        {departments.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono text-text3 uppercase tracking-widest">Form & Table Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Shrinkage Stats, Embroidery Logs"
                        value={newFormName}
                        onChange={e => setNewFormName(e.target.value)}
                        className="w-full bg-bg3 border border-bg4 rounded-xl p-3 text-xs font-bold text-text mt-1"
                      />
                    </div>

                    {/* Column Field Builder Box */}
                    <div className="bg-bg3/30 border border-bg4 rounded-xl p-4 space-y-3">
                      <h4 className="text-[10px] font-black uppercase text-po tracking-wider">Configure Form Columns</h4>
                      
                      <div className="space-y-2">
                        <div>
                          <label className="text-[9px] font-mono text-text3 uppercase">Column Heading / Label</label>
                          <input
                            type="text"
                            placeholder="e.g. Ironing Temp, Defect Count"
                            value={newFieldLabel}
                            onChange={e => setNewFieldLabel(e.target.value)}
                            className="w-full bg-bg3 border border-bg4 rounded-xl p-2.5 text-xs font-bold text-text mt-1"
                          />
                        </div>

                        <div>
                          <label className="text-[9px] font-mono text-text3 uppercase">Data Type</label>
                          <select
                            value={newFieldType}
                            onChange={e => setNewFieldType(e.target.value as any)}
                            className="w-full bg-bg3 border border-bg4 rounded-xl p-2.5 text-xs font-bold text-text mt-1"
                          >
                            <option value="text">Text Input (User Defined)</option>
                            <option value="number">Numeric Input (User Defined)</option>
                            <option value="date">Date picker (User Defined)</option>
                            <option value="fetched_po">Dropdown list of active PO numbers</option>
                            <option value="fetched_color">Dropdown list of configured active Colors</option>
                            <option value="fetched_style">Dropdown list of styles</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-2 py-1">
                          <input
                            type="checkbox"
                            id="field_req_chk"
                            checked={newFieldRequired}
                            onChange={e => setNewFieldRequired(e.target.checked)}
                            className="bg-bg3 border-bg4 text-po rounded"
                          />
                          <label htmlFor="field_req_chk" className="text-[10px] font-mono text-text2 uppercase cursor-pointer">
                            Required Field?
                          </label>
                        </div>

                        <button
                          type="button"
                          onClick={handleAddFieldToBuilder}
                          className="w-full bg-bg4 text-text hover:bg-bg3 hover:border-po/20 font-black py-2 rounded-xl transition-all border border-bg4 uppercase tracking-widest text-[10px]"
                        >
                          + Append Column Row
                        </button>
                      </div>
                    </div>

                    {/* final form build button */}
                    <button
                      type="button"
                      onClick={handleCreateForm}
                      disabled={isSubmitting}
                      className="w-full bg-po text-white font-black py-3 rounded-xl shadow-lg hover:bg-red-600 transition-all uppercase tracking-widest text-xs"
                    >
                      Deploy Workstation Form Schema
                    </button>
                  </div>
                </div>

                {/* Right side schemas list and previews */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Dynamic field schema lists */}
                  <div className="bg-bg2 border border-bg4 rounded-2xl p-6 shadow-xl space-y-4">
                    <h4 className="text-xs font-black uppercase text-text tracking-wider">Form Field Preview List</h4>
                    
                    <div className="divide-y divide-bg4">
                      {builderFields.map((field, idx) => (
                        <div key={idx} className="py-3 flex items-center justify-between text-xs font-bold">
                          <div>
                            <span className="text-text">{field.label}</span>
                            <div className="flex gap-2 items-center mt-0.5">
                              <span className="text-[9px] font-mono text-po uppercase bg-po/10 px-1.5 py-0.5 rounded border border-po/10">
                                {field.type.replace('_', ' ')}
                              </span>
                              {field.required && (
                                <span className="text-[9px] font-mono text-reject uppercase bg-reject/10 px-1.5 py-0.5 rounded border border-reject/10">
                                  REQUIRED
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Delete column row if NOT the absolute default PO number */}
                          {idx > 0 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveFieldFromBuilder(idx)}
                              className="text-text3 hover:text-reject p-1 bg-bg3 rounded-lg border border-bg4"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Deployed Workstation Forms List */}
                  <div className="bg-bg2 border border-bg4 rounded-2xl overflow-hidden shadow-xl">
                    <div className="p-4 bg-bg3/30 border-b border-bg4">
                      <h4 className="text-xs font-black uppercase tracking-wider text-text">Active Deployed Dynamic Forms ({customForms.length})</h4>
                    </div>

                    <div className="divide-y divide-bg4">
                      {customForms.map(form => (
                        <div key={form.id} className="p-4 flex items-center justify-between hover:bg-bg3/10 transition-all font-bold">
                          <div>
                            <span className="text-sm font-bold text-text">{form.form_name}</span>
                            <div className="flex gap-2 items-center text-[10px] text-text3 mt-1">
                              <span className="uppercase text-po">{form.department_name} Dept</span>
                              <span>&bull;</span>
                              <span>{form.schema.length} columns</span>
                              <span>&bull;</span>
                              <span>{form.submission_count} entries recorded</span>
                            </div>
                          </div>

                          <button
                            onClick={() => handleDeleteForm(form.id, form.form_name)}
                            className="bg-reject/10 text-reject font-black text-[10px] uppercase border border-reject/20 px-3 py-1.5 rounded-xl hover:bg-reject hover:text-white transition-all flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete Schema
                          </button>
                        </div>
                      ))}

                      {customForms.length === 0 && (
                        <p className="p-6 text-center text-xs text-text3 italic">No active dynamic worksheets created yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
