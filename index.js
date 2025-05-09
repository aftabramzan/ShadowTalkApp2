
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase JSON payload limit for base64 images

// Database configuration
const dbConfig = {
    host: 'ballast.proxy.rlwy.net',
    port: 36187,
    user: 'root',
    password: 'DvOaFEEahZudDBXyLLWCKGjMleRcmLDz',
    database: 'railway'
};

// Create a connection pool
const pool = mysql.createPool(dbConfig);

app.post('/api/chat', async (req, res) => {
    try {
        const { uaid, message } = req.body;

        if (!uaid || !message) {
            return res.status(400).json({
                success: false,
                message: "Missing required parameters"
            });
        }

        // Simple response logic (replace this with NLP logic later)
        const response_text = "Thanks for your message!";
        const sentiment_score = 0.5; // Default
        const is_biased = 0; // Default non-biased

        // Get a connection from the pool
        const connection = await pool.getConnection();

        try {
            // Insert into ChatbotResponse table
            const [result] = await connection.execute(
                "INSERT INTO ChatbotResponse (UAID, CB_Text, SentimentsScore, CB_is_biased, Created_By) VALUES (?, ?, ?, ?, ?)",
                [uaid, response_text, sentiment_score, is_biased, uaid]
            );

            res.json({
                success: true,
                response: response_text,
                sentiment: sentiment_score,
                biased: is_biased
            });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
});

// New post creation endpoint
app.post('/api/create-post', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const { uaid, title, content, sentiment_score = 0.0, s_id } = req.body;

        // Validate required fields
        if (!uaid || !content) {
            return res.status(400).json({ response: "Missing required fields" });
        }

        // Start transaction
        await connection.beginTransaction();

        try {
            // Insert post
            const [postResult] = await connection.execute(
                `INSERT INTO UserPost (UAID, S_ID, Title, Content, SentimentsScore, Created_By) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [uaid, s_id, title, content, sentiment_score, uaid]
            );

            const post_id = postResult.insertId;

            // Get user data
            const [userData] = await connection.execute(
                `SELECT ua.Username, ua.Email, ua.Username_visibility,
                        u.First_Name, u.Last_Name, u.Anonymous_name, u.Name_visibility,
                        upi.Real_Image, upi.Hide_Image, upi.Profile_visibility
                 FROM UserAuthentication ua
                 LEFT JOIN Users u ON ua.UAID = u.UAID
                 LEFT JOIN UserProfileImage upi ON ua.UAID = upi.UAID
                 WHERE ua.UAID = ?`,
                [uaid]
            );

            if (userData.length === 0) {
                throw new Error("User not found");
            }

            const user = userData[0];

            // Commit transaction
            await connection.commit();

            // Prepare response
            const response = {
                response: "Post created successfully",
                post_id: post_id,
                user_data: {
                    username: user.Username_visibility === 'visible' ? 
                            user.Username : 'Anonymous',
                    name: user.Name_visibility === 'visible' ? 
                         `${user.First_Name} ${user.Last_Name}` : 
                         user.Anonymous_name,
                    profile_image: user.Profile_visibility === 'visible' ? 
                                 Buffer.from(user.Real_Image).toString('base64') : 
                                 Buffer.from(user.Hide_Image).toString('base64')
                }
            };

            res.json(response);
        } catch (error) {
            // Rollback transaction on error
            await connection.rollback();
            throw error;
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            response: "Error: " + error.message 
        });
    } finally {
        connection.release();
    }
});
app.get('/api/search-public-profiles', async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const { query } = req.query;

        if (!query || query.trim() === "") {
            return res.status(400).json({
                status: "error",
                message: "Search query is required"
            });
        }

        const searchTerm = `%${query}%`;

        // Query to fetch users with username visible and personal info visible
        const [visibleUsers] = await connection.execute(
            `SELECT 
                u.First_Name, u.Last_Name, u.Anonymous_name, u.Name_visibility,
                upi.Real_Image, upi.Hide_Image, upi.Profile_visibility
             FROM Users u
             LEFT JOIN UserProfileImage upi ON u.UAID = upi.UAID
             WHERE 
                u.Name_visibility = 'visible'
                AND u.PersonalInfo_visibility = 'visible'
                AND (
                    CONCAT(u.First_Name, ' ', u.Last_Name) LIKE ?
                    OR u.Anonymous_name LIKE ?
                )`,
            [searchTerm, searchTerm]
        );

        // Query to fetch users with username visible but personal info hidden (only search by anonymous name)
        const [hiddenPersonalInfoUsers] = await connection.execute(
            `SELECT 
                u.First_Name, u.Last_Name, u.Anonymous_name, u.Name_visibility,
                upi.Real_Image, upi.Hide_Image, upi.Profile_visibility
             FROM Users u
             LEFT JOIN UserProfileImage upi ON u.UAID = upi.UAID
             WHERE 
                u.Name_visibility = 'visible'
                AND u.PersonalInfo_visibility = 'hidden'
                AND u.Anonymous_name LIKE ?`,
            [searchTerm]
        );

        // Combine both results
        const allUsers = [...visibleUsers, ...hiddenPersonalInfoUsers];

        const users = allUsers.map(user => {
            const displayName = user.Name_visibility === 'visible'
                ? `${user.First_Name} ${user.Last_Name}`
                : user.Anonymous_name;

            // Check if image visibility is allowed and show the appropriate image
            const profileImage = user.Profile_visibility === 'visible'
                ? (user.Real_Image ? Buffer.from(user.Real_Image).toString('base64') : null)
                : (user.Hide_Image ? Buffer.from(user.Hide_Image).toString('base64') : null);

            return {
                name: displayName,
                profile_image: profileImage
            };
        });

        res.json({
            status: "success",
            users
        });

    } catch (error) {
        console.error("Error searching public profiles:", error);
        res.status(500).json({
            status: "error",
            message: error.message
        });
    } finally {
        connection.release();
    }
});

// New user creation endpoint
app.post('/api/create-user', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const userData = {
            firstName: req.body.first_name,
            middleName: req.body.middle_name,
            lastName: req.body.last_name,
            age: req.body.age,
            country: req.body.country,
            city: req.body.city,
            anonymousName: req.body.anonymous_name,
            postalCode: req.body.postal_code,
            uaid: req.body.uaid,
            nameVisibility: req.body.name_visibility || 'visible',
            personalInfoVisibility: req.body.personal_info_visibility || 'visible'
        };

        // Validate required fields
        const requiredFields = ['firstName', 'lastName', 'anonymousName', 'uaid'];
        const missingFields = requiredFields.filter(field => !userData[field]);

        if (missingFields.length > 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Missing required fields: ' + missingFields.join(', ')
            });
        }

        // Check if UAID exists in UserAuthentication table
        const [existingUser] = await connection.execute(
            "SELECT UAID FROM UserAuthentication WHERE UAID = ?",
            [userData.uaid]
        );

        if (existingUser.length === 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid User Authentication ID (UAID)'
            });
        }

        // Insert new user
        const [result] = await connection.execute(
            `INSERT INTO Users (
                First_Name, 
                Middle_Name, 
                Last_Name, 
                Age, 
                Country, 
                City, 
                Anonymous_name, 
                Postal_Code, 
                UAID,
                Name_visibility,
                PersonalInfo_visibility
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userData.firstName,
                userData.middleName,
                userData.lastName,
                userData.age,
                userData.country,
                userData.city,
                userData.anonymousName,
                userData.postalCode,
                userData.uaid,
                userData.nameVisibility,
                userData.personalInfoVisibility
            ]
        );

        res.json({
            status: 'success',
            message: 'User created successfully',
            userId: result.insertId
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to create user: ' + error.message
        });
    } finally {
        connection.release();
    }
});

// New endpoint to fetch user data
app.post('/api/get-user-data', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const { UAID } = req.body;

        if (!UAID) {
            return res.status(400).json({
                status: 'error',
                message: 'UAID is required'
            });
        }

        // Fetch user data
        const [rows] = await connection.execute(
            `SELECT u.First_Name, u.Last_Name, ui.Real_Image
             FROM Users u
             JOIN UserAuthentication ua ON u.UAID = ua.UAID
             JOIN UserProfileImage ui ON ua.UAID = ui.UAID
             WHERE ua.UAID = ?`,
            [UAID]
        );

        if (rows.length > 0) {
            res.json({
                status: 'success',
                data: rows[0]
            });
        } else {
            res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Internal server error'
        });
    } finally {
        connection.release();
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                response: "Email and password are required"
            });
        }

        // Check if email and password exist in the database
        const [users] = await connection.execute(
            'SELECT UAID, Email, Username FROM UserAuthentication WHERE Email = ? AND Password = ?',
            [email, password]
        );

        if (users.length > 0) {
            const user = users[0];
            res.json({
                response: "Login Successful",
                uaid: user.UAID,
                email: user.Email,
                username: user.Username
            });
        } else {
            res.status(401).json({
                response: "Invalid credentials"
            });
        }

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            response: "Internal server error"
        });
    } finally {
        connection.release();
    }
});

