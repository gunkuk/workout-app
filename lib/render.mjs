export function roundToStep(weight, step) {
  return Math.round(weight / step) * step;
}

export function renderProgram(program, tms, { step = 2.5 } = {}) {
  const lines = [`# ${program.name} (v${program.version})`];
  program.weeks.forEach((week, wi) => {
    lines.push("", `## Week ${wi + 1}`);
    for (const day of week.days) {
      const hint = day.weekdayHint ? ` (${day.weekdayHint})` : "";
      lines.push("", `### Day ${day.ordinal}${hint} — ${day.name}`);
      for (const slot of day.slots) {
        const rule = slot.progressionRuleId ? ` · rule: ${slot.progressionRuleId}` : "";
        lines.push("", `**[${slot.label}] ${slot.exerciseId}**${rule}`);
        lines.push("| # | 무게 | reps |", "|---|---|---|");
        slot.sets.forEach((set, si) => {
          let w = "—";
          if (set.load.kind === "pctOfTM") {
            const ref = set.load.ref ?? slot.exerciseId;
            const pctLabel = `${Math.round(set.load.pct * 100)}%`;
            w =
              tms[ref] == null
                ? `${pctLabel} of ${ref} (TM?)`
                : `${roundToStep(tms[ref] * set.load.pct, step)}kg (${pctLabel})`;
          }
          const reps = set.amrapRole
            ? `${set.reps}+${set.amrapRole === "topSet" ? " ★topSet" : ""}`
            : `${set.reps}`;
          lines.push(`| ${si + 1} | ${w} | ${reps} |`);
        });
      }
    }
  });
  return lines.join("\n");
}
