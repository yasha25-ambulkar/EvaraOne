/**
 * AddDeviceForm — 2-step node provisioning form.
 * Step 1: Identity (type, name, hardware ID, hierarchy assignment)
 * Step 2: Setup (ThingSpeak config + template-specific specs + geospatial)
 */
import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cpu,
  Wifi,
  MapPin,
  Key,
  Gauge,
  Droplets,
  FlaskConical,
  Waves,
  Loader2,
  Check,
  ChevronRight,
  ChevronLeft,
  Zap,
  Info,
  User,
  Navigation2,
  Ruler,
  Search,
} from "lucide-react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../../ui/Modal";
import { MapPicker } from "../MapPicker";

import { adminService } from "../../../services/admin";
import { useZones } from "../../../hooks/useZones";
import { useToast } from "../../ToastProvider";
import { useAuth } from "../../../context/AuthContext";
import { deviceSchema, type DeviceInput } from "../../../schemas";
import { FormField } from "../../forms/FormField";
import { useThingSpeakFieldSelector } from "../../../hooks/useThingSpeakFieldSelector";
import { ThingSpeakFieldSelector } from "../../forms/ThingSpeakFieldSelector";
import { TankDimensionsCalculator } from "../../forms/TankDimensionsCalculator";

interface Props {
  onSubmit: (data: any) => void;
  onCancel: () => void;
  initialData?: any;
}

