import { SimpleMLP, kratosOverloadModel, dualSportFatigueModel, recoveryModel, buildRecoveryFeatureVector, recoveryHeuristic, cardioFreshness, kratosEffortVolume, GYM_VOLUME_HARD_WEEK_KG } from '@zenith/shared';
import { computePMC } from './pmc';

// ==========================================================
// 1. SMART COACH MODEL DEFINITION
// ==========================================================
const COACH_WORKOUTS = ['recovery', 'endurance', 'tempo', 'threshold', 'sweetspot', 'vo2max'] as const;

function generateCoachDefaultWeights() {
  const W1: number[][] = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const B1: number[] = new Array(8).fill(0.02);
  const W2: number[][] = Array.from({ length: 8 }, () => new Array(6).fill(0));
  const B2: number[] = new Array(6).fill(0.0);

  W1[0][0] = -0.5; W1[1][0] = 0.8;
  W1[0][1] = 0.6;  W1[1][1] = -0.2;
  W1[2][0] = -0.9;
  W1[2][5] = 0.9;

  W1[4][4] = 0.9;
  W1[5][5] = 0.9;
  W1[6][1] = 0.9;
  W1[7][0] = 0.8;

  W2[0][0] = 1.2;
  W2[1][1] = 1.0;
  W2[2][2] = 0.9;
  W2[3][3] = 0.9;
  W2[4][4] = 1.0;
  W2[5][5] = 1.1;

  return { W1, B1, W2, B2 };
}

export const coachModel = new SimpleMLP(8, 8, 6, 'cyclo_coach_nn_weights', generateCoachDefaultWeights);

// ==========================================================
// 2. VO2MAX MODEL DEFINITION
// ==========================================================
function generateVO2maxDefaultWeights() {
  const W1: number[][] = Array.from({ length: 4 }, () => new Array(6).fill(0));
  const B1: number[] = new Array(6).fill(0.0);
  const W2: number[][] = Array.from({ length: 6 }, () => new Array(1).fill(0));
  const B2: number[] = [0.2];

  for (let i = 0; i < 6; i++) {
    W1[0][i] = 0.8;
    W1[1][i] = -0.5;
    W1[2][i] = 0.7;
    W1[3][i] = -0.4;
    W2[i][0] = 0.5;
  }

  return { W1, B1, W2, B2 };
}

export const vo2maxModel = new SimpleMLP(4, 6, 1, 'cyclo_vo2max_weights', generateVO2maxDefaultWeights);

// ==========================================================
// 3. INJURY RISK MODEL DEFINITION
// ==========================================================
function generateInjuryDefaultWeights() {
  const W1: number[][] = Array.from({ length: 6 }, () => new Array(6).fill(0));
  const B1: number[] = new Array(6).fill(0.0);
  const W2: number[][] = Array.from({ length: 6 }, () => new Array(1).fill(0));
  const B2: number[] = [-0.15];

  for (let i = 0; i < 6; i++) {
    W1[0][i] = 0.2;
    W1[1][i] = 0.4;
    W1[2][i] = -0.6;
    W1[3][i] = 0.7;
    W1[4][i] = 0.9;
    W1[5][i] = 0.8;
    W2[i][0] = 0.5;
  }

  return { W1, B1, W2, B2 };
}

export const injuryModel = new SimpleMLP(6, 6, 1, 'cyclo_injury_nn_weights', generateInjuryDefaultWeights);


// ==========================================================
// CENTRALIZED BACKGROUND TRAINER SERVICE
// ==========================================================

