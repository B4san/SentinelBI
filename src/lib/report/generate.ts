import {
  GenerationTimeoutError,
  modelSupportsStructuredOutputs,
  openaiGenerate,
  resolveGenerateDeadlineMs,
  resolveStepTimeoutMs,
  type ResponseFormatStep,
} from '../ai/openaiCompatible';
import { geminiGenerate as geminiCall } from '../ai/geminiAdapter';
import { PROVIDERS, isOpenRouterFreeRouter } from '../ai/providers';
import { resolveProviderConfig, type EnvLike } from '../ai/resolve';
import { AIProviderError } from '../ai/types';
import { numbersMatchFacts } from '../dashboard/facts';
import { extractJsonObject } from '../dashboard/validate';
import type { GenerateAttempt } from '../dashboard/generate';
import { buildReportFacts } from './facts';
import { REPORT_JSON_SCHEMA, reportPrompt } from './schema';
import { buildTemplateReport, factsToMarkdown } from './template';
import type { ExecutiveReportDoc, GenerateReportContext } from './types';

function statusOf(error: unknown): number | undefined {
  if (error instanceof AIProviderError) return error.status;
  if (error instanceof GenerationTimeoutError) return error.status;
  if (error && typeof error === 'object' && 'status' in error) {
    const n = Number((error as { status: unknown }).status);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function asDoc(parsed: unknown): {
  executiveSummary: string;
  keyFindings: string[];
  trends: string;
  risks: string;
  recommendations: string[];
  methodology: string;
} | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const rec = parsed as Record<string, unknown>;
  const executiveSummary = String(rec.executiveSummary || rec.summary || '').trim();
  const keyFindings = Array.isArray(rec.keyFindings) ? rec.keyFindings.map((x) => String(x).trim()).filter(Boolean) : [];
  const recommendations = Array.isArray(rec.recommendations) ? rec.recommendations.map((x) => String(x).trim()).filter(Boolean) : [];
  if (!executiveSummary || keyFindings.length < 2) return null;
  return {
    executiveSummary,
    keyFindings,
    trends: String(rec.trends || '').trim() || 'Insufficient data in current scope.',
    risks: String(rec.risks || '').trim() || 'Insufficient data in current scope.',
    recommendations: recommendations.length ? recommendations : ['Insufficient data in current scope.'],
    methodology: String(rec.methodology || '').trim(),
  };
}

export async function generateExecutiveReportOnServer(
  ctx: GenerateReportContext,
  env: EnvLike = typeof process !== 'undefined' ? process.env : {},
): Promise<ExecutiveReportDoc> {
  const facts = buildReportFacts(ctx.title || 'Workspace', ctx.datasets || []);
  const template = (reason: string, extra?: { error?: string; attempts?: GenerateAttempt[]; generatedBy?: string }): ExecutiveReportDoc => {
    const base = buildTemplateReport(facts, reason);
    const doc: ExecutiveReportDoc = {
      ...base,
      error: extra?.error,
      generatedBy: extra?.generatedBy || base.generatedBy,
      attempts: extra?.attempts,
      facts,
      markdown: '',
    };
    doc.markdown = factsToMarkdown(facts, doc);
    return doc;
  };

  if (!ctx.datasets?.length || facts.rowCount === 0) {
    return template('No dataset loaded. Upload a CSV before generating a report.');
  }

  const started = Date.now();
  const deadlineMs = ctx.deadlineMs ?? resolveGenerateDeadlineMs(env);
  const deadlineAt = started + deadlineMs;
  const attempts: GenerateAttempt[] = [];
  const config = resolveProviderConfig({
    provider: ctx.provider as never,
    baseUrl: ctx.baseUrl,
    model: ctx.model,
    apiKey: ctx.apiKey,
  }, env);
  const def = PROVIDERS[config.provider];
  const hasKey = Boolean(config.apiKey) || !def.requiresApiKey;
  attempts.push({
    step: 'resolve',
    status: 200,
    ms: 0,
    model: config.model,
    keySource: config.source.apiKey,
  });

  console.info(JSON.stringify({
    evt: 'report.generate',
    route: '/api/reports/generate',
    provider: config.provider,
    model: config.model,
    keySource: config.source.apiKey,
    hasKey,
    rowCount: facts.rowCount,
    compatible: config.compatible,
  }));

  if (!hasKey) {
    console.info(JSON.stringify({ evt: 'report.generate.result', source: 'fallback', reason: 'missing_key' }));
    return template(`Missing API key for ${def.label}. Showing a computed template instead.`, { attempts });
  }

  const prompt = reportPrompt(facts, {
    chat: ctx.chatContext,
    guidelines: ctx.policies?.writerGuidelines,
    forbidden: ctx.policies?.forbiddenActions,
  });
  const remaining = () => Math.max(1000, deadlineAt - Date.now());
  const fetchImpl = ctx.fetchImpl || fetch;

  const finishAi = (draft: NonNullable<ReturnType<typeof asDoc>>, model: string): ExecutiveReportDoc => {
    const body = { ...draft, methodology: draft.methodology || facts.methodology };
    const combined = [body.executiveSummary, ...body.keyFindings, body.trends, body.risks, ...body.recommendations].join('\n');
    if (!numbersMatchFacts(combined, facts.tokens)) {
      console.info(JSON.stringify({ evt: 'report.generate.verify', ok: false, model }));
      return template('AI draft contained numbers that are not in the computed fact list.', {
        attempts,
        generatedBy: model,
        error: 'unverified numbers',
      });
    }
    const doc: ExecutiveReportDoc = {
      title: `${facts.title} — executive report`,
      ...body,
      source: 'ai',
      generatedBy: model,
      generatedAt: new Date().toISOString(),
      facts,
      attempts,
      markdown: '',
    };
    doc.markdown = factsToMarkdown(facts, doc);
    return doc;
  };

  try {
    if (config.compatible === 'gemini') {
      const t0 = Date.now();
      const text = await geminiCall(config, [{ role: 'user', content: `${prompt}\nReturn JSON only.` }]);
      attempts.push({ step: 'plain', status: 200, ms: Date.now() - t0, model: config.model, keySource: config.source.apiKey });
      const parsed = asDoc(extractJsonObject(text));
      if (!parsed) return template('Gemini did not return a usable JSON report.', { attempts, generatedBy: config.model });
      return finishAi(parsed, config.model);
    }

    const skipSchema = isOpenRouterFreeRouter(config.model);
    let useSchema = !skipSchema;
    if (!skipSchema) {
      try {
        useSchema = await modelSupportsStructuredOutputs(config, fetchImpl);
        attempts.push({ step: 'models', status: 200, ms: 0, model: config.model, keySource: config.source.apiKey });
      } catch {
        useSchema = false;
      }
    }
    const ladder: ResponseFormatStep[] = useSchema
      ? ['json_schema', 'json_object', 'plain']
      : ['json_object', 'plain'];

    let lastError = '';
    for (const step of ladder) {
      if (Date.now() > deadlineAt) {
        return template(`timed out after ${Math.round((Date.now() - started) / 1000)}s at step ${step}`, { attempts });
      }
      const t0 = Date.now();
      try {
        const generated = await openaiGenerate(config, [{ role: 'user', content: prompt }], {
          json: step !== 'plain',
          temperature: 0.2,
          maxTokens: 4000,
          jsonSchema: step === 'json_schema' ? (REPORT_JSON_SCHEMA as unknown as Record<string, unknown>) : undefined,
          format: step,
          timeoutMs: resolveStepTimeoutMs(remaining(), env),
          fetchImpl,
          retries: step === 'json_schema' ? 0 : 1,
        });
        const parsed = asDoc(extractJsonObject(generated.text));
        attempts.push({
          step,
          status: 200,
          ms: Date.now() - t0,
          model: generated.model || config.model,
          keySource: config.source.apiKey,
          error: parsed ? undefined : 'unusable JSON',
        });
        if (!parsed) {
          lastError = 'unusable JSON';
          console.info(JSON.stringify({ evt: 'report.generate.parse', step, error: lastError, excerpt: generated.text.slice(0, 240) }));
          continue;
        }
        return finishAi(parsed, generated.model || config.model);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        console.info(JSON.stringify({
          evt: 'report.generate.provider',
          step,
          status: statusOf(error) || 500,
          error: lastError,
        }));
        attempts.push({
          step,
          status: statusOf(error) || 500,
          ms: Date.now() - t0,
          model: config.model,
          keySource: config.source.apiKey,
          error: lastError,
        });
        const status = statusOf(error);
        if (status === 401 || status === 402 || status === 403) {
          return template(lastError, { attempts, error: lastError, generatedBy: config.model });
        }
      }
    }
    console.info(JSON.stringify({ evt: 'report.generate.result', source: 'fallback', reason: lastError || 'ladder_exhausted', attempts: attempts.length }));
    return template(lastError || 'Provider ladder exhausted.', { attempts, error: lastError, generatedBy: config.model });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    attempts.push({ step: 'fatal', status: statusOf(error) || 500, ms: Date.now() - started, error: message, keySource: config.source.apiKey });
    return template(message, { attempts, error: message, generatedBy: config.model });
  }
}