const DEVICE_TYPES = [
  {
    value: "tank",
    label: "EvaraTank",
    icon: Droplets,
    template: "EvaraTank",
    desc: "Overhead tanks, underground sumps",
    color: "text-indigo-600",
    bg: "bg-indigo-50",
  },
  {
    value: "deep",
    label: "EvaraDeep",
    icon: FlaskConical,
    template: "EvaraDeep",
    desc: "Borewells, deep wells, groundwater",
    color: "text-slate-600",
    bg: "bg-slate-100",
  },
  {
    value: "flow",
    label: "EvaraFlow",
    icon: Waves,
    template: "EvaraFlow",
    desc: "Pumps, flow meters, pipelines",
    color: "text-cyan-600",
    bg: "bg-cyan-50",
  },
  {
    value: "tds",
    label: "EvaraTDS",
    icon: FlaskConical,
    template: "EvaraTDS",
    desc: "Water quality and TDS sensors",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
];

const STEPS = [
  { num: 1, label: "Identity", icon: Cpu },
  { num: 2, label: "Setup", icon: Wifi },
];

export const AddDeviceForm = ({ onSubmit, onCancel, initialData }: Props) => {
  // ── ThingSpeak field selector hook ────────────────────────────────────────
  const tsSelector = useThingSpeakFieldSelector();
  const { showToast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isEdit = !!initialData;
  const [step, setStep] = useState(1);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [assetSubType, setAssetSubType] = useState<"tank" | "sump">(
    initialData?.asset_type === "sump" ? "sump" : "tank",
  );
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [coordError, setCoordError] = useState("");
  const { zones, isLoading: loadingRegions } = useZones();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<DeviceInput>({
    resolver: zodResolver(deviceSchema) as any,
    mode: "onChange",
    defaultValues: initialData || {
      device_type: "tank",
      analytics_template: "EvaraTank",
      status: "Online",
      is_active: true,
      capacity: "",
      max_depth: "",
      static_depth: "",
      dynamic_depth: "",
      recharge_threshold: "",
      pipe_diameter: "",
      max_flow_rate: "",
      length: "",
      breadth: "",
      water_level_field: "field1",
      depth_field: "field1",
      meter_reading_field: "field1",
      flow_rate_field: "field2",
    },
  });

  const watchType = watch("device_type");
  const watchTemplate = watch("analytics_template");
  const watchZoneId = watch("zone_id" as any);
  const watchLat = watch("latitude");
  const watchLng = watch("longitude");
  const { data: availableClients = [], isLoading: loadingClients } = useQuery({
    queryKey: ["clients_by_zone", watchZoneId],
    queryFn: () => adminService.getClients(undefined, watchZoneId as string),
    enabled: !!watchZoneId,
  });

  useEffect(() => {
    const typeMatch = DEVICE_TYPES.find((d) => d.value === watchType);
    if (typeMatch) setValue("analytics_template", typeMatch.template);
  }, [watchType, setValue]);

  // Sync manual coord inputs when map picker updates form values
  useEffect(() => {
    if (watchLat) setManualLat(Number(watchLat).toFixed(6));
    if (watchLng) setManualLng(Number(watchLng).toFixed(6));
  }, [watchLat, watchLng]);

  const sortedRegions = useMemo(
    () =>
      zones
        ? [...zones].sort((a, b) =>
            (a.zoneName || "").localeCompare(b.zoneName || ""),
          )
        : [],
    [zones],
  );

  const handleNext = async () => {
    const ok = await trigger([
      "name",
      "node_key",
      "device_type",
      "zone_id",
      "customer_id",
    ] as any);
    if (ok) setStep(2);
    else showToast("Please fill all required fields", "error");
  };

  const handleGoToCoords = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      setCoordError("Latitude must be -90 to 90");
      return;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      setCoordError("Longitude must be -180 to 180");
      return;
    }
    setCoordError("");
    setValue("latitude", String(lat));
    setValue("longitude", String(lng));
  };

  const onFormSubmit = async (data: DeviceInput) => {
    try {
      console.log('[AddDeviceForm] ─────────────────────────────────────────────');
      console.log('[AddDeviceForm] 📝 FORM SUBMITTED');
      console.log('[AddDeviceForm] Device Type:', data.device_type);
      console.log('[AddDeviceForm] Full form data:', data);

      // Step 5: Flat nodeData schema matching user's requested Firestore structure
      const nodeData: any = {
        hardwareId: data.node_key,
        displayName: data.name,
        assetType:
          data.device_type === "tank"
            ? "EvaraTank"
            : data.device_type === "deep"
              ? "EvaraDeep"
              : data.device_type === "flow"
                ? "EvaraFlow"
                : data.device_type === "tds"
                  ? "EvaraTDS"
                  : "EvaraTank",
        subType:
          data.device_type === "deep"
            ? "Borewell"
            : data.device_type === "flow"
              ? "Pump"
              : data.device_type === "tds"
                ? "TDSSensor"
                : assetSubType === "sump"
                  ? "UndergroundSump"
                  : "OverheadTank",

        zoneId: watchZoneId || "",
        customerId: data.customer_id,

        latitude: Number(data.latitude),
        longitude: Number(data.longitude),

        thingspeakChannelId: data.thingspeak_channel_id,
        thingspeakReadKey: data.thingspeak_read_key,
        waterLevelField: data.water_level_field,
        borewellDepthField: data.depth_field,
        meterReadingField: data.meter_reading_field,
        flowRateField: data.flow_rate_field,
        tdsField: data.tds_field,
        temperatureField: data.temperature_field,

        capacity: data.capacity ? Number(data.capacity) : 0,
        depth: data.max_depth ? Number(data.max_depth) : 0,

        // Metadata for backward compatibility if needed by analytics
        tankLength: data.length ? Number(data.length) : 0,
        tankBreadth: data.breadth ? Number(data.breadth) : 0,
        staticDepth: data.static_depth ? Number(data.static_depth) : 0,
        dynamicDepth: data.dynamic_depth ? Number(data.dynamic_depth) : 0,
        rechargeThreshold: data.recharge_threshold
          ? Number(data.recharge_threshold)
          : 0,

        status: "online",
      };

      console.log('[AddDeviceForm] 📤 Sending to API:', nodeData);
      console.log('[AddDeviceForm] ─────────────────────────────────────────────');

      let result;
      if (isEdit) {
        result = await adminService.updateNode(initialData.id, nodeData);
        console.log('[AddDeviceForm] ✅ Node updated successfully');
        showToast("Node updated successfully", "success");
      } else {
        result = await adminService.createNode(nodeData);
        console.log('[AddDeviceForm] ✅ Node created successfully, ID:', result?.id);
        showToast("Node commissioned successfully! 🎉", "success");
      }

      // Step 9: Refresh UI - invalidate all node-related queries
      queryClient.invalidateQueries({ queryKey: ["nodes"] });
      queryClient.invalidateQueries({ queryKey: ["map_devices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard_summary"] });

      onSubmit(result);
    } catch (err: any) {
      console.error('[AddDeviceForm] ❌ SUBMISSION FAILED');
      console.error('[AddDeviceForm] Error:', err.message);
      if (err.response?.data) {
        console.error('[AddDeviceForm] Response:', err.response.data);
      }
      showToast(
        err.message || `Failed to ${isEdit ? "update" : "commission"} node`,
        "error",
      );
    }
  };

  const inp = (error?: any) =>
    `w-full px-3.5 py-2.5 h-10 min-h-[40px] rounded-xl border text-sm outline-none transition-all duration-150 text-[var(--modal-text-color)] placeholder:text-[var(--modal-placeholder-color)] ${error ? "border-red-300 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-100 dark:bg-red-900/20 dark:border-red-500/50" : "bg-[var(--modal-input-bg)] border-[var(--modal-input-border)] focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"}`;


  return (
    <div
      className="flex flex-col"
      style={{ minHeight: "520px", maxHeight: "78vh" }}
    >
      <Modal
        isOpen={showMapPicker}
        onClose={() => setShowMapPicker(false)}
        title="Pick Device Location"
      >
        <MapPicker
          initialLat={watchLat ? Number(watchLat) : 17.385}
          initialLng={watchLng ? Number(watchLng) : 78.487}
          onConfirm={(lat, lng) => {
            setValue("latitude", String(lat));
            setValue("longitude", String(lng));
            setShowMapPicker(false);
            showToast(
              `Location set: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
              "success",
            );
          }}
          onCancel={() => setShowMapPicker(false)}
        />
      </Modal>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-3 mb-5 shrink-0">
        {STEPS.map((s, i) => (
          <div key={s.num} className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 shadow-sm ${step >= s.num ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400"}`}
            >
              {step > s.num ? <Check size={16} /> : <s.icon size={16} />}
            </div>
            <span
              className={`text-[11px] font-[800] uppercase tracking-tight ${step >= s.num ? "text-emerald-700" : "text-slate-400"}`}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div
                className={`w-10 h-[2px] rounded-full transition-all duration-500 ${step > s.num ? "bg-emerald-500" : "bg-slate-200"}`}
              />
            )}
          </div>
        ))}
      </div>

      <form
        id="device-form"
        onSubmit={handleSubmit(onFormSubmit)}
        className="flex-1 overflow-y-auto pr-1 custom-scrollbar min-h-0"
      >
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                {DEVICE_TYPES.map((type) => {
                  const isSelected = watchType === type.value;
                  return (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setValue("device_type", type.value)}
                      className={`relative p-4 rounded-2xl border-2 text-left transition-all duration-200 ${isSelected ? "border-emerald-500 bg-emerald-50/60 shadow-md" : "border-slate-100 bg-white/40 hover:border-slate-200 hover:bg-white/60"}`}
                    >
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2.5 ${type.bg} ${type.color}`}
                      >
                        <type.icon size={17} />
                      </div>
                      <div className="text-[13px] font-[700] text-slate-800 leading-tight">
                        {type.label}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                        {type.desc}
                      </div>
                      {isSelected && (
                        <div className="absolute top-2.5 right-2.5 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                          <Check size={11} className="text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Sub-type selector — only for EvaraTank */}
              {watchType === "tank" && (
                <div className="modal-card-glass p-3.5 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-[11px] font-[800] text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                    <Droplets size={12} /> Asset Sub-Type
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAssetSubType("tank")}
                      className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-all ${assetSubType === "tank" ? "border-indigo-500 bg-indigo-50 shadow-sm" : "border-slate-100 bg-white/60 hover:border-slate-200"}`}
                    >
                      <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                        <Droplets size={14} />
                      </div>
                      <div>
                        <p className="text-[12px] font-[700] text-slate-800">
                          Overhead Tank
                        </p>
                        <p className="text-[9px] text-slate-500">
                          OHT / Ground tank
                        </p>
                      </div>
                      {assetSubType === "tank" && (
                        <div className="ml-auto w-4 h-4 bg-indigo-500 rounded-full flex items-center justify-center">
                          <Check size={9} className="text-white" />
                        </div>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssetSubType("sump")}
                      className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-all ${assetSubType === "sump" ? "border-indigo-500 bg-indigo-50 shadow-sm" : "border-slate-100 bg-white/60 hover:border-slate-200"}`}
                    >
                      <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                        <Waves size={14} />
                      </div>
                      <div>
                        <p className="text-[12px] font-[700] text-slate-800">
                          Underground Sump
                        </p>
                        <p className="text-[9px] text-slate-500">
                          Sump / cistern
                        </p>
                      </div>
                      {assetSubType === "sump" && (
                        <div className="ml-auto w-4 h-4 bg-indigo-500 rounded-full flex items-center justify-center">
                          <Check size={9} className="text-white" />
                        </div>
                      )}
                    </button>
                  </div>
                </div>
              )}

              <div className="modal-card-glass p-4 rounded-2xl space-y-3 shadow-sm">
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    label="Display Name"
                    required
                    icon={Cpu}
                    error={errors.name?.message}
                  >
                    <input
                      {...register("name")}
                      placeholder="e.g. Tank A1"
                      className={inp(errors.name)}
                    />
                  </FormField>
                  <FormField
                    label="Hardware ID (Node Key)"
                    required
                    icon={Key}
                    error={errors.node_key?.message}
                  >
                    <input
                      {...register("node_key")}
                      placeholder="e.g. EV-TNK-001"
                      className={inp(errors.node_key)}
                    />
                  </FormField>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Zone Filter" icon={MapPin}>
                    <select
                      {...register("zone_id" as any)}
                      className={inp()}
                      disabled={loadingRegions}
                    >
                      <option value="">Select Zone...</option>
                      {sortedRegions.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.zoneName}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField
                    label="Assign Customer"
                    required
                    icon={User}
                    error={errors.customer_id?.message}
                  >
                    <select
                      {...register("customer_id")}
                      className={inp(errors.customer_id)}
                      disabled={!watchZoneId || loadingClients}
                    >
                      <option value="">Select client...</option>
                      {availableClients?.map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.display_name || c.full_name || "Unnamed Client"}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              className="space-y-4"
            >
              {/* ThingSpeak — dynamic field selector */}
              <div className="modal-card-glass p-4 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-[800] text-cyan-700 dark:text-cyan-400 uppercase tracking-wider">
                  <Wifi size={13} /> ThingSpeak Configuration
                </div>

                <ThingSpeakFieldSelector
                  {...tsSelector}
                  inputClassName={inp()}
                  addLabel="+ Map another field"
                  onFieldsChange={(fields) => {
                    // Sync the first selected field back to the appropriate
                    // react-hook-form field based on the current device template.
                    const first = fields[0] ?? '';
                    const second = fields[1] ?? '';

                    // Always persist channel / key into form so validation works.
                    setValue('thingspeak_channel_id', tsSelector.channelId, { shouldValidate: true });
                    setValue('thingspeak_read_key', tsSelector.readApiKey, { shouldValidate: true });

                    if (watchTemplate === 'EvaraTank') {
                      setValue('water_level_field', first, { shouldValidate: true });
                    } else if (watchTemplate === 'EvaraDeep') {
                      setValue('depth_field', first, { shouldValidate: true });
                    } else if (watchTemplate === 'EvaraFlow') {
                      setValue('meter_reading_field', first, { shouldValidate: true });
                      setValue('flow_rate_field', second, { shouldValidate: true });
                    } else if (watchTemplate === 'EvaraTDS') {
                      setValue('tds_field', first, { shouldValidate: true });
                      setValue('temperature_field', second, { shouldValidate: true });
                    }
                  }}
                />

                <div className="flex gap-2 items-start p-2.5 bg-cyan-50 dark:bg-cyan-900/20 rounded-xl border border-cyan-100 dark:border-cyan-800">
                  <Info className="text-cyan-500 mt-0.5 shrink-0" size={12} />
                  <p className="text-[10px] text-cyan-700 dark:text-cyan-200 leading-relaxed">
                    Ensure the channel is <strong>Public</strong> or the{" "}
                    <strong>Read Key</strong> is correct. Select the fields that
                    match your sensor outputs.
                  </p>
                </div>
              </div>

              {/* EvaraTank dimensions — dynamic calculator */}
              {watchTemplate === "EvaraTank" && (
                <TankDimensionsCalculator
                  inputClassName={inp()}
                  onCalculated={(vals) => {
                    if (!vals) return;
                    setValue("length",   String(vals.lengthM),   { shouldValidate: true });
                    setValue("breadth",  String(vals.breadthM),  { shouldValidate: true });
                    setValue("max_depth",String(vals.heightM),   { shouldValidate: true });
                    setValue("capacity", String(vals.capacityL), { shouldValidate: true });
                  }}
                />
              )}

              {/* EvaraDeep dimensions */}
              {watchTemplate === "EvaraDeep" && (
                <div className="modal-card-glass p-4 rounded-2xl space-y-3">
                  <div className="flex items-center gap-2 text-[11px] font-[800] text-slate-600 dark:text-slate-200 uppercase tracking-wider">
                    <FlaskConical size={13} /> Borewell Specifications
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <FormField label="Total Bore Depth (m)" icon={Ruler as any}>
                      <input
                        {...register("max_depth")}
                        type="number"
                        step="0.1"
                        placeholder="e.g. 200"
                        className={inp()}
                      />
                    </FormField>
                    <FormField
                      label="Static Water Level (m)"
                      icon={Droplets as any}
                    >
                      <input
                        {...register("static_depth")}
                        type="number"
                        step="0.1"
                        placeholder="e.g. 50"
                        className={inp()}
                      />
                    </FormField>
                    <FormField
                      label="Dynamic Water Level (m)"
                      icon={Waves as any}
                    >
                      <input
                        {...register("dynamic_depth")}
                        type="number"
                        step="0.1"
                        placeholder="e.g. 80"
                        className={inp()}
                      />
                    </FormField>
                  </div>
                </div>
              )}

              {/* EvaraFlow info */}
              {watchTemplate === "EvaraFlow" && (
                <div className="flex gap-2 items-start p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-xl border border-cyan-100 dark:border-cyan-800">
                  <Info className="text-cyan-500 mt-0.5 shrink-0" size={13} />
                  <p className="text-[10px] text-cyan-700 dark:text-cyan-200 leading-relaxed">
                    <strong>EvaraFlow</strong> derives meter readings and flow
                    rates directly from live sensor data — no physical
                    dimensions needed.
                  </p>
                </div>
              )}

              {/* Geospatial */}
              <div className="modal-card-glass p-4 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11px] font-[800] text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                    <MapPin size={13} /> Device Location
                  </div>
                  {watchLat && watchLng && (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-[700]">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Location Set
                    </span>
                  )}
                </div>

                {/* Inline coordinate inputs */}
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <p className="text-[9px] font-[700] text-slate-400 uppercase tracking-wider mb-1">
                      Latitude
                    </p>
                    <input
                      type="text"
                      value={manualLat}
                      onChange={(e) => setManualLat(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        (e.preventDefault(), handleGoToCoords())
                      }
                      placeholder="e.g. 17.385044"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[var(--modal-input-border)] bg-[var(--modal-input-bg)] text-[var(--modal-text-color)] placeholder:text-[var(--modal-placeholder-color)] text-sm font-mono outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 transition-all"
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-[9px] font-[700] text-slate-400 uppercase tracking-wider mb-1">
                      Longitude
                    </p>
                    <input
                      type="text"
                      value={manualLng}
                      onChange={(e) => setManualLng(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        (e.preventDefault(), handleGoToCoords())
                      }
                      placeholder="e.g. 78.486671"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[var(--modal-input-border)] bg-[var(--modal-input-bg)] text-[var(--modal-text-color)] placeholder:text-[var(--modal-placeholder-color)] text-sm font-mono outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 transition-all"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleGoToCoords}
                    className="flex items-center gap-1 px-3.5 py-2.5 rounded-xl bg-emerald-600 text-white text-[12px] font-[700] hover:bg-emerald-700 transition-all shrink-0 shadow-sm"
                  >
                    <Search size={12} /> Apply
                  </button>
                </div>
                {coordError && (
                  <p className="text-[10px] text-red-500 font-[500]">
                    {coordError}
                  </p>
                )}

                {/* Coordinate status badge */}
                {watchLat && watchLng ? (
                  <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl modal-card-glass shadow-sm">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                      <MapPin size={15} className="text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-[700] text-emerald-700 uppercase tracking-wider">
                        Position confirmed
                      </p>
                      <p className="text-[12px] font-mono font-[600] text-slate-700 dark:text-slate-300 truncate">
                        {Number(watchLat).toFixed(6)},{" "}
                        {Number(watchLng).toFixed(6)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowMapPicker(true)}
                      className="text-[10px] font-[700] text-emerald-600 hover:text-emerald-800 underline underline-offset-2 shrink-0"
                    >
                      Edit
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-dashed border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-900/20">
                    <MapPin size={14} className="text-emerald-300 dark:text-emerald-500 shrink-0" />
                    <p className="text-[11px] text-emerald-500 dark:text-emerald-400">
                      Enter coordinates above or use the map picker below
                    </p>
                  </div>
                )}

                {/* Position Device on Map button */}
                <button
                  type="button"
                  onClick={() => setShowMapPicker(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[13px] font-[800] hover:from-emerald-700 hover:to-teal-700 transition-all shadow-md shadow-emerald-100 active:scale-[0.98]"
                >
                  <Navigation2 size={15} />
                  {watchLat ? "Reposition on Map" : "Position Device on Map"}
                </button>

                {(errors.latitude || errors.longitude) && (
                  <p className="text-[11px] text-red-500 font-[500]">
                    Location is required — enter coordinates or use the map
                    picker.
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>

      {/* Navigation */}
      <div className="shrink-0 flex justify-between items-center pt-4 mt-1 border-t border-slate-100">
        <button
          type="button"
          onClick={step === 1 ? onCancel : () => setStep(1)}
          disabled={isSubmitting}
          className="flex items-center gap-1.5 px-5 py-2.5 font-[700] text-slate-500 hover:text-slate-800 hover:bg-slate-100/60 rounded-xl transition-all text-sm"
        >
          {step > 1 && <ChevronLeft size={15} />}
          {step === 1 ? "Cancel" : "Back"}
        </button>

        {step === 1 ? (
          <motion.button
            whileHover={{ x: 4 }}
            whileTap={{ scale: 0.96 }}
            type="button"
            onClick={handleNext}
            className="flex items-center gap-2 px-7 py-2.5 bg-emerald-600 text-white text-sm font-[800] rounded-xl hover:bg-emerald-700 shadow-md shadow-emerald-100 transition-all"
          >
            Continue <ChevronRight size={15} />
          </motion.button>
        ) : (
          user?.role === "superadmin" && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              type="submit"
              form="device-form"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-8 py-2.5 bg-emerald-600 text-white text-sm font-[800] rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all"
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Zap size={16} />
              )}
              {isSubmitting ? "Provisioning..." : "Commission Node"}
            </motion.button>
          )
        )}
      </div>
    </div>
  );
};