export async function runBackgroundTraining(supabase: any, userId: string): Promise<boolean> {
  console.log(`Starting background training orchestrator for user: ${userId}`);
  
  try {
    // 1. Fetch user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    const weight = profile?.weight_kg || 75;
    const ftp = profile?.ftp_watts || 220;
    const goal = profile?.training_goal || 'general';

    // 2. Fetch recent datasets
    const { data: rides } = await supabase
      .from('rides')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });

    const { data: sleep } = await supabase
      .from('vigor_sleep')
      .select('*')
      .eq('user_id', userId)
      .order('logged_at', { ascending: false });



    const { data: workouts } = await supabase
      .from('kratos_workouts')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false });

    // Real daily step counts (Vigor) and logged food calories (Fuel), used below to
    // replace the previously-hardcoded dailySteps=8000 / calorieBalance=0 constants
    // in the training loops with actual per-day values where they exist.
    const { data: stepLogs } = await supabase
      .from('vigor_steps')
      .select('logged_at, step_count')
      .eq('user_id', userId)
      .order('logged_at', { ascending: false });

    const { data: foodLogs } = await supabase
      .from('fuel_logs')
      .select('logged_at, calories')
      .eq('user_id', userId)
      .order('logged_at', { ascending: false });

    const getStepsForDate = (dStr: string): number => {
      const rec = stepLogs?.find((s: any) => new Date(s.logged_at).toISOString().slice(0, 10) === dStr);
      // No steps logged for that day -> genuinely 0, not a fabricated "average day" guess.
      return rec ? Number(rec.step_count) || 0 : 0;
    };

    // Rough BMR heuristic (~1 kcal/kg body weight/day) — see the matching comment in
    // ZenithHubPage.tsx. Hub doesn't have Fuel's full calibrated TDEE model available,
    // so this only aims to give the training loop a real, non-fabricated directional
    // signal instead of a permanent hardcoded 0.
    const CALORIE_BALANCE_BMR_KCAL_PER_KG_PER_DAY = 24;
    const getCalorieBalanceForDate = (dStr: string, bodyWeightKg: number): number => {
      const dayLogs = foodLogs?.filter((f: any) => new Date(f.logged_at).toISOString().slice(0, 10) === dStr) || [];
      if (dayLogs.length === 0) return 0; // no logged nutrition for that day -> neutral, not fabricated
      const consumed = dayLogs.reduce((sum: number, f: any) => sum + Number(f.calories || 0), 0);
      const roughTdee = bodyWeightKg * CALORIE_BALANCE_BMR_KCAL_PER_KG_PER_DAY;
      return Math.round(consumed - roughTdee);
    };

    // Load weights
    await Promise.all([
      kratosOverloadModel.loadFromSupabase(supabase, userId),
      coachModel.loadFromSupabase(supabase, userId),
      vo2maxModel.loadFromSupabase(supabase, userId),
      injuryModel.loadFromSupabase(supabase, userId),
      dualSportFatigueModel.loadFromSupabase(supabase, userId),
      recoveryModel.loadFromSupabase(supabase, userId)
    ]);

    // Pre-calculate cardio TSB history from rides (CR1)
    const rideTSSList = (rides || []).map((r: any) => {
      let witha = r.metadata;
      if (typeof witha === 'string') {
        try { witha = JSON.parse(witha); } catch { witha = {}; }
      }
      return {
        date: Number(r.date),
        tss: Number(witha?.tss ?? witha?.hrTSS ?? 0)
      };
    }).filter((r: any) => r.tss > 0);

    const pmcPoints = computePMC(rideTSSList);

    const getCardioTsbForDate = (dateStr: string): number => {
      const targetTime = new Date(dateStr).setHours(0,0,0,0);
      const point = pmcPoints.find(p => {
        const pDate = new Date(p.date);
        pDate.setHours(0,0,0,0);
        return pDate.getTime() === targetTime;
      });
      return point?.tsb ?? 0;
    };

    // 3. Train Kratos Progressive Overload Model
    // Every model in this file is fitted with retrainFromScratch: samples are
    // collected first, then the model is reset to its priors and fitted to all of
    // them in one deterministic pass. Each of these used to apply its gradient
    // updates on top of whatever the previous run had left behind. Since this whole
    // routine re-runs on every page load AND on every realtime insert, replaying the
    // same history over and over kept nudging the weights further with no new
    // information - which is what made the dashboard's scores drift on their own
    // between refreshes, with nothing having been logged.
    //
    // Batching also collapses the network writes: 8 models persisting up to 31
    // times per run was the single largest contributor to Supabase API usage.
    if (workouts && workouts.length > 1) {
      const overloadSamples: { x: number[]; targets: number[] }[] = [];
      // Find successive workouts of the same routine/exercises and train the overload MLP
      for (let i = 0; i < workouts.length - 1; i++) {
        const currentW = workouts[i];
        const prevW = workouts[i + 1];

        // Fetch sleep quality logged on the day of current workout
        const wDate = new Date(currentW.started_at).toISOString().slice(0, 10);
        const daySleep = sleep?.find((s: any) => new Date(s.logged_at).toISOString().slice(0, 10) === wDate);
        const sleepQuality = daySleep?.quality || 75;

        // Use real cardio TSB calculated from rides PMC history (CR1)
        const cardioTsb = getCardioTsbForDate(currentW.started_at);

        // Parse volume progression
        const volumeDiff = Number(currentW.volume) - Number(prevW.volume);
        const increment = Math.max(0, volumeDiff / 100); // proxy to kg increment

        // Input: [pastSetsVolume/5000, weightProgression/10, sleepQuality/1.0, cardioTsbScaled/1.0, targetReps/20]
        const x = [
          Math.min(1.5, Number(prevW.volume) / 5000),
          Math.min(1.5, Math.max(-1.5, increment / 10)),
          Math.min(1.0, sleepQuality / 100),
          Math.max(0, Math.min(1, (cardioTsb + 50) / 100)),
          0.5 // default targetReps (10/20)
        ];

        const target = Math.max(0, Math.min(1, increment / 10));
        overloadSamples.push({ x, targets: [target] });
      }
      await kratosOverloadModel.retrainFromScratch(supabase, userId, overloadSamples);
    }

    // 4. Train Smart Coach Model
    if (rides && rides.length > 0) {
      // Basic PMC calculation for inputs
      let ctl = 45;
      let atl = 50;
      let tsb = -5;

      const lastRpe = 6; // default average RPE last 3 rides
      const goalIndex = ['general', 'climbing', 'speed', 'endurance'].indexOf(goal);

      const x = [
        Math.min(1.5, ctl / 100),
        Math.min(1.5, atl / 100),
        Math.max(0, Math.min(1, (tsb + 50) / 100)),
        goalIndex === 0 ? 1 : 0,
        goalIndex === 1 ? 1 : 0,
        goalIndex === 2 ? 1 : 0,
        goalIndex === 3 ? 1 : 0,
        Math.min(1.0, lastRpe / 10)
      ];

      // Smart coach trains on completed ride intensity mapping
      const recentRide = rides[0];
      let witha = recentRide.metadata;
      if (typeof witha === 'string') {
        try { witha = JSON.parse(witha); } catch { witha = {}; }
      }
      const tss = Number(witha?.tss ?? witha?.hrTSS ?? 50);
      
      let targetWorkout: typeof COACH_WORKOUTS[number] = 'endurance';
      if (tss < 35) targetWorkout = 'recovery';
      else if (tss < 70) targetWorkout = 'endurance';
      else if (tss < 110) targetWorkout = 'sweetspot';
      else targetWorkout = 'threshold';

      const targetIdx = COACH_WORKOUTS.indexOf(targetWorkout);
      const targets = new Array(6).fill(0.05);
      targets[targetIdx] = 0.95;

      await coachModel.retrainFromScratch(supabase, userId, [{ x, targets }], 20, 0.2);
    }

    if (rides && rides.length > 0) {
      const validRide = rides.find((r: any) => r.avg_power && r.avg_hr);
      if (validRide) {
        let witha = validRide.metadata;
        if (typeof witha === 'string') {
          try { witha = JSON.parse(witha); } catch { witha = {}; }
        }
        const best5mPower = Number(witha?.best_efforts?.m5 ?? ftp * 1.2);
        const actualVO2max = (10.8 * best5mPower / weight) + 7;

        const x = [
          Math.min(1.5, Number(validRide.avg_power || 180) / 500),
          Math.min(1.5, Number(validRide.avg_hr || 135) / 220),
          0.3, // HR recovery baseline
          Math.min(1.5, weight / 150)
        ];

        const target = Math.max(0, Math.min(1, (actualVO2max - 20) / 70));
        await vo2maxModel.retrainFromScratch(supabase, userId, [{ x, targets: [target] }]);
      }
    }

    // 5. Train Dual-Sport Fatigue Model (CR14)
    // Train on a 30-day daily stats window
    const fatigueSamples: { x: number[]; targets: number[] }[] = [];
    for (let dayOffset = 30; dayOffset >= 0; dayOffset--) {
      const d = new Date();
      d.setDate(d.getDate() - dayOffset);
      const dStr = d.toISOString().slice(0, 10);
      const dTime = d.setHours(0,0,0,0);
      
      const pmcOnDay = pmcPoints.find(p => {
        const pDate = new Date(p.date);
        pDate.setHours(0,0,0,0);
        return pDate.getTime() === dTime;
      });
      const cCTL = pmcOnDay?.ctl ?? 0;
      const cATL = pmcOnDay?.atl ?? 0;

      const start7d = new Date(d);
      start7d.setDate(start7d.getDate() - 7);
      const end7d = d;
      const recentWorkouts = workouts?.filter((w: any) => {
        const wDate = new Date(w.started_at);
        return wDate >= start7d && wDate <= end7d;
      }) || [];
      // Effort kg, not raw tonnage - the same discount the prediction path applies
      // (see kratosEffortVolume). Training on tonnage while serving on effort would
      // be a train/serve mismatch of exactly the kind this file has already had.
      const gymEffort7d = recentWorkouts.reduce((sum: number, w: any) => sum + kratosEffortVolume(w.volume, w.sets), 0);

      const daySleep = sleep?.find((s: any) => new Date(s.logged_at).toISOString().slice(0, 10) === dStr);
      const sleepQuality = daySleep?.quality_score || daySleep?.quality || 75;

      const dayRides = rides?.filter((r: any) => new Date(Number(r.date)).toISOString().slice(0, 10) === dStr) || [];
      const activeCalories = dayRides.reduce((sum: number, r: any) => {
        let witha = r.metadata;
        if (typeof witha === 'string') try { witha = JSON.parse(witha); } catch { witha = {}; }
        return sum + Number(witha?.calories ?? 0);
      }, 0);

      const dailySteps = getStepsForDate(dStr); // real logged steps for this day, 0 if unlogged (no fabricated baseline)

      const x = [
        cardioFreshness(cCTL, cATL),
        Math.min(1.5, cATL / 100),
        Math.min(1.5, gymEffort7d / GYM_VOLUME_HARD_WEEK_KG),
        Math.min(1.0, sleepQuality / 100),
        Math.min(1.0, (dailySteps * 7) / 100000),
        Math.min(1.5, activeCalories / 5000)
      ];

      const fatigueTarget = Math.max(0, Math.min(1.0, (cATL / 80 + (100 - sleepQuality) / 100 + gymEffort7d / GYM_VOLUME_HARD_WEEK_KG) / 3));
      fatigueSamples.push({ x, targets: [fatigueTarget] });
    }
    await dualSportFatigueModel.retrainFromScratch(supabase, userId, fatigueSamples);

    // 6. Train Unified Recovery Score Model (CR11)
    const recoverySamples: { x: number[]; targets: number[] }[] = [];
    for (let dayOffset = 30; dayOffset >= 0; dayOffset--) {
      const d = new Date();
      d.setDate(d.getDate() - dayOffset);
      const dStr = d.toISOString().slice(0, 10);
      const dTime = d.setHours(0,0,0,0);
      
      const pmcOnDay = pmcPoints.find(p => {
        const pDate = new Date(p.date);
        pDate.setHours(0,0,0,0);
        return pDate.getTime() === dTime;
      });
      const cCTL = pmcOnDay?.ctl ?? 0;
      const cATL = pmcOnDay?.atl ?? 0;

      const start7d = new Date(d);
      start7d.setDate(start7d.getDate() - 7);
      const end7d = d;
      const recentWorkouts = workouts?.filter((w: any) => {
        const wDate = new Date(w.started_at);
        return wDate >= start7d && wDate <= end7d;
      }) || [];
      // Effort kg, not raw tonnage - the same discount the prediction path applies
      // (see kratosEffortVolume). Training on tonnage while serving on effort would
      // be a train/serve mismatch of exactly the kind this file has already had.
      const gymEffort7d = recentWorkouts.reduce((sum: number, w: any) => sum + kratosEffortVolume(w.volume, w.sets), 0);

      const daySleep = sleep?.find((s: any) => new Date(s.logged_at).toISOString().slice(0, 10) === dStr);
      const sleepQuality = daySleep?.quality_score || daySleep?.quality || 75;
      const sleepDuration = (daySleep?.duration_minutes || 480) / 60;

      const dailySteps = getStepsForDate(dStr); // real logged steps for this day, 0 if unlogged (no fabricated baseline)
      const calorieBalance = getCalorieBalanceForDate(dStr, weight); // real logged intake vs rough TDEE, 0 if no food logged that day

      // Built by the model's own function, not a copy of its scaling here - see
      // buildRecoveryFeatureVector. This block previously hardcoded the divisors
      // and had already drifted from the predictor on gym volume.
      const recoveryInput = {
        cardioCTL: cCTL,
        cardioATL: cATL,
        sleepQuality,
        sleepDurationHours: sleepDuration,
        gymEffort7d,
        dailySteps,
        calorieBalance,
        bodyWeight: weight
      };
      const x = buildRecoveryFeatureVector(recoveryInput);

      // The target is recoveryHeuristic itself - the SAME formula the model's
      // starting weights reproduce. It used to be a separate hand-written
      // expression here, and it disagreed with those priors about both the
      // ranking and the scaling of every signal, so each training pass dragged
      // the displayed score away from where the defaults put it. That tug-of-war
      // is why the number kept reading low and kept coming back after each fix.
      //
      // Three concrete faults it also had, each of which capped the achievable
      // score on its own: freshness scaled raw TSB onto a fixed band topping out
      // at TSB +50, unreachable for anyone without a big cardio base; the gym term
      // capped at 15,000 kg a week, so a serious lifter forfeited it permanently;
      // and the gym term counted raw tonnage, teaching an easy high-tonnage week
      // as though it had been a hard one.
      const recoveryTarget = recoveryHeuristic(recoveryInput);

      recoverySamples.push({ x, targets: [recoveryTarget] });
    }
    await recoveryModel.retrainFromScratch(supabase, userId, recoverySamples);

    console.log(`Background training successfully completed for all models of user: ${userId}`);
    return true;
  } catch (err) {
    console.error("Error running background training loops:", err);
    return false;
  }
}
