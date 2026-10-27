import { Minus, Square, SquarePen, X } from "lucide-react";
import { useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import { MailList } from "../components/MailList";
import { MailReader } from "../components/MailReader";
import { MailSidebar } from "../components/MailSidebar";
import { isDesktop } from "../services/desktop";
import { mailService } from "../services/mailService";
import { useMailStore } from "../stores/mailStore";

const DEFAULT_LIST_WIDTH = 440;
const MIN_LIST_WIDTH = 360;
const MAX_LIST_WIDTH = 1600;
const MIN_READER_WIDTH = 320;
const LIST_WIDTH_STORAGE_KEY = "lunamail:list-pane-width";

function readListWidth() {
  const savedWidth = Number(window.localStorage.getItem(LIST_WIDTH_STORAGE_KEY));
  return Number.isFinite(savedWidth) && savedWidth > 0
    ? Math.min(MAX_LIST_WIDTH, Math.max(MIN_LIST_WIDTH, savedWidth))
    : DEFAULT_LIST_WIDTH;
}

export function AppLayout() {
  const { accounts, selectedView, openComposer } = useMailStore(useShallow((state) => ({
    accounts: state.accounts,
    selectedView: state.selectedView,
    openComposer: state.openComposer
  })));
  const [listWidth, setListWidth] = useState(readListWidth);
  const hasAccounts = accounts.length > 0;
  const showsOverview = selectedView === "dashboard" || selectedView === "health";

  function startListResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const workspace = event.currentTarget.parentElement;
    if (!workspace) return;
    const workspaceBounds = workspace.getBoundingClientRect();
    const maxWidth = Math.max(MIN_LIST_WIDTH, Math.min(MAX_LIST_WIDTH, workspaceBounds.width - MIN_READER_WIDTH));
    document.body.classList.add("is-resizing-pane");

    const resize = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(maxWidth, Math.max(MIN_LIST_WIDTH, moveEvent.clientX - workspaceBounds.left));
      setListWidth(Math.round(nextWidth));
    };
    const stopResize = (upEvent: PointerEvent) => {
      const finalWidth = Math.min(maxWidth, Math.max(MIN_LIST_WIDTH, upEvent.clientX - workspaceBounds.left));
      const roundedWidth = Math.round(finalWidth);
      setListWidth(roundedWidth);
      window.localStorage.setItem(LIST_WIDTH_STORAGE_KEY, String(roundedWidth));
      document.body.classList.remove("is-resizing-pane");
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResize);
    };

    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResize);
  }

  function resetListWidth() {
    setListWidth(DEFAULT_LIST_WIDTH);
    window.localStorage.setItem(LIST_WIDTH_STORAGE_KEY, String(DEFAULT_LIST_WIDTH));
  }

  return (
    <div className="relative h-full overflow-hidden bg-canvas text-ink">
      {isDesktop ? <div className="titlebar-drag absolute left-[260px] right-32 top-0 z-40 h-10" /> : null}
      {isDesktop ? (
        <div className="titlebar-drag absolute right-0 top-0 z-50 flex h-9 items-center gap-0.5 px-2">
          <button className="titlebar-no-drag inline-flex h-7 w-9 items-center justify-center rounded-lg text-label-2 transition-colors hover:bg-surface hover:text-ink" onClick={() => void window.electronAPI?.window.minimize()} title="Minimieren">
            <Minus size={13} />
          </button>
          <button className="titlebar-no-drag inline-flex h-7 w-9 items-center justify-center rounded-lg text-label-2 transition-colors hover:bg-surface hover:text-ink" onClick={() => void window.electronAPI?.window.toggleMaximize()} title="Maximieren">
            <Square size={11} />
          </button>
          <button className="titlebar-no-drag inline-flex h-7 w-9 items-center justify-center rounded-lg text-label-2 transition-colors hover:bg-red-500 hover:text-white" onClick={() => void mailService.requestClose()} title="Schließen">
            <X size={13} />
          </button>
        </div>
      ) : null}

      <section className="tr-shell flex h-full min-h-0 overflow-hidden">
        <MailSidebar />
        <div className="app-workspace relative flex min-w-0 flex-1 overflow-hidden bg-canvas">
          <div
            className={"relative min-w-0 overflow-hidden " + (showsOverview ? "workspace-overview-pane flex-1" : "mail-list-pane")}
            style={showsOverview ? undefined : { flex: "0 0 " + listWidth + "px", width: listWidth, maxWidth: "none" }}
          >
            <MailList />
          </div>
          {!showsOverview ? (
            <div
              className="pane-resizer hidden xl:flex"
              role="separator"
              aria-label="Breite der Nachrichtenliste ändern"
              aria-orientation="vertical"
              aria-valuemin={MIN_LIST_WIDTH}
              aria-valuemax={MAX_LIST_WIDTH}
              aria-valuenow={listWidth}
              title="Ziehen zum Ändern · Doppelklick zum Zurücksetzen"
              onPointerDown={startListResize}
              onDoubleClick={resetListWidth}
            >
              <span />
            </div>
          ) : null}
          <MailReader />
          <button
            className="accent-primary compose-fab absolute bottom-6 left-6 z-30 inline-flex h-12 items-center gap-2.5 rounded-full px-5 text-[14px] font-bold shadow-float transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!hasAccounts}
            onClick={() => openComposer()}
          >
            <SquarePen size={18} />
            Neue Nachricht
          </button>
        </div>
      </section>
    </div>
  );
}
