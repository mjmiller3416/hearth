"use client";

import { useCallback, useState } from "react";
import { ListChecks, Sparkles } from "lucide-react";
import { useHousehold } from "@/components/app/Household";
import { useCleanSession, useKidsChores } from "@/hooks/useHub";
import { useIdleReset } from "@/hooks/useIdleReset";
import { Segmented } from "@/components/ui/Button";
import { AsOf, EmptyState, SourceGate, Tile } from "@/components/ui/Tile";
import { Page } from "@/components/ui/Page";
import { KidChoreList } from "./ChoreList";
import { CleanTask, DoneToday, RoomPicker } from "./CleanSession";

// Chores: everything Tada! runs, in one place. Two modes, because the two
// surfaces have deliberately different philosophies (spec D4/D5):
//
//   Kids      each kid's checklist for today: what's left and what's done.
//   Cleaning  Maryann's guided session: one task at a time, never a list.
//
// The lens picks the sensible default: a kid sees their own list, large;
// Maryann lands on her session; everyone else sees both kids side by side.

type Mode = "kids" | "clean";

export function ChoresView({ initialMode }: { initialMode: Mode | null }) {
  const { lens } = useHousehold();
  const kids = useKidsChores();
  const clean = useCleanSession();

  // A picked mode sticks only while the same person is looking.
  const lensKey = lens?.key ?? "";
  const [picked, setPicked] = useState<{ lensKey: string; mode: Mode } | null>(
    initialMode ? { lensKey, mode: initialMode } : null,
  );
  const mode: Mode =
    picked && picked.lensKey === lensKey ? picked.mode : lens?.cleans ? "clean" : "kids";

  const resetClean = clean.reset;
  useIdleReset(
    useCallback(() => {
      setPicked(null);
      resetClean();
    }, [resetClean]),
  );

  // A kid's lens narrows the lists to that kid.
  const columns =
    lens?.role === "kid" && lens.tadaId
      ? kids.columns.filter((c) => c.kid.id === lens.tadaId)
      : kids.columns;

  return (
    <Page
      title={mode === "clean" ? "Cleaning" : "Chores"}
      controls={
        <Segmented
          label="Which chores"
          value={mode}
          onChange={(m) => setPicked({ lensKey, mode: m })}
          options={[
            { value: "kids", label: "Kids" },
            { value: "clean", label: "Cleaning" },
          ]}
        />
      }
    >
      {mode === "kids" ? (
        <SourceGate
          state={kids.state}
          configured={kids.configured}
          app="Tada!"
          what="The kids' chores"
          rows={5}
        >
          {columns.length === 0 ? (
            <EmptyState icon={ListChecks} title="No kids set up yet">
              Kids are listed in TADA_MEMBERS. Once they are, their chores show here.
            </EmptyState>
          ) : (
            <div
              className="grid gap-4 wide:h-full wide:gap-5"
              style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 18rem), 1fr))` }}
            >
              {columns.map((col) => (
                <Tile
                  key={col.kid.id}
                  tone="glass"
                  className="wide:h-full"
                  bodyClassName="flex flex-col pt-5"
                  stamp={<AsOf isStale={kids.state.isStale} lastUpdated={kids.state.lastUpdated} />}
                >
                  <KidChoreList
                    column={col}
                    onComplete={(chore) => kids.complete(col.kid.id, chore)}
                    onUndo={(chore) => kids.undo(col.kid.id, chore)}
                  />
                </Tile>
              ))}
            </div>
          )}
        </SourceGate>
      ) : (
        <SourceGate
          state={clean.state}
          configured={clean.configured}
          app="Tada!"
          what="The cleaning session"
          rows={4}
        >
          <div className="flex flex-col gap-4 wide:h-full wide:flex-row wide:gap-5">
            <Tile tone="glass" className="min-h-[24rem] wide:min-h-0 wide:flex-[5]" bodyClassName="flex flex-col pt-5">
              {clean.rooms.length > 0 && (
                <RoomPicker
                  rooms={clean.rooms}
                  activeRoomId={clean.roomId}
                  onSelect={clean.setRoomId}
                />
              )}
              <div className="min-h-0 flex-1">
                <CleanTask session={clean} />
              </div>
            </Tile>
            <Tile
              tone="glass"
              title="Done today"
              icon={Sparkles}
              className="wide:flex-[2]"
              bodyClassName="flex flex-col"
              stamp={<AsOf isStale={clean.state.isStale} lastUpdated={clean.state.lastUpdated} />}
            >
              <DoneToday completions={clean.completions} color={clean.adult?.color ?? null} />
            </Tile>
          </div>
        </SourceGate>
      )}
    </Page>
  );
}
