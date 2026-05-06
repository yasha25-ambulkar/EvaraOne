const channelId = "2613746";
const apiKey = "HFNHKPM629X3M2F5";
const fieldKey = "field1";

async function testTS() {
    const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&results=5`;
    console.log(`Fetching from: ${url}`);
    
    const res = await fetch(url);
    const json = await res.json();
    console.log("Response:", JSON.stringify(json, null, 2));
}

testTS().catch(console.error);
