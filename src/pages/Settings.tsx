import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Settings as SettingsIcon, Bell, Shield, Key, AlertTriangle, EyeOff, Save, FileText } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useParams } from 'react-router-dom';
import { useStore } from '../store';

export function Settings() {
  const { spaceId } = useParams();
  const spaces = useStore(state => state.spaces);
  const updateSpace = useStore(state => state.updateSpace);
  const activeSpace = spaces.find(s => s.id === spaceId) || spaces[0];

  if (!activeSpace) {
    return <div className="p-8 text-center text-gray-500">No active workspace selected.</div>;
  }

  const policies = activeSpace.policies || {
    securityLevel: 'Standard',
    piiRedaction: true,
    requireHumanReviewThreshold: 75,
    maxExportRows: 10000,
    allowExecutiveExport: true,
    allowDatasetJoins: true,
    forbiddenActions: '',
    writerGuidelines: ''
  };

  const updatePolicy = (key: string, value: any) => {
    updateSpace(activeSpace.id, { 
      policies: { ...policies, [key]: value } as any
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl pb-12">
      <div>
        <h2 className="text-[28px] font-bold tracking-tight text-gray-900">Governance & Policy Engine</h2>
        <p className="text-gray-500 mt-1 font-medium text-[15px]">Define operational boundaries for the AI agents, security proxies, and export layers in this Space.</p>
      </div>

      <Card className="border-none soft-shadow overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-red-500 via-orange-500 to-amber-500" />
        <CardHeader>
           <CardTitle className="text-xl font-bold flex items-center text-gray-900">
             <Shield className="w-5 h-5 text-red-500 mr-2" /> Security Proxy Policies
           </CardTitle>
           <CardDescription>Rules enforced by the Security Proxy agent before query execution.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
           <div>
             <label className="text-[13px] uppercase tracking-wider font-bold text-gray-500 block mb-3">Enforcement Level</label>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {['Standard', 'Strict', 'Zero-Trust'].map(level => (
                   <button 
                     key={level}
                     onClick={() => updatePolicy('securityLevel', level)}
                     className={`p-4 rounded-xl text-left border ${policies.securityLevel === level ? 'border-red-500 bg-red-50 shadow-sm ring-1 ring-red-200 text-red-900' : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'}`}
                   >
                      <div className="font-bold mb-1">{level}</div>
                      <div className="text-xs opacity-80 mt-1">
                         {level === 'Standard' && 'Blocks obvious prompt injection and exfiltration.'}
                         {level === 'Strict' && 'Requires query sanitization and limits aggregation scopes.'}
                         {level === 'Zero-Trust' && 'Blocks all unverified structural queries. Human loop mandatory.'}
                      </div>
                   </button>
                ))}
             </div>
           </div>

           <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
              <div>
                 <h4 className="font-bold text-gray-900 flex items-center"><EyeOff className="w-4 h-4 mr-2" /> PII Redaction</h4>
                 <p className="text-sm text-gray-500 mt-1">Automatically mask detected emails, SSNs, and names before semantic extraction.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={policies.piiRedaction} onChange={(e) => updatePolicy('piiRedaction', e.target.checked)} />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
              </label>
           </div>
        </CardContent>
      </Card>

      <Card className="border-none soft-shadow overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-amber-500 to-yellow-400" />
        <CardHeader>
           <CardTitle className="text-xl font-bold flex items-center text-gray-900">
             <AlertTriangle className="w-5 h-5 text-amber-500 mr-2" /> Orchestrator Escalation Thresholds
           </CardTitle>
           <CardDescription>Configure when the orchestrator halts execution to demand human review.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
           <div className="space-y-4">
             <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-bold text-gray-700">Action Risk Score (0-100)</label>
                <span className="text-xl font-extrabold text-amber-600">{policies.requireHumanReviewThreshold}</span>
             </div>
             <input 
               type="range" 
               min="10" max="100" step="5"
               value={policies.requireHumanReviewThreshold}
               onChange={(e) => updatePolicy('requireHumanReviewThreshold', parseInt(e.target.value))}
               className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-amber-500" 
             />
             <p className="text-xs font-semibold text-gray-500">If the Governance Agent scores an AI query's risk index higher than this threshold, the pipeline will block until an Analyst approves it.</p>
           </div>
        </CardContent>
      </Card>

      <Card className="border-none soft-shadow overflow-hidden">
         <div className="h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
         <CardHeader>
            <CardTitle className="text-xl font-bold flex items-center text-gray-900">
              <Key className="w-5 h-5 text-blue-500 mr-2" /> Custom LLM Key (Local)
            </CardTitle>
            <CardDescription>Optionally bypass the platform API key. Never shared with the server permanently.</CardDescription>
         </CardHeader>
         <CardContent className="space-y-6">
            <div className="space-y-2">
               <label className="text-sm font-bold text-gray-700">Gemini API Key</label>
               <Input 
                 type="password" 
                 placeholder="AIza..."
                 defaultValue={localStorage.getItem('sentinel_api_key') || ''}
                 onBlur={(e) => {
                   if(e.target.value) {
                     localStorage.setItem('sentinel_api_key', e.target.value);
                   } else {
                     localStorage.removeItem('sentinel_api_key');
                   }
                 }}
                 className="max-w-xl font-mono" 
               />
               <p className="text-xs text-gray-400">Stored safely in your browser's localStorage. Remove to use default platform key.</p>
            </div>
         </CardContent>
      </Card>

      <Card className="border-none soft-shadow overflow-hidden">
         <CardHeader>
            <CardTitle className="text-xl font-bold flex items-center text-gray-900">
              <FileText className="w-5 h-5 text-blue-500 mr-2" /> Export & Agent Policies
            </CardTitle>
            <CardDescription>Control how data leaves the intelligence perimeter and limit agent output.</CardDescription>
         </CardHeader>
         <CardContent className="space-y-6">
            <div className="space-y-2">
               <label className="text-sm font-bold text-gray-700">Maximum Rows per Export</label>
               <Input 
                 type="number" 
                 value={policies.maxExportRows} 
                 onChange={(e) => updatePolicy('maxExportRows', parseInt(e.target.value) || 0)}
                 className="max-w-xs font-mono font-bold" 
               />
            </div>
            
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 mt-4">
              <div>
                 <h4 className="font-bold text-gray-900">Allow Executive Report Generation (PDF/PPTX)</h4>
                 <p className="text-sm text-gray-500 mt-1">Permit the Executive Writer Agent to synthesize narratives.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={policies.allowExecutiveExport} onChange={(e) => updatePolicy('allowExecutiveExport', e.target.checked)} />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
           </div>
           
           <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
              <div>
                 <h4 className="font-bold text-gray-900 flex items-center">Allow Cross-Dataset Joins</h4>
                 <p className="text-sm text-gray-500 mt-1">Permit agents to cross-query multiple datasets.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={policies.allowDatasetJoins} onChange={(e) => updatePolicy('allowDatasetJoins', e.target.checked)} />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
           </div>

           <div className="pt-4 border-t border-gray-100">
              <label className="text-sm font-bold text-gray-700">Forbidden Actions</label>
              <textarea 
                className="w-full mt-2 p-3 border border-gray-200 rounded-lg text-sm bg-white" 
                rows={3}
                placeholder="e.g. Do not compute revenue sharing, omit Q1 data, do not attempt to guess individual salaries..."
                value={policies.forbiddenActions || ''}
                onChange={(e) => updatePolicy('forbiddenActions', e.target.value)}
              />
           </div>

           <div className="pt-4 border-t border-gray-100">
              <label className="text-sm font-bold text-gray-700">Executive Writer Guidelines</label>
              <textarea 
                className="w-full mt-2 p-3 border border-gray-200 rounded-lg text-sm bg-white" 
                rows={3}
                placeholder="e.g. Always emphasize operational efficiency, limit summary to 3 paragraphs..."
                value={policies.writerGuidelines || ''}
                onChange={(e) => updatePolicy('writerGuidelines', e.target.value)}
              />
           </div>
         </CardContent>
      </Card>
      
      <div className="flex justify-end gap-3">
         <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => {
            if(window.confirm('Are you sure? This will delete all your local data including datasets and spaces. The server holds NO data, everything is in your browser.')) {
              useStore.getState().clearAllData();
              window.location.href = '/';
            }
         }}>
           <AlertTriangle className="w-4 h-4 mr-2" /> Clear All Local Data
         </Button>
         <Button className="bg-gray-900 text-white rounded-full px-6 shadow-md"><Save className="w-4 h-4 mr-2" /> Save Active Policies</Button>
      </div>

    </div>
  );
}
