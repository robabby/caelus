"use client";

import { useCallback, useState } from "react";

const INSTALL_CMD = "npm install caelus";

export function useInstallCopy() {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(INSTALL_CMD);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, []);

  return { copied, copy, installCmd: INSTALL_CMD };
}
