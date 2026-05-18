import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { 
  Code, LayoutTemplate, Activity, Play, CheckCircle2, 
  Terminal, ShieldCheck, Database, BrainCircuit, Loader2,
  Maximize2
} from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart as RechartsPie, Pie, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ScatterChart, Scatter } from 'recharts';
import { D3Visual } from '../components/D3Visual';
import { computeDataTruth } from '../lib/DataTruthEngine';

export function CodeCanvas() {
  const { spaceId } = useParams();
  const spaces = useStore(state => state.spaces);
  const updateSpace = useStore(state => state.updateSpace);
  const activeSpace = spaces.find(s => s.id === spaceId);
  const [viewMode, setViewMode] = useState<'split' | 'code' | 'visual'>('split');

  const { executionState = 'idle', generatedCode = '', executionTimeline = [], promptContext = '', datasets = [], parsedData = [] } = activeSpace || {};
  
  const [localCode, setLocalCode] = useState(generatedCode);
  const [previewData, setPreviewData] = useState<any>(activeSpace?.visualInsights?.[0] || null);

  // Debounced preview update
  useEffect(() => {
    const handler = setTimeout(() => {
      try {
        const parsed = JSON.parse(localCode);
        setPreviewData(parsed);
        // Persist when correctly parsed
        const updatedInsights = [...(activeSpace?.visualInsights || [])];
        if (updatedInsights.length > 0) {
           updatedInsights[0] = parsed;
        } else {
           updatedInsights.push(parsed);
        }
        updateSpace(spaceId!, { 
            visualInsights: updatedInsights,
            generatedCode: localCode // keep store sync
        });
      } catch (e) {
        // invalid JSON, ignore
      }
    }, 800);
    return () => clearTimeout(handler);
  }, [localCode, spaceId, updateSpace]);

  useEffect(() => {
    if (activeSpace && activeSpace.executionState === 'running') {
       runPipeline();
    } else if (activeSpace && activeSpace.executionState === 'completed') {
       // Pull fresh code when pipeline finishes successfully
       if (activeSpace.generatedCode && activeSpace.generatedCode !== localCode) {
           setLocalCode(activeSpace.generatedCode);
       }
       setPreviewData(activeSpace?.visualInsights?.[0] || null);
    }
  }, [activeSpace?.executionState]);

  const runPipeline = async () => {
    if (!activeSpace || !spaceId) return;

    let updatedTimeline = [
       ...executionTimeline, 
       { id: `tx-${Date.now()}-1`, agent: 'Orchestrator', action: 'Initiating Visual Dashboard Gen', status: 'running' as const, timestamp: new Date().toISOString() },
       { id: `tx-${Date.now()}-2`, agent: 'Visual Code Agent', action: 'Generating D3 & Recharts code', status: 'pending' as const, timestamp: new Date().toISOString() }
    ];
    updateSpace(spaceId, { executionTimeline: updatedTimeline });
    
    for (let i = 0; i < updatedTimeline.length; i++) {
       if (updatedTimeline[i].status === 'success') continue;
       
       updatedTimeline = updatedTimeline.map((step, idx) => 
         idx === i ? { ...step, status: 'running' as const } : step
       );
       updateSpace(spaceId, { executionTimeline: updatedTimeline });
       
       await new Promise(r => setTimeout(r, 1200)); // Simulate work
       
       updatedTimeline = updatedTimeline.map((step, idx) => 
         idx === i ? { ...step, status: 'success' as const, timestamp: new Date().toISOString() } : step
       );
       updateSpace(spaceId, { executionTimeline: updatedTimeline });
    }

    // Call Gemini to generate actual code, injecting Computed Data
    try {
       const datasetsToAnalyze = (activeSpace.datasets && activeSpace.datasets.length > 0) 
         ? activeSpace.datasets 
         : activeSpace.parsedData 
           ? [{ id: 'legacy', name: 'Legacy Dataset', data: activeSpace.parsedData, columns: activeSpace.columns || [] }] 
           : [];

       let datasetSummary = '';

       if (datasetsToAnalyze.length === 0) {
         datasetSummary += "No datasets available.\n";
       } else {
         datasetsToAnalyze.forEach(ds => {
           const truth = computeDataTruth(ds.data);
           datasetSummary += `Dataset: ${ds.name || ds.id}
       Fields: ${ds.columns?.map((c: any) => c.name).join(', ')}
       Row Count: ${truth.rowCount}
       Numeric Summaries:
       ${Object.entries(truth.numericSummary).map(([col, stat]) => `- ${col}: Sum=${stat.sum.toFixed(2)}, Avg=${stat.avg.toFixed(2)}, Min=${stat.min}, Max=${stat.max}`).join('\n')}
       `;
         });
       }
       
       const prompt = `You are a Visual Code Agent supported by a deterministic Data Engine. Use the computed summaries below to generate the dashboard.
       Computed Real Data Summaries:
       ${datasetSummary}
       
       User Intent: ${promptContext || 'Analyze my data overview'}
       
       KNOWLEDGE PACK (D3.js & Charting Capabilities):
       You MUST formulate your dashboard using our strictly supported chart types.
       1. Recharts Types: "bar", "line", "area", "pie", "scatter". 
       2. D3.js Types: "force", "pack", "radial", "tree".
       
       VARIETY IS REQUIRED. Do not just use bar charts. Analyze the data and pick the best representation:
       - Use "pie" for categorical compositions.
       - Use "line" or "area" for temporal or sequential series.
       - Use "scatter" for distributions and correlations.
       - Use "force" (D3) for network graphs showing relationships between entities.
       - Use "pack" (D3) for hierarchical circle-packing or clustered counts.
       - Use "radial" (D3) for circular visualizations or periodic patterns.
       - Use "tree" (D3) for clear organizational hierarchies or parent-child structures.
       
       CRITICAL INSTRUCTIONS:
       1. For KPIs, YOU MUST inject EXACT values from the "Numeric Summaries" above. DO NOT use placeholders. If the user asks for total revenue, find revenue sum and use it inside "value". Format cleanly (e.g. "1,450" or "$1.2M"). 
       2. NEVER hallucinate string tags or unrelated keys for chart axis fields. Use exact column names from the "Dataset fields" list.
       3. ALWAYS mix and match chart types depending on data semantics. You MUST include at least one D3.js chart type ("force", "pack", "radial", or "tree") if the data context has potential hierarchies or categorizations.
       4. Return "fontFamily": "font-sans" | "font-mono" | "font-grotesk" | "font-outfit" | "font-serif" | "font-roboto"
       
       OUTPUT A STRICT JSON OBJECT ONLY.
       Schema:
       {
         "title": "Data Dashboard",
         "fontFamily": "font-sans | font-mono | font-grotesk | font-outfit | font-serif | font-roboto",
         "globalBg": "#HEX",
         "borderRadius": "rounded-none | rounded-md | rounded-xl | rounded-2xl | rounded-3xl | rounded-full",
         "kpis": [{ "label": "string", "value": "string (ACTUAL VALUE)", "trend": "string (optional)" }],
         "charts": [
           { 
             "title": "string",
             "type": "bar" | "line" | "area" | "pie" | "scatter" | "force" | "pack" | "radial" | "tree",
             "xAxisField": "columnName",
             "yAxisField": "columnName",
             "groupField": "optionalColumnName",
             "sizeField": "optionalColumnName",
             "color": "#HEX",
             "bgColor": "#HEX"
           }
         ]
       }
       `;

       const response = await fetch('/api/gemini', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', 'x-api-key': localStorage.getItem('sentinel_api_key') || '' },
         body: JSON.stringify({ model: 'gemini-3-flash-preview', contents: prompt })
       });

       let generatedText = '';
       let generatedJson = null;

       if (response.ok) {
         const data = await response.json();
         generatedText = data.text || '';
         const rawJsonString = generatedText.replace(/^\`\`\`(json)?/gm, '').replace(/\`\`\`$/gm, '').trim();
         try {
            generatedJson = JSON.parse(rawJsonString);

            updateSpace(spaceId, { 
               executionState: 'completed', 
               generatedCode: JSON.stringify(generatedJson, null, 2),
               visualInsights: [generatedJson as any]
            });
         } catch (err) {
            updateSpace(spaceId, { executionState: 'completed', generatedCode: `// Failed to parse JSON\n${generatedText}` });
         }
       } else {
         updateSpace(spaceId, { executionState: 'completed', generatedCode: '// API Error' });
       }
    } catch (e) {
       console.error("Pipeline failure:", e);
       updateSpace(spaceId, { executionState: 'completed', generatedCode: '// Fallback rendered code' });
    }
  };

  if (!activeSpace) {
    return (
      <div className="flex flex-col items-center justify-center h-full animate-in fade-in duration-500">
         <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4 border border-blue-100 shadow-sm relative">
           <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
         </div>
         <p className="font-semibold text-gray-500">Connecting to Intelligence Engine...</p>
      </div>
    );
  }

  if (executionState === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 animate-in fade-in duration-500">
         <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-6 border border-gray-100 shadow-sm relative">
           <LayoutTemplate className="w-10 h-10 text-gray-400" />
         </div>
         <h2 className="text-3xl font-bold mb-3 tracking-tight text-gray-900">Code Canvas is Empty</h2>
         <p className="text-gray-500 max-w-md font-medium text-[15px]">The agent topology has not generated any visuals yet. Upload data and provide a prompt to start the AI pipeline.</p>
      </div>
    );
  }

  const chartData = datasets[0]?.data || parsedData || [];

  return (
    <div className="flex flex-col h-full space-y-6 animate-in fade-in duration-500">
      {/* Top action bar */}
      <div className="flex justify-between items-center bg-white p-2 rounded-2xl soft-shadow border-none">
         <div className="flex items-center space-x-4 ml-2">
            <h2 className="font-bold text-[15px] flex items-center text-gray-900">
               <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center mr-3 border border-blue-100">
                 <Terminal className="w-4 h-4 text-blue-600" /> 
               </div>
               Generated Intelligence Canvas
            </h2>
            {executionState === 'running' && (
               <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50 px-2.5 py-1">
                  <Activity className="w-3 h-3 mr-1.5 animate-pulse" /> Generating...
               </Badge>
            )}
            {executionState === 'completed' && (
               <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50 px-2.5 py-1">
                  <CheckCircle2 className="w-3 h-3 mr-1.5" /> Compilation Success
               </Badge>
            )}
         </div>
         <div className="flex bg-gray-50/50 border border-gray-100 rounded-xl p-1 shadow-sm">
            <Button 
               variant={viewMode === 'code' ? 'secondary' : 'ghost'} 
               size="sm" 
               className={`h-8 text-xs font-semibold px-4 rounded-lg transition-colors ${viewMode === 'code' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
               onClick={() => setViewMode('code')}
            >
               <Code className="w-3.5 h-3.5 mr-1.5" /> Code
            </Button>
            <Button 
               variant={viewMode === 'split' ? 'secondary' : 'ghost'} 
               size="sm" 
               className={`h-8 text-xs font-semibold px-4 rounded-lg transition-colors ${viewMode === 'split' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
               onClick={() => setViewMode('split')}
            >
               <LayoutTemplate className="w-3.5 h-3.5 mr-1.5" /> Split
            </Button>
            <Button 
               variant={viewMode === 'visual' ? 'secondary' : 'ghost'} 
               size="sm" 
               className={`h-8 text-xs font-semibold px-4 rounded-lg transition-colors ${viewMode === 'visual' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
               onClick={() => setViewMode('visual')}
            >
               <Play className="w-3.5 h-3.5 mr-1.5" /> Visual
            </Button>
         </div>
      </div>

      {executionState === 'running' && (
         <div className="flex-1 flex flex-col items-center justify-center p-8 border-none rounded-3xl soft-shadow bg-white">
            <div className="w-24 h-24 bg-blue-50/50 rounded-full flex items-center justify-center mb-6">
              <BrainCircuit className="w-10 h-10 text-blue-500 animate-pulse" />
            </div>
            <h3 className="text-2xl font-bold tracking-tight text-gray-900 mb-8">AI Execution Pipeline Active</h3>
            
            <div className="w-full max-w-2xl space-y-4">
               {executionTimeline.map((step, idx) => (
                  <div key={idx} className={`flex items-center justify-between p-5 rounded-xl border transition-all duration-300 ${step.status === 'running' ? 'bg-blue-50/30 border-blue-100 shadow-sm' : step.status === 'success' ? 'bg-emerald-50/20 border-emerald-100' : 'bg-gray-50/50 border-gray-100 opacity-60'}`}>
                     <div className="flex items-center space-x-4">
                        {step.status === 'success' ? (
                           <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        ) : step.status === 'running' ? (
                           <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                        ) : (
                           <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                        )}
                        <div>
                           <p className={`font-bold text-[15px] ${step.status === 'running' ? 'text-blue-900' : 'text-gray-900'}`}>{step.agent}</p>
                           <p className="text-xs font-medium text-gray-500 mt-0.5">{step.action}</p>
                        </div>
                     </div>
                     <Badge variant="outline" className="text-xs font-semibold uppercase tracking-wider opacity-70 bg-white shadow-sm">{step.status}</Badge>
                  </div>
               ))}
            </div>
         </div>
      )}

      {executionState === 'completed' && (
         <div className={`flex-1 flex gap-6 overflow-hidden ${viewMode === 'split' ? 'flex-row' : 'flex-col'}`}>
            
            {/* Code Panel */}
            {(viewMode === 'split' || viewMode === 'code') && (
               <div className={`border-none rounded-[2rem] soft-shadow bg-[#11131a] flex flex-col overflow-hidden ${viewMode === 'split' ? 'w-1/2' : 'flex-1'} relative`}>
                  <div className="bg-[#181C25] px-6 py-4 border-b border-[#282d3b] flex items-center justify-between">
                     <span className="text-sm text-blue-400 font-mono font-semibold tracking-wide flex items-center">
                        <Code className="w-4 h-4 mr-2" /> GeneratedLayout.json (Editable)
                     </span>
                     <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white hover:bg-[#282d3b] rounded-xl transition-colors">
                        <Maximize2 className="w-4 h-4" />
                     </Button>
                  </div>
                  <textarea 
                    className="p-6 overflow-auto custom-scrollbar flex-1 font-mono text-[13px] text-gray-300 leading-loose bg-transparent border-none focus:outline-none resize-none w-full"
                    spellCheck={false}
                    value={localCode}
                    onChange={(e) => setLocalCode(e.target.value)}
                  />
               </div>
            )}

            {/* Visual Panel */}
            {(viewMode === 'split' || viewMode === 'visual') && (
               <div className={`border-none rounded-[2rem] soft-shadow bg-gray-50/70 flex flex-col overflow-hidden ${viewMode === 'split' ? 'w-1/2' : 'flex-1'}`}>
                  <div className="bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                     <span className="text-sm font-bold text-gray-900 flex items-center">
                        <Play className="w-4 h-4 text-emerald-500 mr-2" /> Live Render Preview
                     </span>
                  </div>
                  <div className="p-8 overflow-auto custom-scrollbar flex-1">
                     {previewData ? (
                        <div style={{ backgroundColor: previewData.globalBg || '' }} className={`space-y-8 p-6 -mx-6 rounded-[2.5rem] relative ${previewData.fontFamily || 'font-sans'} ${!previewData.globalBg && 'bg-gray-50/50'}`}>
                           <h3 className="text-2xl font-bold tracking-tight text-gray-900">{previewData.title}</h3>
                           
                           <div className="grid grid-cols-3 gap-6">
                              {previewData.kpis?.map((kpi: any, i: number) => (
                                 <Card key={i} className={`border-none soft-shadow bg-white ${previewData.borderRadius || 'rounded-3xl'}`}>
                                    <CardContent className="p-6">
                                       <p className="text-[13px] font-bold uppercase tracking-wider text-gray-400">{kpi.label}</p>
                                       <p className="text-[32px] font-extrabold mt-3 text-gray-900 tracking-tight">{kpi.value}</p>
                                       {kpi.trend && <p className="text-sm font-semibold text-emerald-500 mt-2">{kpi.trend}</p>}
                                    </CardContent>
                                 </Card>
                              ))}
                           </div>

                           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              {previewData.charts?.map((chart: any, i: number) => {
                                 let localChartData = chartData;
                                 if (chart.filterField && chart.filterValue && chart.filterOp) {
                                     localChartData = localChartData.filter((d: any) => {
                                         const val = d[chart.filterField];
                                         const numVal = Number(val);
                                         const fVal = chart.filterValue;
                                         const numFVal = Number(fVal);
                  
                                         switch (chart.filterOp) {
                                             case 'equals': return String(val || '').toLowerCase() === String(fVal || '').toLowerCase();
                                             case 'not_equals': return String(val || '').toLowerCase() !== String(fVal || '').toLowerCase();
                                             case 'contains': return String(val || '').toLowerCase().includes(String(fVal || '').toLowerCase());
                                             case 'not_contains': return !String(val || '').toLowerCase().includes(String(fVal || '').toLowerCase());
                                             case 'starts_with': return String(val || '').toLowerCase().startsWith(String(fVal || '').toLowerCase());
                                             case 'ends_with': return String(val || '').toLowerCase().endsWith(String(fVal || '').toLowerCase());
                                             case 'gt': return !isNaN(numVal) && !isNaN(numFVal) && val !== '' && fVal !== '' ? numVal > numFVal : String(val || '') > String(fVal || '');
                                             case 'gte': return !isNaN(numVal) && !isNaN(numFVal) && val !== '' && fVal !== '' ? numVal >= numFVal : String(val || '') >= String(fVal || '');
                                             case 'lt': return !isNaN(numVal) && !isNaN(numFVal) && val !== '' && fVal !== '' ? numVal < numFVal : String(val || '') < String(fVal || '');
                                             case 'lte': return !isNaN(numVal) && !isNaN(numFVal) && val !== '' && fVal !== '' ? numVal <= numFVal : String(val || '') <= String(fVal || '');
                                             default: return true;
                                         }
                                     });
                                 }

                                 const isD3 = ['force', 'radial', 'pack', 'tree', 'scatter'].includes(chart.type);
                                 
                                 return (
                                    <Card key={i} style={{ backgroundColor: chart.bgColor || '#ffffff' }} className={`border-none soft-shadow p-2 ${previewData.borderRadius || 'rounded-3xl'}`}>
                                       <CardHeader className="px-6 pt-6 pb-2">
                                          <CardTitle className="text-lg font-bold text-gray-900">{chart.title}</CardTitle>
                                       </CardHeader>
                                       <CardContent className="px-6 pb-6">
                                          <div className="h-[240px] w-full mt-4">
                                             {isD3 ? (
                                                <D3Visual data={localChartData.slice(0, 100)} config={chart} />
                                             ) : (
                                                <ResponsiveContainer width="100%" height="100%">
                                                   {chart.type === 'bar' ? (
                                                      <BarChart data={localChartData.slice(0, 50)} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                                         <XAxis dataKey={chart.xAxisField} stroke="#cbd5e1" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                                                         <YAxis hide />
                                                         <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: 'none', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} itemStyle={{ color: '#111827', fontWeight: 600 }} />
                                                         <Bar dataKey={chart.yAxisField} fill={chart.color || '#3b82f6'} radius={[6, 6, 0, 0]} isAnimationActive={false} />
                                                      </BarChart>
                                                   ) : chart.type === 'line' ? (
                                                      <LineChart data={localChartData.slice(0, 50)} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                                                         <XAxis dataKey={chart.xAxisField} stroke="#cbd5e1" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                                                         <YAxis hide />
                                                         <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: 'none', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} itemStyle={{ color: '#111827', fontWeight: 600 }} />
                                                         <Line type="natural" dataKey={chart.yAxisField} stroke={chart.color || '#8b5cf6'} strokeWidth={3} dot={false} isAnimationActive={false} />
                                                      </LineChart>
                                                   ) : chart.type === 'pie' ? (
                                                     <RechartsPie>
                                                       <Pie
                                                         data={localChartData.slice(0, 50)}
                                                         dataKey={chart.yAxisField}
                                                         nameKey={chart.xAxisField}
                                                         cx="50%"
                                                         cy="50%"
                                                         outerRadius={80}
                                                         fill={chart.color || '#3b82f6'}
                                                         label
                                                         isAnimationActive={false}
                                                       >
                                                         {localChartData.slice(0, 50).map((entry: any, index: number) => (
                                                           <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'][index % 7]} />
                                                         ))}
                                                       </Pie>
                                                       <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: 'none', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} itemStyle={{ color: '#111827', fontWeight: 600 }} />
                                                     </RechartsPie>
                                                   ) : chart.type === 'scatter' ? (
                                                     <ScatterChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                                                         <XAxis dataKey={chart.xAxisField} type="number" name={chart.xAxisField} stroke="#cbd5e1" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                                                         <YAxis dataKey={chart.yAxisField} type="number" name={chart.yAxisField} hide />
                                                         <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#ffffff', border: 'none', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} itemStyle={{ color: '#111827', fontWeight: 600 }} />
                                                         <Scatter name="Data" data={localChartData.slice(0, 50)} fill={chart.color || '#8b5cf6'} isAnimationActive={false} />
                                                     </ScatterChart>
                                                   ) : (
                                                      <AreaChart data={localChartData.slice(0, 50)} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                                                         <defs>
                                                            <linearGradient id={`color-cc-${i}`} x1="0" y1="0" x2="0" y2="1">
                                                               <stop offset="5%" stopColor={chart.color || '#10b981'} stopOpacity={0.2}/>
                                                               <stop offset="95%" stopColor={chart.color || '#10b981'} stopOpacity={0}/>
                                                            </linearGradient>
                                                         </defs>
                                                         <XAxis dataKey={chart.xAxisField} stroke="#cbd5e1" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                                                         <YAxis hide />
                                                         <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: 'none', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} itemStyle={{ color: '#111827', fontWeight: 600 }} />
                                                         <Area type="natural" dataKey={chart.yAxisField} stroke={chart.color || '#10b981'} strokeWidth={3} fillOpacity={1} fill={`url(#color-cc-${i})`} isAnimationActive={false} />
                                                      </AreaChart>
                                                   )}
                                                </ResponsiveContainer>
                                             )}
                                          </div>
                                       </CardContent>
                                    </Card>
                                 );
                              })}
                           </div>
                        </div>
                     ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 font-medium text-[15px] bg-white rounded-2xl border border-dashed border-gray-200">
                           <LayoutTemplate className="w-10 h-10 mb-4 text-gray-300" />
                           <p>No valid render output available.</p>
                        </div>
                     )}
                  </div>
               </div>
            )}
         </div>
      )}
    </div>
  );
}
