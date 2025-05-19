# Settings Component

A global, event-driven settings modal for toggling microphone, audio output, and push-to-talk mode. Aligned with the XState/event-driven architecture of the app.

- Accessible from a gear icon in the top-right of the app, visible on all pages.
- Modal opens/closes via EventBus events.
- Settings changes are broadcast as events and can be managed by XState/context.

See [EVENTS.md](./EVENTS.md) for event details and [ARCHITECTURE.md](./ARCHITECTURE.md) for integration notes. 