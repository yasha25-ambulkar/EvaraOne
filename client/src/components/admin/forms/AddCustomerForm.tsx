/**
 * AddCustomerForm — creates a customer (client) record in the clients table.
 * No auth user creation — customers are not system users.
 */
import { useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Loader2,
  CheckCircle,
  Lock,
  ShieldCheck,
  Activity,
} from "lucide-react";

import { adminService } from "../../../services/admin";
import { useZones } from "../../../hooks/useZones";
import { useToast } from "../../ToastProvider";
import { FormField } from "../../forms/FormField";
import { customerSchema, type CustomerInput } from "../../../schemas";

interface Props {
  onSubmit: (data: any) => void;
  onCancel: () => void;
  initialData?: any;
}

export const AddCustomerForm = ({ onSubmit, onCancel, initialData }: Props) => {
  const { showToast } = useToast();
  const isEdit = !!initialData;
  const { zones, isLoading: loadingRegions } = useZones();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: initialData || {
      display_name: "",
      full_name: "",
      email: "",
      phone_number: "",
      zone_id: "",
      role: "customer",
      status: "active",
    },
  });

  // Watch form values
  const watchZoneId = watch("zone_id");
  const watchEmail = watch("email");
  const watchDisplayName = watch("display_name");

  // Debug: Log watched values when they change
  useEffect(() => {
    console.log('[AddCustomerForm] 👀 Form Values:', {
      zone_id: watchZoneId,
      email: watchEmail,
      display_name: watchDisplayName
    });
  }, [watchZoneId, watchEmail, watchDisplayName]);

  const sortedRegions = useMemo(
    () =>
      zones
        ? [...zones].sort((a, b) =>
            (a.zoneName || "").localeCompare(b.zoneName || ""),
          )
        : [],
    [zones],
  );

  const handleFormSubmit = async (data: CustomerInput) => {
    try {
      // Debug: Log what's being sent to backend
      console.log('═══════════════════════════════════════════════════════');
      console.log('[AddCustomerForm] 📝 FORM VALIDATION PASSED');
      console.log('═══════════════════════════════════════════════════════');
      console.log('[AddCustomerForm] ✅ Form Data:', JSON.stringify(data, null, 2));
      console.log('[AddCustomerForm] ✅ zone_id field value:', data.zone_id);
      console.log('[AddCustomerForm] ✅ display_name:', data.display_name);
      console.log('[AddCustomerForm] ✅ email:', data.email);
      console.log('═══════════════════════════════════════════════════════');

      // CRITICAL: Ensure zone_id is not empty
      if (!data.zone_id || data.zone_id.trim() === '') {
        console.error('[AddCustomerForm] ❌ CRITICAL: zone_id is empty!', data.zone_id);
        showToast("Zone assignment is required", "error");
        return;
      }

      // Build request body with all fields explicitly
      const requestBody = {
        display_name: data.display_name,
        full_name: data.full_name || '',
        email: data.email,
        phone_number: data.phone_number || '',
        password: data.password,
        confirmPassword: data.confirmPassword,
        role: data.role,
        status: data.status,
        zone_id: data.zone_id,  // ← EXPLICITLY include zone_id
      };

      console.log('[AddCustomerForm] 📦 REQUEST BODY being sent:', JSON.stringify(requestBody, null, 2));

      let result;
      if (isEdit) {
        result = await adminService.updateCustomer(initialData.id, requestBody);
        showToast("Customer updated successfully", "success");
      } else {
        console.log('[AddCustomerForm] 📤 Sending to API...');
        result = await adminService.createCustomer(requestBody);
        console.log('[AddCustomerForm] ✅ API Response:', result);
        showToast("Customer created successfully", "success");
      }
      onSubmit(result);
    } catch (err: any) {
      console.error('[AddCustomerForm] ❌ SUBMISSION ERROR:', err);
      showToast(
        err.message || `Failed to ${isEdit ? "update" : "create"} customer`,
        "error",
      );
    }
  };

  const inputClass = (error?: any) => `
        w-full px-4 py-3 rounded-2xl border transition-all duration-300 outline-none text-sm
        ${
          error
            ? 'border-red-300 bg-red-50 text-red-900 placeholder:text-red-300 focus:border-red-500 focus:ring-4 focus:ring-red-500/10 dark:bg-red-900/20 dark:border-red-500/50 dark:text-red-200'
            : 'bg-transparent text-[var(--text-primary)] border-[var(--modal-input-border)] placeholder:text-[var(--modal-placeholder-color)] focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
        }
    `;

  return (
    <form
      onSubmit={handleSubmit(handleFormSubmit)}
      className="space-y-6 p-1 h-[60vh] overflow-y-auto pr-2 custom-scrollbar"
    >
      {/* Identity */}
      <div className="modal-card-glass p-6 rounded-3xl space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-indigo-800 dark:text-indigo-400 uppercase tracking-tight">
          <User size={16} className="text-blue-500" /> Account Identity
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            label="Display Name"
            required
            icon={User}
            error={errors.display_name?.message}
          >
            <input
              {...register("display_name")}
              placeholder="e.g. Ramesh S."
              className={inputClass(errors.display_name)}
            />
          </FormField>
          <FormField
            label="Full Name"
            icon={User}
            error={errors.full_name?.message}
          >
            <input
              {...register("full_name")}
              placeholder="e.g. Ramesh Sharma"
              className={inputClass(errors.full_name)}
            />
          </FormField>
          <FormField
            label="Email (Login Username)"
            required
            icon={Mail}
            error={errors.email?.message}
          >
            <input
              {...register("email")}
              type="email"
              placeholder="customer@example.com"
              className={inputClass(errors.email)}
            />
          </FormField>
          <FormField
            label="Phone Number"
            icon={Phone}
            error={errors.phone_number?.message}
          >
            <input
              {...register("phone_number")}
              placeholder="+91 98765 43210"
              className={inputClass(errors.phone_number)}
            />
          </FormField>
        </div>
      </div>

      {/* Security */}
      <div className="modal-card-glass p-6 rounded-3xl space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-tight">
          <Lock size={16} className="text-slate-400" /> Auth & Role
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {!isEdit && (
            <>
              <FormField
                label="Password"
                required
                icon={Lock}
                error={errors.password?.message}
              >
                <input
                  {...register("password", { required: !isEdit })}
                  type="password"
                  placeholder="Min 8 characters"
                  className={inputClass(errors.password)}
                />
              </FormField>
              <FormField
                label="Confirm Password"
                required
                icon={Lock}
                error={errors.confirmPassword?.message}
              >
                <input
                  {...register("confirmPassword", { required: !isEdit })}
                  type="password"
                  placeholder="Repeat password"
                  className={inputClass(errors.confirmPassword)}
                />
              </FormField>
            </>
          )}
          <FormField
            label="User Role"
            required
            icon={ShieldCheck}
            error={errors.role?.message}
          >
            <select {...register("role")} className={inputClass(errors.role)}>
              <option value="customer">Customer (Home Owner)</option>
              <option value="operator">Operator (Technician)</option>
              <option value="viewer">Viewer (Read-only)</option>
            </select>
          </FormField>
          <FormField
            label="Account Status"
            required
            icon={Activity}
            error={errors.status?.message}
          >
            <select
              {...register("status")}
              className={inputClass(errors.status)}
            >
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="suspended">Suspended</option>
            </select>
          </FormField>
        </div>
      </div>

      {/* Assignment */}
      <div className="modal-card-glass p-6 rounded-3xl space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-tight">
          <MapPin size={16} className="text-blue-500" /> Zone Assignment
        </div>
        <div className="grid grid-cols-1 gap-4">
          <FormField label="Assign Zone" required icon={MapPin} error={errors.zone_id?.message}>
            <select
              {...register("zone_id")}
              className={inputClass(errors.zone_id)}
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
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-6 py-3 text-sm font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all"
        >
          Cancel
        </button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-2 px-8 py-3 bg-[#3A7AFE] text-white text-sm font-bold rounded-xl hover:bg-[#2563EB] transition-all disabled:opacity-50 shadow-md"          onClick={(e) => {
            console.log('[AddCustomerForm] 🔍 FORM ERRORS BEFORE SUBMIT:', errors);
            console.log('[AddCustomerForm] 🔍 FORM STATE:', {
              isSubmitting,
              isDirty: true,
              isValid: Object.keys(errors).length === 0
            });
          }}        >
          {isSubmitting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <CheckCircle size={16} />
          )}
          {isSubmitting ? (isEdit ? "Saving Changes..." : "Creating User...") : (isEdit ? "Save Changes" : "Add Customer Account")}
        </motion.button>
      </div>
    </form>
  );
};
