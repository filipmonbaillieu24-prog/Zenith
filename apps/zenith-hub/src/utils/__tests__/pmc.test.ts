import { describe, it, expect } from 'vitest';
import { computePMC, recoveryAdvice, interpretTSB } from '../pmc';

describe('PMC Physiological Calculations', () => {
  it('should compute CTL, ATL and TSB correctly for a series of rides', () => {
    const today = Date.now();
    const dayMs = 24 * 3600 * 1000;
    
    const rideTSSList = [
      { date: today - 5 * dayMs, tss: 100 },
      { date: today - 4 * dayMs, tss: 120 },
      { date: today - 3 * dayMs, tss: 0 },
      { date: today - 2 * dayMs, tss: 80 },
      { date: today - 1 * dayMs, tss: 150 },
      { date: today, tss: 90 },
    ];

    const pmc = computePMC(rideTSSList);
    expect(pmc.length).toBeGreaterThanOrEqual(6);
    
    const lastPoint = pmc[pmc.length - 1];
    expect(lastPoint.ctl).toBeGreaterThan(0);
    expect(lastPoint.atl).toBeGreaterThan(0);
    expect(lastPoint.tsb).toEqual(Math.round((lastPoint.ctl - lastPoint.atl) * 10) / 10);
  });

  it('should provide accurate recovery advice for TSS levels', () => {
    expect(recoveryAdvice(30).hours).toBe('< 12u');
    expect(recoveryAdvice(100).hours).toBe('12–24u');
    expect(recoveryAdvice(200).hours).toBe('24–48u');
    expect(recoveryAdvice(350).hours).toBe('48–72u');
  });

  it('should interpret TSB scores with correct labels', () => {
    expect(interpretTSB(10).label).toBe('Piekconditie');
    expect(interpretTSB(0).label).toBe('Goede trainingsperiode');
    expect(interpretTSB(-30).label).toBe('Overtraining risico');
  });
});
