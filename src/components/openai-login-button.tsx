"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function OpenAILoginButton({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const popupRef = useRef<Window | null>(null);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (event.data?.type !== "openai-login-complete") {
        return;
      }

      setPending(false);
      popupRef.current?.close();
      popupRef.current = null;
      router.refresh();
    },
    [router],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  useEffect(() => {
    if (!pending) {
      return;
    }

    const timer = window.setInterval(() => {
      if (popupRef.current && popupRef.current.closed) {
        setPending(false);
        popupRef.current = null;
        router.refresh();
      }
    }, 400);

    return () => window.clearInterval(timer);
  }, [pending, router]);

  function openLoginPopup() {
    const width = 520;
    const height = 720;
    const left = Math.max(window.screenX + (window.outerWidth - width) / 2, 0);
    const top = Math.max(window.screenY + (window.outerHeight - height) / 2, 0);
    popupRef.current = window.open(
      "/auth/openai/login",
      "openai-login",
      `popup=yes,width=${width},height=${height},left=${left},top=${top}`,
    );
    if (popupRef.current) {
      setPending(true);
    }
  }

  return (
    <button
      type="button"
      onClick={openLoginPopup}
      disabled={pending}
      className={className}
    >
      {pending ? "Waiting for browser prompt..." : children ?? "Continue with OpenAI"}
    </button>
  );
}
