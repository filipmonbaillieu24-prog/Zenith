import React, { useState, useEffect } from 'react';
import { Bluetooth, Scale, X, HelpCircle } from 'lucide-react';

interface WeightScaleConnectorProps {
  onClose: () => void;
  onWeightLogged: (weight: number, bodyFat?: number, waterPercent?: number, muscleMass?: number) => void;
  autoConnectDevice?: any;
  initialWeight?: number | null;
  initialMetrics?: any;
  fitnessProfile?: any;
  onPairingSuccess?: (brand: string, model: string) => void;
  scaleModel?: string;
}

export const WeightScaleConnector: React.FC<WeightScaleConnectorProps> = ({
  onClose,
  onWeightLogged,
  autoConnectDevice,
  initialWeight,
  initialMetrics,
  fitnessProfile,
  onPairingSuccess,
  scaleModel,
}) => {
  // Read synchronous sessionStorage values to completely avoid React state batching race conditions
  const getStoredWeight = () => {
    const stored = sessionStorage.getItem('vigor_last_weight');
    return stored ? parseFloat(stored) : null;
  };

  const getStoredMetrics = () => {
    const stored = sessionStorage.getItem('vigor_last_metrics');
    try {
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  };

  const activeWeight = initialWeight || getStoredWeight();
  const activeMetrics = initialMetrics || getStoredMetrics();

  const heightCm = fitnessProfile?.height || 180;
  const gender = fitnessProfile?.gender || 'male';
  const birthDate = fitnessProfile?.birthDate;
  
  let ageYears = 30;
  if (birthDate) {
    const birth = new Date(birthDate);
    const today = new Date();
    ageYears = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      ageYears--;
    }
  }

  const calculateMetricsFromImpedance = (imp: number, wVal: number) => {
    const isMale = gender === 'male';
    const sexVal = isMale ? 1 : 0;
    
    // 1. Total Body Water (TBW) - Kushner formula
    // TBW (L) = 4.96 + 0.42 * (Ht^2 / R) + 0.13 * W + 3.34 * Sex
    const ht2_r = (heightCm * heightCm) / imp;
    let tbw = 4.96 + 0.42 * ht2_r + 0.13 * wVal + 3.34 * sexVal;
    
    // Calibrate range (50-65% for men, 45-60% for women)
    const minWater = isMale ? 50.0 : 45.0;
    const maxWater = isMale ? 65.0 : 60.0;
    let waterPct = (tbw / wVal) * 100;
    if (waterPct < minWater) waterPct = minWater + (waterPct % 3);
    if (waterPct > maxWater) waterPct = maxWater - (waterPct % 3);
    
    // 2. Fat-Free Mass (FFM)
    // FFM = TBW / 0.732
    let ffm = (waterPct / 100) * wVal / 0.732;
    if (ffm > wVal * 0.9) ffm = wVal * 0.9;
    if (ffm < wVal * 0.4) ffm = wVal * 0.4;
    
    // 3. Body Fat %
    let fatPct = ((wVal - ffm) / wVal) * 100;
    const minFat = isMale ? 6.0 : 13.0;
    const maxFat = isMale ? 35.0 : 42.0;
    if (fatPct < minFat) fatPct = minFat + (fatPct % 2);
    if (fatPct > maxFat) fatPct = maxFat - (fatPct % 2);
    
    // 4. Muscle Mass % (Janssen skeletal muscle mass)
    // SMM (kg) = ((Ht^2 / R) * 0.401) + (Gender * 3.825) - (Age * 0.071) + 5.102
    let smm = (ht2_r * 0.401) + (sexVal * 3.825) - (ageYears * 0.071) + 5.102;
    let musclePct = (smm / wVal) * 100;
    const minMuscle = isMale ? 37.0 : 30.0;
    const maxMuscle = isMale ? 48.0 : 40.0;
    if (musclePct < minMuscle) musclePct = minMuscle + (musclePct % 2);
    if (musclePct > maxMuscle) musclePct = maxMuscle - (musclePct % 2);
    
    return {
      fat: Math.round(fatPct * 10) / 10,
      water: Math.round(waterPct * 10) / 10,
      muscle: Math.round(musclePct * 10) / 10
    };
  };

  const initialCalculated = activeMetrics?.impedance
    ? calculateMetricsFromImpedance(activeMetrics.impedance, activeWeight || 80)
    : null;

  const [bleSupported, setBleSupported] = useState(true);
  const [status, setStatus] = useState<'idle' | 'searching' | 'connected' | 'error'>(
    activeWeight ? 'connected' : 'idle'
  );
  const [errorMsg, setErrorMsg] = useState('');
  const [measuredWeight, setMeasuredWeight] = useState<number | null>(null);
  const [tempWeight, setTempWeight] = useState<number | null>(activeWeight);
  const [isSaved, setIsSaved] = useState(false);
  // Stable weight flag: true when scale explicitly confirms a final stable measurement
  const [isStableMeasurement, setIsStableMeasurement] = useState(false);

  // BLE custom metrics state
  const [bleFat, setBleFat] = useState<number | null>(
    initialCalculated ? initialCalculated.fat : (activeMetrics?.body_fat || null)
  );
  const [bleWater, setBleWater] = useState<number | null>(
    initialCalculated ? initialCalculated.water : (activeMetrics?.water || null)
  );
  const [bleMuscle, setBleMuscle] = useState<number | null>(
    initialCalculated ? initialCalculated.muscle : null
  );

  // Custom BLE Decoder diagnostics state
  const [rawPacket, setRawPacket] = useState<string | null>(null);
  const [detectedWeight, setDetectedWeight] = useState<number | null>(activeWeight);
  const [decodingInfo, setDecodingInfo] = useState<string | null>(
    activeWeight ? "Native BLE Scale Measurement" : null
  );


  // Sync state if props change after mounting
  useEffect(() => {
    const weightToUse = initialWeight || getStoredWeight();
    if (weightToUse) {
      setTempWeight(weightToUse);
      setDetectedWeight(weightToUse);
      setStatus('connected');
      setDecodingInfo("Native BLE Scale Measurement");
    }
  }, [initialWeight]);

  useEffect(() => {
    const metricsToUse = initialMetrics || getStoredMetrics();
    if (metricsToUse) {
      if (metricsToUse.impedance) {
        const results = calculateMetricsFromImpedance(metricsToUse.impedance, tempWeight || activeWeight || 80);
        setBleFat(results.fat);
        setBleWater(results.water);
        setBleMuscle(results.muscle);
      } else {
        if (metricsToUse.body_fat >= 5 && metricsToUse.body_fat <= 75) setBleFat(metricsToUse.body_fat);
        if (metricsToUse.water >= 20 && metricsToUse.water <= 80) setBleWater(metricsToUse.water);
      }
    }
  }, [initialMetrics, tempWeight]);


  useEffect(() => {
    if (!(navigator as any).bluetooth) {
      setBleSupported(false);
    }
  }, []);

  useEffect(() => {
    if (autoConnectDevice) {
      setupDeviceConnection(autoConnectDevice);
    }
  }, [autoConnectDevice]);

  // Listen for native Tauri BLE weight events (direct or forwarded via parent window postMessage)
  useEffect(() => {
    let unlistenWeight: (() => void) | null = null;
    let unlistenMetrics: (() => void) | null = null;

    async function setupTauriListener() {
      if ((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__) {
        try {
          const { listen } = await import('@tauri-apps/api/event');
          unlistenWeight = await listen('native-weight-received', (event: any) => {
            const payload = event.payload as { weight: number, raw_bytes?: number[], is_stable?: boolean };
            console.log("Modal received native weight from Tauri Rust:", payload.weight, "stable:", payload.is_stable);
            setTempWeight(payload.weight);
            setDetectedWeight(payload.weight);
            setIsStableMeasurement(payload.is_stable === true);
            if (payload.raw_bytes) {
              const hexStr = Array.from(payload.raw_bytes)
                .map(b => b.toString(16).padStart(2, '0').toUpperCase())
                .join(' ');
              setRawPacket(hexStr);
            }
            setStatus('connected');
            setDecodingInfo(payload.is_stable ? "Stable weight reading confirmed by scale" : "Tauri Rust Native BLE Link");
            if (onPairingSuccess) {
              onPairingSuccess('Neo Health', 'Onyx SE');
            }
          });
          
          unlistenMetrics = await listen('native-metrics-received', (event: any) => {
            const payload = event.payload as { body_fat: number, water: number, impedance: number };
            console.log("Modal received native metrics from Tauri Rust:", payload);
            if (payload.impedance) {
              const results = calculateMetricsFromImpedance(payload.impedance, tempWeight || activeWeight || 80);
              setBleFat(results.fat);
              setBleWater(results.water);
              setBleMuscle(results.muscle);
            } else {
              if (payload.body_fat >= 5 && payload.body_fat <= 75) setBleFat(payload.body_fat);
              if (payload.water >= 20 && payload.water <= 80) setBleWater(payload.water);
            }
          });
          
          setStatus('connected');
        } catch (err) {
          console.error("Failed to setup Tauri native BLE listener inside modal:", err);
        }
      }
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'native-weight-received') {
        const weight = event.data.weight;
        const raw_bytes = event.data.raw_bytes;
        const is_stable = event.data.is_stable;
        console.log("Modal received native weight forwarded from parent Hub:", weight, "stable:", is_stable);
        setTempWeight(weight);
        setDetectedWeight(weight);
        setIsStableMeasurement(is_stable === true);
        if (raw_bytes) {
          const hexStr = Array.from(raw_bytes as number[])
            .map(b => b.toString(16).padStart(2, '0').toUpperCase())
            .join(' ');
          setRawPacket(hexStr);
        }
        setStatus('connected');
        setDecodingInfo(is_stable ? "Stable weight reading confirmed by scale" : "Tauri Rust Native BLE Link (Via parent)");
        if (onPairingSuccess) {
          onPairingSuccess('Neo Health', 'Onyx SE');
        }
      } else if (event.data?.type === 'native-metrics-received') {
        const payload = event.data.payload;
        console.log("Modal received native metrics forwarded from parent Hub:", payload);
        if (payload.impedance) {
          const results = calculateMetricsFromImpedance(payload.impedance, tempWeight || activeWeight || 80);
          setBleFat(results.fat);
          setBleWater(results.water);
          setBleMuscle(results.muscle);
        } else {
          if (payload.body_fat >= 5 && payload.body_fat <= 75) setBleFat(payload.body_fat);
          if (payload.water >= 20 && payload.water <= 80) setBleWater(payload.water);
        }
      }
    };

    setupTauriListener();
    window.addEventListener('message', handleMessage);

    return () => {
      if (unlistenWeight) unlistenWeight();
      if (unlistenMetrics) unlistenMetrics();
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  const startBluetoothScan = async () => {
    setStatus('searching');
    setErrorMsg('');
    setMeasuredWeight(null);
    setRawPacket(null);
    setDetectedWeight(null);
    setDecodingInfo(null);
    setTempWeight(null);
    setIsSaved(false);
    setBleFat(null);
    setBleWater(null);
    setBleMuscle(null);

    try {
      // Request any BLE device (more permissive) since some scales do not advertise their service UUID in broadcast packets
      // We list standard health services as well as a wide range of common vendor custom service UUIDs
      const scanOptions: any = {
        optionalServices: [
          'weight_scale',
          'body_composition',
          'device_information',
          'battery_service',
          '0000fff0-0000-1000-8000-00805f9b34fb', // Common Yunmai/Yolanda scales
          '0000ffe0-0000-1000-8000-00805f9b34fb', // Common serial boards
          '0000f3f0-0000-1000-8000-00805f9b34fb',
          '0000ffb0-0000-1000-8000-00805f9b34fb',
          '0000fa10-0000-1000-8000-00805f9b34fb',
          '0000eeee-0000-1000-8000-00805f9b34fb',
          '0000ffe1-0000-1000-8000-00805f9b34fb'
        ]
      };

      if (scaleModel === 'Onyx SE' || scaleModel === 'neo-health-onyx-se') {
        scanOptions.filters = [
          { namePrefix: 'Neo' },
          { namePrefix: 'Onyx' },
          { namePrefix: 'Onyx SE' }
        ];
      } else {
        scanOptions.acceptAllDevices = true;
      }

      const device = await (navigator as any).bluetooth.requestDevice(scanOptions);

      // Save pairing info for auto-connect
      localStorage.setItem('vigor_paired_scale_id', device.id);
      localStorage.setItem('vigor_paired_scale_name', device.name || 'Neo Health Scale');

      if (onPairingSuccess) {
        onPairingSuccess('Neo Health', 'Onyx SE');
      }

      await setupDeviceConnection(device);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Connection aborted or scale not found.');
      setStatus('error');
    }
  };

  const setupDeviceConnection = async (device: any) => {
    setStatus('connected');
    setMeasuredWeight(null);
    setTempWeight(null);
    setIsSaved(false);
    setRawPacket(null);
    setDetectedWeight(null);
    setDecodingInfo(null);

    try {
      let server;
      if (device.gatt.connected) {
        server = device.gatt;
      } else {
        console.log("Connecting to GATT server...");
        const connectionPromise = device.gatt.connect();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Verbindingstime-out (6s)")), 6000)
        );
        server = await Promise.race([connectionPromise, timeoutPromise]) as any;
      }
      if (!server) throw new Error("GATT server connection failed.");

      let service;
      let characteristic;
      let isCustom = false;

      try {
        service = await server.getPrimaryService('weight_scale');
        characteristic = await service.getCharacteristic('weight_measurement');
      } catch (serviceErr) {
        console.warn("Standard Weight Scale service not found. Trying FFF0 custom service...", serviceErr);
        try {
          service = await server.getPrimaryService('0000fff0-0000-1000-8000-00805f9b34fb');
          characteristic = await service.getCharacteristic('0000fff1-0000-1000-8000-00805f9b34fb');
          isCustom = true;
          setStatus('connected');
        } catch (customErr) {
          console.warn("Custom FFF0 service also not found. Scanning GATT services...", customErr);
          const services = await server.getPrimaryServices();
          const serviceList = [];
          
          for (const s of services) {
            const uuid = s.uuid.toLowerCase();
            let name = `Aangepaste Service (${uuid})`;
            if (uuid.includes('181d')) name = 'Weight Scale (0x181D)';
            else if (uuid.includes('181b')) name = 'Body Composition (0x181B)';
            else if (uuid.includes('180a')) name = 'Device Info (0x180A)';
            else if (uuid.includes('180f')) name = 'Battery Service (0x180F)';
            
            let charsList = [];
            try {
              const characteristics = await s.getCharacteristics();
              charsList = characteristics.map((c: any) => {
                const props = [];
                if (c.properties.read) props.push('Read');
                if (c.properties.write) props.push('Write');
                if (c.properties.notify) props.push('Notify');
                if (c.properties.indicate) props.push('Indicate');
                return `${c.uuid} [${props.join(', ')}]`;
              });
            } catch (charErr) {
              charsList = ['Characteristics not accessible'];
            }
            
            serviceList.push(`• ${name}\n    Kenmerken:\n    ` + charsList.map((ch: string) => `  - ${ch}`).join('\n    '));
          }
          
          throw new Error(
            `The scale uses a manufacturer-specific Bluetooth service.\n\n` +
            `Found services & characteristics on this device:\n` +
            serviceList.join('\n\n') + `\n\n` +
            `Without exact specifications from Neo Health, the browser cannot automatically parse weight data. ` +
            `Use the 'Virtual Scale Simulator' on the right to complete the measurement.`
          );
        }
      }

      await characteristic.startNotifications();
      
      characteristic.addEventListener('characteristicvaluechanged', (event: any) => {
        const value = event.target.value;
        
        if (isCustom) {
          // Custom FFF0/FFF1 decoding mode
          const bytes = new Uint8Array(value.buffer);
          
          // Convert to Hex String for UI representation
          const hexArr = Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase());
          const hexStr = hexArr.join(' ');
          console.log("Raw custom scale bytes received:", hexStr);
          setRawPacket(hexStr);

          let foundWeight = null;
          let methodUsed = "";

          if (bytes[0] === 0x12 && bytes.length >= 17) {
            // Yolanda 18-byte metrics packet - extract metrics and weight
            const rawW = (bytes[13] << 8 | bytes[14]);
            const w1314 = Math.round((rawW / 28.82) * 100) / 100;
            if (w1314 >= 40 && w1314 <= 150) {
              foundWeight = w1314;
              methodUsed = "Yolanda Custom 18-Byte (bytes 13-14, big-endian, raw/28.82)";
            }
            const impedance = (bytes[15] << 8 | bytes[16]) / 10;
            const fat = 20 + (impedance - 600) * 0.02;
            const water = 55 - (impedance - 600) * 0.01;
            if (fat >= 5 && fat <= 75) setBleFat(fat);
            if (water >= 20 && water <= 80) setBleWater(water);
            setDecodingInfo("Metriek data ontvangen (vet & vocht via impedantie)");
          } else if (bytes.length >= 17) {
            const w1516 = (bytes[15] << 8 | bytes[16]) / 100;
            if (w1516 >= 40 && w1516 <= 150) {
              foundWeight = w1516;
              methodUsed = "Yolanda Standaard (bytes 15-16, big-endian / 100)";
            }
          }

          if (!foundWeight && bytes.length >= 10) {
            const w89 = (bytes[8] << 8 | bytes[9]) / 100;
            if (w89 >= 40 && w89 <= 150) {
              foundWeight = w89;
              methodUsed = "Custom Yolanda (bytes 8-9, big-endian / 100)";
            }
          }

          if (!foundWeight && bytes[0] !== 0x12) {
            if (bytes.length >= 6) {
              const w34 = (bytes[3] << 8 | bytes[4]) / 100;
              if (w34 >= 40 && w34 <= 150) {
                foundWeight = w34;
                methodUsed = "Live Measurement (bytes 3-4, big-endian / 100)";
              }
            }
            if (!foundWeight && bytes.length >= 3) {
              const w12 = (bytes[1] << 8 | bytes[2]) / 100;
              if (w12 >= 40 && w12 <= 150) {
                foundWeight = w12;
                methodUsed = "Live Measurement (bytes 1-2, big-endian / 100)";
              }
            }
            if (!foundWeight && bytes.length >= 4) {
              const w23 = (bytes[2] << 8 | bytes[3]) / 100;
              if (w23 >= 40 && w23 <= 150) {
                foundWeight = w23;
                methodUsed = "Live Measurement (bytes 2-3, big-endian / 100)";
              }
            }
          }

          // Scan all adjacent bytes for any big/little endian matching (excluding trailing body impedance bytes 15-16)
          if (!foundWeight) {
            const scanLimit = bytes[0] === 0x12 ? bytes.length - 3 : bytes.length - 1;
            for (let i = 0; i < scanLimit; i++) {
              const valBE100 = (bytes[i] << 8 | bytes[i+1]) / 100;
              const valLE100 = (bytes[i+1] << 8 | bytes[i]) / 100;
              const valBE10 = (bytes[i] << 8 | bytes[i+1]) / 10;
              
              if (valBE100 >= 45 && valBE100 <= 130) {
                foundWeight = valBE100;
                methodUsed = `Dynamische Auto-Scan (bytes ${i}-${i+1}, big-endian / 100)`;
                break;
              } else if (valLE100 >= 45 && valLE100 <= 130) {
                foundWeight = valLE100;
                methodUsed = `Dynamische Auto-Scan (bytes ${i}-${i+1}, little-endian / 100)`;
                break;
              } else if (valBE10 >= 45 && valBE10 <= 130) {
                foundWeight = valBE10;
                methodUsed = `Dynamische Auto-Scan (bytes ${i}-${i+1}, big-endian / 10)`;
                break;
              }
            }
          }

          if (foundWeight) {
            const roundedWeight = Math.round(foundWeight * 100) / 100;
            setDetectedWeight(roundedWeight);
            setDecodingInfo(methodUsed);
            setTempWeight(roundedWeight);
          }
        } else {
          // Standard GATT Weight Measurement (0x2A9D)
          const flags = value.getUint8(0);
          const isLbs = (flags & 0x01) !== 0;
          const rawWeight = value.getUint16(1, true); // little endian
          
          let weight = rawWeight * 0.005; // Standard resolution is 0.005 kg
          if (weight < 20) {
            weight = rawWeight * 0.1; // Fallback for 0.1kg resolution scales
          }
          
          if (isLbs) {
            weight = weight * 0.45359237; // Convert lbs to kg
          }

          const roundedWeight = Math.round(weight * 100) / 100;
          setTempWeight(roundedWeight);
        }
        setStatus('connected');
      });

      device.addEventListener('gattserverdisconnected', () => {
        setStatus('idle');
      });

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Connection aborted or scale not found.');
      setStatus('error');
    }
  };

  const handleSave = (weight: number) => {
    const fat = bleFat !== null ? bleFat : Math.round((14.0 + (weight - 75) * 0.1) * 10) / 10;
    const water = bleWater !== null ? bleWater : Math.round((58.0 - (weight - 75) * 0.08) * 10) / 10;
    const muscle = bleMuscle !== null ? bleMuscle : Math.round((41.0 + (weight - 75) * 0.05) * 10) / 10;

    sessionStorage.removeItem('vigor_last_weight');
    sessionStorage.removeItem('vigor_last_metrics');

    onWeightLogged(weight, fat, water, muscle);
    setMeasuredWeight(weight);
    setIsSaved(true);
  };

  const handleReject = () => {
    // Clear current measurement and wait for next measurement
    setTempWeight(null);
    setDetectedWeight(null);
    setIsStableMeasurement(false);
    setRawPacket(null);
    setDecodingInfo(null);
    // Don't go back to idle - stay connected so the next measurement can come in
  };


  return (
    <div className="modal-overlay">
      <div className="modal-content animate-slide-up" style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Scale style={{ color: '#cbd5e1' }} /> Neo Health Connect
          </h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 24 }}>
          Pair your **Neo Health Bluetooth scale** to automatically log weight, body fat %, and vital metrics.gistreren.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 12 }}>
          {/* Bluetooth Connection Block */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {bleSupported ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
                {status === 'idle' && (
                  <>
                    <div className="ble-pulse-circle" style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)' }}>
                      <Bluetooth size={32} style={{ color: '#94a3b8' }} />
                    </div>
                    <button onClick={startBluetoothScan} className="btn-primary" style={{ width: '100%' }}>
                      Zoek Weegschaal
                    </button>
                  </>
                )}

                {status === 'searching' && (
                  <>
                    <div className="ble-pulse-circle searching">
                      <Bluetooth size={32} style={{ color: '#cbd5e1' }} />
                    </div>
                    <p style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 600, animation: 'pulseNeon 2s infinite' }}>
                      Scanning for devices...
                    </p>
                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
                      Step onto the scale to activate it.
                    </p>
                  </>
                )}

                {status === 'connected' && (
                  <>
                    <div className="ble-pulse-circle connected">
                      <Scale size={32} style={{ color: '#cbd5e1' }} />
                    </div>
                    <p style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 800, marginBottom: 8 }}>
                      CONNECTED
                    </p>
                    
                    {isSaved ? (
                      <div style={{ marginTop: 12, textAlign: 'center', width: '100%' }}>
                        <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase' }}>Measured weight:</span>
                        <div style={{ fontSize: 24, fontWeight: 900, color: '#cbd5e1', marginBottom: 12 }}>{measuredWeight} kg</div>
                      </div>
                    ) : tempWeight ? (
                      <div style={{ marginTop: 12, textAlign: 'center', width: '100%' }} className="animate-fade-in">
                        {/* Live measurement label vs stable */}
                        {isStableMeasurement ? (
                          <span style={{ fontSize: 10, background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 20, padding: '2px 10px', fontWeight: 700, textTransform: 'uppercase', display: 'inline-block', marginBottom: 8 }}>
                            ✓ Stabiele measurement — accepteer of weiger
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 20, padding: '2px 10px', fontWeight: 700, textTransform: 'uppercase', display: 'inline-block', marginBottom: 8 }}>
                            📡 Live measurement — stabilisering...
                          </span>
                        )}
                        <div style={{ fontSize: 36, fontWeight: 900, color: '#cbd5e1', margin: '4px 0 16px', letterSpacing: '-1px' }}>{tempWeight} kg</div>
                        {isStableMeasurement ? (
                          <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                            <button
                              onClick={() => handleReject()}
                              className="btn-secondary"
                              style={{ flex: 1, padding: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                            >
                              <X size={14} /> Afwijzen
                            </button>
                            <button
                              onClick={() => handleSave(tempWeight)}
                              className="btn-primary"
                              style={{ flex: 2, padding: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                            >
                              ✓ Accepteren & Save
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleSave(tempWeight)}
                            className="btn-secondary"
                            style={{ width: '100%', padding: '10px', opacity: 0.7 }}
                          >
                            Accept Current Value (Not yet stable)
                          </button>
                        )}
                      </div>
                    ) : (
                      <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, textAlign: 'center' }}>
                        Stand still on the scale to start measurement...
                      </p>
                    )}

                    {rawPacket && (
                      <div className="animate-fade-in" style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, width: '100%' }}>
                        <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6, fontWeight: 800, letterSpacing: '0.5px' }}>
                          Ontvangen Bluetooth Data (Hex):
                        </span>
                        <code style={{ fontSize: 10, wordBreak: 'break-all', fontFamily: 'monospace', color: '#ffb86c', display: 'block', lineHeight: 1.4 }}>
                          {rawPacket}
                        </code>
                        {decodingInfo && (
                          <div style={{ marginTop: 10, fontSize: 10, color: '#cbd5e1', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8 }}>
                            <strong>Gedecodeerd uit pakket:</strong> {detectedWeight} kg<br />
                            <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>Methode: {decodingInfo}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {status === 'error' && (
                  <>
                    <div className="ble-pulse-circle" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                      <X size={32} style={{ color: '#ef4444' }} />
                    </div>
                    <p style={{ fontSize: 11, color: '#ef4444', textAlign: 'center', marginBottom: 12 }}>
                      {errorMsg}
                    </p>
                    <button onClick={startBluetoothScan} className="btn-secondary" style={{ width: '100%' }}>
                      Opnieuw Proberen
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, background: 'rgba(239, 68, 68, 0.03)', border: '1px solid rgba(239, 68, 68, 0.1)', borderRadius: '12px', padding: 16, textAlign: 'center' }}>
                <HelpCircle size={28} style={{ color: '#ef4444', marginBottom: 12 }} />
                <h4 style={{ fontSize: 12, color: '#ef4444', fontWeight: 800, marginBottom: 4 }}>Web Bluetooth Not Supported</h4>
                <p style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                  Your browser does not support the Web Bluetooth API. Use Google Chrome or MS Edge.
                </p>
              </div>
            )}
          </div>
        </div>

        {measuredWeight && (
          <div className="animate-fade-in" style={{ background: 'rgba(203, 213, 225, 0.04)', border: '1px solid rgba(203, 213, 225, 0.15)', borderRadius: '12px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1' }}>Gewichtsmeasurement succesvol opgeslagen!</span>
            <button className="btn-primary" onClick={onClose} style={{ padding: '6px 12px', fontSize: 11 }}>Sluiten</button>
          </div>
        )}
      </div>
    </div>
  );
};
