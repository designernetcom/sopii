import { useEffect } from 'react';

/**
 * Emits standalone JSON-LD.
 *
 * Most pages should pass their schema to `SEOHead`'s `jsonLd` prop instead —
 * that keeps one page's markup in one place. This component is for graphs that
 * belong to the *site* rather than to a page (Organization, WebSite) and are
 * mounted once in the layout, so they must survive route changes and therefore
 * must not carry the `data-seo` stamp that SEOHead clears on every navigation.
 */
export function StructuredData({ id, schema }) {
  useEffect(() => {
    if (!schema) return undefined;

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = id;
    script.setAttribute('data-seo-global', '');
    script.textContent = JSON.stringify(schema);

    // Replace rather than append, so a settings change cannot leave two graphs.
    document.getElementById(id)?.remove();
    document.head.appendChild(script);

    return () => script.remove();
  }, [id, schema]);

  return null;
}
