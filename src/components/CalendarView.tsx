const days = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const dates = [null, null, null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31];
const agenda = [
  ["10:00", "Projekt Meeting"],
  ["11:30", "Design Review"],
  ["14:00", "Kunden Call"],
  ["16:00", "Team Sync"]
];

export function CalendarView() {
  return (
    <article className="tr-panel grid min-w-0 grid-cols-[1fr_145px] overflow-hidden rounded-[8px]">
      <div className="p-4">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Mai 2025</h2>
          <div className="flex gap-2 text-white/55">
            <span>‹</span>
            <span className="rounded bg-white/[0.08] px-2">›</span>
          </div>
        </div>
        <div className="mb-3 grid grid-cols-7 text-center text-[10px] text-white/45">
          {days.map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-y-3 text-center text-[11px]">
          {dates.map((date, index) => (
            <span
              key={`${date ?? "blank"}-${index}`}
              className={`mx-auto inline-flex h-6 w-6 items-center justify-center rounded-full ${date === 15 ? "bg-[rgb(var(--accent))] text-[rgb(var(--accent-contrast))]" : "text-white"}`}
            >
              {date}
            </span>
          ))}
        </div>
      </div>
      <aside className="border-l border-white/[0.06] p-4">
        <h3 className="text-sm font-semibold">Heute</h3>
        <p className="mt-1 text-[10px] text-white/45">Do. 15 Mai</p>
        <div className="mt-4 space-y-3">
          {agenda.map(([time, label]) => (
            <div key={time} className="text-[10px] leading-4">
              <div className="text-white/55">{time}</div>
              <div className="truncate text-white">{label}</div>
            </div>
          ))}
        </div>
      </aside>
    </article>
  );
}
