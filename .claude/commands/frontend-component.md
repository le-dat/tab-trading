# Command: frontend-component

## Description
Create a new UI component for Tap Trading following the project's design system and patterns.

## Design principles — ALWAYS remember
- **Mobile-first**: looks great on 375px first, then desktop
- **One-tap**: most important actions require at most 1 tap, no confirm dialogs
- **Real-time**: data must be live from WebSocket, never stale
- **Gamified**: fast animations, immediate feedback, snappy feel

## File structure when creating a new component
```
components/
  trading/
    {ComponentName}/
      {ComponentName}.tsx        ← pure UI, no complex logic
      use{ComponentName}.ts      ← hook separated if there is state/effect
  ui/
    {ComponentName}.tsx          ← design system primitives (button, badge...)
hooks/
  use{HookName}.ts               ← data hooks (usePrice, useOrder, useSocket)
stores/
  {domain}.store.ts              ← Zustand store
```

## Template: Component with real-time price
```typescript
'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useTradeStore } from '@/stores/trade.store';
import { formatPrice } from '@packages/shared';

interface TargetBlockProps {
  targetPrice: bigint;
  currentPrice: bigint;
  multiplier: number;
  direction: 'above' | 'below';
  onSelect: (target: bigint) => void;
}

export function TargetBlock({
  targetPrice,
  currentPrice,
  multiplier,
  direction,
  onSelect,
}: TargetBlockProps) {
  const distancePct = Math.abs(
    Number((targetPrice - currentPrice) * 10000n / currentPrice) / 100
  );
  const isSelected = useTradeStore((s) => s.selectedTarget === targetPrice);

  return (
    <motion.button
      className={cn(
        'relative flex flex-col items-center justify-center',
        'w-full h-20 rounded-2xl border-2 transition-colors',
        isSelected
          ? 'border-amber-400 bg-amber-50 dark:bg-amber-950'
          : 'border-border bg-card hover:border-amber-200'
      )}
      whileTap={{ scale: 0.95 }}
      onClick={() => onSelect(targetPrice)}
    >
      <span className="text-xs text-muted-foreground">
        {direction === 'above' ? '↑' : '↓'} {distancePct.toFixed(1)}%
      </span>
      <span className="text-lg font-bold tabular-nums">
        {formatPrice(targetPrice)}
      </span>
      <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
        {multiplier.toFixed(1)}×
      </span>
    </motion.button>
  );
}
```

## Template: useSocket hook
```typescript
import { useEffect, useState } from 'react';
import { socket } from '@/lib/socket';

export function useOrderSocket(orderId: string) {
  const [status, setStatus] = useState<'open' | 'won' | 'lost'>('open');
  const [payout, setPayout] = useState<bigint>(0n);

  useEffect(() => {
    if (!orderId) return;

    socket.on(`order:${orderId}:won`, ({ payout: p }: { payout: string }) => {
      setStatus('won');
      setPayout(BigInt(p));
    });

    socket.on(`order:${orderId}:lost`, () => {
      setStatus('lost');
    });

    return () => {
      socket.off(`order:${orderId}:won`);
      socket.off(`order:${orderId}:lost`);
    };
  }, [orderId]);

  return { status, payout };
}
```

## Template: usePrice hook
```typescript
import { useEffect, useState, useRef } from 'react';
import { socket } from '@/lib/socket';

export function usePrice(asset: string) {
  const [price, setPrice] = useState<bigint>(0n);
  const [direction, setDirection] = useState<'up' | 'down' | null>(null);
  const prevRef = useRef<bigint>(0n);

  useEffect(() => {
    socket.on(`price:${asset}`, ({ value }: { value: string }) => {
      const next = BigInt(value);
      setDirection(next > prevRef.current ? 'up' : 'down');
      prevRef.current = next;
      setPrice(next);
    });
    return () => { socket.off(`price:${asset}`); };
  }, [asset]);

  return { price, direction };
}
```

## Template: Zustand store
```typescript
import { create } from 'zustand';

interface TradeState {
  selectedAsset: string;
  selectedTarget: bigint | null;
  selectedDuration: number;   // seconds
  stake: string;
  setAsset: (asset: string) => void;
  setTarget: (target: bigint) => void;
  setDuration: (duration: number) => void;
  setStake: (stake: string) => void;
  reset: () => void;
}

export const useTradeStore = create<TradeState>((set) => ({
  selectedAsset: 'BTC/USD',
  selectedTarget: null,
  selectedDuration: 60,
  stake: '',
  setAsset: (selectedAsset) => set({ selectedAsset, selectedTarget: null }),
  setTarget: (selectedTarget) => set({ selectedTarget }),
  setDuration: (selectedDuration) => set({ selectedDuration }),
  setStake: (stake) => set({ stake }),
  reset: () => set({ selectedTarget: null, stake: '' }),
}));
```

## Animation patterns (Framer Motion)

### Win modal
```typescript
const winVariants = {
  hidden: { scale: 0.8, opacity: 0 },
  visible: {
    scale: 1, opacity: 1,
    transition: { type: 'spring', stiffness: 300, damping: 20 }
  },
};
```

### Price flash (green when up, red when down)
```typescript
// Use with usePrice hook's direction
useEffect(() => {
  if (!direction || !ref.current) return;
  const color = direction === 'up' ? '#22c55e' : '#ef4444';
  ref.current.animate(
    [{ color }, { color: 'inherit' }],
    { duration: 400, easing: 'ease-out' }
  );
}, [price]);
```

### Countdown ring (SVG)
```typescript
// circumference = 2 * Math.PI * radius
// strokeDashoffset = circumference * (1 - timeLeft / totalTime)
const circumference = 2 * Math.PI * 40;  // radius = 40
const offset = circumference * (1 - timeLeft / totalTime);

<circle
  r={40} cx={48} cy={48}
  fill="none"
  stroke="currentColor"
  strokeWidth={4}
  strokeDasharray={circumference}
  strokeDashoffset={offset}
  style={{ transition: 'stroke-dashoffset 1s linear' }}
/>
```

## Checklist before creating a new component
```
[ ] Is the hook separated from the UI component?
[ ] Is there a loading state handled? (skeleton or spinner)
[ ] Is there an error state handled?
[ ] Are Price/BigInt displays using formatPrice() from packages/shared?
[ ] Are animations wrapped in <AnimatePresence> if mounting/unmounting?
[ ] Does dark mode work? (test with dark: prefix)
[ ] Are touch targets large enough? (minimum 44×44px for mobile)
```

## Special component: TapButton
```typescript
// The most important element in the entire UI — must be extremely responsive
export function TapButton({ onTap, disabled, loading }: TapButtonProps) {
  return (
    <motion.button
      className="w-full h-16 rounded-2xl bg-amber-400 text-amber-900 font-bold text-lg"
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      disabled={disabled || loading}
      onClick={onTap}
    >
      {loading ? <Spinner /> : 'TAP TO TRADE'}
    </motion.button>
  );
}
// DO NOT use confirm dialogs — one tap and it's done.
// Validate all conditions (target selected, stake > 0) BEFORE enabling the button.
```
