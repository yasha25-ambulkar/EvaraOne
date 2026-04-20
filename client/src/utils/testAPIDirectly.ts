import axios from 'axios';

// Test the exact API call the frontend makes
const testTDSHistoryAPI = async () => {
  try {
    const baseURL = import.meta.env.DEV ? '/api/v1' : 'http://localhost:8000/api/v1';
    
    console.log('🧪 Testing TDS History API');
    console.log('Base URL:', baseURL);
    console.log('Device ID: OQWlyPvxFmmbTZMmCUa2');
    console.log('');

    // Create axios instance
    const api = axios.create({
      baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Make request
    const url = `/devices/tds/OQWlyPvxFmmbTZMmCUa2/history?hours=3`;
    console.log('📡 Sending GET request to:', url);
    console.log('');

    const response = await api.get(url);

    console.log('✅ Response received');
    console.log('Status:', response.status);
    console.log('Data structure:');
    console.log('  - id:', response.data?.id);
    console.log('  - label:', response.data?.label);
    console.log('  - count:', response.data?.count);
    console.log('  - period_hours:', response.data?.period_hours);
    console.log('  - history array length:', response.data?.history?.length);
    console.log('');

    if (response.data?.history && response.data.history.length > 0) {
      console.log('📊 Sample history points:');
      const samples = response.data.history.slice(0, 3);
      samples.forEach((point, i) => {
        console.log(`  Point ${i + 1}:`, {
          timestamp: point.timestamp,
          value: point.value,
          temperature: point.temperature,
          quality: point.quality
        });
      });
      console.log('  ...');
      const last = response.data.history[response.data.history.length - 1];
      console.log(`  Point ${response.data.history.length}:`, {
        timestamp: last.timestamp,
        value: last.value,
        temperature: last.temperature,
        quality: last.quality
      });
    } else {
      console.log('⚠️  No history data returned!');
    }

    console.log('');
    console.log('✅ API Test Complete');

  } catch (error: any) {
    console.error('❌ API Request Failed');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
};

// Run test
testTDSHistoryAPI();
