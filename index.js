const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 4000;
app.use(express.json());


app.get('/verify-unity-token', async (req, res) => {
    const accessToken = req.query.access_token;
    const playerId = req.query.player_id;
    console.log("Received: Succeed");
    if (!accessToken || !playerId) {
        console.log("Received: Failed");
        return res.status(400).json({ ResultCode: 0, Message: "Missing Params" });
    }

    try {
        // Gọi Unity API để lấy thông tin người dùng đồng thời xác thực token
        const response = await axios.get('https://social.services.api.unity.com/v1/names/'+playerId, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                ProjectId: process.env.PROJECT_ID
            }
        });

        const PlayerName = response.data.name; // sub là User ID trong Unity
        const nickname = PlayerName; // Tùy bạn đặt logic

        // Trả kết quả cho Photon
        return res.json({
            ResultCode: 1,
            UserId: playerId,
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
// app.use((req, res) => {
//     console.log("Received unexpected request:", req.method, req.url);
//     res.status(404).json({ message: "Route not found" });
// });
app.listen(port, () => console.log('Server listening on port', port));
