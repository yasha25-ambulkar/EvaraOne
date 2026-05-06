const axios = require('axios');

async function checkApi() {
  try {
    const res = await axios.get('http://localhost:5002/api/v1/nodes/EV-TNK-003/telemetry');
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('API call failed:', err.response?.data || err.message);
  }
}

checkApi();