// Profile image upload endpoint
app.post('/api/upload-profile-image', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const { uaid, real_image, hide_image } = req.body;

        if (!uaid || !real_image || !hide_image) {
            return res.status(400).json({
                success: false,
                message: "UAID, real_image, and hide_image are required"
            });
        }

        // Decode base64 images
        const realImageBuffer = Buffer.from(real_image, 'base64');
        const hideImageBuffer = Buffer.from(hide_image, 'base64');

        // Check if record already exists
        const [existingRecord] = await connection.execute(
            'SELECT UAID FROM UserProfileImage WHERE UAID = ?',
            [uaid]
        );

        if (existingRecord.length > 0) {
            // Update existing record
            await connection.execute(
                'UPDATE UserProfileImage SET Real_Image = ?, Hide_Image = ? WHERE UAID = ?',
                [realImageBuffer, hideImageBuffer, uaid]
            );
        } else {
            // Insert new record
            await connection.execute(
                'INSERT INTO UserProfileImage (Real_Image, Hide_Image, UAID, Profile_visibility) VALUES (?, ?, ?, ?)',
                [realImageBuffer, hideImageBuffer, uaid, 'visible']
            );
        }

        res.json({
            success: true,
            message: "Profile image saved successfully"
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: "Failed to save profile image"
        });
    } finally {
        connection.release();
    }
});



