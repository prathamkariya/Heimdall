import { useEffect, useState } from 'react';

interface UseKeyboardNavProps {
  itemCount: number;
  onSelect: (index: number) => void;
  onClose?: () => void;
  isActive: boolean;
}

export function useKeyboardNav({ itemCount, onSelect, onClose, isActive }: UseKeyboardNavProps) {
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  // Reset focus when it becomes inactive
  useEffect(() => {
    if (!isActive) {
      setFocusedIndex(-1);
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((prev) => (prev < itemCount - 1 ? prev + 1 : prev));
          break;
        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;
        case 'e':
        case 'Enter':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < itemCount) {
            onSelect(focusedIndex);
          }
          break;
        case 'Escape':
          e.preventDefault();
          if (onClose) {
            onClose();
          }
          setFocusedIndex(-1);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, itemCount, focusedIndex, onSelect, onClose]);

  return { focusedIndex, setFocusedIndex };
}
