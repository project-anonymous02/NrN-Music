import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | Error | null;
  reload: () => void;
}

/**
 * Tiny data loader with cancellation — enough for this app's needs and far
 * lighter than a client library.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    setLoading(true);
    setError(null);
    loaderRef
      .current()
      .then((result) => {
        if (!alive.current) return;
        setData(result);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!alive.current) return;
        setError(cause instanceof Error ? cause : new Error(String(cause)));
        setLoading(false);
      });
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { data, loading, error, reload };
}
