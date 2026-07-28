import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { QueryClient, QueryClientProvider } from "@tanstack/preact-query";
import {
  beginLogin,
  clearToken,
  completeLogin,
  fetchConfig,
  getToken,
  isCallback,
} from "./lib/auth.ts";
import { App } from "./components/app.tsx";
import type { AppConfig } from "./lib/types.ts";

const client = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 15_000,
      retry: 1,
    },
  },
});

type Status = "loading" | "login" | "ready" | "error";

function Root() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const cfg = await fetchConfig();
        setConfig(cfg);

        if (cfg.authDisabled) {
          setStatus("ready");
          return;
        }

        if (isCallback()) {
          const err = await completeLogin(cfg);
          if (err) {
            setMessage(err);
            setStatus("error");
            return;
          }
          setStatus("ready");
          return;
        }

        setStatus(getToken() ? "ready" : "login");
      } catch (e) {
        setMessage(String(e));
        setStatus("error");
      }
    })();
  }, []);

  if (status === "loading") {
    return <p class="centered muted">Loading...</p>;
  }

  if (status === "error") {
    return (
      <div class="centered">
        <p class="error">{message}</p>
        <button type="button" onClick={() => location.assign("/")}>
          Start over
        </button>
      </div>
    );
  }

  if (status === "login") {
    return (
      <div class="centered">
        <h1>SMS Gateway</h1>
        <p class="muted">Sign in</p>
        <button
          type="button"
          class="primary"
          onClick={() => config && beginLogin(config)}
        >
          Sign in (SSO)
        </button>
      </div>
    );
  }

  return (
    <App
      onSignOut={config?.authDisabled ? null : () => {
        clearToken();
        setStatus("login");
      }}
    />
  );
}

const root = document.getElementById("app");
if (root) {
  render(
    <QueryClientProvider client={client}>
      <Root />
    </QueryClientProvider>,
    root,
  );
}
