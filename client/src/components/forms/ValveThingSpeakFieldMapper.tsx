/**
 * Role-based ThingSpeak field mapping for EvaraValve provisioning.
 * Each dropdown is tied to a purpose (flow vs total volume), not selection order.
 */

import type { ThingSpeakField, UseThingSpeakFieldSelectorReturn } from '../../hooks/useThingSpeakFieldSelector';

export interface ValveFieldMapping {
  flowFieldKey: string;
  flowFieldName: string;
  totalVolumeFieldKey: string;
  totalVolumeFieldName: string;
}

export interface ValveThingSpeakFieldMapperProps extends UseThingSpeakFieldSelectorReturn {
  inputClassName: string;
  flowFieldKey: string;
  totalVolumeFieldKey: string;
  onMappingChange: (mapping: ValveFieldMapping) => void;
}

function labelForField(availableFields: ThingSpeakField[], key: string): string {
  if (!key) return '';
  return availableFields.find((f) => f.key === key)?.label ?? key;
}

function buildOptions(
  availableFields: ThingSpeakField[],
  selectedInOther: string,
  currentValue: string,
): Array<ThingSpeakField & { isDisabled: boolean }> {
  return availableFields.map((field) => ({
    ...field,
    isDisabled: field.key === selectedInOther && field.key !== currentValue,
  }));
}

export const ValveThingSpeakFieldMapper = ({
  channelId,
  readApiKey,
  setChannelId,
  setReadApiKey,
  availableFields,
  isFetching,
  fetchError,
  hasFetched,
  fetchFields,
  inputClassName,
  flowFieldKey,
  totalVolumeFieldKey,
  onMappingChange,
}: ValveThingSpeakFieldMapperProps) => {
  const emitMapping = (flowKey: string, totalKey: string) => {
    onMappingChange({
      flowFieldKey: flowKey,
      flowFieldName: labelForField(availableFields, flowKey),
      totalVolumeFieldKey: totalKey,
      totalVolumeFieldName: labelForField(availableFields, totalKey),
    });
  };

  const handleFlowSelect = (key: string) => {
    emitMapping(key, totalVolumeFieldKey);
  };

  const handleTotalSelect = (key: string) => {
    emitMapping(flowFieldKey, key);
  };

  const flowOptions = buildOptions(availableFields, totalVolumeFieldKey, flowFieldKey);
  const totalOptions = buildOptions(availableFields, flowFieldKey, totalVolumeFieldKey);
  const mappingComplete = Boolean(flowFieldKey && totalVolumeFieldKey);

  return (
    <>
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

      {fetchError && (
        <p role="alert" style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '4px', marginBottom: 0 }}>
          ⚠ {fetchError}
        </p>
      )}

      {hasFetched && !fetchError && availableFields.length > 0 && (
        <p style={{ color: '#16a34a', fontSize: '0.75rem', marginTop: '2px', marginBottom: 0 }}>
          ✓ {availableFields.length} field{availableFields.length !== 1 ? 's' : ''} found
        </p>
      )}

      {hasFetched && availableFields.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
          <div>
            <label className="block text-[11px] font-[800] mb-1 uppercase text-cyan-800 dark:text-cyan-300 tracking-wider">
              Flow Rate Field *
            </label>
            <select
              value={flowFieldKey}
              onChange={(e) => handleFlowSelect(e.target.value)}
              className={inputClassName}
              aria-label="Flow rate field"
            >
              <option value="">— Select flow rate field —</option>
              {flowOptions.map((opt) => (
                <option key={opt.key} value={opt.key} disabled={opt.isDisabled}>
                  {opt.label} ({opt.key})
                  {opt.isDisabled ? ' (used for total volume)' : ''}
                </option>
              ))}
            </select>
            <p className="text-[10px] mt-1 mb-0" style={{ color: 'var(--text-muted)' }}>
              Used for Current Flow, Flow Trend, and auto-shutoff calculations
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-[800] mb-1 uppercase text-cyan-800 dark:text-cyan-300 tracking-wider">
              Total Volume Field *
            </label>
            <select
              value={totalVolumeFieldKey}
              onChange={(e) => handleTotalSelect(e.target.value)}
              className={inputClassName}
              aria-label="Total volume field"
            >
              <option value="">— Select total volume field —</option>
              {totalOptions.map((opt) => (
                <option key={opt.key} value={opt.key} disabled={opt.isDisabled}>
                  {opt.label} ({opt.key})
                  {opt.isDisabled ? ' (used for flow rate)' : ''}
                </option>
              ))}
            </select>
            <p className="text-[10px] mt-1 mb-0" style={{ color: 'var(--text-muted)' }}>
              Used for Total Litres and total volume display
            </p>
          </div>

          {!mappingComplete && (
            <p style={{ color: '#dc2626', fontSize: '0.75rem', margin: 0 }}>
              Select both a flow rate field and a total volume field before commissioning.
            </p>
          )}
        </div>
      )}
    </>
  );
};

export default ValveThingSpeakFieldMapper;
