const axios = require('axios');

async function testLikeAndDislike() {
    try {
        // Step 1: Create a post
        const postResponse = await axios.post('http://localhost:5000/api/create-post', {
            uaid: 1,  // Replace with your actual UAID
            title: "Test Post Title",
            content: "This is a test post content Good",
            s_id: 1  // Replace with your actual S_ID
        });

        console.log('Post Created:', postResponse.data);

        const pid = postResponse.data.post_id;  // Get the post ID from the response

        // Step 2: Like the post
        const likeResponse = await axios.post('http://localhost:5000/api/like-post', {
            uaid: 1,  // User ID
            pid: pid, // Post ID from the created post
            s_id: 1   // Optional section/service ID
        });

        console.log('Post Liked:', likeResponse.data);

        // // Step 3: Dislike the post
        // const dislikeResponse = await axios.post('http://localhost:5000/api/dislike-post', {
        //     uaid: 1,  // User ID
        //     pid: pid  // Post ID from the created post
        // });

        // console.log('Post Disliked:', dislikeResponse.data);

    } catch (error) {
        console.error('Error testing APIs:', error.response ? error.response.data : error.message);
    }
}

// Run the test
testLikeAndDislike();
