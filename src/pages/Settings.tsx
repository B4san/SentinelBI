import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Shield, AlertTriangle, EyeOff, Save, FileText, Key, Moon, Sun, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useParams } from 'react-router-dom';
import { useStore } from '../store';
import { PROVIDER_LIST, PROVIDERS } from '../lib/ai/providers';
import { fetchModels, generateContent } from '../lib/ai/client';
import type { ModelInfo, ProviderId } from '../lib/ai/types';

export function Settings() {
  const { spaceId } = useParams();
  const spaces = useStore((state) => state.spaces);
  const updateSpace = useStore((state) => state.updateSpace);
  const appearance = useStore((state) => state.appearance);
  const setAppearance = useStore((state) => state.setAppearance);
  const aiSettings = useStore((state) => state.aiSettings);
  const setAiSettings = useStore((state) => state.setAiSettings);
  const activeSpace = spaces.find((s) => s.id === spaceId) || spaces[0];

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelSource, setModelSource] = useState('curated');
  const [loadingModels, setLoadingModels] = useState(false);
  const [testState, setTestState] = useState<'idle' | 'running' | 'ok' | 'err'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  const def = PROVIDERS[aiSettings.provider];

  const policies = activeSpace?.policies || {
    securityLevel: 'Standard' as const,
    piiRedaction: true,
    requireHumanReviewThreshold: 75,
    maxExportRows: 10000,
    allowExecutiveExport: true,
    allowDatasetJoins: true,
    forbiddenActions: '',
    writerGuidelines: '',
  };

  const updatePolicy = (key: string, value: unknown) => {
    if (!activeSpace) return;
    updateSpace(activeSpace.id, { policies: { ...policies, [key]: value } as typeof policies });
  };

  const applyProvider = (id: ProviderId) => {
    const next = PROVIDERS[id];
    setAiSettings({
      provider: id,
      baseUrl: next.defaultBaseUrl,
      model: next.defaultModel,
    });
    setModels(next.curatedModels);
    setModelSource('curated');
  };

  const loadModels = async () => {
    setLoadingModels(true);
    try {
      const result = await fetchModels(aiSettings);
      setModels(result.models);
      setModelSource(result.source);
    } catch (error) {
      setModels(def.curatedModels);
      setModelSource('curated');
      setTestMessage(error instanceof Error ? error.message : 'Could not list models');
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    setModels(def.curatedModels);
  }, [aiSettings.provider]);

  const testConnection = async () => {
    setTestState('running');
    setTestMessage('');
    try {
      const result = await generateContent({ contents: 'Reply with the single word pong.' });
      setTestState('ok');
      setTestMessage(`Connected via ${result.provider || aiSettings.provider} (${result.model || aiSettings.model}).`);
    } catch (error) {
      setTestState('err');
      setTestMessage(error instanceof Error ? error.message : 'Connection failed');
    }
  };

  if (!activeSpace) {
    return <div className="p-8 text-center text-[var(--muted-foreground)]">No active workspace selected.</div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl pb-12">
      <div>
        <h2 className="page-title">Settings</h2>
        <p className="page-subtitle mt-1">Providers, appearance, and the policy engine for this space.</p>
      </div>

      <Card className="overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-500" />
        <CardHeader>
          <CardTitle className="text-xl font-bold flex items-center">
            <Key className="w-5 h-5 text-blue-500 mr-2" /> AI provider
          </CardTitle>
          <CardDescription>
            OpenRouter and any OpenAI-compatible API, plus the original Gemini integration. Keys stay in this browser and are never committed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PROVIDER_LIST.map((provider) => (
              <button
                key={provider.id}
                onClick={() => applyProvider(provider.id)}
                className={`text-left p-3 rounded-2xl border transition-colors ${
                  aiSettings.provider === provider.id
                    ? 'border-[var(--primary)] bg-[var(--accent)]'
                    : 'border-[var(--border)] hover:bg-[var(--secondary)]'
                }`}
              >
                <div className="font-semibold">{provider.label}</div>
                <div className="text-xs text-[var(--muted-foreground)] mt-1">{provider.description}</div>
              </button>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-semibold">Base URL</span>
              <Input
                className="mt-1 font-mono text-xs"
                value={aiSettings.baseUrl}
                onChange={(e) => setAiSettings({ baseUrl: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">API key</span>
              <Input
                className="mt-1 font-mono"
                type="password"
                placeholder={def.requiresApiKey ? 'Required' : 'Optional for local servers'}
                value={aiSettings.apiKey}
                onChange={(e) => setAiSettings({ apiKey: e.target.value })}
              />
              <p className="text-xs text-[var(--muted-foreground)] mt-1">
                Server env fallback: {def.envKey} or AI_API_KEY. Never stored in git.
              </p>
            </label>
          </div>

          <div className="flex flex-col md:flex-row gap-3 md:items-end">
            <label className="block flex-1">
              <span className="text-sm font-semibold">Model</span>
              <Input
                className="mt-1 font-mono text-xs"
                value={aiSettings.model}
                onChange={(e) => setAiSettings({ model: e.target.value })}
                list="ai-models"
              />
              <datalist id="ai-models">
                {models.map((m) => (
                  <option key={m.id} value={m.id} />
                ))}
              </datalist>
            </label>
            <Button variant="outline" onClick={loadModels} disabled={loadingModels}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loadingModels ? 'animate-spin' : ''}`} />
              Fetch models
            </Button>
            <label className="flex items-center gap-2 text-sm pb-2">
              <input
                type="checkbox"
                checked={aiSettings.stream}
                onChange={(e) => setAiSettings({ stream: e.target.checked })}
              />
              Stream responses
            </label>
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            Model list source: {modelSource}. {models.length} option{models.length === 1 ? '' : 's'} available.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={testConnection} disabled={testState === 'running'}>
              {testState === 'running' ? 'Testing…' : 'Test connection'}
            </Button>
            {testState === 'ok' && <span className="text-sm text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> {testMessage}</span>}
            {testState === 'err' && <span className="text-sm text-rose-500">{testMessage}</span>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold flex items-center">
            {appearance.mode === 'dark' ? <Moon className="w-5 h-5 mr-2" /> : <Sun className="w-5 h-5 mr-2" />}
            Appearance
          </CardTitle>
          <CardDescription>App chrome theme. Generated dashboards can still pick their own palette.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          {(['light', 'dark'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setAppearance({ mode })}
              className={`px-4 py-3 rounded-2xl border capitalize ${appearance.mode === mode ? 'border-[var(--primary)] bg-[var(--accent)]' : 'border-[var(--border)]'}`}
            >
              {mode}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-red-500 via-orange-500 to-amber-500" />
        <CardHeader>
          <CardTitle className="text-xl font-bold flex items-center">
            <Shield className="w-5 h-5 text-red-500 mr-2" /> Security proxy policies
          </CardTitle>
          <CardDescription>Rules enforced before query execution. Changes apply immediately.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <label className="text-[13px] uppercase tracking-wider font-bold text-[var(--muted-foreground)] block mb-3">Enforcement level</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {['Standard', 'Strict', 'Zero-Trust'].map((level) => (
                <button
                  key={level}
                  onClick={() => updatePolicy('securityLevel', level)}
                  className={`p-4 rounded-xl text-left border ${policies.securityLevel === level ? 'border-red-500 bg-red-50 dark:bg-red-500/10 text-red-900 dark:text-red-200' : 'border-[var(--border)]'}`}
                >
                  <div className="font-bold mb-1">{level}</div>
                  <div className="text-xs opacity-80 mt-1">
                    {level === 'Standard' && 'Blocks obvious prompt injection and exfiltration.'}
                    {level === 'Strict' && 'Requires query sanitization and limits aggregation scopes.'}
                    {level === 'Zero-Trust' && 'Blocks unverified structural queries. Human loop mandatory.'}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between p-4 rounded-xl border border-[var(--border)] bg-[var(--secondary)]">
            <div>
              <h4 className="font-bold flex items-center"><EyeOff className="w-4 h-4 mr-2" /> PII redaction</h4>
              <p className="text-sm text-[var(--muted-foreground)] mt-1">Mask emails, SSNs, and names before semantic extraction.</p>
            </div>
            <input type="checkbox" checked={policies.piiRedaction} onChange={(e) => updatePolicy('piiRedaction', e.target.checked)} />
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-amber-500 to-yellow-400" />
        <CardHeader>
          <CardTitle className="text-xl font-bold flex items-center">
            <AlertTriangle className="w-5 h-5 text-amber-500 mr-2" /> Escalation threshold
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-bold">Action risk score (0-100)</label>
            <span className="text-xl font-extrabold text-amber-600">{policies.requireHumanReviewThreshold}</span>
          </div>
          <input
            type="range"
            min="10"
            max="100"
            step="5"
            value={policies.requireHumanReviewThreshold}
            onChange={(e) => updatePolicy('requireHumanReviewThreshold', parseInt(e.target.value))}
            className="w-full accent-amber-500"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold flex items-center">
            <FileText className="w-5 h-5 text-blue-500 mr-2" /> Export & agent policies
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-bold">Maximum rows per export</label>
            <Input type="number" value={policies.maxExportRows} onChange={(e) => updatePolicy('maxExportRows', parseInt(e.target.value) || 0)} className="max-w-xs font-mono font-bold" />
          </div>
          <label className="flex items-center justify-between p-4 rounded-xl border border-[var(--border)]">
            <span className="font-bold">Allow executive report generation</span>
            <input type="checkbox" checked={policies.allowExecutiveExport} onChange={(e) => updatePolicy('allowExecutiveExport', e.target.checked)} />
          </label>
          <label className="flex items-center justify-between p-4 rounded-xl border border-[var(--border)]">
            <span className="font-bold">Allow cross-dataset joins</span>
            <input type="checkbox" checked={policies.allowDatasetJoins} onChange={(e) => updatePolicy('allowDatasetJoins', e.target.checked)} />
          </label>
          <div>
            <label className="text-sm font-bold">Forbidden actions</label>
            <textarea className="w-full mt-2 p-3 border border-[var(--border)] rounded-lg text-sm bg-[var(--card)]" rows={3} value={policies.forbiddenActions || ''} onChange={(e) => updatePolicy('forbiddenActions', e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-bold">Executive writer guidelines</label>
            <textarea className="w-full mt-2 p-3 border border-[var(--border)] rounded-lg text-sm bg-[var(--card)]" rows={3} value={policies.writerGuidelines || ''} onChange={(e) => updatePolicy('writerGuidelines', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3 flex-wrap">
        <Button
          variant="outline"
          className="text-red-600 border-red-200 hover:bg-red-50"
          onClick={() => {
            if (window.confirm('Delete all local spaces, settings, and keys from this browser? The server stores none of this.')) {
              useStore.getState().clearAllData();
              window.location.href = '/';
            }
          }}
        >
          <AlertTriangle className="w-4 h-4 mr-2" /> Clear all local data
        </Button>
        <Button
          onClick={() => {
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 1500);
          }}
        >
          <Save className="w-4 h-4 mr-2" /> {savedFlash ? 'Saved' : 'Save active policies'}
        </Button>
      </div>
    </div>
  );
}
