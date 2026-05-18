import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useParams } from 'react-router-dom';
import { useStore } from '../store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Activity, ArrowUpRight, ArrowDownRight, Database, ShieldAlert, Bot, RefreshCw, CheckCircle2, MoreHorizontal, Zap, Target, Search, AlertTriangle, Fingerprint, Lock, Sparkles, ArrowLeft } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '../components/ui/button';
import { computeDataTruth, computeSpaceDataTruth } from '../lib/DataTruthEngine';

export function Dashboard() {
  const { spaceId } = useParams();
  const spaces = useStore(state => state.spaces);
  const activeSpace = spaces.find(s => s.id === spaceId);
  
  const [explainingChart, setExplainingChart] = useState<boolean>(false);
  const [chartExplanation, setChartExplanation] = useState<string | null>(null);
  const [bubblePos, setBubblePos] = useState<{x: number, y: number, align: 'left' | 'right'} | null>(null);

  const handleExplainInsight = async (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isRightSide = rect.left > window.innerWidth / 2;
    setBubblePos({
       x: isRightSide ? rect.right : rect.left,
       y: rect.top,
       align: isRightSide ? 'right' : 'left'
    });
    setExplainingChart(true);
    setChartExplanation(null);
    try {
      const payload = {
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [{ text: `You are a BI Data Analyst. Give a very brief 2-3 sentence insight explaining the intelligence activity of the workspace. Dataset Context: ${activeSpace?.title} - ${activeSpace?.description}` }]
          }
        ]
      };
      
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      setChartExplanation(data.text || "Intelligence volume confirms a healthy baseline based on actual workspace events.");
    } catch (e) {
      setChartExplanation("Error fetching explanation context.");
    }
  };

  if (!activeSpace) return null;

  // Data truth derivation
  const datasetsToAnalyze = (activeSpace.datasets && activeSpace.datasets.length > 0) 
    ? activeSpace.datasets 
    : activeSpace.parsedData 
      ? [{ id: 'legacy', name: 'Legacy Dataset', data: activeSpace.parsedData }] 
      : [];
  
  const spaceTruth = computeSpaceDataTruth(datasetsToAnalyze);
  const rowCount = spaceTruth.totalRowCount;
  const colCount = activeSpace.datasets?.[0]?.columns?.length || activeSpace.columns?.length || 0;
  const fileCount = activeSpace.uploadedFiles?.length || 0;
  
  const totalAnomalies = spaceTruth.totalAnomalyCount;
  const completeness = spaceTruth.overallCompletenessScore;
  const dataQuality = spaceTruth.overallDataQualityScore;
  
  // Real logs
  const govCount = activeSpace.governanceLogs?.length || 0;
  const secCount = activeSpace.securityEvents?.length || 0;
  const failedExecutions = activeSpace.executionTimeline.filter(t => t.status === 'failed').length;

  const aiConfidence = datasetsToAnalyze.length > 0 ? Math.max(0, dataQuality - (failedExecutions * 5)) : 0;
  const govIntegrity = datasetsToAnalyze.length > 0 ? Math.max(0, 100 - (secCount * 10)) : 0;

  // Build timeline chart data from actual chat and execution logs
  const activityMap: Record<string, number> = {};
  const datesToTrack = [...(activeSpace.chatMessages || []), ...(activeSpace.governanceLogs || []), ...(activeSpace.executionTimeline || [])]
      .filter((i: any) => i.timestamp)
      .map((i: any) => new Date(i.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  
  datesToTrack.forEach(d => { activityMap[d] = (activityMap[d] || 0) + 1; });
  let activityChartData = Object.entries(activityMap).map(([name, value]) => ({ name, value1: value, value2: secCount }));
  
  if (activityChartData.length === 0) {
     activityChartData = [{ name: 'No Activity', value1: 0, value2: 0 }];
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <h2 className="text-[28px] font-bold tracking-tight text-gray-900">{activeSpace.title} Overview</h2>
          <p className="text-gray-500 mt-1 font-medium text-[15px]">Enterprise intelligence orchestration and semantic analytics</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        
        {/* Left/Main Column */}
        <div className="flex-1 space-y-8">
           
           {/* Top Row Cards */}
           <div className="grid gap-6 md:grid-cols-3">
             
             {/* Space Context Card */}
             <Card className="flex flex-col items-center justify-center p-8 soft-shadow relative overflow-hidden group border-none">
               <div className="relative mb-4">
                  <div className="h-24 w-24 rounded-full p-1 border-2 border-blue-400 shadow-sm flex items-center justify-center">
                     <div className="h-full w-full rounded-full bg-blue-100/50 flex flex-col items-center justify-center border border-white">
                        <Database className="h-8 w-8 text-blue-600 mb-1" />
                        <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider">Synced</span>
                     </div>
                  </div>
                  <div className="absolute bottom-0 right-0 bg-gray-900 border-2 border-white rounded-full p-1.5 shadow-sm">
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  </div>
               </div>
               <h3 className="text-xl font-bold text-gray-900">Semantic Model</h3>
               <p className="text-sm font-medium text-gray-400 mt-1">Ready for analysis</p>
               
               <div className="flex gap-4 mt-8 w-full justify-center">
                 <div className="flex flex-col items-center bg-gray-50 px-3 py-2 rounded-2xl border border-gray-100 shadow-sm min-w-[70px]">
                   <span className="text-xs font-bold text-gray-700">{rowCount.toLocaleString()}</span>
                   <span className="text-[10px] text-gray-400 font-semibold uppercase mt-0.5">Rows</span>
                 </div>
                 <div className="flex flex-col items-center bg-gray-50 px-3 py-2 rounded-2xl border border-gray-100 shadow-sm min-w-[70px]">
                   <span className="text-xs font-bold text-gray-700">{colCount}</span>
                   <span className="text-[10px] text-gray-400 font-semibold uppercase mt-0.5">Cols</span>
                 </div>
                 <div className="flex flex-col items-center bg-gray-50 px-3 py-2 rounded-2xl border border-gray-100 shadow-sm min-w-[70px]">
                   <span className="text-xs font-bold text-gray-700">{fileCount}</span>
                   <span className="text-[10px] text-gray-400 font-semibold uppercase mt-0.5">Sources</span>
                 </div>
               </div>
             </Card>

             {/* AI Confidence Card */}
             <Card className="p-8 colored-shadow-warm mesh-gradient-warm text-gray-900 relative border-none">
               <div className="absolute top-6 right-6 bg-white/30 backdrop-blur-md rounded-full p-2">
                 <Target className="h-5 w-5 text-gray-800" />
               </div>
               <h3 className="font-semibold text-lg text-gray-900 mt-2">Data Completeness &<br/>AI Confidence</h3>
               
               <div className="mt-16">
                 {datasetsToAnalyze.length > 0 ? (
                   <>
                     <div className="text-5xl font-bold tracking-tight">{aiConfidence}%</div>
                     <p className="text-sm font-medium text-gray-700 mt-2 opacity-80">Based on dataset quality</p>
                   </>
                 ) : (
                   <div className="text-lg font-semibold text-gray-400 mt-4">No data loaded</div>
                 )}
               </div>
             </Card>

             {/* Governance Integrity Card */}
             <Card className="p-8 colored-shadow-cool mesh-gradient-cool text-gray-900 relative border-none">
               <div className="absolute top-6 right-6 bg-white/30 backdrop-blur-md rounded-full p-2">
                 <ShieldAlert className="h-5 w-5 text-gray-800" />
               </div>
               <h3 className="font-semibold text-lg text-gray-900 mt-2">Governance<br/>Integrity</h3>
               
               <div className="mt-16">
                 {datasetsToAnalyze.length > 0 ? (
                   <>
                      <div className="text-5xl font-bold tracking-tight">{govIntegrity}%</div>
                      <p className="text-sm font-medium text-gray-700 mt-2 opacity-80">{secCount === 0 ? "Zero policy violations" : `${secCount} active violations`}</p>
                   </>
                 ) : (
                   <div className="text-lg font-semibold text-gray-400 mt-4">No activity yet</div>
                 )}
               </div>
             </Card>
           </div>
           
           {/* Active Agents Strip */}
           <Card className="p-4 px-6 flex items-center justify-between shadow-sm bg-gray-50/80 border-gray-100 rounded-full border-none">
             <div className="flex flex-col">
               <span className="font-bold text-gray-900 text-[15px]">Active Orchestration Agents</span>
               <span className="text-xs text-gray-400 font-medium mt-0.5">Ready for query execution</span>
             </div>
             <div className="flex items-center gap-3">
               <div className="flex -space-x-3">
                 <div className="h-10 w-10 rounded-full bg-white border border-gray-100 shadow-sm flex items-center justify-center text-emerald-500 font-bold text-xl z-20">
                   <Search className="h-4 w-4" />
                 </div>
                 <div className="h-10 w-10 rounded-full bg-white border border-gray-100 shadow-sm flex items-center justify-center text-blue-500 font-bold text-base z-10">
                   <Zap className="h-4 w-4" />
                 </div>
                 <div className="h-10 w-10 rounded-full bg-white border border-gray-100 shadow-sm flex items-center justify-center text-purple-500 z-0 p-2">
                   <Bot className="h-4 w-4" />
                 </div>
               </div>
               <Button variant="ghost" size="icon" className="rounded-full bg-white shadow-sm border border-gray-100 h-10 w-10 ml-2">
                 <MoreHorizontal className="h-4 w-4 text-gray-500" />
               </Button>
             </div>
           </Card>

           {/* Chart Area */}
           <Card className="soft-shadow relative group border-none">
             <CardHeader className="flex flex-row items-center justify-between pb-2">
               <div>
                 <CardTitle className="text-xl">Intelligence Throughput</CardTitle>
                 <CardDescription className="text-gray-400 font-medium">Activity vs events triggered</CardDescription>
               </div>
               <div className="flex items-center gap-2">
                 <Button variant="outline" size="sm" onClick={(e) => handleExplainInsight(e)} className="hidden group-hover:flex h-9 text-xs font-semibold rounded-full items-center text-blue-600 border-blue-200 bg-blue-50/50 hover:bg-blue-100 transition-all opacity-0 group-hover:opacity-100">
                    <Sparkles className="w-3 h-3 mr-1" /> AI Explanation
                 </Button>
               </div>
             </CardHeader>
             <CardContent className="pt-6 relative">
               <div className="h-[280px] w-full">
                 <ResponsiveContainer width="100%" height="100%">
                   <AreaChart data={activityChartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                     <defs>
                       <linearGradient id="colorFocus" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                         <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                       </linearGradient>
                       <linearGradient id="colorLack" x1="0" y1="0" x2="0" y2="1">
                         <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                         <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                       </linearGradient>
                     </defs>
                     <XAxis dataKey="name" stroke="#cbd5e1" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                     <YAxis hide />
                     <Tooltip 
                       contentStyle={{ backgroundColor: '#ffffff', border: 'none', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                       itemStyle={{ color: '#111827', fontWeight: 600 }}
                     />
                     <Area type="natural" dataKey="value2" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorFocus)" activeDot={{ r: 6, strokeWidth: 0 }} />
                     <Area type="natural" dataKey="value1" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorLack)" activeDot={{ r: 6, strokeWidth: 0 }} />
                   </AreaChart>
                 </ResponsiveContainer>
               </div>

               <div className="absolute right-8 bottom-16 text-right">
                  <div className="text-4xl font-extrabold text-gray-900 tracking-tight">{datesToTrack.length}</div>
                  <div className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Total Actions</div>
               </div>

               {/* Custom Legend */}
               <div className="flex gap-6 mt-4 pl-4">
                 <div className="flex items-center gap-2">
                   <div className="w-3 h-3 rounded bg-blue-500"></div>
                   <span className="text-xs font-semibold text-gray-500">Activity (Chats/Executions)</span>
                 </div>
                 <div className="flex items-center gap-2">
                   <div className="w-3 h-3 rounded bg-red-400"></div>
                   <span className="text-xs font-semibold text-gray-500">Security Events Flagged</span>
                 </div>
               </div>
             </CardContent>
           </Card>
        </div>

        {/* Right Column */}
        <div className="w-full lg:w-[380px] space-y-8 pl-0 lg:pl-6 border-transparent lg:border-l lg:border-gray-100 flex flex-col">
           
           <div className="flex-1">
             <div className="flex items-center justify-between mb-8">
               <h3 className="text-xl font-bold text-gray-900">Recent Observations</h3>
               <Button variant="ghost" size="icon" className="bg-white rounded-full shadow-sm border border-gray-100 text-gray-900 h-10 w-10">
                 <Fingerprint className="w-4 h-4" />
               </Button>
             </div>

             <div className="space-y-6">
               {(activeSpace.governanceLogs || []).slice(0, 4).map((event: any, i: number) => (
                 <div key={i} className="flex gap-4 group cursor-pointer border-b border-gray-100 pb-6 relative">
                   <div className="w-[80px] shrink-0">
                     <p className="text-[13px] font-medium text-gray-400">{new Date(event.timestamp).toLocaleDateString()}</p>
                     <p className="text-[14px] font-bold text-gray-900 mt-1">{new Date(event.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                   </div>
                   <div className="flex-1">
                     <p className="text-[15px] font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{event.action}</p>
                     <p className="text-[13px] font-semibold text-gray-400 mt-1 flex items-center gap-1.5">
                       {event.status === 'blocked' ? (
                          <span className="w-4 h-4 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                            <AlertTriangle className="w-2.5 h-2.5" />
                          </span>
                       ) : (
                          <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                            <ShieldAlert className="w-2.5 h-2.5" />
                          </span>
                       )}
                       {event.agentName}
                     </p>
                   </div>
                 </div>
               ))}
               {(!activeSpace.governanceLogs || activeSpace.governanceLogs.length === 0) && (
                 <p className="text-sm text-gray-500 text-center py-4">No events logged yet.</p>
               )}
             </div>
           </div>
        </div>
      </div>

      {explainingChart && bubblePos && (
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
               <Button variant="ghost" size="icon" onClick={() => setExplainingChart(false)} className="h-8 w-8 rounded-full">
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
                 <BlurRevealText text={chartExplanation} />
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


