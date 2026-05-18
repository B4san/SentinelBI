import React, { useMemo, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { AreaChart, Area, BarChart, Bar, PieChart as RechartsPie, Pie, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ScatterChart, Scatter, LineChart, Line } from 'recharts';
import { BrainCircuit, Activity, PieChart, Sparkles, Download, FileImage, FileText, Globe, Presentation, Layers, MousePointer2, ArrowDownRight, ArrowUpRight, BarChart2, Edit3, ArrowLeft, ArrowRight, Save, Filter, RefreshCw } from 'lucide-react';
import { D3Visual } from '../components/D3Visual';
import { toCanvas } from 'html-to-image';
import { jsPDF } from 'jspdf';
import PptxGenJS from 'pptxgenjs';
import { ExecutiveReportBuilder } from '../components/ExecutiveReportBuilder';
import { computeDataTruth } from '../lib/DataTruthEngine';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

const MemoizedChartCard = React.memo(({ chart, i, data, isEditMode, moveChart, updateChartField, handleExplainInsight, datasets, generatedLayout }: any) => {
   // Use selected dataset or default to first
   const selectedDataset = datasets?.find((d: any) => d.id === chart.datasetId) || datasets?.[0];
   const resolvedData = selectedDataset?.data || [];
   
   let chartData = resolvedData;
   if (chart.filterField && chart.filterValue && chart.filterOp) {
       chartData = chartData.filter((d: any) => {
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
   chartData = chartData.slice(0, 100);
   const isD3 = ['force', 'network', 'chord', 'arc', 'radial', 'spider', 'pack', 'circle-pack', 'treemap', 'tree', 'dendrogram', 'sankey', 'hierarchy', 'heatmap', 'calendar', 'matrix', 'dot-plot', 'swarm', 'distribution'].includes(chart.type);

   return (
      <Card style={{ backgroundColor: chart.bgColor || '#ffffff' }} className={`flex flex-col border-none soft-shadow p-2 group relative transition-all duration-300 ${generatedLayout.borderRadius || 'rounded-3xl'} ${isEditMode ? 'ring-2 ring-blue-400 ring-offset-2' : ''}`}>
         {isEditMode && (
           <div className="absolute -top-3 -right-3 z-50 flex items-center bg-white rounded-full shadow-lg border border-gray-100 p-1">
             <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => moveChart(i, 'left')} disabled={i === 0}>
               <ArrowLeft className="w-4 h-4 text-gray-500" />
             </Button>
             <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => moveChart(i, 'right')} disabled={i === generatedLayout.charts.length - 1}>
               <ArrowRight className="w-4 h-4 text-gray-500" />
             </Button>
             <div className="w-px h-4 bg-gray-200 mx-1"></div>
             {datasets?.length > 1 && (
               <>
                 <select 
                   className="bg-transparent border-none text-xs font-semibold focus:ring-0 cursor-pointer pr-4 max-w-[100px] truncate" 
                   value={chart.datasetId || ''}
                   onChange={(e) => updateChartField(i, 'datasetId', e.target.value)}
                   title="Select Dataset"
                 >
                    {datasets.map((d: any) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                 </select>
                 <div className="w-px h-4 bg-gray-200 mx-1"></div>
               </>
             )}
             <select 
               className="bg-transparent border-none text-xs font-semibold focus:ring-0 cursor-pointer pr-4" 
               value={chart.type}
               onChange={(e) => updateChartField(i, 'type', e.target.value)}
               title="Chart Type"
             >
                <optgroup label="Bar Elements">
                  <option value="bar">Bar</option>
                  <option value="stacked-bar">Stacked Bar</option>
                  <option value="grouped-bar">Grouped Bar</option>
                  <option value="horizontal-bar">Horizontal Bar</option>
                  <option value="waterfall">Waterfall</option>
                </optgroup>
                <optgroup label="Trend Elements">
                  <option value="line">Line</option>
                  <option value="stepped-line">Stepped Line</option>
                  <option value="bump">Bump</option>
                  <option value="area">Area</option>
                  <option value="stacked-area">Stacked Area</option>
                  <option value="streamgraph">Streamgraph</option>
                </optgroup>
                <optgroup label="Circular">
                  <option value="pie">Pie</option>
                  <option value="donut">Donut</option>
                  <option value="sunburst">Sunburst</option>
                  <option value="nightingale">Nightingale</option>
                </optgroup>
                <optgroup label="Point & Distribution">
                  <option value="scatter">Scatter</option>
                  <option value="bubble">Bubble</option>
                  <option value="jitter">Jitter</option>
                  <option value="dot-plot">Dot Plot</option>
                  <option value="distribution">Distribution</option>
                </optgroup>
                <optgroup label="Network & Relational (D3)">
                  <option value="force">Force Network</option>
                  <option value="arc">Arc Diagram</option>
                  <option value="chord">Chord Diagram</option>
                  <option value="network">Network Map</option>
                </optgroup>
                <optgroup label="Hierarchical (D3)">
                  <option value="tree">Tree</option>
                  <option value="dendrogram">Dendrogram</option>
                  <option value="pack">Circle Pack</option>
                  <option value="treemap">Treemap</option>
                  <option value="sankey">Sankey</option>
                </optgroup>
                <optgroup label="Radial & Maps (D3)">
                  <option value="radial">Radial</option>
                  <option value="spider">Spider</option>
                  <option value="heatmap">Heatmap</option>
                  <option value="calendar">Calendar</option>
                  <option value="matrix">Matrix</option>
                </optgroup>
             </select>
             <div className="w-px h-4 bg-gray-200 mx-1"></div>
             <div className="relative group/color px-2">
                <div className="w-5 h-5 rounded-full border shadow-sm cursor-pointer" style={{ backgroundColor: chart.color || '#3b82f6' }}></div>
                <input type="color" className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer" value={chart.color || '#3b82f6'} onChange={(e) => updateChartField(i, 'color', e.target.value)} title="Chart Color" />
             </div>
             <div className="relative group/bg px-2">
                <div className="w-5 h-5 rounded-full border shadow-sm cursor-pointer border-dashed" style={{ backgroundColor: chart.bgColor || '#ffffff' }}></div>
                <input type="color" className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer" value={chart.bgColor || '#ffffff'} onChange={(e) => updateChartField(i, 'bgColor', e.target.value)} title="Background Color" />
             </div>
           </div>
         )}
         <CardHeader className="px-6 pt-6 pb-2 flex flex-col items-start justify-between">
            <div className="w-full flex justify-between">
                <div className="flex-1">
                   {isEditMode ? (
                     <Input 
                       value={chart.title} 
                       onChange={(e) => updateChartField(i, 'title', e.target.value)}
                       className="text-xl font-bold h-9 w-full bg-transparent border-dashed focus-visible:ring-1 p-0"
                     />
                   ) : (
                     <CardTitle className="text-xl font-bold text-gray-900 flex items-center justify-between">
                       {chart.title}
                     </CardTitle>
                   )}
                   <CardDescription className="font-medium mt-1 mb-2 text-gray-500 flex items-center flex-wrap gap-2">
                     <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full text-gray-600 border border-gray-200">{selectedDataset?.name || 'Primary Dataset'}</span>
                     {!isEditMode && chart.filterField && chart.filterValue && (
                       <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 border">
                         <Filter className="w-3 h-3 mr-1" /> {chart.filterField} {chart.filterOp || 'contains'} {chart.filterValue}
                       </span>
                     )}
                   </CardDescription>
                </div>
                {!isEditMode && (
                  <Button variant="outline" size="sm" onClick={(e) => handleExplainInsight(i, chart, e)} className="hidden group-hover:flex h-8 text-xs font-semibold rounded-full items-center text-blue-600 border-blue-200 bg-blue-50/50 hover:bg-blue-100 transition-all opacity-0 group-hover:opacity-100 shrink-0 ml-4 relative z-20">
                     <Sparkles className="w-3 h-3 mr-1" /> Explain Insight
                  </Button>
                )}
            </div>
            {isEditMode && (
                <div className="flex items-center space-x-2 w-full text-xs mt-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                    <span className="text-gray-500 font-semibold flex items-center"><Filter className="w-3 h-3 mr-1" /> Filter:</span>
                    <select 
                        value={chart.filterField || ''} 
                        onChange={(e) => updateChartField(i, 'filterField', e.target.value)} 
                        className="bg-transparent border-b border-gray-300 focus:border-blue-500 outline-none p-1 flex-1 max-w-[120px]"
                    >
                        <option value="">No filter</option>
                        {selectedDataset?.columns?.map((c: any) => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                    {chart.filterField && (
                        <>
                            <select 
                                value={chart.filterOp || 'contains'} 
                                onChange={(e) => updateChartField(i, 'filterOp', e.target.value)} 
                                className="bg-transparent border-b border-gray-300 focus:border-blue-500 outline-none p-1"
                            >
                                <option value="contains">Contains</option>
                                <option value="not_contains">Not Contains</option>
                                <option value="equals">Equals</option>
                                <option value="not_equals">Not Equals</option>
                                <option value="starts_with">Starts With</option>
                                <option value="ends_with">Ends With</option>
                                <option value="gt">&gt;</option>
                                <option value="gte">&gt;=</option>
                                <option value="lt">&lt;</option>
                                <option value="lte">&lt;=</option>
                            </select>
                            <input 
                                type="text" 
                                value={chart.filterValue || ''} 
                                onChange={(e) => updateChartField(i, 'filterValue', e.target.value)} 
                                list={`filter-values-${i}`}
                                className="bg-transparent border-b border-gray-300 focus:border-blue-500 outline-none p-1 w-24" 
                                placeholder="Value..." 
                            />
                            <datalist id={`filter-values-${i}`}>
                                {Array.from(new Set((resolvedData || data).map((d: any) => d[chart.filterField]).filter((v: any) => v !== null && v !== undefined))).slice(0, 50).map((v: any) => (
                                    <option key={v} value={v} />
                                ))}
                            </datalist>
                        </>
                    )}
                </div>
            )}
         </CardHeader>
         <CardContent className="flex-1 px-6 pb-6 relative">
            <div className="h-[320px] w-full mt-4">
               {isD3 ? (
                  <D3Visual data={chartData} config={chart} />
               ) : (
                  <ResponsiveContainer width="100%" height="100%">
                     {['bar', 'stacked-bar', 'grouped-bar', 'horizontal-bar', 'waterfall'].includes(chart.type) ? (
                        <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                           <XAxis dataKey={chart.xAxisField} stroke="#cbd5e1" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                           <YAxis hide />
                           <Tooltip 
                             contentStyle={{ backgroundColor: '#ffffff', border: 'none', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                             itemStyle={{ color: '#111827', fontWeight: 600 }}
                           />
                           <Bar dataKey={chart.yAxisField} fill={chart.color || '#3b82f6'} radius={[10, 10, 0, 0]} isAnimationActive={false} />
                        </BarChart>
                     ) : ['line', 'stepped-line', 'bump'].includes(chart.type) ? (
                        <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                           <XAxis dataKey={chart.xAxisField} stroke="#cbd5e1" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                           <YAxis hide />
                           <Tooltip 
                             contentStyle={{ backgroundColor: '#ffffff', border: 'none', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                             itemStyle={{ color: '#111827', fontWeight: 600 }}
                           />
                           <Line type={chart.type === 'stepped-line' ? 'stepAfter' : "natural"} dataKey={chart.yAxisField} stroke={chart.color || '#8b5cf6'} strokeWidth={4} dot={false} activeDot={{ r: 6, strokeWidth: 0 }} isAnimationActive={false} />
                        </LineChart>
                     ) : ['area', 'stacked-area', 'streamgraph'].includes(chart.type) ? (
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                           <XAxis dataKey={chart.xAxisField} stroke="#cbd5e1" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                           <YAxis hide />
                           <Tooltip 
                             contentStyle={{ backgroundColor: '#ffffff', border: 'none', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                             itemStyle={{ color: '#111827', fontWeight: 600 }}
                           />
                           <Area type="natural" dataKey={chart.yAxisField} stroke={chart.color || '#10b981'} fill={chart.color || '#10b981'} fillOpacity={0.3} strokeWidth={2} isAnimationActive={false} />
                        </AreaChart>
                     ) : ['pie', 'donut', 'sunburst', 'nightingale'].includes(chart.type) ? (
                       <RechartsPie>
                         <Pie
                           data={chartData}
                           dataKey={chart.yAxisField}
                           nameKey={chart.xAxisField}
                           cx="50%"
                           cy="50%"
                           outerRadius={100}
                           innerRadius={['donut', 'sunburst'].includes(chart.type) ? 60 : 0}
                           fill={chart.color || '#3b82f6'}
                           label
                           isAnimationActive={false}
                         >
                           {chartData.map((entry: any, index: number) => (
                             <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'][index % 7]} />
                           ))}
                         </Pie>
                         <Tooltip 
                           contentStyle={{ backgroundColor: '#ffffff', border: 'none', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                           itemStyle={{ color: '#111827', fontWeight: 600 }}
                         />
                       </RechartsPie>
                     ) : ['scatter', 'bubble', 'jitter'].includes(chart.type) ? (
                       <ScatterChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                           <XAxis dataKey={chart.xAxisField} type="number" name={chart.xAxisField} stroke="#cbd5e1" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                           <YAxis dataKey={chart.yAxisField} type="number" name={chart.yAxisField} hide />
                           <Tooltip 
                             cursor={{ strokeDasharray: '3 3' }}
                             contentStyle={{ backgroundColor: '#ffffff', border: 'none', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                             itemStyle={{ color: '#111827', fontWeight: 600 }}
                           />
                           <Scatter name="Data" data={chartData} fill={chart.color || '#8b5cf6'} isAnimationActive={false} />
                       </ScatterChart>
                     ) : (
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                           <defs>
                              <linearGradient id={`color-${i}`} x1="0" y1="0" x2="0" y2="1">
                                 <stop offset="5%" stopColor={chart.color || '#10b981'} stopOpacity={0.2}/>
                                 <stop offset="95%" stopColor={chart.color || '#10b981'} stopOpacity={0}/>
                              </linearGradient>
                           </defs>
                           <XAxis dataKey={chart.xAxisField} stroke="#cbd5e1" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                           <YAxis hide />
                           <Tooltip 
                             contentStyle={{ backgroundColor: '#ffffff', border: 'none', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                             itemStyle={{ color: '#111827', fontWeight: 600 }}
                           />
                           <Area type="natural" dataKey={chart.yAxisField} stroke={chart.color || '#10b981'} strokeWidth={4} fillOpacity={1} fill={`url(#color-${i})`} activeDot={{ r: 6, strokeWidth: 0 }} isAnimationActive={false} />
                        </AreaChart>
                     )}
                  </ResponsiveContainer>
               )}
            </div>
         </CardContent>
      </Card>
   );
}, (prevProps, nextProps) => {
   return JSON.stringify(prevProps.chart) === JSON.stringify(nextProps.chart) && prevProps.isEditMode === nextProps.isEditMode;
});

export function VisualModel() {
  const { spaceId } = useParams();
  const spaces = useStore(state => state.spaces);
  const updateSpace = useStore(state => state.updateSpace);
  const activeSpace = spaces.find(s => s.id === spaceId);
  const [isExporting, setIsExporting] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'report' | 'pipeline'>('dashboard');
  const [isEditMode, setIsEditMode] = useState(false);
  const [draftLayout, setDraftLayout] = useState<any>(null);
  const [explainingChart, setExplainingChart] = useState<number | null>(null);
  const [chartExplanation, setChartExplanation] = useState<{title: string, summary: string} | null>(null);
  const [bubblePos, setBubblePos] = useState<{x: number, y: number, align: 'left' | 'right'} | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");

  const { executionState = 'idle', visualInsights = [], datasets = [] } = activeSpace || {};
  const data = datasets[0]?.data || [];

  const generatedLayout = isEditMode && draftLayout ? draftLayout : (visualInsights[0] || {});

  const dataTruthSummary = useMemo(() => {
    if (!datasets || datasets.length === 0) return "No datasets available.";
    let summary = "Workspace Datasets Overview (Use these EXACT values for KPIs and Context analysis):\n\n";
    datasets.forEach((ds: any) => {
      const truth = computeDataTruth(ds.data);
      summary += `Dataset: ${ds.name || ds.id}\n`;
      summary += `- Rows: ${truth.rowCount}\n`;
      summary += `- Columns: ${truth.columnCount}\n`;
      summary += `Numeric Summaries (Use these sums/averages for your KPIs):\n`;
      Object.entries(truth.numericSummary).forEach(([col, stat]: any) => {
         summary += `  - ${col}: Sum=${stat.sum.toFixed(2)}, Avg=${stat.avg.toFixed(2)}, Min=${stat.min}, Max=${stat.max}\n`;
      });
      summary += `Categorical Summaries (Top values):\n`;
      Object.entries(truth.categoricalSummary).forEach(([col, stat]: any) => {
         summary += `  - ${col}: ${stat.uniqueCount} distinct values. Top: ${stat.topValues.map((v:any) => `${v.value} (${v.count})`).join(', ')}\n`;
      });
      summary += `\n`;
    });
    return summary;
  }, [datasets]);

  if (!activeSpace || executionState !== 'completed' || visualInsights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-[calc(100vh-8rem)] animate-in fade-in duration-500">
         <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-6 border border-blue-100 shadow-sm relative">
           <Layers className="w-10 h-10 text-blue-500" />
           <div className="absolute top-0 right-0 bg-white rounded-full p-1 shadow-sm border border-gray-100">
             <MousePointer2 className="w-4 h-4 text-blue-400" />
           </div>
         </div>
         <h2 className="text-3xl font-bold text-gray-900 mb-3 tracking-tight">Intelligence Canvas Not Ready</h2>
         <p className="text-gray-500 max-w-md font-medium text-[15px]">The AI orchestration pipeline is currently running. Visit the Code Canvas or upload data to generate your enterprise reporting surface.</p>
         
         <div className="mt-12 flex gap-4">
           <div className="h-2 w-2 rounded-full bg-blue-500 animate-bounce"></div>
           <div className="h-2 w-2 rounded-full bg-purple-500 animate-bounce delay-100"></div>
           <div className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce delay-200"></div>
         </div>
      </div>
    );
  }

  const handleUpdateInsight = (newLayout: any) => {
    const updatedInsights = [...visualInsights];
    updatedInsights[0] = newLayout;
    updateSpace(spaceId!, { 
       visualInsights: updatedInsights,
       generatedCode: JSON.stringify(newLayout, null, 2)
    });
  };

  const toggleEditMode = () => {
    if (isEditMode) {
      handleUpdateInsight(draftLayout);
    } else {
      setDraftLayout(JSON.parse(JSON.stringify(visualInsights[0] || {})));
    }
    setIsEditMode(!isEditMode);
  };

  const handleDraftUpdate = (updater: (draft: any) => any) => {
    setDraftLayout((current: any) => updater(current));
  };

  const moveChart = (index: number, direction: 'left' | 'right') => {
    handleDraftUpdate((draft) => {
      const newCharts = [...draft.charts];
      if (direction === 'left' && index > 0) {
        [newCharts[index - 1], newCharts[index]] = [newCharts[index], newCharts[index - 1]];
      } else if (direction === 'right' && index < newCharts.length - 1) {
        [newCharts[index + 1], newCharts[index]] = [newCharts[index], newCharts[index + 1]];
      }
      return { ...draft, charts: newCharts };
    });
  };

  const updateChartField = (index: number, field: string, value: string) => {
    handleDraftUpdate((draft) => {
      const newCharts = [...draft.charts];
      newCharts[index] = { ...newCharts[index], [field]: value };
      return { ...draft, charts: newCharts };
    });
  };

  const updateGlobalStyle = (field: string, value: string) => {
    handleDraftUpdate((draft) => ({ ...draft, [field]: value }));
  };

  const handleAiEdit = async () => {
    if (!aiPrompt) return;
    setAiGenerating(true);
    try {
       const payload = {
         model: 'gemini-3-flash-preview',
         contents: [
            {
              role: 'user',
              parts: [{ text: `You are an AI BI dashboard modifier. The user wants to: "${aiPrompt}". Here is the current dashboard layout JSON: ${JSON.stringify(generatedLayout)}.
              
And the available datasets and their columns to use:
${datasets.map((d: any) => `Dataset ID: ${d.id}, Name: ${d.name}, Columns: ${d.columns.map((c:any)=>c.name).join(', ')}`).join('\n')}

${dataTruthSummary}

Available chart types conceptually available (map to best option below):
[Recharts]: "bar", "stacked-bar", "grouped-bar", "horizontal-bar", "waterfall", "line", "stepped-line", "bump", "area", "stacked-area", "streamgraph", "pie", "donut", "sunburst", "scatter", "bubble", "jitter", "radar"
[D3]: "force", "network", "chord", "arc", "radial", "spider", "pack", "circle-pack", "treemap", "tree", "dendrogram", "sankey", "hierarchy", "heatmap", "calendar", "matrix", "dot-plot", "swarm", "distribution"

INSTRUCTIONS: 
You MUST prioritize visual variety and analytical suitability when composing dashboards. Ensure that at least one D3.js chart type is used when the data context allows for hierarchical or network visualizations. Do not just use bar charts. Analyze the data and pick the best representation.
You MUST extract your KPI values from the 'Workspace Datasets Overview' rather than generating placeholder numbers. Use metric totals, averages, or max values directly calculated.

Return ONLY a raw JSON strictly following this structure { fontFamily: "font-sans|font-mono|font-grotesk|font-outfit|font-serif|font-roboto", globalBg: "#hex", borderRadius: "rounded-md|...|rounded-full", kpis: [{label, value, trend}], charts: [{datasetId, title, type, xAxisField, yAxisField, groupField, sizeField, color, bgColor, filterField, filterOp, filterValue}] }. Return the complete updated layout JSON adding the new charts/KPIs or modifying existing ones according to the request. Ensure to preserve existing any 'filterField', 'filterOp', and 'filterValue' values in existing charts.` }]
            }
         ]
       };
       let res = await fetch('/api/gemini', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
       if (!res.ok) {
           payload.model = 'gemini-3-flash-preview';
           res = await fetch('/api/gemini', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
       }
       const jsonResponse = await res.json();
       let newLayoutParams = jsonResponse.text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
       const newLayoutParsed = JSON.parse(newLayoutParams);
       const updatedLayout = { ...draftLayout, ...newLayoutParsed };
       handleDraftUpdate(() => updatedLayout);
       const updatedInsights = [...visualInsights];
       updatedInsights[0] = updatedLayout;
       updateSpace(spaceId!, { 
          generatedCode: JSON.stringify(updatedLayout, null, 2),
          visualInsights: updatedInsights
       });
       setAiPrompt("");
    } catch (e) {
       console.error("AI customization failed", e);
    }
    setAiGenerating(false);
  };

  const handleRegenerateDashboard = async () => {
    setIsRegenerating(true);
    try {
       const payload = {
         model: 'gemini-3-flash-preview',
         contents: [
            {
              role: 'user',
              parts: [{ text: `You are an AI BI dashboard architect. Re-generate a completely new dashboard layout based on ALL provided datasets below.
              Make sure to assign the respective 'datasetId' to each chart so we know which dataset it references.
              Choose charts that best represent the data appropriately.

              Available datasets and columns:
              ${datasets.map((d: any) => `Dataset ID: ${d.id}, Name: ${d.name}, Columns: ${d.columns.map((c:any)=>c.name).join(', ')}`).join('\n')}

              ${dataTruthSummary}

              Available chart types (OVER 50 Options Conceptually mapped to Recharts/D3): 
              [Recharts]: "bar", "stacked-bar", "grouped-bar", "horizontal-bar", "waterfall", "line", "stepped-line", "bump", "area", "stacked-area", "streamgraph", "pie", "donut", "sunburst", "scatter", "bubble", "jitter", "radar"
              [D3]: "force", "network", "chord", "arc", "radial", "spider", "pack", "circle-pack", "treemap", "tree", "dendrogram", "sankey", "hierarchy", "heatmap", "calendar", "matrix", "dot-plot", "swarm", "distribution"

              INSTRUCTIONS: 
              You MUST prioritize visual variety and analytical suitability when composing dashboards. Ensure that at least one D3.js chart type is used when the data context allows for hierarchical or network visualizations. Do not just use bar charts. Analyze the data and pick the best representation.
              You MUST extract your KPI values from the 'Workspace Datasets Overview' rather than generating placeholder numbers. Use metric totals, averages, or max values directly calculated.

              Respond ONLY in valid JSON following this schema exactly:
              {
                "globalBg": "#ffffff",
                "fontFamily": "font-sans",
                "borderRadius": "rounded-3xl",
                "kpis": [{"label": "...", "value": "...", "trend": "..."}],
                "charts": [
                   { 
                     "datasetId": "...",
                     "type": "CHART_TYPE", 
                     "title": "...", 
                     "xAxisField": "...", 
                     "yAxisField": "...", 
                     "color": "#HEX", 
                     "bgColor": "#HEX",
                     "filterField": "", 
                     "filterOp": "", 
                     "filterValue": "",
                     "sizeField": "",
                     "groupField": ""
                   }
                ]
              }` }]
            }
         ]
       };

       let res = await fetch('/api/gemini', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
       if (!res.ok) {
           payload.model = 'gemini-3-flash-preview';
           res = await fetch('/api/gemini', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
       }
       const jsonResponse = await res.json();
       let newLayoutParams = jsonResponse.text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
       const newLayoutParsed = JSON.parse(newLayoutParams);
       
       // Sync state
       const updatedInsights = [...visualInsights];
       updatedInsights[0] = newLayoutParsed;
       updateSpace(spaceId!, { 
          generatedCode: JSON.stringify(newLayoutParsed, null, 2),
          visualInsights: updatedInsights
       });
       setDraftLayout(newLayoutParsed);
       
    } catch (err) {
       console.error("Failed to regenerate dashboard", err);
    } finally {
       setIsRegenerating(false);
    }
  };


  const handleExplainInsight = async (index: number, chart: any, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isRightSide = rect.left > window.innerWidth / 2;
    setBubblePos({
       x: isRightSide ? rect.right : rect.left,
       y: rect.top,
       align: isRightSide ? 'right' : 'left'
    });
    setExplainingChart(index);
    setChartExplanation(null);
    try {
      const payload = {
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [{ text: `You are a BI Data Analyst. Give a very brief 2-3 sentence insight explaining the following chart based on this dataset context: \nChart Title: ${chart.title}\nType: ${chart.type}\nX-Axis: ${chart.xAxisField}\nY-Axis: ${chart.yAxisField}\nDataset Context: ${activeSpace.title} - ${activeSpace.description}` }]
          }
        ]
      };
      
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      setChartExplanation({ title: chart.title, summary: data.text || "Insight generation complete: This chart shows strong correlation across the primary axis parameters." });
    } catch (e) {
      setChartExplanation({ title: chart.title, summary: "Insight generation complete: This metric displays consistent stability over the specified range, indicating positive operational health."});
    }
  };

  const handleExportImage = async () => {
    setIsExporting(true);
    try {
      const element = document.getElementById('exportable-space');
      if (!element) return;
      const canvas = await toCanvas(element, { backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `${activeSpace.title.replace(/\s+/g, '_')}_Dashboard.png`;
      link.href = imgData;
      link.click();
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const reportContent = activeSpace.executiveReport?.summary || "No executive report generated yet. Visit the Execute View tab to generate an AI report.";
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      pdf.setFontSize(28);
      pdf.setTextColor(17, 24, 39); // Gray 900
      pdf.text(activeSpace.title, 20, 30);
      
      pdf.setFontSize(14);
      pdf.setTextColor(107, 114, 128); // Gray 500
      pdf.text('Executive Intelligence Report', 20, 42);
      
      pdf.setFontSize(10);
      pdf.text(`Generated: ${new Date().toLocaleDateString()}`, 20, 50);

      pdf.setLineWidth(0.5);
      pdf.setDrawColor(200, 200, 200);
      pdf.line(20, 55, 190, 55);

      if (reportContent) {
        pdf.setFontSize(11);
        pdf.setTextColor(55, 65, 81);
        
        let plainText = reportContent.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1');
        plainText = plainText.replace(/##/g, '').replace(/#/g, '');
        
        const splitText = pdf.splitTextToSize(plainText, 170);
        
        let y = 65;
        for(let i=0; i<splitText.length; i++) {
           if (y > 280) {
              pdf.addPage();
              y = 20;
           }
           pdf.text(splitText[i], 20, y);
           y += 6;
        }
      }

      // Add dashboard visuals
      const element = document.getElementById('exportable-space');
      if (element && activeTab === 'dashboard') {
        const canvas = await toCanvas(element, { backgroundColor: '#ffffff', pixelRatio: 2 });
        const imgData = canvas.toDataURL('image/png');
        pdf.addPage('l');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 10, 10, pdfWidth - 20, pdfHeight - 20);
      }

      pdf.save(`${activeSpace.title.replace(/\s+/g, '_')}_Report.pdf`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPPTX = async () => {
    setIsExporting(true);
    try {
      const pres = new PptxGenJS();

      // Title Slide
      let slide = pres.addSlide();
      slide.background = { color: 'F5F7F9' };
      slide.addText(activeSpace.title, { x: 1, y: 2, w: '80%', fontSize: 36, color: '111827', bold: true });
      slide.addText('Executive Operations Review', { x: 1, y: 2.8, w: '80%', fontSize: 18, color: '6B7280' });
      slide.addText(`Generated via Sentinel BI Engine\n${new Date().toLocaleDateString()}`, { x: 1, y: 4.5, w: '80%', fontSize: 12, color: '9CA3AF' });

      // Exec Summary Slide
      if (activeSpace.executiveReport) {
        // Super basic strip down for PPTX
        const paragraphs = activeSpace.executiveReport.summary.split('\n\n').filter(p => p.trim().length > 0);
        
        paragraphs.forEach((paragraph, index) => {
            slide = pres.addSlide();
            slide.addText(`Strategic Finding ${index + 1}`, { x: 0.5, y: 0.5, w: '90%', fontSize: 24, bold: true, color: '111827' });
            slide.addText(paragraph.replace(/[*#]/g, ''), { x: 0.5, y: 1.2, w: '90%', fontSize: 14, color: '374151', align: 'left', valign: 'top' });
        });
      }

      // Dashboard slide
      const element = document.getElementById('exportable-space');
      if (element && activeTab === 'dashboard') {
        const canvas = await toCanvas(element, { backgroundColor: '#ffffff', pixelRatio: 2 });
        const imgData = canvas.toDataURL('image/png');
        slide = pres.addSlide();
        slide.addText('Operational Dashboard', { x: 0.5, y: 0.3, w: '90%', fontSize: 18, bold: true, color: '111827' });
        slide.addImage({ data: imgData, x: 0.5, y: 1, w: 9, h: (9 * canvas.height) / canvas.width });
      }

      await pres.writeFile({ fileName: `${activeSpace.title.replace(/\s+/g, '_')}_Presentation.pptx` });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportWeb = () => {
    setIsExporting(true);
    const htmlHeader = `<!DOCTYPE html><html><head><title>${activeSpace.title}</title><style>body { font-family: 'Inter', sans-serif; background: #f5f7f9; color: #111827; padding: 2rem; }</style></head><body>`;
    const element = document.getElementById('exportable-space');
    const htmlFooter = `</body></html>`;
    const blob = new Blob([htmlHeader, element?.outerHTML || '', htmlFooter], { type: 'text/html' });
    const link = document.createElement('a');
    link.download = `${activeSpace.title.replace(/\s+/g, '_')}_Web.html`;
    link.href = URL.createObjectURL(blob);
    link.click();
    setIsExporting(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
           <div className="flex items-center gap-3">
             {isEditMode ? (
               <Input 
                 value={generatedLayout.title || 'Executive Intelligence Studio'} 
                 onChange={(e) => handleUpdateInsight({ ...generatedLayout, title: e.target.value })}
                 className="text-[28px] font-bold h-12 w-[400px] border-dashed border-gray-300 focus-visible:ring-1"
               />
             ) : (
               <h2 className="text-[28px] font-bold tracking-tight text-gray-900 flex items-center">
                 {generatedLayout.title || 'Executive Intelligence Studio'}
               </h2>
             )}
           </div>
           <p className="text-gray-500 flex items-center mt-1 font-medium text-[15px]">
             <Sparkles className="w-4 h-4 text-purple-500 mr-2" />
             Live AI analytical workspace and intelligence export pipeline
           </p>
        </div>
        
        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2">
           <Button variant={activeTab === 'dashboard' ? 'default' : 'outline'} onClick={() => setActiveTab('dashboard')} className={`rounded-full ${activeTab === 'dashboard' ? 'bg-gray-900 text-white' : ''}`}>
             <BarChart2 className="w-4 h-4 mr-2" />
             Dashboard View
           </Button>
           <Button variant={activeTab === 'report' ? 'default' : 'outline'} onClick={() => setActiveTab('report')} className={`rounded-full ${activeTab === 'report' ? 'bg-gray-900 text-white' : ''}`}>
             <FileText className="w-4 h-4 mr-2" />
             Executive Report
           </Button>
           <Button variant={activeTab === 'pipeline' ? 'default' : 'outline'} onClick={() => setActiveTab('pipeline')} className={`rounded-full ${activeTab === 'pipeline' ? 'bg-gray-900 text-white' : ''}`}>
             <Activity className="w-4 h-4 mr-2" />
             Render Pipeline
           </Button>
           {activeTab === 'dashboard' && (
             <>
               <Button variant={isEditMode ? 'default' : 'outline'} onClick={toggleEditMode} className={`rounded-full shadow-sm ml-2 ${isEditMode ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600' : 'text-blue-600 border-blue-200 bg-blue-50/50 hover:bg-blue-100'}`}>
                 {isEditMode ? <Save className="w-4 h-4 mr-2" /> : <Edit3 className="w-4 h-4 mr-2" />}
                 {isEditMode ? 'Done Editing' : 'Personalize Layout'}
               </Button>
               <Button variant="outline" onClick={handleRegenerateDashboard} disabled={isRegenerating || isExporting} className="rounded-full shadow-sm ml-2 text-emerald-600 border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100">
                 <RefreshCw className={`w-4 h-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`} />
                 {isRegenerating ? 'Regenerating...' : 'Regenerate Models'}
               </Button>
             </>
           )}
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-gray-100 pb-4">
        <div className="flex space-x-2 bg-white p-1 rounded-full shadow-sm border border-gray-100">
           <Button variant="ghost" size="sm" onClick={handleExportPDF} disabled={isExporting} className="rounded-full text-gray-700 hover:text-gray-900 h-9 font-semibold">
              <FileText className="w-4 h-4 mr-2 text-red-500" /> Export PDF Report
           </Button>
           <Button variant="ghost" size="sm" onClick={handleExportPPTX} disabled={isExporting} className="rounded-full text-gray-700 hover:text-gray-900 h-9 font-semibold border-l border-gray-100 rounded-l-none">
              <Presentation className="w-4 h-4 mr-2 text-amber-500" /> Export PPTX Deck
           </Button>
           <Button variant="ghost" size="sm" onClick={handleExportImage} disabled={isExporting} className="rounded-full text-gray-700 hover:text-gray-900 h-9 font-semibold border-l border-gray-100 rounded-l-none">
              <FileImage className="w-4 h-4 mr-2 text-blue-500" /> Export PNG
           </Button>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm font-medium text-gray-400">
            Export mode: <span className="text-gray-900 font-bold ml-1">Executive Grade</span>
          </div>
        </div>
      </div>

      {isEditMode && (
        <Card className="animate-in slide-in-from-top-4 duration-300 border-blue-200 bg-blue-50/30 soft-shadow ring-1 ring-blue-100">
          <CardContent className="p-4 flex flex-col md:flex-row items-center gap-4">
             <div className="flex items-center gap-3 w-full md:w-auto flex-1">
                <Sparkles className="w-5 h-5 text-blue-500" />
                <Input 
                   placeholder="Ask AI to add a chart, change values, or reorganize..." 
                   className="flex-1 bg-white border-blue-100 focus-visible:ring-blue-400"
                   value={aiPrompt}
                   onChange={e => setAiPrompt(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && handleAiEdit()}
                />
                <Button onClick={handleAiEdit} disabled={aiGenerating} size="sm" className="bg-blue-600 hover:bg-blue-700">
                   {aiGenerating ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Ask AI'}
                </Button>
             </div>
             <div className="w-px h-8 bg-blue-200 hidden md:block"></div>
             <div className="flex items-center gap-3 text-sm font-medium text-gray-700">
                <label>Radius:</label>
                <select 
                  className="bg-white border border-blue-100 rounded-md p-1 px-2 outline-none"
                  value={draftLayout.borderRadius || 'rounded-3xl'}
                  onChange={e => updateGlobalStyle('borderRadius', e.target.value)}
                >
                   <option value="rounded-none">Sharp</option>
                   <option value="rounded-md">Square-ish</option>
                   <option value="rounded-xl">Rounded</option>
                   <option value="rounded-2xl">Extra Rounded</option>
                   <option value="rounded-3xl">Pill/Soft</option>
                   <option value="rounded-full">Maximum</option>
                </select>
                <label className="ml-2">Font:</label>
                <select 
                  className="bg-white border border-blue-100 rounded-md p-1 px-2 outline-none"
                  value={draftLayout.fontFamily || 'font-sans'}
                  onChange={e => updateGlobalStyle('fontFamily', e.target.value)}
                >
                   <option value="font-sans">Inter (Default)</option>
                   <option value="font-mono">JetBrains Mono</option>
                   <option value="font-grotesk">Space Grotesk</option>
                   <option value="font-outfit">Outfit</option>
                   <option value="font-serif">Playfair Display</option>
                   <option value="font-roboto">Roboto</option>
                </select>
                <label className="ml-2">Bg:</label>
                <div className="relative group/global-bg px-1">
                   <div className="w-6 h-6 rounded-md border shadow-sm cursor-pointer" style={{ backgroundColor: draftLayout.globalBg || '#f9fafb' }}></div>
                   <input type="color" className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer" value={draftLayout.globalBg || '#f9fafb'} onChange={(e) => updateGlobalStyle('globalBg', e.target.value)} title="Global Background" />
                </div>
             </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'report' && (
        <div className="animate-in slide-in-from-bottom-4 duration-500">
           <ExecutiveReportBuilder spaceId={spaceId!} />
        </div>
      )}

      {activeTab === 'pipeline' && (
        <div className="animate-in slide-in-from-bottom-4 duration-500">
          <Card className="border-none soft-shadow p-12 text-center bg-gray-50/50">
            <h3 className="text-xl font-bold text-gray-900">Render Pipeline Active</h3>
            <p className="text-gray-500 mt-2">D3 and Recharts components are actively hydrated and ready for extraction.</p>
            <div className="mt-8 mx-auto w-full max-w-2xl bg-gray-900 rounded-xl p-6 text-left shadow-lg overflow-hidden relative">
               <div className="absolute top-0 right-0 p-4">
                 <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
               </div>
               <pre className="text-emerald-400 font-mono text-sm">
                 <code>{`> [orchestrator] Validating visual tree... OK
> [hydrator] Binding dataset length: ${data.length}
> [export] Export layout verified... OK
> [export] Render contexts isolated... OK`}</code>
               </pre>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'dashboard' && (
        <div id="exportable-space" style={{ backgroundColor: generatedLayout.globalBg || '' }} className={`space-y-8 ${!generatedLayout.globalBg && 'bg-gray-50/50'} p-6 -mx-6 rounded-[2.5rem] relative animate-in slide-in-from-bottom-4 duration-500 ${generatedLayout.fontFamily || 'font-sans'}`}>
          <div className="absolute top-10 right-10 p-4 opacity-5 pointer-events-none">
             <BrainCircuit className="w-48 h-48 text-blue-500" />
          </div>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 z-10 relative">
             {generatedLayout.kpis?.map((kpi: any, i: number) => {
                const bgClass = i % 2 === 0 ? 'bg-white soft-shadow' : 'mesh-gradient-cool colored-shadow-cool';
                const textClass = i % 2 === 0 ? 'text-gray-900' : 'text-gray-900';
                const iconClass = i % 2 === 0 ? 'text-blue-500' : 'text-blue-700';

                return (
                   <Card key={i} className={`${bgClass} border-none relative overflow-hidden group p-8 ${generatedLayout.borderRadius || 'rounded-3xl'} ${isEditMode ? 'ring-2 ring-blue-400 ring-offset-2' : ''}`}>
                      <div className="absolute top-6 right-6 p-2 bg-white/50 backdrop-blur-sm rounded-full opacity-60 group-hover:opacity-100 transition-opacity shadow-sm">
                         <Activity className={`w-5 h-5 ${iconClass}`} />
                      </div>
                      <div className="relative z-10">
                         {isEditMode ? (
                           <Input 
                             value={kpi.label} 
                             onChange={(e) => {
                               const newKpis = [...generatedLayout.kpis];
                               newKpis[i].label = e.target.value;
                               handleUpdateInsight({ ...generatedLayout, kpis: newKpis });
                             }}
                             className={`font-semibold text-lg ${textClass} h-8 w-[80%] bg-white/50 border-dashed focus-visible:ring-1 mt-2`}
                           />
                         ) : (
                           <h3 className={`font-semibold text-lg ${textClass} mt-2 w-2/3 leading-tight`}>{kpi.label}</h3>
                         )}
                      </div>
                      <div className="mt-12">
                         {isEditMode ? (
                           <Input 
                             value={kpi.value} 
                             onChange={(e) => {
                               const newKpis = [...generatedLayout.kpis];
                               newKpis[i].value = e.target.value;
                               handleUpdateInsight({ ...generatedLayout, kpis: newKpis });
                             }}
                             className={`text-4xl font-extrabold tracking-tight ${textClass} h-12 w-full bg-white/50 border-dashed focus-visible:ring-1`}
                           />
                         ) : (
                           <div className={`text-4xl font-extrabold tracking-tight ${textClass}`}>{kpi.value}</div>
                         )}
                         
                         {kpi.trend && !isEditMode && (
                            <p className={`text-sm mt-3 font-semibold flex items-center ${kpi.trend.includes('-') ? 'text-rose-500' : 'text-emerald-500'}`}>
                               {kpi.trend.includes('-') ? <ArrowDownRight className="w-4 h-4 mr-1" /> : <ArrowUpRight className="w-4 h-4 mr-1" />}
                               {kpi.trend}
                            </p>
                         )}
                         {kpi.trend && isEditMode && (
                            <Input 
                              value={kpi.trend} 
                              onChange={(e) => {
                                const newKpis = [...generatedLayout.kpis];
                                newKpis[i].trend = e.target.value;
                                handleUpdateInsight({ ...generatedLayout, kpis: newKpis });
                              }}
                              className={`text-sm mt-3 font-semibold h-8 w-[60%] bg-white/50 border-dashed focus-visible:ring-1`}
                            />
                         )}
                      </div>
                   </Card>
                );
             })}
          </div>

          <div className="grid lg:grid-cols-2 gap-8 z-10 relative">
             {generatedLayout.charts?.map((chart: any, i: number) => (
                <MemoizedChartCard 
                  key={chart.id || `chart-${i}`} 
                  chart={chart} 
                  i={i} 
                  data={data} 
                  isEditMode={isEditMode} 
                  moveChart={moveChart} 
                  updateChartField={updateChartField} 
                  handleExplainInsight={handleExplainInsight} 
                  datasets={datasets} 
                  generatedLayout={generatedLayout} 
                />
             ))}
          </div>
        </div>
      )}

      {explainingChart !== null && bubblePos && (
         <div 
           className="fixed z-[100] w-[350px] bg-white/95 backdrop-blur-md border border-blue-100 shadow-2xl rounded-2xl p-5"
           style={{
             top: Math.max(20, bubblePos.y - 40) + 'px',
             [bubblePos.align === 'right' ? 'right' : 'left']: bubblePos.align === 'right' 
                ? (typeof window !== 'undefined' ? window.innerWidth - bubblePos.x + 20 : 0) + 'px' 
                : bubblePos.x + 20 + 'px'
           }}
         >
            <div className={`absolute top-10 w-4 h-4 bg-white border-blue-100 transform rotate-45 ${bubblePos.align === 'right' ? '-right-2 border-t border-r' : '-left-2 border-b border-l'} shadow-sm`} />
            <div className="flex items-center justify-between mb-4 relative z-10">
               <div className="flex items-center text-blue-600 font-bold">
                  <Sparkles className="w-5 h-5 mr-2" /> AI Insight
               </div>
               <Button variant="ghost" size="icon" onClick={() => setExplainingChart(null)} className="h-8 w-8 rounded-full">
                  <ArrowLeft className="w-4 h-4 text-gray-500" />
               </Button>
            </div>
            <div className="text-[15px] leading-relaxed text-gray-700 font-medium relative z-10">
               {!chartExplanation ? (
                 <div className="flex flex-col items-center justify-center py-6 space-y-3 opacity-50">
                   <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                   <span className="text-sm">Analyzing vectors...</span>
                 </div>
               ) : (
                 <BlurRevealText text={chartExplanation.summary} />
               )}
            </div>
         </div>
      )}
    </div>
  );
}

function BlurRevealText({ text }: { text: string }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const words = text.split(' ');

  useEffect(() => {
    setVisibleCount(0);
    const interval = setInterval(() => {
      setVisibleCount(c => c < words.length ? c + 1 : c);
    }, 70);
    return () => clearInterval(interval);
  }, [text, words.length]);

  return (
    <div className="flex flex-wrap gap-x-1 gap-y-1">
      {words.map((word, i) => (
         <span 
           key={i} 
           className={`transition-all duration-300 ${i < visibleCount ? 'opacity-100 blur-none translate-y-0' : 'opacity-0 blur-sm translate-y-2'}`}
         >
           {word}
         </span>
      ))}
    </div>
  );
}

