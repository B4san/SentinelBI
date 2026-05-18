import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Database, RefreshCw, AlertCircle, FileText, CheckCircle2, Upload, ChevronDown, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, ExternalLink, Sparkles } from 'lucide-react';
import Papa from 'papaparse';
import { computeDataTruth } from '../lib/DataTruthEngine';

export function DataSources() {
  const { spaceId } = useParams();
  const spaces = useStore(state => state.spaces);
  const updateSpace = useStore(state => state.updateSpace);
  const activeSpace = spaces.find(s => s.id === spaceId);

  const files = activeSpace?.uploadedFiles || [];
  const [isUploading, setIsUploading] = useState(false);
  const [expandedDataSourceId, setExpandedDataSourceId] = useState<string | null>(null);

  const [filterType, setFilterType] = useState('all');
  const [filterConnection, setFilterConnection] = useState('all');
  const [filterSync, setFilterSync] = useState('all');

  const [aiProcessingAction, setAiProcessingAction] = useState<'compare' | 'join' | 'append' | null>(null);
  const [aiResult, setAiResult] = useState<any>(null);
  const [showAiModal, setShowAiModal] = useState(false);

  const filteredFiles = files.filter((file: any) => {
    const dataset = activeSpace?.datasets?.find(d => d.id === file.id);
    
    // Type Filter
    if (filterType !== 'all') {
      const typeStr = (file.type || '').toLowerCase();
      const extStr = (file.name || '').toLowerCase().split('.').pop() || '';
      if (filterType === 'csv' && !typeStr.includes('csv') && extStr !== 'csv') return false;
      if (filterType === 'json' && !typeStr.includes('json') && extStr !== 'json') return false;
    }
    
    // Connection Filter
    if (filterConnection !== 'all') {
        if (filterConnection === 'disconnected') return false; // all listed files are connected
    }
    
    // Sync Filter
    if (filterSync !== 'all') {
      const hasDataset = !!dataset;
      if (filterSync === 'success' && !hasDataset) return false;
      if (filterSync === 'failed' && hasDataset) return false;
    }
    
    return true;
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeSpace) return;

    setIsUploading(true);

    const onComplete = (parsedData: any[], rawColumns: string[]) => {
      const columns = rawColumns.map(col => {
        let type: 'numeric' | 'categorical' | 'date' | 'boolean' = 'categorical';
        const sample = parsedData[0]?.[col];
        if (typeof sample === 'number') type = 'numeric';
        else if (typeof sample === 'boolean') type = 'boolean';
        else if (typeof sample === 'string' && !isNaN(Date.parse(sample)) && sample.length > 5) type = 'date';
        return { name: col, type };
      });

      const datasetId = `ds-${Date.now()}`;
      const newFile = { id: datasetId, name: file.name, size: file.size, type: file.type };
      const newDataset = { 
        id: datasetId, 
        name: file.name, 
        type: file.type, 
        data: parsedData, 
        columns,
        semanticRole: 'fact' as const,
        refreshStatus: 'success' as const,
        versionNumber: 1,
        lastSyncTimestamp: new Date().toISOString(),
        relationshipCandidates: [],
        embeddingsRecomputed: false,
        qualityScore: 100
      };

      updateSpace(spaceId!, {
        uploadedFiles: [...(activeSpace.uploadedFiles || []), newFile],
        datasets: [...(activeSpace.datasets || []), newDataset],
        // Merge columns across datasets by simply appending, in a real app this would be more robust
        columns: [...(activeSpace.columns || []), ...columns],
        // Also append parsed data to support legacy layout
        parsedData: [...(activeSpace.parsedData || []), ...parsedData],
      });
      setIsUploading(false);
    };

    if (file.name.endsWith('.json')) {
       const reader = new FileReader();
       reader.onload = async (event) => {
         try {
           const json = JSON.parse(event.target?.result as string);
           const dataArray = Array.isArray(json) ? json : [json];
           const rawColumns = dataArray.length > 0 ? Object.keys(dataArray[0]) : [];
           onComplete(dataArray, rawColumns);
         } catch (error) {
           console.error("JSON Parse Error:", error);
           setIsUploading(false);
         }
       };
       reader.readAsText(file);
    } else {
       Papa.parse(file, {
         header: true,
         skipEmptyLines: true,
         dynamicTyping: true,
         complete: (results) => {
           const parsedData = results.data;
           const rawColumns = results.meta.fields || [];
           onComplete(parsedData, rawColumns);
         },
         error: (error) => {
           console.error("CSV Parse Error:", error);
           setIsUploading(false);
         }
       });
    }
  };

  const handleSyncSchema = (fileId: string) => {
    if (!activeSpace) return;
    const dataset = activeSpace.datasets?.find(d => d.id === fileId);
    if (!dataset) return;
    
    // Simulate updating schema by re-running type inference and updating lastSyncTimestamp
    const updatedColumns = dataset.columns.map(col => ({ ...col }));
    const computedTruth = computeDataTruth(dataset.data || []);
    
    updateSpace(spaceId!, {
      datasets: activeSpace.datasets?.map(d => 
        d.id === fileId ? { 
          ...d, 
          columns: updatedColumns, 
          lastSyncTimestamp: new Date().toISOString(),
          versionNumber: d.versionNumber + 1,
          embeddingsRecomputed: true,
          qualityScore: computedTruth.dataQualityScore
        } : d
      ),
      executionTimeline: [...(activeSpace.executionTimeline || []), {
         id: `tx-${Date.now()}`,
         agent: 'Data Intake Agent',
         action: `Resynced schema for ${dataset.name}`,
         status: 'success',
         timestamp: new Date().toISOString()
      }]
    });
  };

  const handleDisconnect = (fileId: string) => {
    if (!activeSpace) return;
    updateSpace(spaceId!, {
      uploadedFiles: (activeSpace.uploadedFiles || []).filter(f => f.id !== fileId),
      datasets: (activeSpace.datasets || []).filter(d => d.id !== fileId),
      executionTimeline: [...(activeSpace.executionTimeline || []), {
         id: `tx-${Date.now()}`,
         agent: 'Data Intake Agent',
         action: `Disconnected source ID ${fileId}`,
         status: 'success',
         timestamp: new Date().toISOString()
      }]
    });
  };

  const handleAiUnify = async (action: 'compare' | 'join' | 'append') => {
    if (!activeSpace || !activeSpace.datasets || activeSpace.datasets.length < 2) return;
    
    setAiProcessingAction(action);
    setAiResult(null);
    setShowAiModal(true);

    const datasetsInfo = activeSpace.datasets.map(d => ({
       id: d.id,
       name: d.name,
       columns: d.columns,
       sampleData: (d.data || []).slice(0, 3) 
    }));

    try {
      const prompt = `You are a data engineer AI. I have ${datasetsInfo.length} datasets.
Here is their schema and 3 rows of sample data:
${JSON.stringify(datasetsInfo, null, 2)}

Task: ${action}
If 'compare': Return a JSON object with { "analysis": "Detailed text comparing profiles, types, and overlap." }.
If 'join': Detect the best way to join these datasets. Return a JSON object with { "dataset1Id": "...", "dataset2Id": "...", "joinKey1": "...", "joinKey2": "...", "analysis": "Why this join makes sense" }. (Use exact IDs provided).
If 'append': Detect if these datasets can be safely appended (union). Return a JSON object with { "canAppend": true, "analysis": "Explanation of schemas overlap" }.

Respond ONLY with valid JSON, nothing else. No markdown wrappers.`;

      let res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemini-3-flash-preview',
          contents: [{ role: 'user', parts: [{ text: prompt }] }]
        })
      });
      if (!res.ok) {
        res = await fetch('/api/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
             model: 'gemini-3-flash-preview', // fall back if first attempt fails
             contents: [{ role: 'user', parts: [{ text: prompt }] }]
          })
        });
      }
      
      const jsonResponse = await res.json();
      let text = (jsonResponse.text || "").replace(/```json\n?/g, '').replace(/```\n?/g, '');
      const parsed = JSON.parse(text);
      setAiResult({ action, ...parsed });
      
    } catch (e) {
       console.error("AI unification failed", e);
       setAiResult({ error: "Failed to process the request. Try again." });
    } finally {
       setAiProcessingAction(null);
    }
  };

  const executeJoinOrAppend = () => {
    if (!aiResult || !activeSpace) return;
    
    if (aiResult.action === 'join' && aiResult.dataset1Id && aiResult.dataset2Id && aiResult.joinKey1 && aiResult.joinKey2) {
       const ds1 = activeSpace.datasets?.find(d => d.id === aiResult.dataset1Id);
       const ds2 = activeSpace.datasets?.find(d => d.id === aiResult.dataset2Id);
       
       if (ds1 && ds2) {
         // Create a simple left join map
         const map2 = new Map();
         ds2.data.forEach((row: any) => {
           map2.set(row[aiResult.joinKey2], row);
         });
         
         const joinedData = ds1.data.map((row: any) => {
           const match = map2.get(row[aiResult.joinKey1]) || {};
           const cleanMatch = { ...match };
           delete cleanMatch[aiResult.joinKey2]; // remove redundant key
           // prefix columns from ds2 to avoid collision
           const prefixedMatch: any = {};
           Object.keys(cleanMatch).forEach(k => {
              if (row[k] !== undefined && k !== aiResult.joinKey1) {
                prefixedMatch[`${ds2.name}_${k}`] = cleanMatch[k];
              } else {
                prefixedMatch[k] = cleanMatch[k];
              }
           });
           return { ...row, ...prefixedMatch };
         });
         
         const newDsId = `ds-joined-${Date.now()}`;
         const newCols = Object.keys(joinedData[0] || {}).map(k => ({ name: k, type: 'categorical' as any }));
         
         const newFile = {
           id: newDsId,
           name: `Joined: ${ds1.name} + ${ds2.name}`,
           size: joinedData.length * 100, // roughly estimate
           type: 'application/json'
         };

         updateSpace(spaceId!, {
            uploadedFiles: [...(activeSpace.uploadedFiles || []), newFile],
            datasets: [...(activeSpace.datasets || []), {
              id: newDsId,
              name: `Joined: ${ds1.name} + ${ds2.name}`,
              type: 'application/json',
              data: joinedData,
              columns: newCols,
              semanticRole: 'fact',
              refreshStatus: 'success',
              versionNumber: 1,
              lastSyncTimestamp: new Date().toISOString(),
              relationshipCandidates: [],
              embeddingsRecomputed: false,
              qualityScore: 100
            }],
            columns: [...(activeSpace.columns || []), ...newCols],
            parsedData: [...(activeSpace.parsedData || []), ...joinedData],
         });
         setShowAiModal(false);
       }
    } else if (aiResult.action === 'append' && aiResult.canAppend) {
       const allData = (activeSpace.datasets || []).reduce((acc: any[], ds) => {
          return acc.concat(ds.data);
       }, []);
       const newDsId = `ds-appended-${Date.now()}`;
       const newCols = Object.keys(allData[0] || {}).map(k => ({ name: k, type: 'categorical' as any }));
       
       const newFile = {
         id: newDsId,
         name: `Appended All Datasets`,
         size: allData.length * 100, // roughly estimate
         type: 'application/json'
       };

       updateSpace(spaceId!, {
            uploadedFiles: [...(activeSpace.uploadedFiles || []), newFile],
            datasets: [...(activeSpace.datasets || []), {
              id: newDsId,
              name: `Appended All Datasets`,
              type: 'application/json',
              data: allData,
              columns: newCols,
              semanticRole: 'fact',
              refreshStatus: 'success',
              versionNumber: 1,
              lastSyncTimestamp: new Date().toISOString(),
              relationshipCandidates: [],
              embeddingsRecomputed: false,
              qualityScore: 100
            }],
            columns: [...(activeSpace.columns || []), ...newCols],
            parsedData: [...(activeSpace.parsedData || []), ...allData],
       });
       setShowAiModal(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <h2 className="text-[28px] font-bold tracking-tight text-gray-900">Data Sources</h2>
          <p className="text-gray-500 mt-1 font-medium text-[15px]">Manage isolated datasets connected to this workspace.</p>
        </div>
        <div className="mt-4 sm:mt-0 relative inline-block">
          <Button disabled={isUploading} className="shadow-md">
            {isUploading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            {isUploading ? 'Uploading...' : 'Add Source'}
          </Button>
          <input
             type="file"
             className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
             accept=".csv,.json"
             onChange={handleFileUpload}
             disabled={isUploading}
           />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <select 
          className="px-3 py-2 border border-gray-200 rounded-md text-sm outline-none focus:border-blue-500 bg-white"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="all">All File Types</option>
          <option value="csv">CSV</option>
          <option value="json">JSON</option>
        </select>
        
        <select 
          className="px-3 py-2 border border-gray-200 rounded-md text-sm outline-none focus:border-blue-500 bg-white"
          value={filterConnection}
          onChange={(e) => setFilterConnection(e.target.value)}
        >
          <option value="all">All Connections</option>
          <option value="connected">Connected</option>
          <option value="disconnected">Disconnected</option>
        </select>
        
        <select 
          className="px-3 py-2 border border-gray-200 rounded-md text-sm outline-none focus:border-blue-500 bg-white"
          value={filterSync}
          onChange={(e) => setFilterSync(e.target.value)}
        >
          <option value="all">All Sync Status</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div className="grid gap-6">
        {filteredFiles.map((file: any) => {
          const dataset = activeSpace?.datasets?.find(d => d.id === file.id);
          const isExpanded = expandedDataSourceId === file.id;

          return (
          <Card key={file.id} className="soft-shadow border-none bg-white p-2 transition-all duration-200">
            <CardHeader 
              className="flex flex-row items-center justify-between pb-4 px-6 pt-6 cursor-pointer hover:bg-gray-50/50 rounded-xl"
              onClick={() => setExpandedDataSourceId(isExpanded ? null : file.id)}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center">
                  <Database className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex flex-col">
                  <CardTitle className="text-xl font-bold text-gray-900">
                    {file.name}
                  </CardTitle>
                  <CardDescription className="text-gray-400 font-medium">File ID: {file.id.substring(0, 12)}</CardDescription>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <Badge variant="outline" className="border-emerald-100 text-emerald-600 bg-emerald-50 px-3 py-1 font-semibold flex items-center shadow-sm">
                  <CheckCircle2 className="w-3 h-3 mr-1.5" /> Connected
                </Badge>
                {isExpanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
              </div>
            </CardHeader>
            {isExpanded && (
              <CardContent className="px-6 pb-6 pt-0 animate-in slide-in-from-top-2 duration-200">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 p-6 rounded-2xl bg-gray-50 border border-gray-100">
                  <div>
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Type</p>
                    <p className="font-bold text-gray-900 text-lg mt-1">{file.type || 'CSV / JSON'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Size</p>
                    <p className="font-bold text-gray-900 text-lg mt-1">{(file.size / 1024).toFixed(2)} KB</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Parsed</p>
                    <p className="font-bold text-gray-900 text-lg mt-1">{dataset?.data?.length || 0} rows</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Last Sync</p>
                    <p className="font-bold text-gray-900 text-lg mt-1">{dataset?.lastSyncTimestamp ? new Date(dataset.lastSyncTimestamp).toLocaleTimeString() : 'Just now'}</p>
                  </div>
                </div>

                <div className="mt-6 flex space-x-3">
                   <Button variant="outline" className="shadow-sm border-gray-200" onClick={(e) => { e.stopPropagation(); handleSyncSchema(file.id); }}>
                      <RefreshCw className="w-4 h-4 mr-2" /> Sync Schema
                   </Button>
                   <Button variant="outline" className="shadow-sm text-red-600 border-red-100 hover:bg-red-50 hover:text-red-700" onClick={(e) => { e.stopPropagation(); handleDisconnect(file.id); }}>
                      Disconnect
                   </Button>
                </div>
                
                {dataset && (
                  <DatasetPreview dataset={dataset} />
                )}
              </CardContent>
            )}
          </Card>
        )})}

        {filteredFiles.length === 0 && (
          <Card className="border-dashed border-2 border-gray-200 py-16 flex flex-col items-center justify-center text-gray-400 bg-gray-50/50 shadow-none">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100 mb-4">
              <FileText className="w-6 h-6 text-gray-300" />
            </div>
            <p className="font-medium text-[15px]">{files.length === 0 ? "No external data sources explicitly added." : "No data sources match the selected filters."}</p>
          </Card>
        )}
      </div>

      {(activeSpace?.datasets?.length || 0) > 1 && (
         <Card className="border-none soft-shadow bg-gradient-to-br from-indigo-50 to-blue-50/50 overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-indigo-500 to-blue-500 w-full" />
            <CardHeader>
               <CardTitle className="text-xl font-bold text-indigo-900 tracking-tight">Multi-Dataset Analysis Tools</CardTitle>
               <CardDescription className="text-indigo-700/80 font-medium">Your workspace contains {(activeSpace?.datasets?.length || 0)} active datasets. Unify them safely.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
               {/* Compare Mode */}
               <div onClick={() => handleAiUnify('compare')} className="bg-white rounded-xl p-4 border border-indigo-100 shadow-sm flex flex-col items-start hover:shadow-md transition-shadow cursor-pointer">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center mb-3">
                     <ArrowUpDown className="w-5 h-5 text-indigo-600" />
                  </div>
                  <h4 className="font-bold text-gray-900 mb-1">Compare Profiles</h4>
                  <p className="text-xs text-gray-500 leading-relaxed flex-1">Side-by-side analysis of dataset schemas, overlapping properties, and completeness distribution.</p>
                  <Button variant="ghost" size="sm" className="mt-3 text-indigo-600 hover:text-indigo-700 font-semibold px-0 hover:bg-transparent pointer-events-none">Launch Compare <ChevronRight className="w-4 h-4 ml-1" /></Button>
               </div>
               
               {/* Join Candidates */}
               <div onClick={() => handleAiUnify('join')} className="bg-white rounded-xl p-4 border border-indigo-100 shadow-sm flex flex-col items-start hover:shadow-md transition-shadow cursor-pointer">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center mb-3">
                     <Database className="w-5 h-5 text-indigo-600" />
                  </div>
                  <h4 className="font-bold text-gray-900 mb-1">Join Candidates</h4>
                  <p className="text-xs text-gray-500 leading-relaxed flex-1">Auto-detect shared primary/foreign keys across datasets to suggest safe semantic joins.</p>
                  <Button variant="ghost" size="sm" className="mt-3 text-indigo-600 hover:text-indigo-700 font-semibold px-0 hover:bg-transparent pointer-events-none">Scan Keys <ChevronRight className="w-4 h-4 ml-1" /></Button>
               </div>

               {/* Consolidation */}
               <div onClick={() => handleAiUnify('append')} className="bg-white rounded-xl p-4 border border-indigo-100 shadow-sm flex flex-col items-start hover:shadow-md transition-shadow cursor-pointer">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center mb-3">
                     <FileText className="w-5 h-5 text-indigo-600" />
                  </div>
                  <h4 className="font-bold text-gray-900 mb-1">Append Compatibility</h4>
                  <p className="text-xs text-gray-500 leading-relaxed flex-1">Check variable definitions to see if partitioned datasets can be appended safely.</p>
                  <Button variant="ghost" size="sm" className="mt-3 text-indigo-600 hover:text-indigo-700 font-semibold px-0 hover:bg-transparent pointer-events-none">Check Schema <ChevronRight className="w-4 h-4 ml-1" /></Button>
               </div>
            </CardContent>
         </Card>
      )}

      {showAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-500" />
                <span>AI Data Integration</span>
              </h2>
              <p className="text-sm text-gray-500 mt-1 pb-2">
                AI is analyzing your datasets to suggest optimal unifications.
              </p>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
               {aiProcessingAction && !aiResult && (
                  <div className="flex flex-col items-center justify-center py-6">
                     <div className="w-12 h-12 relative animate-spin mb-4">
                       <div className="absolute inset-0 rounded-full border-b-2 border-indigo-600"></div>
                       <div className="absolute inset-0 rounded-full border-t-2 border-blue-400 opacity-50 block rotate-90"></div>
                     </div>
                     <p className="text-indigo-900 font-semibold">Running Data Intelligence...</p>
                     <p className="text-sm text-gray-500 mt-1">Analyzing cross-dataset relationships and schemas.</p>
                  </div>
               )}

               {aiResult && aiResult.error && (
                  <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm mb-4">
                     {aiResult.error}
                  </div>
               )}

               {aiResult && !aiResult.error && (
                  <div className="space-y-4">
                     <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                        <h4 className="font-semibold text-indigo-900 mb-2 capitalize text-lg">{aiResult.action} Result</h4>
                        <div className="text-sm text-indigo-800 leading-relaxed flex flex-col gap-2">
                           <p><strong>Analysis:</strong> {aiResult.analysis}</p>
                           
                           {aiResult.action === 'join' && aiResult.dataset1Id && (
                             <div className="mt-2 bg-white rounded-lg p-3 border border-indigo-100/50 shadow-sm">
                               <p><strong>Suggested Join Keys:</strong></p>
                               <ul className="list-disc pl-5 mt-1">
                                 <li>Dataset 1: <code className="bg-gray-100 px-1 rounded">{aiResult.joinKey1}</code></li>
                                 <li>Dataset 2: <code className="bg-gray-100 px-1 rounded">{aiResult.joinKey2}</code></li>
                               </ul>
                             </div>
                           )}
                           
                           {aiResult.action === 'append' && (
                             <p className="mt-2 text-indigo-900 font-medium">Compatible for Append: {aiResult.canAppend ? '✅ Yes' : '❌ No'}</p>
                           )}
                        </div>
                     </div>
                  </div>
               )}
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2 flex-shrink-0">
               <Button variant="outline" onClick={() => setShowAiModal(false)}>Close</Button>
               {aiResult && !aiResult.error && (aiResult.action === 'join' || aiResult.action === 'append') && (
                  <Button onClick={executeJoinOrAppend} className="bg-indigo-600 hover:bg-indigo-700 shadow-md text-white border-transparent">
                     Execute {aiResult.action === 'join' ? 'Join' : 'Append'} and Create New Source
                  </Button>
               )}
            </div>
          </div>
        </div>
      )}


      <Card className="border-amber-100 bg-amber-50/50 soft-shadow">
        <CardContent className="p-6">
           <div className="flex items-start">
              <div className="p-2 bg-amber-100 rounded-full shrink-0 mr-4">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                 <h4 className="font-bold text-amber-900 text-[15px] mb-1">Data Isolation Guarantee</h4>
                 <p className="text-sm text-amber-700/80 font-medium leading-relaxed">Data ingested into this workspace is physically isolated from other topologies. External models will only process row-level values if explicitly permitted by the Governance Center policies.</p>
              </div>
           </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DatasetPreview({ dataset }: { dataset: any }) {
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;
  
  if (!dataset || !dataset.data || !dataset.columns) return null;

  const dataPreview = dataset.data.slice(0, 100);

  const sortedData = React.useMemo(() => {
    let sortableItems = [...dataPreview];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [dataPreview, sortConfig]);

  const totalPages = Math.ceil(sortedData.length / itemsPerPage);
  const currentData = sortedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  return (
    <div className="mt-8 border-t border-gray-200 pt-8">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Data Preview</h3>
          <p className="text-sm text-gray-500">First 100 rows</p>
        </div>
        <div className="text-sm text-gray-500 font-medium">Page {currentPage} of {totalPages || 1}</div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm relative w-full mb-4">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-700 uppercase bg-gray-50 shadow-sm z-10 w-full" style={{ position: 'sticky', top: 0 }}>
            <tr>
              {dataset.columns.map((col: any) => (
                <th key={col.name} className="px-5 py-4 cursor-pointer hover:bg-gray-100 whitespace-nowrap border-b border-gray-200 transition-colors" onClick={() => requestSort(col.name)}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-gray-800">{col.name}</div>
                      <div className="text-[10px] text-gray-400 mt-1 lowercase font-semibold tracking-wider">{col.type}</div>
                    </div>
                    {sortConfig?.key === col.name ? (
                      sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 ml-2 text-blue-600" /> : <ArrowDown className="w-3 h-3 ml-2 text-blue-600" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 ml-2 text-gray-300" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {currentData.length > 0 ? (
              currentData.map((row: any, i: number) => (
                <tr key={i} className="bg-white border-b hover:bg-gray-50 border-gray-100 transition-colors">
                  {dataset.columns.map((col: any) => (
                     <td key={col.name} className="px-5 py-3 text-gray-600 truncate max-w-[250px] font-medium" title={String(row[col.name])}>
                       {String(row[col.name])}
                     </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={dataset.columns.length} className="px-5 py-6 text-center text-gray-500 font-medium bg-gray-50">No data available</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between items-center">
        <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Previous</Button>
        <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>Next</Button>
      </div>
    </div>
  );
}