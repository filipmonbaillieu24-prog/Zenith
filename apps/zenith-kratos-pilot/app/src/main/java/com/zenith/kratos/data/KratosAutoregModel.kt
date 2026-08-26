package com.zenith.kratos.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.double

object KratosAutoregModel {
    private var W1: List<List<Double>> = emptyList()
    private var B1: List<Double> = emptyList()
    private var W2: List<List<Double>> = emptyList()
    private var B2: List<Double> = emptyList()

    fun isLoaded(): Boolean {
        return W1.isNotEmpty() && B1.isNotEmpty() && W2.isNotEmpty() && B2.isNotEmpty()
    }

    fun loadWeightsFromJson(jsonStr: String) {
        try {
            val parser = Json { ignoreUnknownKeys = true }
            val root = parser.parseToJsonElement(jsonStr)
            val array = root.jsonArray
            if (array.isNotEmpty()) {
                val weightsObj = array[0].jsonObject["weights"]?.jsonObject ?: return
                
                // Parse W1
                W1 = weightsObj["W1"]?.jsonArray?.map { row ->
                    row.jsonArray.map { it.jsonPrimitive.double }
                } ?: emptyList()
                
                // Parse B1
                B1 = weightsObj["B1"]?.jsonArray?.map { it.jsonPrimitive.double } ?: emptyList()
                
                // Parse W2
                W2 = weightsObj["W2"]?.jsonArray?.map { row ->
                    row.jsonArray.map { it.jsonPrimitive.double }
                } ?: emptyList()
                
                // Parse B2
                B2 = weightsObj["B2"]?.jsonArray?.map { it.jsonPrimitive.double } ?: emptyList()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun predict(x: DoubleArray): Double {
        if (!isLoaded()) {
            return 0.5 // default fallback
        }

        val h = DoubleArray(B1.size)
        for (col in B1.indices) {
            var sum = 0.0
            for (row in x.indices) {
                sum += x[row] * W1[row][col]
            }
            h[col] = Math.max(0.0, sum + B1[col]) // ReLU
        }

        var sumOut = 0.0
        for (row in h.indices) {
            sumOut += h[row] * W2[row][0]
        }
        val y = 1.0 / (1.0 + Math.exp(-(sumOut + B2[0]))) // Sigmoid
        return y
    }

    fun predictWeight(
        setIndex: Int,
        prevWeight: Double,
        prevReps: Int,
        prevRir: Int,
        restSeconds: Int,
        targetReps: Int,
        targetRir: Int
    ): Double {
        // This feature vector must exactly match shared/ml/SharedModels.ts's
        // buildAutoregFeatureVector() (6 inputs, same scales) - the persisted
        // weights this model loads are trained there and shared via the
        // ml_weights table, so a different shape/scale here silently turns
        // every on-device prediction into noise regardless of how good the
        // trained weights are. Previously this built a 5-element vector using
        // raw prevRir instead of rirDelta and different scale divisors, and
        // predict()'s forward pass only ever read the first 5 of W1's 6 rows -
        // it "worked" only because the safety-band clamp downstream (see
        // TrackerScreen.kt) bounds the final output regardless.
        val rirDelta = (prevRir - targetRir).toDouble()
        // Same ratio shape as computeAutoregRestRatio() in SharedModels.ts,
        // with recommendedRestSeconds defaulted to its own 120s default:
        // restSeconds here (TrackerScreen's `totalRest`) is already the app's
        // computed recommended rest for the next set (base rest scaled by
        // cardio stress factor), not an observed "actual rest taken" reading -
        // this call fires right when a set completes, before any rest
        // countdown starts, so there's no real elapsed-rest figure to compare
        // it against yet.
        val restRatio = Math.min(1.5, Math.max(0.2, restSeconds / Math.max(45.0, 120.0)))
        // Sleep quality isn't tracked in this app (unlike Kratos web, which
        // reads vigor_sleep) - 80.0 matches predictAutoregWeight's own default
        // in SharedModels.ts for the same "no reading available" case.
        val sleepQuality = 80.0

        val x = doubleArrayOf(
            Math.min(1.0, setIndex / 10.0),
            Math.min(1.5, prevWeight / 400.0),
            Math.min(1.5, prevReps / 30.0),
            Math.max(-1.5, Math.min(1.5, rirDelta / 5.0)),
            restRatio,
            Math.min(1.0, sleepQuality / 100.0)
        )

        val y = predict(x)
        val predictedE1RM = y * 400.0
        val repsToFailure = targetReps + targetRir
        val predictedWeight = predictedE1RM / (1.0 + repsToFailure / 30.0)
        return Math.max(0.0, predictedWeight)
    }
}
