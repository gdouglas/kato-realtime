# Contributing to **kato‑realtime**

Welcome! We follow a *strictly‑typed XState* architecture and a few lightweight
conventions so that every developer can move quickly without breaking hidden
contracts.  Please skim this before opening a PR.

---

---

## 1 Commit style

* Conventional Commits (`feat/ …`, `fix/ …`, `chore/ …`).
* Keep commits small; prefer one logical change per commit.
* Run `pnpm lint` and `pnpm test` (when available) before pushing.

---

## 2 State‑machine conventions

### 2.1 When to use which typing style

| Use this style                         | File size                                                       | Auto‑complete inside callbacks | Compile‑time guarantees                                 |
| -------------------------------------- | --------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------- |
| **`setup({ types }).createMachine()`** | ≥ 100 loc or many inline `assign` / `guard` / `input` callbacks | **Full**                       | Fails build on typo in `src`, `actions`, `guards`, etc. |
| **`createMachine<Ctx, Evt, Inp>()`**   | < 100 loc, leaf actors, few callbacks                           | Limited (add casts)            | Still typed but looser; faster to write                 |

**Rule of thumb**: if a machine has *nested states* **or** more than **5** inline
callbacks, use `setup()`. Otherwise use the generic shorthand.

### 2.2 Directory layout

```
src/app/machines/
 ├─ root.machine.ts           # setup() – core coordinator
 ├─ session/                  # one‑agent life‑cycle
 │   ├─ index.ts              # setup()
 │   ├─ introPlayer.machine.ts# generic
 │   └─ rtcConn.machine.ts    # generic
 └─ settings.machine.ts       # generic
```

### 2.3 `invoke` syntax

* **Always wrap** single‑object invocations in an **array**:

  ```ts
  invoke: [ { id: "rtc", src: rtcConnMachine } ]
  ```

  This keeps TypeScript happy until XState’s typings are relaxed.
* If you use `setup()`, list every callable in `types.actors`.

### 2.4 Forwarding events

* No `autoForward`. Instead:

  ```ts
  on: { SWITCH_TO_WRITE: { actions: forwardTo("settings") } }
  ```

---
