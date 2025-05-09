const axios = require('axios');

async function testPostAPI() {
    try {
        const response = await axios.post('http://localhost:5000/api/create-post', {
            uaid: 1,  // Replace with your actual UAID
            title: "Test Post Title",
            content: "This is a test post content Good",
            s_id: 1  // Replace with your actual S_ID
        });

        console.log('API Response:', response.data);
    } catch (error) {
        console.error('Error testing API:', error.response ? error.response.data : error.message);
    }
}

// Run the test
testPostAPI(); 