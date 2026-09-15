/*
 * Footer persistence — reading and conditionally writing the one document.
 * ===========================================================================
 * Every write follows the same shape: read the footer, apply one pure change
 * from `lib/footer.ts`, write it back only if nobody else wrote in between.
 * A lost race re-reads and re-applies rather than failing, because each change
 * is expressed against the current list ("toggle section X", "move these ids"),
 * so replaying it on a newer copy is still exactly what the admin asked for.
 */

import type { FooterConfig, FooterSection } from '@/types';
import { FOOTER_ID, FooterModel } from '../db/models.js';
import { DEFAULT_FOOTER_SECTIONS } from './footer.js';
import { HttpError, nowIso } from './http.js';

interface StoredFooter {
  sections: FooterSection[];
  /** `null` when no document exists yet — the defaults are being served. */
  revision: number | null;
  updatedAt: string | null;
}

/** How many times a write re-reads after losing a race before giving up. */
const MAX_ATTEMPTS = 6;

async function readStoredFooter(): Promise<StoredFooter> {
  const doc = await FooterModel.findById(FOOTER_ID).lean();
  if (!doc) {
    return { sections: structuredClone(DEFAULT_FOOTER_SECTIONS), revision: null, updatedAt: null };
  }
  return {
    sections: doc.sections ?? [],
    revision: doc.revision ?? 0,
    updatedAt: doc.updatedAt ?? null,
  };
}

const toConfig = ({ sections, updatedAt }: StoredFooter): FooterConfig => ({ sections, updatedAt });

export async function readFooter(): Promise<FooterConfig> {
  return toConfig(await readStoredFooter());
}

/**
 * Applies `change` to the current footer and saves it.
 *
 * The first save materialises the defaults into a document (a concurrent first
 * save loses on the duplicate `_id` and retries against the winner's copy);
 * every later save is conditional on the revision it read.
 */
export async function mutateFooter(
  change: (sections: FooterSection[]) => FooterSection[],
): Promise<FooterConfig> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const current = await readStoredFooter();
    // Validation errors throw from here, before anything is written.
    const sections = change(current.sections);
    const updatedAt = nowIso();

    if (current.revision === null) {
      try {
        await FooterModel.create({ _id: FOOTER_ID, sections, revision: 1, updatedAt });
        return toConfig({ sections, revision: 1, updatedAt });
      } catch (error) {
        if ((error as { code?: number })?.code === 11000) continue;
        throw error;
      }
    }

    const saved = await FooterModel.findOneAndUpdate(
      {
        _id: FOOTER_ID,
        // A document written without the field reads as revision 0.
        revision: current.revision === 0 ? { $in: [0, null] } : current.revision,
      },
      { $set: { sections, updatedAt }, $inc: { revision: 1 } },
      { new: true, runValidators: true },
    ).lean();

    if (saved) {
      return toConfig({
        sections: saved.sections ?? [],
        revision: saved.revision,
        updatedAt: saved.updatedAt ?? updatedAt,
      });
    }
  }

  throw new HttpError(409, 'The footer is being edited elsewhere — refresh and try again');
}

/**
 * Back to the built-in footer. Deleting the document is the whole operation:
 * its absence is what makes the API serve the defaults.
 */
export async function resetFooter(): Promise<FooterConfig> {
  await FooterModel.deleteOne({ _id: FOOTER_ID });
  return readFooter();
}
