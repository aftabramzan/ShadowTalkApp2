const axios = require('axios');

async function testRegister() {
    try {
        const response = await axios.post('http://localhost:5000/api/register', {
            email: 'janitaaaaa@gamil.com',
            username: 'janitaaa123',
            password: 'password123',
            confirmPassword: 'password123',
            phoneNo: '+923322438858'
        });

        console.log('API Response:', response.data);
    } catch (error) {
        console.error('Error testing API:', error.response ? error.response.data : error.message);
    }
}

// Run the test
testRegister(); 