app.post('/api/create-complete-profile', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        // Start transaction
        await connection.beginTransaction();

        try {
            const {
                first_name,
                middle_name,
                last_name,
                age,
                country,
                city,
                anonymous_name,
                postal_code,
                uaid,
                emailvisible,
                uservisible,
                imagevisible
            } = req.body;

            // Validate required fields
            const requiredFields = ['first_name', 'last_name', 'anonymous_name', 'uaid'];
            const missingFields = requiredFields.filter(field => !req.body[field]);

            if (missingFields.length > 0) {
                return res.status(400).json({
                    status: "error",
                    message: `Missing required fields: ${missingFields.join(', ')}`
                });
            }

            // // Decode base64 images
            // const realImageBuffer = Buffer.from(real_image, 'base64');
            // const hideImageBuffer = Buffer.from(hide_image, 'base64');

            // 1. Insert into Users table
            const [userResult] = await connection.execute(
                `INSERT INTO Users (
                    First_Name, Middle_Name, Last_Name, Age, Country, City,
                    Anonymous_name, Postal_Code, UAID, Name_visibility, PersonalInfo_visibility
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    first_name, middle_name, last_name, age, country, city,
                    anonymous_name, postal_code, uaid, uservisible, emailvisible
                ]
            );

            // 2. Insert into UserProfileImage table
            // await connection.execute(
            //     'INSERT INTO UserProfileImage (Real_Image, Hide_Image, UAID, Profile_visibility) VALUES (?, ?, ?, ?)',
            //     [realImageBuffer, hideImageBuffer, uaid, imagevisible]
            // );

            // Commit transaction
            await connection.commit();

            res.json({
                status: "success",
                message: "Profile and image created successfully"
            });

        } catch (error) {
            // Rollback transaction on error
            await connection.rollback();
            throw error;
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            status: "error",
            message: error.message
        });
    } finally {
        connection.release();
    }
});

app.post('/api/update-complete-profile', async (req, res) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        try {
            const {
                first_name,
                middle_name,
                last_name,
                age,
                country,
                city,
                anonymous_name,
                postal_code,
                uaid,
                real_image,
                hide_image,
                emailvisible,
                uservisible,
                imagevisible
            } = req.body;

            if (!uaid) {
                return res.status(400).json({
                    status: "error",
                    message: "Missing required field: uaid"
                });
            }

            // 1. Update Users table
            const userFields = [];
            const userValues = [];

            if (first_name !== undefined) {
                userFields.push("First_Name = ?");
                userValues.push(first_name);
            }
            if (middle_name !== undefined) {
                userFields.push("Middle_Name = ?");
                userValues.push(middle_name);
            }
            if (last_name !== undefined) {
                userFields.push("Last_Name = ?");
                userValues.push(last_name);
            }
            if (age !== undefined) {
                userFields.push("Age = ?");
                userValues.push(age);
            }
            if (country !== undefined) {
                userFields.push("Country = ?");
                userValues.push(country);
            }
            if (city !== undefined) {
                userFields.push("City = ?");
                userValues.push(city);
            }
            if (anonymous_name !== undefined) {
                userFields.push("Anonymous_name = ?");
                userValues.push(anonymous_name);
            }
            if (postal_code !== undefined) {
                userFields.push("Postal_Code = ?");
                userValues.push(postal_code);
            }
            if (uservisible !== undefined) {
                userFields.push("Name_visibility = ?");
                userValues.push(uservisible);
            }
            if (emailvisible !== undefined) {
                userFields.push("PersonalInfo_visibility = ?");
                userValues.push(emailvisible);
            }

            if (userFields.length > 0) {
                userValues.push(uaid);
                const userUpdateQuery = `
                    UPDATE Users 
                    SET ${userFields.join(', ')} 
                    WHERE UAID = ?
                `;
                await connection.execute(userUpdateQuery, userValues);
            }

            // 2. Update UserProfileImage table
            const imageFields = [];
            const imageValues = [];

            if (real_image !== undefined) {
                const realImageBuffer = Buffer.from(real_image, 'base64');
                imageFields.push("Real_Image = ?");
                imageValues.push(realImageBuffer);
            }
            if (hide_image !== undefined) {
                const hideImageBuffer = Buffer.from(hide_image, 'base64');
                imageFields.push("Hide_Image = ?");
                imageValues.push(hideImageBuffer);
            }
            if (imagevisible !== undefined) {
                imageFields.push("Profile_visibility = ?");
                imageValues.push(imagevisible);
            }

            if (imageFields.length > 0) {
                imageValues.push(uaid);
                const imageUpdateQuery = `
                    UPDATE UserProfileImage 
                    SET ${imageFields.join(', ')} 
                    WHERE UAID = ?
                `;
                await connection.execute(imageUpdateQuery, imageValues);
            }

            await connection.commit();

            res.json({
                status: "success",
                message: "Profile updated successfully"
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            status: "error",
            message: error.message
        });
    } finally {
        connection.release();
    }
});
app.get('/api/get-user/:uaid', async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const uaid = req.params.uaid;

        if (!uaid) {
            return res.status(400).json({
                status: "error",
                message: "Missing UAID"
            });
        }

        const [userData] = await connection.execute(
            `SELECT 
                ua.Username, ua.Email, ua.Username_visibility, 
                u.First_Name, u.Middle_Name, u.Last_Name, u.Anonymous_name,u.Age, u.Country, u.City, u.Postal_Code
             FROM UserAuthentication ua
             LEFT JOIN Users u ON ua.UAID = u.UAID
             LEFT JOIN UserProfileImage upi ON ua.UAID = upi.UAID
             WHERE ua.UAID = ?`,
            [uaid]
        );

        if (userData.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "User not found"
            });
        }

        const user = userData[0];

        res.json({
            status: "success",
            user: {
                username: user.Username,
                email: user.Email,
                first_name: user.First_Name,
                middle_name: user.Middle_Name,
                last_name: user.Last_Name,
                anonymous_name: user.Anonymous_name,
                age: user.Age,
                country: user.Country,
                city: user.City,
                postal_code: user.Postal_Code,

                real_image: user.Real_Image ? Buffer.from(user.Real_Image).toString('base64') : null,
                hide_image: user.Hide_Image ? Buffer.from(user.Hide_Image).toString('base64') : null
            }
        });

    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({
            status: "error",
            message: error.message
        });
    } finally {
        connection.release();
    }
});
// User registration endpoint
// Registration endpoint
app.post('/api/register', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const { email, username, password, confirmPassword, phoneNo } = req.body;

        // Validate required fields
        if (!email || !username || !password || !confirmPassword) {
            return res.status(400).json({
                status: 'error',
                message: 'Email, username, password, and confirm password are required'
            });
        }

        // Validate password match
        if (password !== confirmPassword) {
            return res.status(400).json({
                status: 'error',
                message: 'Passwords do not match'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid email format'
            });
        }

        // Validate phone number format if provided
        if (phoneNo) {
            const phoneRegex = /^\+?[\d\s-]{10,15}$/;
            if (!phoneRegex.test(phoneNo)) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Invalid phone number format'
                });
            }
        }

        // Check if email already exists
        const [existingEmail] = await connection.execute(
            'SELECT UAID FROM UserAuthentication WHERE Email = ?',
            [email]
        );

        if (existingEmail.length > 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Email already registered'
            });
        }

        // Check if username already exists
        const [existingUsername] = await connection.execute(
            'SELECT UAID FROM UserAuthentication WHERE Username = ?',
            [username]
        );

        if (existingUsername.length > 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Username already taken'
            });
        }

        // Start transaction
        await connection.beginTransaction();

        try {
            // Insert into UserAuthentication table
            const [result] = await connection.execute(
                `INSERT INTO UserAuthentication (
                    Email, 
                    Username, 
                    Password, 
                    ConfirmPassword,
                    PhoneNo
                ) VALUES (?, ?, ?, ?, ?)`,
                [email, username, password, confirmPassword, phoneNo]
            );

            const uaid = result.insertId;

            // Commit transaction
            await connection.commit();

            res.json({
                status: 'success',
                message: 'Registration successful',
                uaid: uaid,
                email: email,
                username: username,
                phoneNo: phoneNo
            });

        } catch (error) {
            // Rollback transaction on error
            await connection.rollback();
            throw error;
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Registration failed: ' + error.message
        });
    } finally {
        connection.release();
    }
});

// Add comment endpoint
app.post('/api/add-comment', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const { pid, uaid, comment_text, s_id, sentiment_score = 0.0 } = req.body;

        if (!pid || !uaid || !comment_text) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields"
            });
        }

        const [result] = await connection.execute(
            `INSERT INTO Comment (PID, UAID, Comment_text, S_ID, SentimentsScore, Created_by) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [pid, uaid, comment_text, s_id, sentiment_score, uaid]
        );

        res.json({
            success: true,
            message: "Comment added successfully",
            comment_id: result.insertId
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: "Failed to add comment"
        });
    } finally {
        connection.release();
    }
});

