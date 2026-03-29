import { useEffect, useState } from "react";
import { validateCode } from "../api/client";
import type { SyntaxValidationError } from "../api/contracts";
import { MAX_CODE_BYTES } from "../lib/constants";

interface UseSyntaxValidationResult {
  errors: SyntaxValidationError[];
  isValidating: boolean;
}

export function useSyntaxValidation(code: string): UseSyntaxValidationResult {
  const [errors, setErrors] = useState<SyntaxValidationError[]>([]);
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    const trimmed = code.trim();
    if (!trimmed || new TextEncoder().encode(code).length > MAX_CODE_BYTES) {
      setErrors([]);
      setIsValidating(false);
      return;
    }

    const controller = new AbortController();
    setIsValidating(true);

    const timeoutId = window.setTimeout(async () => {
      try {
        const result = await validateCode(code, controller.signal);
        if (!controller.signal.aborted) {
          setErrors(result.errors ?? []);
        }
      } catch {
        if (!controller.signal.aborted) {
          setErrors([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsValidating(false);
        }
      }
    }, 280);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [code]);

  return { errors, isValidating };
}
