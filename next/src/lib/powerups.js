// Powerup ids
export const UNDO = 'undo';
export const TELEPORT = 'teleport';
export const SWAP = 'swap';
export const ROTATE = 'rotate';
export const DELETE = 'delete';
export const BOMB = 'bomb';

export const CAP = 2;

export const MODE_POWERUPS = {
  classic: [],
  standard: [UNDO, SWAP, DELETE],
  plus: [UNDO, TELEPORT, SWAP, ROTATE, DELETE, BOMB],
};

// starting counts
export const STARTING = {
  standard: { [UNDO]: 2, [SWAP]: 1 },
  plus: { [UNDO]: 2, [TELEPORT]: 1, [SWAP]: 1, [ROTATE]: 1 },
};

// value thresholds that grant +1 use of a given powerup (once per threshold reached)
export const UNLOCKS = {
  standard: [
    { value: 128, id: UNDO },
    { value: 256, id: SWAP },
    { value: 512, id: DELETE },
  ],
  plus: [
    { value: 128, id: UNDO },
    { value: 256, id: TELEPORT },
    { value: 256, id: SWAP },
    { value: 256, id: ROTATE },
    { value: 512, id: DELETE },
    { value: 512, id: BOMB },
  ],
};

export const LABELS = {
  [UNDO]: 'Undo',
  [TELEPORT]: 'Teleport a tile',
  [SWAP]: 'Swap two tiles',
  [ROTATE]: 'Rotate the outer ring',
  [DELETE]: 'Delete tiles by number',
  [BOMB]: 'Bomb',
};
