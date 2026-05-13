// ✅ FIX: Removed PM2 clustering — it breaks Socket.io state
// Socket.io stores room membership in process memory. With clustering:
//   • Client connects to instance A
//   • Telemetry update arrives on instance B
//   • Room lookup finds nothing → real-time update lost
//
// SOLUTION: Use horizontal scaling with Railway replicas + Redis adapter
// The server.js now uses Redis adapter when REDIS_URL is set,
// which allows multiple instances to share Socket.io state.

module.exports = {
  apps: [{
    name: "evara-backend",
    script: "./src/server.js",
    instances: 1,           // ✅ Single instance — Railway handles horizontal scaling
    exec_mode: "fork",      // ✅ Not cluster mode
    watch: false,
    env: {
      NODE_ENV: "production",
      PORT: 8000
    }
  }]
};
