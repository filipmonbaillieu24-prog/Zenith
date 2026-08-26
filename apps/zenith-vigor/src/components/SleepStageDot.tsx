import React from 'react';

/** Small colour key used beside sleep-stage labels. */
export const SleepStageDot: React.FC<{ color: string }> = ({ color }) => (
  <span
    style={{
      display: 'inline-block',
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: color,
      marginRight: 6,
      flexShrink: 0
    }}
  />
);
