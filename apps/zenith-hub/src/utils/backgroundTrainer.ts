import { SimpleMLP, recoveryModel, buildRecoveryFeatureVector, recoveryHeuristic, fetchReadiness, feltToTarget, kratosEffortVolume, toDateKeyFromDate } from '@zenith/shared';
import { computePMC } from './pmc';

// ==========================================================
// 1. SMART COACH MODEL DEFINITION
// ==========================================================



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



// ==========================================================
// CENTRALIZED BACKGROUND TRAINER SERVICE
// ==========================================================

// Day bucketing here is the ecosystem's LOCAL calendar day (shared/dateKey.ts),
// not the UTC one this file used to use. Sleep and step rows are written at 12:00
// UTC so they landed on the same day either way, but ride timestamps are real
// moments - so a ride before 02:00 in UTC+2, or after 19:00 in UTC-5, was trained
// against the wrong night's sleep. The day cursor was also formatted with
// toISOString() while carrying the current time of day, which shifted the whole
// 31-day window depending on what time the page happened to load.
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
      const rec = stepLogs?.find((s: any) => toDateKeyFromDate(new Date(s.logged_at)) === dStr);
      // No steps logged for that day -> genuinely 0, not a fabricated "average day" guess.
      return rec ? Number(rec.step_count) || 0 : 0;
    };

    // Rough BMR heuristic (~1 kcal/kg body weight/day) — see the matching comment in
    // ZenithHubPage.tsx. Hub doesn't have Fuel's full calibrated TDEE model available,
    // so this only aims to give the training loop a real, non-fabricated directional
    // signal instead of a permanent hardcoded 0.
    const CALORIE_BALANCE_BMR_KCAL_PER_KG_PER_DAY = 24;
    const getCalorieBalanceForDate = (dStr: string, bodyWeightKg: number): number => {
      const dayLogs = foodLogs?.filter((f: any) => toDateKeyFromDate(new Date(f.logged_at)) === dStr) || [];
      if (dayLogs.length === 0) return 0; // no logged nutrition for that day -> neutral, not fabricated
      const consumed = dayLogs.reduce((sum: number, f: any) => sum + Number(f.calories || 0), 0);
      const roughTdee = bodyWeightKg * CALORIE_BALANCE_BMR_KCAL_PER_KG_PER_DAY;
      return Math.round(consumed - roughTdee);
    };

    // Load weights
    await Promise.all([
      vo2maxModel.loadFromSupabase(supabase, userId),
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

    // 3. Progressive overload: no longer a model.
    //
    // It was trained here on samples whose target was `volumeDiff / 100`, described in
    // the code as a "proxy to kg increment" - the difference in total session tonnage,
    // relabelled as kilograms on the bar. Two sessions 500 kg apart became "add 5 kg",
    // though that difference is just as likely to be an extra set or more reps at the
    // same load. The inputs were scaled one way here and another way in the prediction
    // path, and the sleep quality read `daySleep?.quality` where the column is
    // `quality_score`, so every sample it ever saw carried a constant 75.
    //
    // Whether to add load is a decision rule with an interaction in it - clear the rep
    // target AND have reps in reserve - and these networks are a function of one
    // weighted sum. It could not have been represented however it was trained. It is
    // now progressionSteps() in shared/ml/models/strengthModels.ts, which is eight
    // lines anyone can read and disagree with.

    // 4. Smart Coach: trained by Aero, not here.
    //
    // This used to train cyclo_coach_nn_weights - the SAME storage key Aero's coach
    // model uses - on three hardcoded constants:
    //
    //     let ctl = 45; let atl = 50; let tsb = -5;   // "Basic PMC calculation"
    //     const lastRpe = 6;                          // "default average RPE"
    //
    // None of them were calculated. This file computes a real PMC a few lines above
    // and ignored it; the athlete's actual figures are nearer 15 / 25 / -10. The
    // target was a relabelling of the LAST ride's TSS into a workout bucket, so it
    // taught the model to recommend repeating whatever was just done, and it trained
    // on exactly one sample with an identical input vector every run.
    //
    // Hub then never predicted from it. Aero does, and Aero trains the same model on
    // the athlete's real CTL/ATL/TSB, real recent RPE, and the workout they actually
    // chose - which is real supervised feedback. So the only effect this had was to
    // periodically overwrite a properly trained model with one fitted to three made
    // up numbers.
    //
    // One owner per model. Aero owns this one.

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
    // 5. Combined fatigue: removed.
    //
    // This model was retrained on every login and its prediction was read by nothing -
    // no app, no page, no component. It also learned from a target computed as a
    // formula over its own inputs, which teaches a network to recite rather than to
    // observe. Hub already answers "how recovered am I" with the recovery score, which
    // trains against how the athlete said they actually felt.

    // 6. Train Unified Recovery Score Model (CR11)
    //
    // Where the athlete has said how they actually felt, that is the target. Where
    // they have not, the heuristic stands in.
    //
    // This is the difference between a model that learns and one that recites. Every
    // target here used to be recoveryHeuristic - a formula over the model's own
    // inputs - and a network fitted to a formula over its own inputs cannot beat the
    // formula, only approximate it less exactly. Real answers give it something the
    // formula does not contain: where THIS athlete departs from the average.
    //
    // No weighting is needed to phase it in. Early on, days with an answer are a
    // small minority of the training set and the heuristic naturally dominates; as
    // answers accumulate they become the majority on their own.
    const readiness = await fetchReadiness(supabase, userId, 60);
    const recoverySamples: { x: number[]; targets: number[] }[] = [];
    for (let dayOffset = 30; dayOffset >= 0; dayOffset--) {
      const d = new Date();
      d.setDate(d.getDate() - dayOffset);
      const dStr = toDateKeyFromDate(d);
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

      const daySleep = sleep?.find((s: any) => toDateKeyFromDate(new Date(s.logged_at)) === dStr);
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
      const feltTarget = feltToTarget(readiness[dStr]?.felt ?? NaN);
      const recoveryTarget = feltTarget ?? recoveryHeuristic(recoveryInput);

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
