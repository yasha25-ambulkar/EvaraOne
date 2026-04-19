const { z } = require("zod");

exports.createNodeSchema = z.object({
  body: z.object({
    id: z.string().optional(),
    displayName: z.string().min(1),
    assetType: z.string().min(1),
    assetSubType: z.string().optional(),
    zoneId: z.string().optional(),
    customerId: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    channelId: z.string().optional(),
    readApiKey: z.string().optional(),
    capacity: z.number().optional(),
    status: z.string().optional(),
    // TDS specific
    tdsValue: z.number().optional(),
    temperature: z.number().optional(),
    waterQualityRating: z.enum(["Good", "Acceptable", "Critical"]).optional(),
    location: z.string().optional()
  })
});

exports.updateNodeSchema = z.object({
  params: z.object({
    id: z.string()
  }),
  body: z.object({
    displayName: z.string().optional(),
    label: z.string().optional(),
    deviceName: z.string().optional(),
    device_name: z.string().optional(),
    assetType: z.string().optional(),
    assetSubType: z.string().optional(),
    zoneId: z.string().optional(),
    customerId: z.string().optional(),
    customer_id: z.string().optional(),
    latitude: z.union([z.number(), z.string()]).optional(),
    longitude: z.union([z.number(), z.string()]).optional(),
    // ThingSpeak credentials — all naming variants accepted
    channelId: z.string().optional(),
    readApiKey: z.string().optional(),
    thingspeak_channel_id: z.string().optional(),
    thingspeakChannelId: z.string().optional(),
    thingspeak_read_key: z.string().optional(),
    thingspeak_read_api_key: z.string().optional(),
    thingspeakReadKey: z.string().optional(),
    // Field mappings
    waterLevelField: z.string().optional(),
    water_level_field: z.string().optional(),
    borewellDepthField: z.string().optional(),
    depth_field: z.string().optional(),
    meterReadingField: z.string().optional(),
    meter_reading_field: z.string().optional(),
    flowRateField: z.string().optional(),
    flow_rate_field: z.string().optional(),
    // Physical dimensions
    capacity: z.union([z.number(), z.string()]).optional(),
    capacity_liters: z.union([z.number(), z.string()]).optional(),
    tank_size: z.union([z.number(), z.string()]).optional(),
    depth: z.union([z.number(), z.string()]).optional(),
    height_m: z.union([z.number(), z.string()]).optional(),
    tank_height: z.union([z.number(), z.string()]).optional(),
    max_depth: z.union([z.number(), z.string()]).optional(),
    tankLength: z.union([z.number(), z.string()]).optional(),
    length_m: z.union([z.number(), z.string()]).optional(),
    tank_length: z.union([z.number(), z.string()]).optional(),
    tankBreadth: z.union([z.number(), z.string()]).optional(),
    breadth_m: z.union([z.number(), z.string()]).optional(),
    tank_breadth: z.union([z.number(), z.string()]).optional(),
    radius: z.union([z.number(), z.string()]).optional(),
    radius_m: z.union([z.number(), z.string()]).optional(),
    tank_radius: z.union([z.number(), z.string()]).optional(),
    // Deep well config
    staticDepth: z.union([z.number(), z.string()]).optional(),
    static_water_level: z.union([z.number(), z.string()]).optional(),
    dynamicDepth: z.union([z.number(), z.string()]).optional(),
    dynamic_water_level: z.union([z.number(), z.string()]).optional(),
    rechargeThreshold: z.union([z.number(), z.string()]).optional(),
    recharge_threshold: z.union([z.number(), z.string()]).optional(),
    total_bore_depth: z.union([z.number(), z.string()]).optional(),
    // Flow meter config
    max_flow_rate: z.union([z.number(), z.string()]).optional(),
    maxFlowRate: z.union([z.number(), z.string()]).optional(),
    // Other
    status: z.string().optional(),
    tank_shape: z.string().optional(),
    temperature_field: z.string().optional(),
    // TDS specific
    tdsValue: z.number().optional(),
    temperature: z.number().optional(),
    waterQualityRating: z.enum(["Good", "Acceptable", "Critical"]).optional(),
    location: z.string().optional(),
    tdsHistory: z.array(z.object({ value: z.number(), timestamp: z.any() })).optional(),
    tempHistory: z.array(z.object({ value: z.number(), timestamp: z.any() })).optional(),
  }).passthrough()
});

exports.createZoneSchema = z.object({
    body: z.object({
        zoneName: z.string().min(1),
        state: z.string().min(1),
        country: z.string().min(1),
        zone_code: z.string().optional(),
        description: z.string().optional()
    })
});

exports.createCustomerSchema = z.object({
    body: z.object({
        display_name: z.string().min(1),
        email: z.string().email().optional(),
        phone: z.string().optional()
    })
});
