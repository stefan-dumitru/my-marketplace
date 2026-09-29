"use client";

import { useCallback, useState } from "react";
import Script from "next/script";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        }
      ) => string;
    };
  }
}

type Props = {
  siteKey: string;
  /** Per-request CSP nonce (see lib/turnstile.ts's getTurnstileClientConfig) — required for the
   *  script tag to be trusted under this app's strict script-src policy (see proxy.ts). */
  nonce: string;
  onVerify: (token: string | null) => void;
};

export function TurnstileWidget({ siteKey, nonce, onVerify }: Props) {
  const [scriptReady, setScriptReady] = useState(false);

  // Callback ref, not useEffect — this only needs to run once the container div actually exists
  // in the DOM *and* the script has finished loading; a ref callback fires exactly when the node
  // mounts, without an extra effect to coordinate against `scriptReady` flipping later.
  const containerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !scriptReady || !window.turnstile) return;
      window.turnstile.render(node, {
        sitekey: siteKey,
        callback: (token) => onVerify(token),
        "expired-callback": () => onVerify(null),
        "error-callback": () => onVerify(null),
      });
    },
    [scriptReady, siteKey, onVerify]
  );

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        nonce={nonce}
        onLoad={() => setScriptReady(true)}
      />
      <div ref={containerRef} />
    </>
  );
}
