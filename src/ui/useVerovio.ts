import { useEffect, useState } from 'react';
import type { VerovioToolkit } from 'verovio/esm';

let loading: Promise<VerovioToolkit> | null = null;

/** Downloads and starts the engraver once; it is several megabytes, so it loads on demand. */
function loadToolkit(): Promise<VerovioToolkit> {
  loading ??= Promise.all([import('verovio/wasm'), import('verovio/esm')]).then(
    async ([{ default: createVerovioModule }, { VerovioToolkit: Toolkit }]) =>
      new Toolkit(await createVerovioModule()),
  );
  return loading;
}

interface VerovioState {
  toolkit: VerovioToolkit | null;
  failed: boolean;
}

/** The staff-notation engraver, or null while it is still loading. */
export function useVerovio(): VerovioState {
  const [state, setState] = useState<VerovioState>({ toolkit: null, failed: false });
  useEffect(() => {
    let cancelled = false;
    loadToolkit().then(
      (toolkit) => {
        if (!cancelled) setState({ toolkit, failed: false });
      },
      (error: unknown) => {
        console.error(error);
        loading = null;
        if (!cancelled) setState({ toolkit: null, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
