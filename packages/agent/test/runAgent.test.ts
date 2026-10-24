/**
 * A4 – Orchestration, fallback and handler tests (owner: Darsh).
 *
 * Happy path (mocked Bedrock) has a toolTrace. An SDK error, a timeout and a hallucinated
 * number each fall back to exactly the template output. The handler rejects bad input and
 * returns { alert: null } for calm.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';
import { AlertCardDataSchema } from '@gridrisk/shared';
import { SHELTERS, ZONE_A } from '@gridrisk/shared/fixtures';
import { analyze, buildScenario, DEFAULT_CONFIG } from '@gridrisk/engine';
import { buildTemplateAlert, runAgent } from '../src';
import { handler } from '../src/handler';
import { createStubModel } from '../scripts/stub-model';

const NOW = new Date('2026-10-23T14:15:00.000Z');
const bedrock = mockClient(BedrockRuntimeClient);

const escalation = () => buildScenario('escalation');
const result = analyze(escalation(), [ZONE_A], { config: DEFAULT_CONFIG, shelters: SHELTERS }).find(
  (r) => r.zoneId === ZONE_A.id,
)!;
const template = () => buildTemplateAlert(result, { zone: ZONE_A, shelters: SHELTERS, now: NOW });

const baseDeps = () => ({ modelId: 'test-model', now: () => NOW });

beforeEach(() => bedrock.reset());
afterEach(() => vi.useRealTimers());

describe('runAgent model path (stub client)', () => {
  it('escalation returns a grounded alert with a toolTrace', async () => {
    const alert = await runAgent(
      { zoneId: ZONE_A.id, events: escalation() },
      { ...baseDeps(), bedrockClient: createStubModel() },
    );
    expect(alert).not.toBeNull();
    expect(AlertCardDataSchema.parse(alert).toolTrace?.length).toBeGreaterThan(0);
    expect(alert?.isolationWindowMinutes).toBe(result.isolationWindowMinutes);
  });

  it('logs info with path=bedrock on the model path', async () => {
    const info = vi.fn();
    await runAgent(
      { zoneId: ZONE_A.id, events: escalation() },
      { ...baseDeps(), bedrockClient: createStubModel(), logger: { info, warn: vi.fn() } },
    );
    expect(info).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ path: 'bedrock' }),
    );
  });
});

describe('runAgent falls back to the template', () => {
  it('on an SDK error', async () => {
    bedrock.on(ConverseCommand).rejects(new Error('ThrottlingException'));
    const warn = vi.fn();
    const alert = await runAgent(
      { zoneId: ZONE_A.id, events: escalation() },
      {
        ...baseDeps(),
        bedrockClient: new BedrockRuntimeClient({}),
        logger: { info: vi.fn(), warn },
      },
    );
    expect(alert).toEqual(template());
    expect(alert?.toolTrace).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ path: 'template' }),
    );
  });

  it('on a hallucinated number (grounding fails)', async () => {
    const alert = await runAgent(
      { zoneId: ZONE_A.id, events: escalation() },
      { ...baseDeps(), bedrockClient: createStubModel({ hallucinate: true }) },
    );
    expect(alert).toEqual(template());
  });

  it('on a timeout', async () => {
    // A client that never resolves until aborted.
    const hanging = {
      send: (_cmd: ConverseCommand, opts?: { abortSignal?: AbortSignal }) =>
        new Promise<ConverseCommandOutput>((_resolve, reject) => {
          opts?.abortSignal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('Request aborted'), { name: 'AbortError' })),
          );
        }),
    };
    const warn = vi.fn();
    const alert = await runAgent(
      { zoneId: ZONE_A.id, events: escalation() },
      { ...baseDeps(), bedrockClient: hanging, timeoutMs: 5, logger: { info: vi.fn(), warn } },
    );
    expect(alert).toEqual(template());
    expect(warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ code: 'timeout' }),
    );
  });

  it('with no model id, uses the template without calling Bedrock', async () => {
    const prev = process.env.BEDROCK_MODEL_ID;
    delete process.env.BEDROCK_MODEL_ID;
    try {
      const alert = await runAgent({ zoneId: ZONE_A.id, events: escalation() }, { now: () => NOW });
      expect(alert).toEqual(template());
    } finally {
      if (prev !== undefined) process.env.BEDROCK_MODEL_ID = prev;
    }
  });
});

describe('runAgent returns null when there is nothing to raise', () => {
  it('calm', async () => {
    expect(
      await runAgent(
        { zoneId: ZONE_A.id, events: buildScenario('calm') },
        { ...baseDeps(), bedrockClient: createStubModel() },
      ),
    ).toBeNull();
  });

  it('unknown zone', async () => {
    expect(await runAgent({ zoneId: 'nope', events: escalation() }, baseDeps())).toBeNull();
  });
});

describe('handler (@gridrisk/agent/handler)', () => {
  it('rejects bad input', async () => {
    await expect(handler({ zoneId: '' })).rejects.toThrow();
    await expect(handler({ nope: true })).rejects.toThrow();
  });

  it('returns { alert: null } for calm', async () => {
    const prev = process.env.BEDROCK_MODEL_ID;
    delete process.env.BEDROCK_MODEL_ID;
    try {
      expect(await handler({ zoneId: ZONE_A.id, events: buildScenario('calm') })).toEqual({
        alert: null,
      });
    } finally {
      if (prev !== undefined) process.env.BEDROCK_MODEL_ID = prev;
    }
  });

  it('returns a template alert for escalation when offline', async () => {
    const prev = process.env.BEDROCK_MODEL_ID;
    delete process.env.BEDROCK_MODEL_ID;
    try {
      const { alert } = await handler({ zoneId: ZONE_A.id, events: escalation() });
      expect(AlertCardDataSchema.parse(alert).zoneId).toBe(ZONE_A.id);
      expect(alert?.toolTrace).toBeUndefined();
    } finally {
      if (prev !== undefined) process.env.BEDROCK_MODEL_ID = prev;
    }
  });
});
