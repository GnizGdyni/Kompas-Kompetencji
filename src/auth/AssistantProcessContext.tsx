import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { OpenProcessContext } from "../lib/processAssistantHints";

type AssistantProcessValue = {
  openProcess: OpenProcessContext | null;
  setOpenProcess: (ctx: OpenProcessContext | null) => void;
};

const AssistantProcessContext = createContext<AssistantProcessValue | null>(
  null,
);

export function AssistantProcessProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [openProcess, setOpenProcessState] =
    useState<OpenProcessContext | null>(null);

  const setOpenProcess = useCallback((ctx: OpenProcessContext | null) => {
    setOpenProcessState(ctx);
  }, []);

  const value = useMemo(
    () => ({ openProcess, setOpenProcess }),
    [openProcess, setOpenProcess],
  );

  return (
    <AssistantProcessContext.Provider value={value}>
      {children}
    </AssistantProcessContext.Provider>
  );
}

export function useAssistantProcess() {
  const ctx = useContext(AssistantProcessContext);
  if (!ctx) {
    throw new Error(
      "useAssistantProcess must be used within AssistantProcessProvider",
    );
  }
  return ctx;
}
