
const axios = require('axios');

async function testAPI() {
  const nodeId = 'EV-TDS-001';
  const url = `http://localhost:5000/api/nodes/analytics/${nodeId}`;
  console.log(`Testing API: ${url}`);
  
  try {
    const response = await axios.get(url);
    console.log('Response Status:', response.status);
    console.log('Response Data:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('API Error:', error.message);
    if (error.response) {
      console.error('Error Data:', error.response.data);
    }
  }
}

testAPI();
