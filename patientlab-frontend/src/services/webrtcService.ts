import { createActor } from "xstate";
import { connectionMachine } from "@/machines/connectionMachine";
import { createRealtimeConnection } from "./realtimeConnection";

/**
 * initializeWebRTC:
 * - Creates a service (interpreter) for connectionMachine
 * - Subscribes to state updates to react to token fetch success or errors
 * - Starts the service and sends INIT_CONNECTION
 */
export function initializeWebRTC(
  audioElementRef: React.RefObject<HTMLAudioElement | null>,
  codec: string,
  enableAudio: boolean
) {
  // Create service (interpreter) for the machine
  const service = interpret(connectionMachine);

  // Subscribe to state changes
  const subscription = service.subscribe((state) => {
    if (state.matches("connected") && state.context.token) {
      createRealtimeConnection(
        state.context.token,
        audioElementRef,
        codec,
        enableAudio
      )
        .then(({ pc, dc }) => {
          console.log("WebRTC connected:", pc, dc);
          // TODO: store or expose pc/dc as needed
        })
        .catch((err) => {
          console.error("WebRTC setup failed:", err);
        });
    }

    if (state.matches("connectionError")) {
      console.error("Token fetch error:", state.context.error);
    }
  });

  // Start the service and fetch token
  service.start();
  service.send("INIT_CONNECTION");

  // Return both service and subscription to allow cleanup if needed
  return { service, subscription };
}
