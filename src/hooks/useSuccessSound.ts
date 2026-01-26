import { useCallback } from 'react';

export function useSuccessSound() {
  const playSuccessSound = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Create a gentle, quiet chime sound
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Soft sine wave for a pleasant tone
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5 note
      oscillator.frequency.setValueAtTime(1318.5, audioContext.currentTime + 0.1); // E6 note
      
      // Very quiet volume (0.05 = 5% volume)
      gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
      
      // Cleanup
      setTimeout(() => {
        audioContext.close();
      }, 500);
    } catch (error) {
      // Silently fail if audio is not supported
      console.log('Audio not supported');
    }
  }, []);

  return { playSuccessSound };
}
