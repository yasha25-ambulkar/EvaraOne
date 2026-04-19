
const axios = require('axios');

async function testBackend() {
    try {
        console.log("Fetching /api/v1/nodes...");
        const nodesRes = await axios.get('http://localhost:5000/api/v1/nodes');
        const tdsNodes = nodesRes.data.filter(n => n.device_type === 'evaratds' || n.asset_type === 'evaratds');
        
        console.log(`Found ${tdsNodes.length} TDS nodes.`);
        tdsNodes.forEach(n => {
            console.log(`Node: ${n.id} (${n.label})`);
            console.log(`  Coords: lat=${n.latitude}, lng=${n.longitude}`);
            console.log(`  Telemetry:`, n.last_telemetry);
        });

        if (tdsNodes.length > 0) {
            const id = tdsNodes[0].id;
            console.log(`\nFetching analytics for ${id}...`);
            const analyticsRes = await axios.get(`http://localhost:5000/api/v1/nodes/${id}/analytics?range=24h`);
            console.log(`Analytics result:`, JSON.stringify(analyticsRes.data, null, 2).substring(0, 500) + "...");
        }

    } catch (error) {
        console.error("Test failed:", error.message);
        if (error.response) {
            console.error("Response:", error.response.data);
        }
    }
}

testBackend();
