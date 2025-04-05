const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());


app.post('/verify-unity-token', async (req, res) => {
    const accessToken = req.body.access_token;
    console.log("Received access_token: Succeed");
    if (!accessToken) {
        return res.status(400).json({ ResultCode: 0, Message: "Missing access_token" });
    }

    try {
        // Gọi Unity API để xác minh token
        const response = await axios.get('https://services.api.unity.com/identity/v1/tokeninfo', {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        const userId = response.data.sub; // sub là User ID trong Unity
        const nickname = "Player_" + userId.slice(-4); // Tùy bạn đặt logic

        // Trả kết quả cho Photon
        return res.json({
            ResultCode: 1,
            UserId: userId,
            NickName: nickname,
            Data: {
                skin: "blue",
                level: 5
            }
        });

    } catch (err) {
        return res.status(401).json({ ResultCode: 0, Message: "Invalid or expired token" });
    }
});

app.listen(3000, () => console.log('Server listening on port 3000'));
