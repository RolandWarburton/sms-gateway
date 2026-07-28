import { useState } from "preact/hooks";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy(e: MouseEvent) {
    // Don't let the click also toggle the row's detail panel.
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard needs a secure context; silently leave the button alone.
    }
  }

  return (
    <button
      type="button"
      class="copy"
      title="Copy message"
      aria-label="Copy message"
      onClick={copy}
    >
      {copied ? "✓" : "⧉"}
    </button>
  );
}
