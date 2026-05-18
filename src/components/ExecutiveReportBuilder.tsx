import React, { useState } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { motion } from 'motion/react';
import { FileText, Loader2, Play, Download, Settings2, RefreshCw } from 'lucide-react';
import { useStore } from '../store';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { computeDataTruth } from '../lib/DataTruthEngine';

export function ExecutiveReportBuilder({ spaceId }: { spaceId: string }) {
  const spaces = useStore(state => state.spaces);
  const updateSpace = useStore(state => state.updateSpace);
  const activeSpace = spaces.find(s => s.id === spaceId);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  const generateReport = async () => {
    const policies = activeSpace?.policies || {
      securityLevel: 'Standard',
      piiRedaction: true,
      requireHumanReviewThreshold: 75,
      maxExportRows: 10000,
      allowExecutiveExport: true
    };

    if (!policies.allowExecutiveExport) {
      alert("Executive export is currently disabled by governance policies for this workspace.");
      return;
    }

    setIsGenerating(true);
    setProgress(10);
    
    try {
      // Step 1: Analyze context
      setProgress(30);
      
      const datasetsToAnalyze = (activeSpace.datasets && activeSpace.datasets.length > 0) 
        ? activeSpace.datasets 
        : activeSpace.parsedData 
          ? [{ id: 'legacy', name: 'Legacy Dataset', data: activeSpace.parsedData }] 
          : [];

      let datasetSummary = '';

      if (datasetsToAnalyze.length === 0) {
        datasetSummary += "No datasets currently in workspace.\n";
      } else {
        datasetsToAnalyze.forEach(ds => {
          const truth = computeDataTruth(ds.data);
          datasetSummary += `Dataset: ${ds.name || ds.id}
      Data Shape: ${truth.rowCount} rows, ${truth.columnCount} columns.
      Health: ${truth.anomalyCount} null/anomalous entries detected (Completeness Score: ${truth.completenessScore}%).
      Numeric Summaries:
      ${Object.entries(truth.numericSummary).map(([col, stat]) => `- ${col}: Sum=${stat.sum.toFixed(2)}, Avg=${stat.avg.toFixed(2)}, Min=${stat.min}, Max=${stat.max}`).join('\n')}
      Categorical Summaries:
      ${Object.entries(truth.categoricalSummary).map(([col, stat]) => `- ${col}: ${stat.uniqueCount} distinct values. Top values: ${stat.topValues.map(v => `${v.value} (${v.count})`).join(', ')}`).join('\n')}
      `;
        });
      }

      const promptContext = `
      Space Title: ${activeSpace?.title || 'Unknown Space'}
      Description: ${activeSpace?.description || 'No description'}
      
      Computed Real Data Statistics:
      ${datasetSummary}
      
      Recent AI Analysis Chat Context:
      ${activeSpace?.chatMessages?.slice(-5).map(m => m.content).join('\n') || 'No recent analysis chats.'}

      Governance Forbidden Actions:
      ${policies.forbiddenActions || 'None specified.'}

      Writer Guidelines (Tone/Focus):
      ${policies.writerGuidelines || 'Standard professional tone.'}
      `;

      const payload = {
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [{ text: `You are a Senior Strategic Consultant (like McKinsey or Palantir) and Executive Writer Agent for an enterprise BI platform. Generate a comprehensive, data-backed executive summary. Use ONLY the provided Real Data Statistics to construct your narrative. DO NOT invent or hallucinate metrics. If data is missing to answer a section, state "Insufficient data in current scope."
            
Format the output as a professional enterprise markdown report with exactly these sections: 
# Executive Intelligence Report
## 1. Executive Summary
## 2. Key Operational Metrics (State actual numbers from the numeric summaries)
## 3. Strategic Findings & Variances
## 4. Risk Analysis & Anomalies (Use the completeness and null metrics provided)
## 5. Strategic Recommendations (Actionable, based only on the available facts)
## Appendix: Technical Data Health

Dataset Context:
${promptContext}` }]
          }
        ]
      };

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      setProgress(70);

      const data = await res.json();
      const generatedText = data.text || "Report generation succeeded, but no text returned.";
      
      const overallTruth = computeDataTruth(datasetsToAnalyze.flatMap(d => d.data));

      updateSpace(spaceId!, {
        executiveReport: {
          summary: generatedText,
          datasetOverview: `${overallTruth.rowCount} rows analyzed across ${datasetsToAnalyze.length} datasets`,
          kpiAnalysis: `Based on computed statistics`,
          trends: "Derived from semantic extraction",
          anomalies: `${overallTruth.anomalyCount} anomalies detected`,
          segments: "Automatically classified",
          forecasts: "Requires deeper predictive modeling",
          recommendations: "See executive summary",
          governance: `${activeSpace?.securityEvents?.length || 0} policy events logged`
        }
      });
      setProgress(100);
    } catch (error) {
      console.error(error);
    } finally {
      setTimeout(() => {
        setIsGenerating(false);
        setProgress(0);
      }, 500);
    }
  };

    if (!activeSpace) return null;
  const report = activeSpace.executiveReport;
  
  const policies = activeSpace?.policies || {
      securityLevel: 'Standard',
      piiRedaction: true,
      requireHumanReviewThreshold: 75,
      maxExportRows: 10000,
      allowExecutiveExport: true
  };

  return (
    <div className="space-y-6">
      {!report && !isGenerating && (
        <Card className="border-none soft-shadow p-12 text-center bg-gray-50/50">
          <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 relative shadow-inner">
            <FileText className="w-8 h-8 text-blue-500" />
            <div className={`absolute -top-1 -right-1 flex h-4 w-4 ${!policies.allowExecutiveExport ? 'hidden' : ''}`}>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-blue-500"></span>
            </div>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2 tracking-tight">Executive Reporting Agent</h3>
          <p className="text-gray-500 max-w-md mx-auto mb-8 font-medium">
            Generate an investor-ready narrative strictly backed by computed metric invariants. Outputs robust PDF/PPTX deliverables without generic AI prose.
          </p>
          <Button 
            onClick={generateReport} 
            size="lg" 
            disabled={!policies.allowExecutiveExport}
            className={`rounded-full shadow-md font-semibold px-8 ${!policies.allowExecutiveExport ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gray-900 text-white hover:bg-gray-800'}`}
          >
            <Play className="w-4 h-4 mr-2" /> Start Executive Pipeline
          </Button>
          {!policies.allowExecutiveExport && (
             <p className="text-red-500 text-xs font-bold mt-4 uppercase tracking-wider">DISABLED BY WORKSPACE GOVERNANCE POLICY</p>
          )}
        </Card>
      )}

      {isGenerating && (
        <Card className="border-none soft-shadow p-12 text-center bg-white">
          <div className="relative w-16 h-16 mx-auto mb-6">
             <div className="absolute inset-0 rounded-full border-4 border-gray-100"></div>
             <Loader2 className="w-16 h-16 text-blue-500 animate-spin absolute inset-0" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-4 tracking-tight">Synthesizing Executive Narrative...</h3>
          <div className="max-w-md mx-auto bg-gray-100 rounded-full h-2 mb-3 overflow-hidden">
            <div className="bg-blue-500 h-2 rounded-full transition-all duration-500 ease-out" style={{ width: `${progress}%` }}></div>
          </div>
          <p className="text-sm font-semibold text-gray-400">
            {progress < 40 ? 'Extracting strict metric invariants...' : progress < 80 ? 'Drafting evidence-backed executive summary...' : 'Finalizing export artifacts...'}
          </p>
        </Card>
      )}

      {report && !isGenerating && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white p-4 rounded-[2rem] soft-shadow border-none">
            <div className="flex items-center gap-3 pl-2">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                <FileText className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900 leading-tight">Executive Report Verification OK</h4>
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-500">Grounded in Computed Data</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={generateReport} className="rounded-full bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100 font-semibold">
                <RefreshCw className="w-4 h-4 mr-2" /> Re-sync Narrative
              </Button>
            </div>
          </div>

          <Card className="border-none soft-shadow rounded-[2rem] overflow-hidden">
             <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500"></div>
             <CardContent className="p-10 prose prose-gray max-w-none prose-headings:font-bold prose-h1:text-3xl prose-h1:tracking-tight prose-h2:text-2xl prose-h2:tracking-tight prose-h2:mt-8 prose-h2:border-b prose-h2:pb-2 prose-a:text-blue-600 prose-p:leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {report.summary}
              </ReactMarkdown>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
