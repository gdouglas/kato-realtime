import { useCallback } from 'react';
import { useMachine } from '@xstate/react';
import { audioMachine } from '@/machines/audioMachine';
import MicActivityIndicator from '@/components/MicActivityIndicator';
import { Button } from '@/components/ui/button';

export default function SpeakPage() {
  const [audioState, audioSend] = useMachine(audioMachine);
  const isListening = audioState.matches('listening');

  const toggleListening = useCallback(() => {
    // send an event *object*, not a string
    audioSend({ type: isListening ? 'STOP_LISTENING' : 'START_LISTENING' });
  }, [audioSend, isListening]);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-semibold">Speak Mode</h1>
      <div className="flex items-center space-x-4">
        <MicActivityIndicator active={isListening} />
        <Button onClick={toggleListening}>
          {isListening ? 'Stop Listening' : 'Start Listening'}
        </Button>
      </div>
    </div>
  );
}
