"use client";

import { useInstallCopy } from "../hooks/useInstallCopy";

type InstallButtonProps = {
  /** Header uses a short label; hero CTAs show the full shell command. */
  label?: "install" | "command";
  className?: string;
};

export default function InstallButton({ label = "command", className = "" }: InstallButtonProps) {
  const { copied, copy } = useInstallCopy();
  const text =
    copied ? "copied ✓" : label === "install" ? "Install" : "$ npm install caelus";

  return (
    <button
      type="button"
      className={`btn btn-primary mono${className ? ` ${className}` : ""}`}
      onClick={copy}
      aria-live="polite"
      title={label === "install" ? "Copy npm install caelus" : undefined}
    >
      {text}
    </button>
  );
}
