import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface BreadcrumbContextValue {
  label?: string;
  setLabel: (label?: string) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  setLabel: () => {},
});

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [label, setLabel] = useState<string | undefined>();
  const value = useMemo(() => ({ label, setLabel }), [label]);
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

export function useBreadcrumb() {
  return useContext(BreadcrumbContext);
}

/**
 * Detail pages call this to replace the raw id segment in the breadcrumb with
 * the record's name once it has loaded.
 */
export function useBreadcrumbLabel(label?: string) {
  const { setLabel } = useBreadcrumb();

  useEffect(() => {
    setLabel(label);
    return () => setLabel(undefined);
  }, [label, setLabel]);
}
