const fs = require('fs');
const p = 'd:/17-04-26/main/client/src/components/admin/forms/AddDeviceForm.tsx';
let txt = fs.readFileSync(p, 'utf8');
const start = txt.indexOf('<ThingSpeakFieldSelector');
const end = txt.indexOf('/>', start) + 2;
const p1 = txt.substring(0, start);
const p2 = txt.substring(end);
const replacement = <ThingSpeakFieldSelector
                  {...tsSelector}
                  inputClassName={inp()}
                  template={watchTemplate}
                  onMappingChange={(mapping) => {
                    setValue('thingspeak_channel_id', tsSelector.channelId, { shouldValidate: true });
                    setValue('thingspeak_read_key', tsSelector.readApiKey, { shouldValidate: true });
                    setValue('sensor_field_mapping', mapping, { shouldValidate: true });
                  }}
                />;
fs.writeFileSync(p, p1 + replacement + p2);
