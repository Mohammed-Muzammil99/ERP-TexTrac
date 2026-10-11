import React, { useState, useEffect } from 'react';
import { sqaService } from '../services/erpService';
import { toast } from 'sonner';
import { 
  Database, 
  Play, 
  CheckCircle2, 
  XCircle, 
  Terminal, 
  RefreshCw, 
  Search, 
  HelpCircle, 
  AlertTriangle,
  FileSpreadsheet,
  Layers,
  Sparkles
} from 'lucide-react';

export const SQADiagnosticsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tester' | 'inspector' | 'guide'>('tester');
  const [tables, setTables] = useState<any[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('finish_records');
  const [tableData, setTableData] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [keepTestData, setKeepTestData] = useState(false);
  
  // Test run state
  const [isRunning, setIsRunning] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    test_po: string;
    logs: string[];
    steps: any[];
    duration: number;
  } | null>(null);

  const fetchTables = async () => {
    try {
      const data = await sqaService.getTables();
      setTables(data);
    } catch (err: any) {
      toast.error('Failed to load database tables info.');
    }
  };

  const fetchTableData = async (tbl: string) => {
    try {
      const data = await sqaService.getTableData(tbl, 100);
      setTableData(data);
    } catch (err: any) {
      toast.error(`Failed to load records from ${tbl}`);
    }
  };

  useEffect(() => {
    fetchTables();
    if (selectedTable) {
      fetchTableData(selectedTable);
    }
  }, [selectedTable]);

  const handleRunAutoTest = async () => {
    setIsRunning(true);
    setTestResult(null);
    const id = toast.loading('Executing SQA Automated Integration Suite...', { duration: 10000 });
    try {
      const res = await sqaService.runAutoTest(keepTestData);
      setIsRunning(false);
      toast.dismiss(id);
      if (res.success) {
        toast.success('SQA Integration Suite completed successfully!');
      } else {
        toast.error('SQA Integration Suite reported failure.');
      }
      setTestResult(res);
      fetchTables();
      if (selectedTable) fetchTableData(selectedTable);
    } catch (err: any) {
      setIsRunning(false);
      toast.dismiss(id);
      toast.error(err.response?.data?.error || err.message || 'Auto-test critical exception');
      if (err.response?.data) {
        setTestResult(err.response.data);
      }
    }
  };

  // Filter shown data
  const filteredRows = tableData.filter(row => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return Object.values(row).some(val => 
      String(val).toLowerCase().includes(term)
    );
  });

  const getStatusBadge = (val: string) => {
    const s = String(val).toLowerCase();
    if (s === 'accepted' || s === 'pass' || s === 'active') {
      return <span className="px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">Accepted</span>;
    }
    if (s === 'pending' || s === 'in_transit') {
      return <span className="px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">{s.replace('_', ' ')}</span>;
    }
    if (s === 'rejected' || s === 'fail' || s === 'completed') {
      return <span className="px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400">{s}</span>;
    }
    return <span className="px-2.5 py-1 text-xs font-black uppercase tracking-wider rounded-lg bg-slate-500/10 border border-slate-500/20 text-slate-600 dark:text-slate-400">{s}</span>;
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 rounded-2xl">
              <Database className="w-6 h-6 animate-pulse" />
            </span>
            <div className="flex flex-col">
              <h1 className="text-3xl font-black uppercase tracking-tight text-slate-800 dark:text-white">SQA Test & Diagnostics</h1>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">Core Validation & Live DB Explorer</span>
            </div>
          </div>
        </div>

        {/* Tab switchers */}
        <div className="flex bg-bg2 border border-bg4 p-1.5 rounded-2xl shadow-sm self-start md:self-center">
          <button
            onClick={() => setActiveTab('tester')}
            className={`px-5 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'tester' 
                ? 'bg-bg text-indigo-600 dark:text-indigo-400 border border-bg4 shadow-sm' 
                : 'text-text2 hover:text-text hover:bg-bg3'
            }`}
          >
            <Play className="w-4 h-4" />
            Auto Integration Test
          </button>
          <button
            onClick={() => setActiveTab('inspector')}
            className={`px-5 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'inspector' 
                ? 'bg-bg text-indigo-600 dark:text-indigo-400 border border-bg4 shadow-sm' 
                : 'text-text2 hover:text-text hover:bg-bg3'
            }`}
          >
            <Database className="w-4 h-4" />
            Live DB Inspector
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`px-5 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'guide' 
                ? 'bg-bg text-indigo-600 dark:text-indigo-400 border border-bg4 shadow-sm' 
                : 'text-text2 hover:text-text hover:bg-bg3'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            Troubleshoot Guide
          </button>
        </div>
      </div>

      {/* Main Area */}
      {activeTab === 'tester' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Settings and Trigger Column */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-bg2 border border-bg4 rounded-3xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 scale-150">
                <Sparkles className="w-16 h-16" />
              </div>

              <h2 className="text-lg font-black uppercase tracking-tight text-slate-800 dark:text-white mb-2">Automated Flows</h2>
              <p className="text-sm text-text2 mb-6 leading-relaxed">
                Execute a complete simulation of the <strong className="text-text">Finishing to Stock Store</strong> workflow. 
                Our engine automatically stages dependencies and handles the constraints of transitions.
              </p>

              {/* Keep test data checkbox */}
              <div className="bg-bg3 border border-bg4 rounded-2xl p-4.5 mb-6">
                <label className="flex items-start gap-3.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={keepTestData}
                    onChange={(e) => setKeepTestData(e.target.checked)}
                    className="mt-0.5 rounded border-bg4 text-indigo-600 focus:ring-indigo-500 w-4.5 h-4.5"
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-black uppercase tracking-tight text-text">Keep Test Data in ERP</span>
                    <span className="text-xs text-text2 mt-1 leading-normal">
                      Do not run SQL teardown after execution. This allows you to inspect the temporary Po and pack items in normal UI views!
                    </span>
                  </div>
                </label>
              </div>

              <button
                onClick={handleRunAutoTest}
                disabled={isRunning}
                className={`w-full py-4 px-6 rounded-2xl font-black uppercase tracking-wider text-sm transition-all flex items-center justify-center gap-3.5 shadow-lg ${
                  isRunning 
                    ? 'bg-bg4 text-text3 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20 hover:scale-[1.01]'
                }`}
              >
                {isRunning ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Executing Test Suite...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-current" />
                    Run Integration Suite
                  </>
                )}
              </button>
            </div>

            {/* Steps Guide Visual */}
            <div className="bg-bg2 border border-bg4 rounded-3xl p-6 shadow-xl">
              <h3 className="text-xs font-black uppercase tracking-widest text-text3 mb-4">Pipeline Steps Covered</h3>
              <div className="space-y-3 font-mono text-xs text-text2">
                <div className="flex items-center gap-3 bg-bg3/50 p-2.5 rounded-xl border border-bg4/40">
                  <span className="w-5 h-5 rounded bg-slate-400/20 text-text font-black flex items-center justify-center text-[10px]">01</span>
                  <span>Provision SQA PO &amp; Products</span>
                </div>
                <div className="flex items-center gap-3 bg-bg3/50 p-2.5 rounded-xl border border-bg4/40">
                  <span className="w-5 h-5 rounded bg-slate-400/20 text-text font-black flex items-center justify-center text-[10px]">02</span>
                  <span>Mock Stitching Accepted Inputs</span>
                </div>
                <div className="flex items-center gap-3 bg-bg3/50 p-2.5 rounded-xl border border-bg4/40">
                  <span className="w-5 h-5 rounded bg-slate-400/20 text-text font-black flex items-center justify-center text-[10px]">03</span>
                  <span>Submit Passed Finishing QC</span>
                </div>
                <div className="flex items-center gap-3 bg-bg3/50 p-2.5 rounded-xl border border-bg4/40">
                  <span className="w-5 h-5 rounded bg-slate-400/20 text-text font-black flex items-center justify-center text-[10px]">04</span>
                  <span>Accept Finishing Handover (Packing)</span>
                </div>
                <div className="flex items-center gap-3 bg-bg3/50 p-2.5 rounded-xl border border-bg4/40">
                  <span className="w-5 h-5 rounded bg-indigo-500/10 text-indigo-600 font-bold flex items-center justify-center text-[10px]">05</span>
                  <span className="font-bold text-text">Verify Loose Pieces Availability</span>
                </div>
                <div className="flex items-center gap-3 bg-bg3/50 p-2.5 rounded-xl border border-bg4/40">
                  <span className="w-5 h-5 rounded bg-slate-400/20 text-text font-black flex items-center justify-center text-[10px]">06</span>
                  <span>Loose to Blister Packing Done</span>
                </div>
                <div className="flex items-center gap-3 bg-bg3/50 p-2.5 rounded-xl border border-bg4/40">
                  <span className="w-5 h-5 rounded bg-slate-400/20 text-text font-black flex items-center justify-center text-[10px]">07</span>
                  <span>Verify Blister Available Stock</span>
                </div>
                <div className="flex items-center gap-3 bg-bg3/50 p-2.5 rounded-xl border border-bg4/40">
                  <span className="w-5 h-5 rounded bg-slate-400/20 text-text font-black flex items-center justify-center text-[10px]">08</span>
                  <span>Blister to Carton Draft</span>
                </div>
                <div className="flex items-center gap-3 bg-bg3/50 p-2.5 rounded-xl border border-bg4/40">
                  <span className="w-5 h-5 rounded bg-slate-400/20 text-text font-black flex items-center justify-center text-[10px]">09</span>
                  <span>Perform Internal Carton QC check</span>
                </div>
                <div className="flex items-center gap-3 bg-bg3/50 p-2.5 rounded-xl border border-bg4/40">
                  <span className="w-5 h-5 rounded bg-slate-400/20 text-text font-black flex items-center justify-center text-[10px]">10</span>
                  <span>Transfer to Store (In-Transit)</span>
                </div>
                <div className="flex items-center gap-3 bg-bg3/50 p-2.5 rounded-xl border border-bg4/40">
                  <span className="w-5 h-5 rounded bg-slate-400/20 text-text font-black flex items-center justify-center text-[10px]">11</span>
                  <span>Store Intake &amp; Balance Verification</span>
                </div>
              </div>
            </div>
          </div>

          {/* Test Logs and Results Console */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-bg2 border border-bg4 rounded-3xl p-6 shadow-xl flex flex-col h-[650px]">
              
              <div className="flex items-center justify-between border-b border-bg4 pb-4.5 mb-4 shrink-0">
                <div className="flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-indigo-500 animate-pulse" />
                  <span className="text-sm font-black uppercase tracking-tight text-slate-800 dark:text-white">Verification Engine Output</span>
                </div>
                {testResult && (
                  <div className="flex items-center gap-3.5">
                    <span className="text-xs font-mono text-text3">Duration: {testResult.duration}ms</span>
                    {testResult.success ? (
                      <span className="px-3 py-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-500 font-black text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-4.5 h-4.5" />
                        SUCCESS PASS
                      </span>
                    ) : (
                      <span className="px-3 py-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-500 font-black text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                        <XCircle className="w-4.5 h-4.5" />
                        FAILED CRITICAL
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Logs area */}
              <div className="flex-1 min-h-0 bg-slate-950 dark:bg-slate-900 border border-slate-900 rounded-2xl p-5 overflow-y-auto font-mono text-xs space-y-2 text-slate-100 shadow-inner scrollbar-thin">
                {!testResult && !isRunning && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3.5 font-mono text-center px-6">
                    <Terminal className="w-10 h-10 stroke-[1.25]" />
                    <div className="space-y-1">
                      <p className="text-slate-400 font-semibold">Console Ready for Execution</p>
                      <p className="text-slate-500 text-[11px]">Click "Run Integration Suite" to execute automated test validation workflow.</p>
                    </div>
                  </div>
                )}

                {isRunning && (
                  <div className="font-mono text-slate-400 flex flex-col items-start gap-2">
                    <span className="text-indigo-400 animate-pulse">[SYSTEM] Initializing simulation transaction...</span>
                    <span className="animate-pulse">[SYSTEM] Running database locks and environment sanitization...</span>
                    <span className="flex items-center gap-2 mt-4 text-emerald-400 font-bold">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      SIMULATING PRODUCTION ACTIVITY IN REAL-TIME...
                    </span>
                  </div>
                )}

                {testResult && testResult.logs && testResult.logs.map((log, index) => {
                  let textStyle = "text-slate-300";
                  if (log.includes("[SUCCESS]")) textStyle = "text-emerald-400 font-bold";
                  else if (log.includes("[CRITICAL ERROR]")) textStyle = "text-rose-500 font-bold";
                  else if (log.includes("[STEP]")) textStyle = "text-indigo-300 font-semibold";
                  else if (log.includes("[SYSTEM]")) textStyle = "text-sky-400";
                  else if (log.includes("[CLEANUP]")) textStyle = "text-slate-400 italic";
                  else if (log.includes("[PERSISTENCE]")) textStyle = "text-violet-400 font-semibold";
                  else if (log.includes(">>")) textStyle = "text-amber-300 pl-4";

                  return (
                    <div key={index} className={`whitespace-pre-wrap leading-relaxed py-0.5 border-b border-white/5 last:border-0 ${textStyle}`}>
                      {log}
                    </div>
                  );
                })}
              </div>

              {testResult && testResult.success && keepTestData && (
                <div className="bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border border-indigo-500/20 rounded-2xl p-4.5 mt-5 text-xs text-text flex items-start gap-3.5">
                  <Sparkles className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-black uppercase tracking-tight text-indigo-600 dark:text-indigo-400">Manual Testing Data Persisted!</p>
                    <p className="text-text2 leading-normal">
                      Purchase Order <code className="bg-bg font-black px-1.5 py-0.5 rounded text-indigo-600 dark:text-indigo-400 font-mono text-[11px]">{testResult.test_po}</code> with style 
                      {' '}<strong>SQA-99-STYLE</strong> exists. Go to <strong>Packing Dept Page</strong>, select it, 
                      and watch it sync beautifully in real time!
                    </p>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {activeTab === 'inspector' && (
        <div className="space-y-6">
          {/* Tables layout info */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {tables.map((t) => (
              <button
                key={t.table}
                onClick={() => setSelectedTable(t.table)}
                className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between h-28 relative overflow-hidden group ${
                  selectedTable === t.table
                    ? 'border-indigo-500 bg-indigo-500/5 shadow-md shadow-indigo-500/5'
                    : 'border-bg4 bg-bg2 hover:bg-bg3 hover:border-text2'
                }`}
              >
                <Database className={`w-5 h-5 absolute top-3 right-3 text-text3 transition-transform group-hover:rotate-12 ${
                  selectedTable === t.table ? 'text-indigo-500' : ''
                }`} />
                <span className="text-xs font-black uppercase tracking-wider text-text3 group-hover:text-text truncate mt-4">{t.table.replace('_', ' ')}</span>
                <div className="flex items-baseline gap-1 mt-auto">
                  <span className="text-2xl font-black text-text font-mono">{t.count}</span>
                  <span className="text-[10px] font-bold text-text2 uppercase tracking-wide">rows</span>
                </div>
              </button>
            ))}
          </div>

          {/* Table Data Viewer */}
          <div className="bg-bg2 border border-bg4 rounded-3xl overflow-hidden shadow-xl">
            {/* Header / Filter bar */}
            <div className="p-5 border-b border-bg4 bg-bg/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-5 h-5 text-indigo-500" />
                <div className="flex flex-col">
                  <h3 className="text-sm font-black uppercase tracking-tight text-slate-800 dark:text-white">Browsing table: {selectedTable}</h3>
                  <span className="text-[11px] text-text3 font-bold uppercase tracking-wider">showing latest 100 entries</span>
                </div>
              </div>

              {/* Input for search */}
              <div className="relative max-w-sm w-full">
                <Search className="w-4 h-4 text-text3 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={`Search rows in ${selectedTable}...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full text-xs font-bold pl-10 pr-4 py-2.5 bg-bg border border-bg4 rounded-2xl focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Table data viewer container */}
            <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
              {filteredRows.length === 0 ? (
                <div className="py-20 text-center text-text3 font-mono text-xs">
                  NO ADAPTIVE MATCHING ROWS FOUND
                </div>
              ) : (
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-bg border-b border-bg4 sticky top-0 text-text3 uppercase font-black tracking-wider text-[10px] z-10">
                    <tr>
                      {Object.keys(filteredRows[0]).map(key => (
                        <th key={key} className="px-5 py-3.5 font-bold border-r border-bg4/30">
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bg4/50 text-text">
                    {filteredRows.map((row, r_idx) => (
                      <tr 
                        key={row.id || r_idx} 
                        className={`hover:bg-bg/40 transition-colors ${
                          row.po_number && String(row.po_number).includes('SQA-TEST') ? 'bg-indigo-500/5' : ''
                        }`}
                      >
                        {Object.entries(row).map(([k, v], c_idx) => (
                          <td key={c_idx} className="px-5 py-3 border-r border-bg4/20 max-w-[200px] truncate text-text2 hover:text-text hover:bg-bg3/20 transition-all font-mono">
                            {k === 'status' || k === 'store_status' || k === 'result'
                              ? getStatusBadge(String(v))
                              : String(v === null ? 'NULL' : v)
                            }
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'guide' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          <div className="space-y-6">
            <div className="bg-bg2 border border-bg4 rounded-3xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <AlertTriangle className="w-12 h-12 text-amber-500" />
              </div>

              <h2 className="text-base font-black uppercase tracking-tight text-slate-800 dark:text-white flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                Why directly inserted DB rows don't show?
              </h2>

              <p className="text-sm text-text2 leading-relaxed mb-4">
                If you are running custom SQL queries directly on the SQLite database or adding rows via tools, 
                they might be filtered out due to strict framework queries. Double check these rules:
              </p>

              <div className="space-y-4 font-mono text-xs text-text">
                <div className="border border-bg4/70 p-3.5 rounded-2xl bg-bg/40 space-y-1.5">
                  <p className="font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-tight">1. INNER JOIN on Product Id (Critical)</p>
                  <p className="text-text2 leading-normal">
                    Queries inside <code className="bg-bg px-1 py-0.5 rounded text-[11px]">finishing.ts</code> and <code className="bg-bg px-1 py-0.5 rounded text-[11px]">packing.ts</code> use:
                  </p>
                  <pre className="bg-bg p-2 rounded-xl text-[10px] text-text3 overflow-x-auto mt-1">
                    JOIN po_products p ON f.product_id = p.id
                  </pre>
                  <p className="text-text2 leading-normal mt-1">
                    If you input a dummy/missing or mismatching <code className="bg-bg font-black text-text px-1 rounded">product_id</code>, SQLite completes but the API returns <strong>0 matches</strong> because of the mandatory link to orders.
                  </p>
                </div>

                <div className="border border-bg4/70 p-3.5 rounded-2xl bg-bg/40 space-y-1.5">
                  <p className="font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-tight">2. String checks for Status values</p>
                  <p className="text-text2 leading-normal">
                    States must be strictly lowercase. If you insert <code className="bg-bg px-1 font-bold text-text rounded">"Accepted"</code> or <code className="bg-bg px-1 font-bold text-text rounded">"PENDING"</code>, the backend validations or React state filtering (e.g. <code className="bg-bg px-1 rounded">status === 'pending'</code>) may fail to match and hide those items entirely.
                  </p>
                </div>

                <div className="border border-bg4/70 p-3.5 rounded-2xl bg-bg/40 space-y-1.5">
                  <p className="font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-tight">3. Inactive Purchase Orders</p>
                  <p className="text-text2 leading-normal">
                    Workstation selectors are tied to PO lists where status is <code className="bg-bg px-1 rounded text-emerald-500 font-bold">'active'</code>. If you update the order's status to Completed, its records immediately hide from daily checklist pages.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-bg2 border border-bg4 rounded-3xl p-6 shadow-xl space-y-4">
              <h2 className="text-base font-black uppercase tracking-tight text-slate-800 dark:text-white flex items-center gap-2 mb-3">
                <HelpCircle className="w-5 h-5 text-indigo-500 shrink-0" />
                Frequently Asked SQA Questions
              </h2>

              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-xs font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-tight">Q: How are Loose pieces vs Blister stocks computed?</p>
                  <p className="text-xs text-text2 leading-relaxed">
                    <strong>Loose Available</strong> = Accepted Finishing QCs - Returned Packing items - Blister Pack records that aren't rejected.
                    <br />
                    <strong>Blister Available</strong> = Accepted Blister outputs - Carton pack records that aren't rejected.
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-tight">Q: Why did my quantities drop to zero?</p>
                  <p className="text-xs text-text2 leading-relaxed">
                    Check if you have any returns filed under the Returns Page. The backend aggregates all approved returned quantities per product and automatically subtracts them from the total finished outputs to prevent over-dispatching down the line.
                  </p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-tight">Q: How do we transfer Cartons in other stores?</p>
                  <p className="text-xs text-text2 leading-relaxed">
                    After creating a carton pack record inside the Packing page, verify it on Carton QC. Once verified, click "Transfer to Store" inside the Packing active console. This generates an "In Transit" status, allowing Store operators to run intake confirmation.
                  </p>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
