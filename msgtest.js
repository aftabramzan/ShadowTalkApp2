const axios = require('axios');

async function testAddMessageAPI() {
    try {
        const response = await axios.post('http://localhost:5000/api/add-message', {
            uaid: 1,              // Replace with actual UAID
            s_id: 2,              // Replace with actual S_ID if needed
            cb_id: 3,             // Replace with actual CB_ID if needed
            message_text: "Hello, this is a test message!",
            sentiment_score: 0.85 // Optional, default is 0.0
        });

        console.log('POST /api/add-message Response:', response.data);
    } catch (error) {
        console.error('Error in POST /api/add-message:', error.response ? error.response.data : error.message);
    }
}
async function testGetMessagesAPI() {
    const uaid = 1; // Replace with actual UAID that has messages

    try {
        const response = await axios.get(`http://localhost:5000/api/get-messages/${uaid}`);
        console.log('GET /api/get-messages Response:', response.data);
    } catch (error) {
        console.error('Error in GET /api/get-messages:', error.response ? error.response.data : error.message);
    }
}
(async () => {
    // await testAddMessageAPI();
    await testGetMessagesAPI();
})();

