import { testReconnection } from './spikes/reconnectionTest';
import { analyzeWebRTCCoupling } from './spikes/webrtcCouplingAnalysis';
import { testContextPreservation } from './spikes/contextPreservationTest';

// Expose the tests to the window object
(window as any).spikeTests = {
  testReconnection,
  analyzeWebRTCCoupling,
  testContextPreservation
};
