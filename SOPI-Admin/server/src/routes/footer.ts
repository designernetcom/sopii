/*
 * Footer — the admin side of the storefront footer.
 * ===========================================================================
 * Thin on purpose: each handler is one pure change from `lib/footer.ts`,
 * applied through `lib/footerStore.ts`, which owns the read-modify-write and
 * its concurrency guard. Every write answers with the whole footer, so the
 * panel never shows a list that disagrees with what was saved.
 *
 * Mounted at `/api/footer` behind the admin auth gate, with the `cms` and
 * `catalog` caches dropped after every successful write — the footer travels in
 * the storefront's `/bootstrap` payload, so a save shows on the shop at once.
 * Permissions reuse `homepage`, the resource that already governs site-wide
 * storefront content such as the announcement strip.
 */

import { Router } from 'express';
import { requirePermission } from '../lib/auth.js';
import {
  addFooterSection,
  removeFooterSection,
  reorderFooterSections,
  updateFooterSection,
} from '../lib/footer.js';
import { mutateFooter, readFooter, resetFooter } from '../lib/footerStore.js';
import { ah } from '../lib/http.js';

export const footerRoutes = Router();

footerRoutes.get(
  '/',
  requirePermission('homepage'),
  ah(async (_req, res) => {
    res.json(await readFooter());
  }),
);

footerRoutes.post(
  '/sections',
  requirePermission('homepage', 'create'),
  ah(async (req, res) => {
    res.status(201).json(await mutateFooter((sections) => addFooterSection(sections, req.body)));
  }),
);

/* Declared before `/sections/:id` so "reorder" is not read as a section id. */
footerRoutes.put(
  '/sections/reorder',
  requirePermission('homepage', 'edit'),
  ah(async (req, res) => {
    const { ids } = (req.body ?? {}) as { ids?: unknown };
    res.json(await mutateFooter((sections) => reorderFooterSections(sections, ids)));
  }),
);

footerRoutes.put(
  '/sections/:id',
  requirePermission('homepage', 'edit'),
  ah(async (req, res) => {
    res.json(
      await mutateFooter((sections) => updateFooterSection(sections, req.params.id, req.body)),
    );
  }),
);

footerRoutes.delete(
  '/sections/:id',
  requirePermission('homepage', 'delete'),
  ah(async (req, res) => {
    res.json(await mutateFooter((sections) => removeFooterSection(sections, req.params.id)));
  }),
);

footerRoutes.post(
  '/reset',
  requirePermission('homepage', 'edit'),
  ah(async (_req, res) => {
    res.json(await resetFooter());
  }),
);