// Get comments for a post
app.get('/api/get-comments/:pid', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const { pid } = req.params;

        const [comments] = await connection.execute(
            `SELECT c.*, u.Anonymous_name, u.Name_visibility, upi.Real_Image, upi.Hide_Image, upi.Profile_visibility
             FROM Comment c
             LEFT JOIN Users u ON c.UAID = u.UAID
             LEFT JOIN UserProfileImage upi ON c.UAID = upi.UAID
             WHERE c.PID = ? AND c.Action = 'A'
             ORDER BY c.Created_at DESC`,
            [pid]
        );

        // Process comments to handle visibility
        const processedComments = comments.map(comment => ({
            ...comment,
            user_name: comment.Name_visibility === 'visible' ? 
                      `${comment.First_Name} ${comment.Last_Name}` : 
                      comment.Anonymous_name,
            profile_image: comment.Profile_visibility === 'visible' ? 
                          Buffer.from(comment.Real_Image).toString('base64') : 
                          Buffer.from(comment.Hide_Image).toString('base64')
        }));

        res.json({
            success: true,
            comments: processedComments
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch comments"
        });
    } finally {
        connection.release();
    }
});

// Add message endpoint
app.post('/api/add-message', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const { uaid, s_id, cb_id, message_text, sentiment_score = 0.0 } = req.body;

        if (!uaid || !message_text) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields"
            });
        }

        const [result] = await connection.execute(
            `INSERT INTO Message (UAID, S_ID, CB_ID, Message_Text, SentimentsScore, Created_By) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uaid, s_id, cb_id, message_text, sentiment_score, uaid]
        );

        res.json({
            success: true,
            message: "Message sent successfully",
            message_id: result.insertId
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: "Failed to send message"
        });
    } finally {
        connection.release();
    }
});

// Get messages for a user
app.get('/api/get-messages/:uaid', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const { uaid } = req.params;

        const [messages] = await connection.execute(
            `SELECT m.*, u.Anonymous_name, u.Name_visibility, upi.Real_Image, upi.Hide_Image, upi.Profile_visibility
             FROM Message m
             LEFT JOIN Users u ON m.UAID = u.UAID
             LEFT JOIN UserProfileImage upi ON m.UAID = upi.UAID
             WHERE m.UAID = ? AND m.Action = 'A'
             ORDER BY m.Created_on DESC`,
            [uaid]
        );

        // Process messages to handle visibility
        const processedMessages = messages.map(message => ({
            ...message,
            user_name: message.Name_visibility === 'visible' ? 
                      `${message.First_Name} ${message.Last_Name}` : 
                      message.Anonymous_name,
            profile_image: message.Profile_visibility === 'visible' ? 
                          Buffer.from(message.Real_Image).toString('base64') : 
                          Buffer.from(message.Hide_Image).toString('base64')
        }));

        res.json({
            success: true,
            messages: processedMessages
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch messages"
        });
    } finally {
        connection.release();
    }
});

// Update post endpoint
app.put('/api/update-post/:pid', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const { pid } = req.params;
        const { uaid, title, content, sentiment_score } = req.body;

        // Validate required fields
        if (!uaid || !content) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields"
            });
        }

        // Check if post exists and belongs to the user
        const [existingPost] = await connection.execute(
            "SELECT * FROM UserPost WHERE PID = ? AND UAID = ?",
            [pid, uaid]
        );

        if (existingPost.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Post not found or unauthorized"
            });
        }

        // Update post
        await connection.execute(
            `UPDATE UserPost 
             SET Title = ?, Content = ?, SentimentsScore = ?, Updated_At = CURRENT_TIMESTAMP, Updated_By = ?
             WHERE PID = ?`,
            [title, content, sentiment_score, uaid, pid]
        );

        res.json({
            success: true,
            message: "Post updated successfully"
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    } finally {
        connection.release();
    }
});

app.post('/api/delete-post', async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const { post_id } = req.body;

        if (!post_id) {
            return res.status(400).json({ response: "Missing post_id" });
        }

        // Check if post exists
        const [existingPost] = await connection.execute(
            `SELECT * FROM UserPost WHERE PID = ?`,
            [post_id]
        );

        if (existingPost.length === 0) {
            return res.status(404).json({ response: "Post not found" });
        }

   // Delete comments for this post
await connection.execute(
    "DELETE FROM Comment WHERE PID = ?",
    [post_id]
);

// Now delete the post
await connection.execute(
    "DELETE FROM UserPost WHERE PID = ?",
    [post_id]
);
        res.json({ response: "Post deleted successfully" });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ response: "Error: " + error.message });
    } finally {
        connection.release();
    }
});




// Get user profile endpoint
app.get('/api/profile/:uaid', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const { uaid } = req.params;

        // Get user profile data
        const [profileData] = await connection.execute(
            `SELECT 
                ua.Email, ua.Username, ua.PhoneNo, ua.Email_visibility, ua.Username_visibility,
                u.First_Name, u.Middle_Name, u.Last_Name, u.Age, u.Country, u.City,
                u.Anonymous_name, u.Postal_Code, u.Name_visibility, u.PersonalInfo_visibility,
                upi.Real_Image, upi.Hide_Image, upi.Profile_visibility
             FROM UserAuthentication ua
             LEFT JOIN Users u ON ua.UAID = u.UAID
             LEFT JOIN UserProfileImage upi ON ua.UAID = upi.UAID
             WHERE ua.UAID = ? AND ua.Action = 'A'`,
            [uaid]
        );

        if (profileData.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Profile not found"
            });
        }

        const profile = profileData[0];

        // Format the response based on visibility settings
        const formattedProfile = {
            email: profile.Email_visibility === 'visible' ? profile.Email : null,
            username: profile.Username_visibility === 'visible' ? profile.Username : 'Anonymous',
            phoneNo: profile.PhoneNo,
            name: profile.Name_visibility === 'visible' ? 
                  `${profile.First_Name} ${profile.Middle_Name ? profile.Middle_Name + ' ' : ''}${profile.Last_Name}` : 
                  profile.Anonymous_name,
            personalInfo: profile.PersonalInfo_visibility === 'visible' ? {
                age: profile.Age,
                country: profile.Country,
                city: profile.City,
                postalCode: profile.Postal_Code
            } : null,
            profileImage: profile.Profile_visibility === 'visible' && profile.Real_Image ? 
                         Buffer.from(profile.Real_Image).toString('base64') : 
                         profile.Hide_Image ? Buffer.from(profile.Hide_Image).toString('base64') : null
        };

        res.json({
            success: true,
            profile: formattedProfile
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    } finally {
        connection.release();
    }
});

// Update user profile endpoint
app.put('/api/profile/:uaid', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const { uaid } = req.params;
        const {
            email,
            username,
            phoneNo,
            firstName,
            middleName,
            lastName,
            age,
            country,
            city,
            anonymousName,
            postalCode,
            emailVisibility,
            usernameVisibility,
            nameVisibility,
            personalInfoVisibility,
            profileVisibility,
            realImage,
            hideImage
        } = req.body;

        // Start transaction
        await connection.beginTransaction();

        try {
            // Update UserAuthentication table
            await connection.execute(
                `UPDATE UserAuthentication 
                 SET Email = ?, Username = ?, PhoneNo = ?, 
                     Email_visibility = ?, Username_visibility = ?,
                     Updated_on = CURRENT_TIMESTAMP
                 WHERE UAID = ?`,
                [email, username, phoneNo, emailVisibility, usernameVisibility, uaid]
            );

            // Update Users table
            await connection.execute(
                `UPDATE Users 
                 SET First_Name = ?, Middle_Name = ?, Last_Name = ?,
                     Age = ?, Country = ?, City = ?,
                     Anonymous_name = ?, Postal_Code = ?,
                     Name_visibility = ?, PersonalInfo_visibility = ?,
                     Updated_on = CURRENT_TIMESTAMP
                 WHERE UAID = ?`,
                [firstName, middleName, lastName, age, country, city,
                 anonymousName, postalCode, nameVisibility, personalInfoVisibility, uaid]
            );

            // Update or insert profile image
            if (realImage || hideImage) {
                const [existingImage] = await connection.execute(
                    "SELECT UAID FROM UserProfileImage WHERE UAID = ?",
                    [uaid]
                );

                if (existingImage.length > 0) {
                    await connection.execute(
                        `UPDATE UserProfileImage 
                         SET Real_Image = ?, Hide_Image = ?, Profile_visibility = ?,
                             Updated_on = CURRENT_TIMESTAMP
                         WHERE UAID = ?`,
                        [realImage ? Buffer.from(realImage, 'base64') : null,
                         hideImage ? Buffer.from(hideImage, 'base64') : null,
                         profileVisibility, uaid]
                    );
                } else {
                    await connection.execute(
                        `INSERT INTO UserProfileImage 
                         (Real_Image, Hide_Image, UAID, Profile_visibility)
                         VALUES (?, ?, ?, ?)`,
                        [realImage ? Buffer.from(realImage, 'base64') : null,
                         hideImage ? Buffer.from(hideImage, 'base64') : null,
                         uaid, profileVisibility]
                    );
                }
            }

            // Commit transaction
            await connection.commit();

            res.json({
                success: true,
                message: "Profile updated successfully"
            });
        } catch (error) {
            // Rollback transaction on error
            await connection.rollback();
            throw error;
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    } finally {
        connection.release();
    }
});

// Chatbot response endpoints
app.post('/api/chatbot-response', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const { uaid, cb_text, sentiment_score, cb_is_biased } = req.body;

        if (!uaid || !cb_text) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields"
            });
        }

        const [result] = await connection.execute(
            `INSERT INTO ChatbotResponse (UAID, CB_Text, SentimentsScore, CB_is_biased, Created_By)
             VALUES (?, ?, ?, ?, ?)`,
            [uaid, cb_text, sentiment_score || 0.0, cb_is_biased || 0, uaid]
        );

        res.json({
            success: true,
            message: "Chatbot response recorded successfully",
            cb_id: result.insertId
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    } finally {
        connection.release();
    }
});

app.get('/api/chatbot-responses/:uaid', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        const { uaid } = req.params;

        const [responses] = await connection.execute(
            `SELECT * FROM ChatbotResponse 
             WHERE UAID = ? AND Action = 'A'
             ORDER BY Created_At DESC`,
            [uaid]
        );

        res.json({
            success: true,
            responses: responses
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    } finally {
        connection.release();
    }
});

// Vercel requires this to be exported
module.exports = app;

// For local development
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
} 
