// @ts-nocheck  – dev-only script
import { agentLifecycleMachine } from "../src/app/machines/katoAgentLifecycleMachine";

/* ---------- helpers ---------------------------------------------------- */

type StateDef = (typeof agentLifecycleMachine)["definition"];

const collect = (def: StateDef): StateDef[] => {
  const out = [def];
  if (def.states) Object.values(def.states).forEach(c => out.push(...collect(c)));
  return out;
};

const add = (name: any, set: Set<string>) => {
  if (!name) return;
  if (typeof name === "string") set.add(name);
  else if (typeof name === "object" && "type" in name) set.add(name.type);
};

/* ---------- walk the chart -------------------------------------------- */

const referenced = new Set<string>();

for (const node of collect(agentLifecycleMachine.definition)) {
  // entry / onEntry
  node.entry?.forEach(e => add(e, referenced));
  node.onEntry?.forEach(e => add(e, referenced));

  // exit / onExit
  node.exit?.forEach(e => add(e, referenced));
  node.onExit?.forEach(e => add(e, referenced));

  // transitions
  if (node.on) {
    Object.values(node.on).flat().forEach((t: any) => {
      t.actions?.forEach(a => add(a, referenced));
      add(t.guard, referenced);
    });
  }

  // invocations: node.invoke can be object **or array** (“invokes” internally)
  const invokes = Array.isArray(node.invoke) ? node.invoke : node.invoke ? [node.invoke] : [];
  invokes.forEach(i => add(i.src, referenced));
}

/* ---------- compare with registered helpers --------------------------- */

const impl = agentLifecycleMachine.implementations ?? {};
const declared = new Set<string>([
  ...Object.keys(impl.actions ?? {}),
  ...Object.keys(impl.guards  ?? {}),
  ...Object.keys(impl.actors  ?? {}),
]);

const neverUsed = [...declared].filter(n => !referenced.has(n));

/* ---------- report ----------------------------------------------------- */

console.log(`Total state nodes: ${collect(agentLifecycleMachine.definition).length}`);
console.log("\nDeclared but never referenced in any state/transition:");
console.log(neverUsed.length ? neverUsed.join("\n") : "✅ none");
