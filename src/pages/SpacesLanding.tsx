import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Hexagon, Plus, Search, Folder, Clock, Star, UploadCloud, ArrowRight, Loader2, FileDown, Shield } from 'lucide-react';
import { useStore, Space } from '../store';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import Papa from 'papaparse';
import { GoogleGenAI } from '@google/genai';

export function SpacesLanding() {
  const { spaces, createSpace, user, toggleFavoriteSpace } = useStore();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  
  // Upload and Creation State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [aiInstruction, setAiInstruction] = useState('');
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const filteredSpaces = spaces.filter(s => s.title.toLowerCase().includes(searchTerm.toLowerCase()));
  const favoriteSpaces = filteredSpaces.filter(s => s.isFavorite);
  const recentSpaces = filteredSpaces.filter(s => !s.isFavorite);

  const processAndCreateSpace = async (file: File, parsedData: any[], rawColumns: string[]) => {
    const columns = rawColumns.map(col => {
      let type: 'numeric' | 'categorical' | 'date' | 'boolean' = 'categorical';
      const sample = parsedData[0]?.[col];
      if (typeof sample === 'number') type = 'numeric';
      else if (typeof sample === 'boolean') type = 'boolean';
      else if (typeof sample === 'string' && !isNaN(Date.parse(sample)) && sample.length > 5) type = 'date';
      return { name: col, type };
    });

         // AI Summary Generation
         let aiSummary = "Data loaded successfully. AI analysis pending.";
         if (aiInstruction) {
           try {
             const dataSample = parsedData.slice(0, 10);
             const prompt = `You are Sentinel BI AI. Analyze this dataset and the user's instruction.\nUser instruction: "${aiInstruction}"\n\nDataset Columns: ${rawColumns.join(', ')}\nSample Data:\n${JSON.stringify(dataSample)}\n\nProvide a short executive summary (max 3 sentences) explaining the initial understanding of this data based on the instruction.`;

             const response = await fetch('/api/gemini', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json', 'x-api-key': localStorage.getItem('sentinel_api_key') || '' },
               body: JSON.stringify({
                 model: 'gemini-3-flash-preview',
                 contents: prompt
               })
             });

             if (response.ok) {
               const data = await response.json();
               aiSummary = data.text || aiSummary;
             }
           } catch (error) {
             console.error("AI Generation Error", error);
           }
         }

    const newSpace: Space = {
      id: `sp-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      title: file.name.split('.')[0] || 'New Workspace',
      description: aiInstruction || 'Imported dataset',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isFavorite: false,
      uploadedFiles: [{ id: `f-${Date.now()}`, name: file.name, size: file.size, type: file.type }],
      parsedData,
      columns,
      datasets: [{ 
        id: `ds-${Date.now()}`, 
        name: file.name, 
        type: file.type, 
        data: parsedData, 
        columns,
        semanticRole: 'fact',
        refreshStatus: 'success',
        versionNumber: 1,
        lastSyncTimestamp: new Date().toISOString(),
        relationshipCandidates: [],
        embeddingsRecomputed: true,
        qualityScore: 100
      }],
      promptContext: aiInstruction,
      executionState: 'running',
      generatedCode: '',
      executionTimeline: [
        { id: 't1', agent: 'Intake Agent', action: 'Receiving and staging files', status: 'pending', timestamp: new Date().toISOString() },
        { id: 't2', agent: 'Schema Agent', action: 'Inferring structure and detecting types', status: 'pending', timestamp: '' },
        { id: 't3', agent: 'Data Quality Agent', action: 'Checking for anomalies and nulls', status: 'pending', timestamp: '' },
        { id: 't4', agent: 'Data Embedding Agent', action: 'Creating vector representations (text format) for contextual generation', status: 'pending', timestamp: '' },
        { id: 't5', agent: 'Orchestrator Agent', action: 'Planning visual execution strategy', status: 'pending', timestamp: '' },
        { id: 't6', agent: 'Analytics Agent', action: 'Computing business insights', status: 'pending', timestamp: '' },
        { id: 't7', agent: 'Visual Code Agent', action: 'Building renderable UI code', status: 'pending', timestamp: '' },
      ],
      aiSummary,
      governanceLogs: [],
      securityEvents: [],
      chatMessages: [
         { id: 'msg-sys-1', role: 'agent', content: `Welcome to the ${file.name.split('.')[0]} workspace. I am processing your layout and extracting intelligence.`, timestamp: new Date().toISOString(), agentName: 'Orchestrator Agent' }
      ],
      topologyNodes: [],
      topologyEdges: [],
      visualInsights: []
    };

    createSpace(newSpace);
    setIsUploading(false);
    navigate(`/space/${newSpace.id}/code`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setSelectedFileName(file.name);
    
    // Simulate real upload progress visually
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress > 90) clearInterval(interval);
      setUploadProgress(Math.min(90, Math.round(progress)));
    }, 200);

    if (file.name.endsWith('.json')) {
       const reader = new FileReader();
       reader.onload = async (event) => {
         try {
           const json = JSON.parse(event.target?.result as string);
           const dataArray = Array.isArray(json) ? json : [json];
           const rawColumns = dataArray.length > 0 ? Object.keys(dataArray[0]) : [];
           clearInterval(interval);
           setUploadProgress(100);
           await processAndCreateSpace(file, dataArray, rawColumns);
         } catch (error) {
           console.error("JSON Parse Error:", error);
           setIsUploading(false);
           clearInterval(interval);
         }
       };
       reader.readAsText(file);
    } else {
       Papa.parse(file, {
         header: true,
         skipEmptyLines: true,
         dynamicTyping: true,
         complete: async (results) => {
           clearInterval(interval);
           setUploadProgress(100);
           const parsedData = results.data;
           const rawColumns = results.meta.fields || [];
           await processAndCreateSpace(file, parsedData, rawColumns);
         },
         error: (error) => {
           console.error("CSV Parse Error:", error);
           setIsUploading(false);
           clearInterval(interval);
         }
       });
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f7f9] text-gray-900 flex animate-in fade-in duration-500">
      {/* Sidebar - Quick Navigation */}
      <div className="w-72 border-r border-gray-100 bg-white p-6 flex flex-col h-screen sticky top-0 overflow-y-auto shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-10">
        <div className="flex items-center mb-8">
          <Hexagon className="w-8 h-8 text-blue-600 mr-2.5 fill-blue-600/10" />
          <span className="font-bold text-2xl tracking-tight text-gray-900">Sentinel<span className="text-blue-600">BI</span></span>
        </div>

        <div className="relative mb-8 shadow-sm rounded-xl">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-gray-400" />
          <Input 
             placeholder="Search spaces..." 
             className="pl-10 bg-gray-50/50 border-gray-100 rounded-xl h-10 shadow-none focus-visible:ring-1 focus-visible:ring-blue-100"
             value={searchTerm}
             onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="space-y-8 flex-1">
          {favoriteSpaces.length > 0 && (
            <div>
              <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3 px-2">Favorites</h3>
              <div className="space-y-1">
                {favoriteSpaces.map(space => (
                  <button 
                    key={space.id} 
                    onClick={() => navigate(`/space/${space.id}`)}
                    className="w-full flex items-center p-2.5 rounded-xl hover:bg-gray-50 text-[14px] font-medium text-gray-700 transition-colors text-left group"
                  >
                    <Star className="w-4 h-4 mr-3 text-amber-500 fill-amber-500" />
                    <span className="truncate flex-1">{space.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3 px-2">Recent Spaces</h3>
            {recentSpaces.length === 0 ? (
               <p className="text-sm font-medium text-gray-400 px-3 bg-gray-50 p-3 rounded-lg border border-dashed border-gray-200">No recent spaces.</p>
            ) : (
               <div className="space-y-1">
                 {recentSpaces.map(space => (
                   <button 
                     key={space.id} 
                     onClick={() => navigate(`/space/${space.id}`)}
                     className="w-full flex items-center p-2.5 rounded-xl hover:bg-gray-50 text-[14px] font-medium text-gray-700 transition-colors text-left group"
                   >
                     <Folder className="w-4 h-4 mr-3 text-blue-500 group-hover:text-blue-600 transition-colors" />
                     <span className="truncate flex-1">{space.title}</span>
                   </button>
                 ))}
               </div>
            )}
          </div>
        </div>

        <div className="mt-auto pt-6 border-t border-gray-50">
           <div className="flex items-center p-2 hover:bg-gray-50 rounded-xl transition-colors cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-sm ring-2 ring-white">
                 {user?.name.charAt(0)}
              </div>
              <div className="ml-3">
                 <p className="text-sm font-bold text-gray-900">{user?.name}</p>
                 <p className="text-[13px] font-medium text-gray-500">{user?.role}</p>
              </div>
           </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-12 relative overflow-hidden bg-[#f5f7f9]">
        {/* Subtle mesh gradients in background */}
        <div className="absolute top-1/4 -right-20 w-[600px] h-[600px] bg-blue-200/40 rounded-full blur-[120px] pointer-events-none mix-blend-multiply" />
        <div className="absolute -bottom-20 -left-20 w-[600px] h-[600px] bg-purple-200/40 rounded-full blur-[100px] pointer-events-none mix-blend-multiply" />

        <motion.div 
          initial={{ opacity: 0, scale: 0.98, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-3xl z-10"
        >
          <div className="text-center mb-12">
             <div className="inline-flex items-center justify-center mb-6 w-20 h-20 rounded-[1.5rem] bg-white shadow-xl shadow-blue-900/5 border border-white relative">
                <div className="absolute inset-0 rounded-[1.5rem] mesh-gradient-cool opacity-10"></div>
                <Hexagon className="w-10 h-10 text-blue-600 fill-blue-600/10" />
             </div>
             <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 mb-4">Create an Intelligence Space</h1>
             <p className="text-gray-500 font-medium text-lg max-w-xl mx-auto leading-relaxed">Upload enterprise datasets to instantly spin up isolated topologies, governance tracking, and analytical models.</p>
          </div>

          <Card className="border-none bg-white rounded-[2.5rem] soft-shadow p-2 relative overflow-hidden">
            {isUploading && (
               <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-md flex flex-col items-center justify-center">
                  <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-6" />
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Engaging Agents for {selectedFileName}...</h3>
                  <div className="w-72 bg-gray-100 rounded-full h-2 overflow-hidden mb-4 shadow-inner">
                     <motion.div 
                        className="h-full bg-blue-600 rounded-full" 
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress}%` }}
                     />
                  </div>
                  <p className="text-sm font-medium text-gray-500">Parsing data, building schema, and generating AI summaries.</p>
               </div>
            )}

            <CardContent className="space-y-8 p-10 pt-8">
               {/* Upload Area */}
               <div className="border-2 border-dashed border-gray-200 rounded-[2rem] p-12 text-center hover:bg-gray-50 hover:border-blue-200 transition-all duration-300 relative group bg-gray-50/50">
                  <input 
                     type="file" 
                     className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                     accept=".csv,.json"
                     onChange={handleFileUpload}
                     disabled={isUploading}
                  />
                  <div className="flex flex-col items-center justify-center pointer-events-none">
                     <div className="w-20 h-20 rounded-full bg-white shadow-sm border border-gray-100 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:shadow-md transition-all duration-300">
                        <FileDown className="w-8 h-8 text-blue-500" />
                     </div>
                     <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-blue-600 transition-colors">Drag & Drop or Click to Upload</h3>
                     <div className="flex items-center text-[13px] font-semibold text-gray-500 bg-white px-4 py-2 rounded-full border border-gray-100 shadow-sm">
                        <Shield className="w-4 h-4 mr-2 text-emerald-500" /> Data remains secure and isolated within this workspace.
                     </div>
                  </div>
               </div>

               {/* Instruction Area */}
               <div className="space-y-4 pt-4">
                  <label className="text-[13px] font-bold text-gray-400 uppercase tracking-wider block ml-2">Initial AI Directive (Optional)</label>
                  <div className="flex gap-4">
                     <Input 
                        placeholder="e.g. Analyze regional sales performance and construct an executive summary." 
                        className="bg-gray-50 border-gray-200 rounded-2xl h-14 text-[15px] font-medium shadow-none focus-visible:ring-1 focus-visible:ring-blue-100 px-6 transition-colors hover:border-gray-300"
                        value={aiInstruction}
                        onChange={e => setAiInstruction(e.target.value)}
                     />
                  </div>
               </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
