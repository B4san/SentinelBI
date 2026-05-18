import React from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { ShieldAlert, ShieldCheck, Info } from 'lucide-react';

export function Security() {
  const { spaceId } = useParams();
  const spaces = useStore(state => state.spaces);
  const activeSpace = spaces.find(s => s.id === spaceId);

  const securityAlerts = activeSpace?.securityEvents || [];
  const totalEvents = securityAlerts.length;
  
  const avgRisk = totalEvents > 0 
      ? (securityAlerts.reduce((acc, curr) => acc + (curr.riskScore || 0), 0) / totalEvents).toFixed(1) 
      : '0.0';
      
  const blockedThreats = securityAlerts.filter(a => a.status === 'blocked').length;
  const threatNeutralization = totalEvents > 0 ? ((blockedThreats / totalEvents) * 100).toFixed(0) + '%' : '100%';

  const uniqueAgents = new Set(activeSpace?.executionTimeline?.map(t => t.agent)).size || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Security & Risks Center</h2>
          <p className="text-[var(--muted-foreground)]">Lobster Trap architecture monitoring and SIEM analytics.</p>
        </div>
        <div className="mt-4 sm:mt-0 flex gap-2">
           <Badge variant="destructive" className={totalEvents > 0 ? "animate-pulse" : ""}>{totalEvents} Logged Events</Badge>
           <Badge variant="outline">Protection: Enforced</Badge>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Threat Neutralization</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono text-emerald-500">{threatNeutralization}</div>
            <p className="text-xs text-[var(--muted-foreground)] mt-2">Harmful payloads blocked vs allowed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Average Risk Index</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold font-mono ${totalEvents > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
               {avgRisk}
            </div>
             <p className="text-xs text-[var(--muted-foreground)] mt-2">
                {totalEvents > 0 ? 'Elevated due to recent incidents' : 'Normal operating bounds'}
             </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Active Agents Monitored</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{uniqueAgents}</div>
             <p className="text-xs text-[var(--muted-foreground)] mt-2">Unique agents passing thru Lobster Trap</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Security Incidents</CardTitle>
          <CardDescription>Live threat feed of prompt injection and exfiltration attempts.</CardDescription>
        </CardHeader>
        <CardContent>
          {securityAlerts.length === 0 ? (
            <div className="text-center p-8 text-[var(--muted-foreground)]">
              <ShieldCheck className="w-12 h-12 mx-auto text-emerald-500 mb-4 opacity-50" />
              <p>No active threats detected in this workspace.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {securityAlerts.map((alert: any) => (
                <div key={alert.id} className="p-4 rounded-lg bg-[var(--accent)] border border-red-500/20 relative overflow-hidden">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center space-x-2">
                        <ShieldAlert className="w-4 h-4 text-red-500" />
                        <span className="font-semibold text-red-500">Exfiltration Blocked</span>
                        <span className="text-xs text-[var(--muted-foreground)] ml-2">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-sm mt-2">{alert.details}</p>
                      {alert.promptExposed && (
                        <div className="mt-3 p-2 bg-[#0f1115] rounded text-xs font-mono text-gray-400 break-all border border-[var(--border)]">
                          <strong className="text-gray-300">Attempted Payload:</strong><br />
                          {alert.promptExposed}
                        </div>
                      )}
                    </div>
                    <Badge variant="destructive">Risk: {alert.riskScore}/100</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      <Card>
          <CardHeader>
            <CardTitle>Lobster Trap Architecture</CardTitle>
            <CardDescription>All LLM boundaries are guarded by deterministic and AI-based classifiers.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-4 border border-[var(--border)] rounded-md bg-[var(--accent)] text-sm flex gap-4">
                <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div>
                   <p className="font-medium text-white mb-1">Intent Analysis Matrix Active</p>
                   <p className="text-[var(--muted-foreground)]">Every prompt sent to the Orchestrator is pre-screened by Gemini Flash using few-shot classification against 14 known exploit archetypes. Execution is halted instantly if Intent == MALICIOUS.</p>
                </div>
            </div>
          </CardContent>
      </Card>
    </div>
  );
}
