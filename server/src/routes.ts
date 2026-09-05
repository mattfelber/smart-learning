import { Router } from 'express';
import type { Request, Response } from 'express';
import { Tutor } from './tutor/orchestrator.js';
import { Store } from './persistence/store.js';
import { ProviderError } from './providers/errors.js';
import { PRICES_AS_OF } from './pricing.js';
import { config } from './config.js';

function asyncHandler(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response) => {
    fn(req, res).catch((err) => {
      // Provider failures are expected (quota, overload) and carry a message
      // written for the learner. Everything else is a real bug.
      if (err instanceof ProviderError) {
        console.error(`[api] ${err.kind}: ${err.message}`);
        res.status(err.status).json({
          error: err.message,
          kind: err.kind,
          retryAfterSeconds: err.retryAfterSeconds
        });
        return;
      }
      console.error(err);
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
        kind: 'UNKNOWN'
      });
    });
  };
}

export function createRoutes(tutor: Tutor, store: Store, configured: boolean, configError?: string) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, configured });
  });

  router.post(
    '/new-topic',
    asyncHandler(async (req, res) => {
      if (!configured) {
        res.json({
          message: configError ?? 'Gemini is not configured.',
          needsConfig: true
        });
        return;
      }
      const { goal } = req.body;
      if (!goal || typeof goal !== 'string') {
        res.status(400).json({ error: 'goal is required' });
        return;
      }
      const result = await tutor.startTopic(goal);
      res.json(result);
    })
  );

  router.post(
    '/chat',
    asyncHandler(async (req, res) => {
      if (!configured) {
        res.json({
          message: configError ?? 'Gemini is not configured.',
          needsConfig: true
        });
        return;
      }
      const { sessionId, message } = req.body;
      if (!sessionId || typeof message !== 'string') {
        res.status(400).json({ error: 'sessionId and message are required' });
        return;
      }
      const result = await tutor.continueSession(sessionId, message);
      res.json(result);
    })
  );

  router.get(
    '/resume',
    asyncHandler(async (_req, res) => {
      // listSessions is already ordered by most recent activity, which is a
      // better notion of "where I was" than the original start time.
      const unfinished = store.listSessions().filter((s) => s.mode !== 'DONE');

      if (!unfinished.length) {
        res.json({ available: false });
        return;
      }

      const session = store.loadSession(unfinished[0].id);
      res.json({ available: true, session });
    })
  );

  router.post(
    '/resume',
    asyncHandler(async (_req, res) => {
      if (!configured) {
        res.json({
          message: configError ?? 'Gemini is not configured.',
          needsConfig: true
        });
        return;
      }
      const result = await tutor.resume();
      res.json(result ? { ...result, available: true } : { available: false });
    })
  );

  router.post(
    '/end',
    asyncHandler(async (req, res) => {
      const { sessionId } = req.body;
      if (!sessionId) {
        res.status(400).json({ error: 'sessionId is required' });
        return;
      }
      const note = await tutor.endSession(sessionId);
      res.json({ note });
    })
  );

  router.get(
    '/sessions',
    asyncHandler(async (_req, res) => {
      res.json(store.listSessions());
    })
  );

  router.get(
    '/topics',
    asyncHandler(async (_req, res) => {
      res.json(store.listTopics());
    })
  );

  /** Token ledger rollup. Free — reads local data only. */
  router.get(
    '/usage',
    asyncHandler(async (req, res) => {
      const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
      res.json(store.summarizeUsage(sessionId, config.USD_BRL, PRICES_AS_OF));
    })
  );

  /** Rehydrate a past transcript without spending an LLM call. */
  router.get(
    '/session/:id',
    asyncHandler(async (req, res) => {
      const session = tutor.getTranscript(req.params.id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      res.json(session);
    })
  );

  /** Reopen a specific past session and get a fresh orienting turn. */
  router.post(
    '/open',
    asyncHandler(async (req, res) => {
      if (!configured) {
        res.json({
          message: configError ?? 'Gemini is not configured.',
          needsConfig: true
        });
        return;
      }
      const { sessionId } = req.body;
      if (!sessionId || typeof sessionId !== 'string') {
        res.status(400).json({ error: 'sessionId is required' });
        return;
      }
      const result = await tutor.openSession(sessionId);
      if (!result) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      res.json(result);
    })
  );

  return router;
}
