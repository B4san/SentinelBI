import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../store';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { 
  Code, LayoutTemplate, Activity, Play, CheckCircle2, 
  Terminal, BrainCircuit, Loader2,
  Maximize2
} from 'lucide-react';
import { generateDashboardSpec } from '../lib/dashboard/generate';
import { validateDashboardSpec } from '../lib/dashboard/validate';
import { toDashboardDatasets } from '../lib/sampleData';
import { DashboardCanvas } from '../components/dashboard/DashboardCanvas';

export function CodeCanvas() {
  const { spaceId } = useParams();
  const spaces = useStore(state => state.spaces);
  const updateSpace = useStore(state => state.updateSpace);
  const activeSpace = spaces.find(s => s.id === spaceId);
  const [viewMode, setViewMode] = useState<'split' | 'code' | 'visual'>('split');

  const { executionState = 'idle', generatedCode = '', executionTimeline = [], promptContext = '' } = activeSpace || {};
  
  const [localCode, setLocalCode] = useState(generatedCode);
  const [previewData, setPreviewData] = useState<any>(activeSpace?.visualInsights?.[0] || null);

  // Debounced preview update
  useEffect(() => {
    const handler = setTimeout(() => {
      try {
        const parsed = validateDashboardSpec(JSON.parse(localCode));
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

    try {
      const result = await generateDashboardSpec({
        title: activeSpace.title,
        intent: promptContext || 'Analyze my data overview',
        datasets: toDashboardDatasets(activeSpace),
      });
      const spec = result.spec;
      updateSpace(spaceId, {
        executionState: 'completed',
        generatedCode: JSON.stringify(spec, null, 2),
        visualInsights: [spec as never],
        dashboardSpec: spec,
      });
    } catch (e) {
      console.error('Pipeline failure:', e);
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
                  <div className="p-4 md:p-6 overflow-auto custom-scrollbar flex-1">
                     {previewData ? (
                        <DashboardCanvas spec={previewData} datasets={toDashboardDatasets(activeSpace)} />
                     ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-[var(--muted-foreground)] font-medium text-[15px] bg-[var(--card)] rounded-2xl border border-dashed border-[var(--border)]">
                           <LayoutTemplate className="w-10 h-10 mb-4 opacity-40" />
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
