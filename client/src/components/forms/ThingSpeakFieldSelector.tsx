/**
 * ThingSpeakFieldSelector
 *
 * Purely logical component: one dropdown per row, no external UI libraries.
 *
 * CRITICAL FIX: onFieldsChange is stored in a ref so it is never listed as a
 * useEffect dependency. This prevents the infinite render loop that occurred
 * when AddDeviceForm passed a new inline arrow function on every render, which
 * would trigger the effect → setValue → re-render → new fn ref → effect again.
 */

import { useEffect, useRef } from 'react';
import type { UseThingSpeakFieldSelectorReturn } from '../../hooks/useThingSpeakFieldSelector';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ThingSpeakFieldSelectorProps
  extends UseThingSpeakFieldSelectorReturn {
  /**
   * Called when the set of non-empty selected field keys changes.
   * Stable identity not required — ref pattern used internally.
   */
  onFieldsChange: (fields: string[]) => void;

  /** CSS class string applied to every <input> and <select>. */
  inputClassName: string;

  /** Label for the "add row" button. @default "+ Add another field" */
  addLabel?: string;
}

// ── Sub-component: single row ─────────────────────────────────────────────────

interface FieldRowProps {
  rowIndex: number;
  value: string;
  options: Array<{ key: string; label: string; isDisabled: boolean }>;
  onSelect: (rowIndex: number, key: string) => void;
  onRemove: (rowIndex: number) => void;
  disabled: boolean;
  canRemove: boolean;
  inputClassName: string;
}

const FieldRow = ({
  rowIndex,
  value,
  options,
  onSelect,
  onRemove,
  disabled,
  canRemove,
  inputClassName,
}: FieldRowProps) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    {/* ONE dropdown per row — core invariant */}
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onSelect(rowIndex, e.target.value)}
      className={inputClassName}
      style={{ flex: 1 }}
      aria-label={`Field row ${rowIndex + 1}`}
    >
      <option value="">— Select a field —</option>
      {options.map((opt) => (
        <option key={opt.key} value={opt.key} disabled={opt.isDisabled}>
          {opt.label}
          {opt.isDisabled ? ' (already selected)' : ''}
        </option>
      ))}
    </select>

    <button
      type="button"
      onClick={() => onRemove(rowIndex)}
      title={canRemove ? 'Remove row' : 'Clear selection'}
      style={{
        padding: '6px 10px',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        background: '#fff',
        cursor: 'pointer',
        flexShrink: 0,
        fontSize: '12px',
        color: '#64748b',
      }}
    >
      ✕
    </button>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────

export const ThingSpeakFieldSelector = ({
  channelId,
  readApiKey,
  setChannelId,
  setReadApiKey,
  availableFields,
  isFetching,
  fetchError,
  hasFetched,
  selectedFields,
  fetchFields,
  selectField,
  addRow,
  removeRow,
  getOptionsForRow,
  isValid,
  onFieldsChange,
  inputClassName,
  addLabel = '+ Add another field',
}: ThingSpeakFieldSelectorProps) => {

  // ── Stable callback ref — breaks the infinite loop ─────────────────────────
  // onFieldsChange is an inline arrow in AddDeviceForm, so its identity changes
  // every render. By storing it in a ref we can call the latest version from
  // inside the effect without listing it as a dependency.
  const onFieldsChangeRef = useRef(onFieldsChange);
  useEffect(() => {
    onFieldsChangeRef.current = onFieldsChange;
  });                    // no dep array — always stays current

  // Notify parent when selection array changes. ONLY selectedFields is in deps.
  useEffect(() => {
    const resolved = selectedFields.filter((f) => f !== '');
    onFieldsChangeRef.current(resolved);
  }, [selectedFields]); // ← onFieldsChange intentionally omitted

  // ── Derived ───────────────────────────────────────────────────────────────
  const canAddMore =
    hasFetched &&
    availableFields.length > 0 &&
    selectedFields.length < availableFields.length;

  return (
    <>
      {/* ── Credentials ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label className="block text-[11px] font-[700] mb-1 uppercase text-gray-600 dark:text-slate-400 tracking-wider">
            Channel ID *
          </label>
          <input
            type="text"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            placeholder="e.g. 2481920"
            className={inputClassName}
          />
        </div>
        <div>
          <label className="block text-[11px] font-[700] mb-1 uppercase text-gray-600 dark:text-slate-400 tracking-wider">
            Read API Key *
          </label>
          <input
            type="text"
            value={readApiKey}
            onChange={(e) => setReadApiKey(e.target.value)}
            placeholder="R3AD_K3Y_X1"
            className={inputClassName}
          />
        </div>
      </div>

      {/* ── Fetch button ── */}
      <button
        type="button"
        onClick={fetchFields}
        disabled={isFetching || !channelId.trim() || !readApiKey.trim()}
        className={inputClassName}
        style={{
          marginTop: '8px',
          background: isFetching ? '#94a3b8' : '#0e7490',
          color: '#fff',
          border: 'none',
          cursor: isFetching || !channelId.trim() || !readApiKey.trim() ? 'not-allowed' : 'pointer',
          fontWeight: 700,
          fontSize: '0.8rem',
          paddingTop: '8px',
          paddingBottom: '8px',
          opacity: isFetching || !channelId.trim() || !readApiKey.trim() ? 0.65 : 1,
        }}
      >
        {isFetching ? '⟳ Fetching…' : '⬇ Fetch Fields'}
      </button>

      {/* ── Fetch error ── */}
      {fetchError && (
        <p role="alert" style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '4px', marginBottom: 0 }}>
          ⚠ {fetchError}
        </p>
      )}

      {/* ── Success info ── */}
      {hasFetched && !fetchError && availableFields.length > 0 && (
        <p style={{ color: '#16a34a', fontSize: '0.75rem', marginTop: '2px', marginBottom: 0 }}>
          ✓ {availableFields.length} field{availableFields.length !== 1 ? 's' : ''} found —
          {' '}{availableFields.map((f) => f.label).join(', ')}
        </p>
      )}

      {/* ── Field rows ── */}
      {hasFetched && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
          {selectedFields.map((value, idx) => (
            <FieldRow
              key={idx}
              rowIndex={idx}
              value={value}
              options={getOptionsForRow(idx)}
              onSelect={selectField}
              onRemove={removeRow}
              disabled={availableFields.length === 0}
              canRemove={selectedFields.length > 1}
              inputClassName={inputClassName}
            />
          ))}

          {canAddMore && (
            <button
              type="button"
              onClick={addRow}
              style={{
                alignSelf: 'flex-start',
                fontSize: '0.75rem',
                color: '#0e7490',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 0',
                fontWeight: 600,
              }}
            >
              {addLabel}
            </button>
          )}

          {hasFetched && availableFields.length > 0 && !isValid && (
            <p style={{ color: '#dc2626', fontSize: '0.75rem', margin: 0 }}>
              Select at least one field before commissioning.
            </p>
          )}
        </div>
      )}
    </>
  );
};

export default ThingSpeakFieldSelector;
