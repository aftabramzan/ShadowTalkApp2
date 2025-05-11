const axios = require('axios');

async function testViewPublicProfileAPI() {
    const uaid = 1; // 🔁 Replace with an actual UAID that exists in your DB

    try {
        const response = await axios.get(`http://localhost:5000/api/view-public-profile/${uaid}`);
        console.log('GET /api/view-public-profile Response:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('Error in GET /api/view-public-profile:', error.response ? error.response.data : error.message);
    }
}

// Call the test
testViewPublicProfileAPI();
