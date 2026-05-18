import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useStore } from '../store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Shield, ShieldAlert, CheckCircle2, History, AlertTriangle, Fingerprint, Settings as SettingsIcon } from 'lucide-react';
import { format } from 'date-fns';

export function Governance() {
  const { spaceId } = useParams();
  const spaces = useStore(state => state.spaces);
  const activeSpace = spaces.find(s => s.id === spaceId);

  const logs = activeSpace?.governanceLogs || [];
  
  const policies = activeSpace?.policies || {
    securityLevel: 'Standard',
    piiRedaction: true,
    requireHumanReviewThreshold: 75,
    maxExportRows: 10000,
    allowExecutiveExport: true
  };

  const blockedLogsCount = logs.filter((l: any) => l.status === 'blocked').length;
  // Compute score based on enforcement level and active incident logs
  let complianceScoreGrade = 'A+';
  let complianceColor = 'text-emerald-500';
  let complianceMessage = 'Zero unmitigated violations';

  if (blockedLogsCount > 10) {
    complianceScoreGrade = 'C-';
    complianceColor = 'text-amber-500';
    complianceMessage = 'High volume of blocked intrusions';
  } else if (blockedLogsCount > 0) {
    complianceScoreGrade = 'B+';
    complianceColor = 'text-emerald-500';
    complianceMessage = 'Active mitigations successful';
  }

  if (policies.securityLevel === 'Standard' && logs.length > 5) {
     complianceScoreGrade = 'B-';
     complianceMessage = 'Upgrade to Strict recommended based on volume';
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
           <div className="flex items-center gap-3">
             <h2 className="text-[28px] font-bold tracking-tight text-gray-900">AI Governance Center</h2>
           </div>
           <p className="text-gray-500 mt-1 font-medium text-[15px]">Enterprise compliance, explainability, and observability logs.</p>
        </div>
        <div className="space-x-3 mt-4 sm:mt-0 flex items-center">
           <Link to={`/space/${spaceId}/settings`}>
             <Button variant="outline" size="sm" className="rounded-full bg-white shadow-sm font-semibold border-gray-200">
                <SettingsIcon className="w-4 h-4 mr-2" /> Modify Policies
             </Button>
           </Link>
           <Badge variant="outline" className="px-3 py-1.5 shadow-sm text-blue-700 font-semibold border-blue-200 bg-blue-50">
             <Shield className="w-3.5 h-3.5 mr-1.5" /> SOC2 Trace Mode
           </Badge>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card className="col-span-1 soft-shadow border-none bg-white p-2">
           <CardHeader className="px-6 pt-6 pb-2 text-center">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-gray-400">Compliance Score</CardTitle>
           </CardHeader>
           <CardContent className="px-6 pb-6">
              <div className={`text-5xl font-extrabold text-center ${complianceColor} mt-2 tracking-tight`}>{complianceScoreGrade}</div>
              <p className="text-center font-semibold text-sm text-gray-500 mt-3">{complianceMessage}</p>
           </CardContent>
        </Card>
        
        <Card className="col-span-3 soft-shadow border-none bg-white p-2">
           <CardHeader className="px-6 pt-6 pb-4">
              <CardTitle className="text-xl font-bold text-gray-900">Governance Policy Engine State</CardTitle>
           </CardHeader>
           <CardContent className="px-6 pb-6">
              <div className="space-y-4">
                 <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
                    <div>
                       <span className="text-[15px] font-bold text-gray-800 block">Security Proxy Level</span>
                       <span className="text-xs text-gray-500 font-semibold">{policies.securityLevel} configuration active</span>
                    </div>
                    <Badge variant="outline" className={`border-amber-200 text-amber-700 bg-amber-50 px-2.5 py-1 ${policies.securityLevel === 'Zero-Trust' ? 'bg-red-50 text-red-700 border-red-200' : ''}`}>Enforced</Badge>
                 </div>
                 <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
                    <div>
                       <span className="text-[15px] font-bold text-gray-800 block">PII De-identification Rule</span>
                       <span className="text-xs text-gray-500 font-semibold">Automatic redaction before semantic parsing</span>
                    </div>
                    <Badge variant="outline" className={policies.piiRedaction ? "border-emerald-200 text-emerald-700 bg-emerald-50 px-2.5 py-1" : "border-gray-200 text-gray-500 bg-gray-50 px-2.5 py-1"}>
                       {policies.piiRedaction ? 'Enforced' : 'Disabled'}
                    </Badge>
                 </div>
                 <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
                    <div>
                        <span className="text-[15px] font-bold text-gray-800 block">Human Review Threshold</span>
                        <span className="text-xs text-gray-500 font-semibold">Risk score &gt; {policies.requireHumanReviewThreshold} requires approval</span>
                    </div>
                    <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50 px-2.5 py-1">Enforced</Badge>
                 </div>
                 <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
                    <div>
                        <span className="text-[15px] font-bold text-gray-800 block">Max Export Data Boundaries</span>
                        <span className="text-xs text-gray-500 font-semibold">{policies.maxExportRows} rows max / Exec Mode: {policies.allowExecutiveExport ? 'Enabled' : 'Disabled'}</span>
                    </div>
                    <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50 px-2.5 py-1">Enforced</Badge>
                 </div>
              </div>
           </CardContent>
        </Card>
      </div>

      <Card className="soft-shadow border-none bg-white overflow-hidden">
        <CardHeader className="px-8 pt-8 pb-6 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold text-gray-900">Global Immutable Audit Trail</CardTitle>
              <CardDescription className="text-gray-500 font-medium mt-1">Chronological log of all system and AI agent actions mapping to governance rules.</CardDescription>
            </div>
            <Button variant="outline" size="sm" className="shadow-sm border-gray-200 font-semibold bg-white rounded-full px-4">
               Export as CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
             <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-400 font-bold uppercase tracking-wider bg-white">
                   <tr>
                      <th className="px-8 py-5 border-b border-gray-100">Timestamp</th>
                      <th className="px-8 py-5 border-b border-gray-100">Agent Actor</th>
                      <th className="px-8 py-5 border-b border-gray-100">Action Type</th>
                      <th className="px-8 py-5 border-b border-gray-100">Risk Assessment</th>
                      <th className="px-8 py-5 border-b border-gray-100 text-right">Execution Status</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                   {logs.map((log: any) => (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors group">
                         <td className="px-8 py-4 whitespace-nowrap font-mono text-gray-500 text-[13px] font-medium">
                            {format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss.SSS')}
                         </td>
                         <td className="px-8 py-4 font-semibold text-gray-900">
                            <div className="flex items-center">
                               <div className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center mr-3 border border-gray-200">
                                 <Shield className="w-3.5 h-3.5 text-gray-500" />
                               </div>
                               {log.agentName}
                            </div>
                         </td>
                         <td className="px-8 py-4 text-gray-700 font-medium">{log.action}</td>
                         <td className="px-8 py-4">
                            <div className="flex items-center">
                               <div className="w-24 h-2 rounded-full bg-gray-100 mr-3 overflow-hidden border border-gray-200">
                                  <div 
                                     className={`h-full rounded-full shadow-sm ${log.riskScore > policies.requireHumanReviewThreshold ? 'bg-amber-500' : log.riskScore > 50 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                                     style={{ width: `${log.riskScore}%` }}
                                  />
                               </div>
                               <span className="text-xs font-bold text-gray-500 w-6">{log.riskScore}</span>
                            </div>
                         </td>
                         <td className="px-8 py-4 text-right">
                            {log.status === 'allowed' ? (
                               <Badge variant="outline" className="border-emerald-200 text-emerald-700 bg-emerald-50 px-2.5 py-1">Allowed</Badge>
                            ) : log.status === 'blocked' ? (
                               <Badge variant="outline" className="border-rose-200 text-rose-700 bg-rose-50 px-2.5 py-1">Blocked</Badge>
                            ) : (
                               <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50 px-2.5 py-1">Flagged</Badge>
                            )}
                         </td>
                      </tr>
                   ))}
                   {logs.length === 0 && (
                      <tr>
                         <td colSpan={5} className="px-8 py-16 text-center text-gray-400 font-medium">
                            <div className="flex flex-col items-center justify-center h-full">
                              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
                                <History className="w-6 h-6 text-gray-300" />
                              </div>
                              No logs found in this timeframe. Action the AI Workspace to generate logs.
                            </div>
                         </td>
                      </tr>
                   )}
                </tbody>
             </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
