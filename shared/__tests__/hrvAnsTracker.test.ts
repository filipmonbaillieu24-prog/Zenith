import { describe, it, expect } from 'vitest';
import { HrvAnsTracker, MIN_BASELINE_NIGHTS } from '../ml/HrvAnsTracker';

/**
 * These use this athlete's real numbers. The series below is what was actually in
 * vigor_sleep on 2026-09-01, and it scaled their lifting targets to 0.8x.
 */
const REAL_BASELINE = [132.03, 162.35, 145.98, 130.46, 160.33, 159.38, 141.78, 160.73, 161.63, 160.10, 159.14, 135.24];
const DUPLICATED_READING = 54.74284105248328;

describe('HRV never deloads an athlete off a suspect reading', () => {
  it('refuses to act on a swing too large to be physiological', () => {
    const state = HrvAnsTracker.calculateAnsState(REAL_BASELINE, DUPLICATED_READING);
    expect(state.intensityMultiplier).toBe(1.0);
    expect(state.tone).toBe('balanced');
    expect(state.insight).toMatch(/too far from your/);
  });

  it('does not let a steady sleeper produce an enormous z-score', () => {
    // Standard deviation here is under 1 ms. The old fixed floor of 1.5 turned an
    // ordinary 8 ms dip into roughly -8 sigma.
    const steady = [159, 160, 161, 160, 159, 160, 161, 160];
    const state = HrvAnsTracker.calculateAnsState(steady, 152);
    expect(Math.abs(state.zScore)).toBeLessThan(1.5);
    expect(state.intensityMultiplier).toBe(1.0);
  });

  it('treats a repeated reading as one night, not as confirmation', () => {
    const repeated = [150, 150, 150, 150, 150, 150, 150, 150, 150, 150];
    const state = HrvAnsTracker.calculateAnsState(repeated, 150);
    // Collapses to a single distinct value, which is not a baseline.
    expect(state.insight).toMatch(/Establishing HRV baseline/);
    expect(state.intensityMultiplier).toBe(1.0);
  });

  it('stays quiet until it has enough nights', () => {
    const state = HrvAnsTracker.calculateAnsState([120, 130, 140], 100);
    expect(state.insight).toContain(`3 of ${MIN_BASELINE_NIGHTS}`);
    expect(state.intensityMultiplier).toBe(1.0);
  });

  it('still calls a genuine, plausible drop', () => {
    const base = [120, 118, 125, 122, 119, 124, 121, 123];
    // ~25% down: within the plausible band, and well below baseline.
    const state = HrvAnsTracker.calculateAnsState(base, 91);
    expect(state.tone).toBe('sympathetic');
    expect(state.intensityMultiplier).toBe(0.8);
  });

  it('still opens the window when HRV is genuinely elevated', () => {
    const base = [120, 118, 125, 122, 119, 124, 121, 123];
    const state = HrvAnsTracker.calculateAnsState(base, 140);
    expect(state.tone).toBe('parasympathetic');
    expect(state.intensityMultiplier).toBe(1.05);
  });

  it('handles a missing reading without inventing a state', () => {
    expect(HrvAnsTracker.calculateAnsState(REAL_BASELINE, 0).intensityMultiplier).toBe(1.0);
    expect(HrvAnsTracker.calculateAnsState(REAL_BASELINE, NaN).intensityMultiplier).toBe(1.0);
  });
});
