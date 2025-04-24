const express = require('express');
const axios = require('axios');
const { GetServerEpochTime, signWithHMAC, verifyHMAC } = require('./ServerInterval');
const port = process.env.PORT || 4000;
const app = express();
app.use(express.json());
///verify auth
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
        const response = await axios.get('https://social.services.api.unity.com/v1/names/' + playerId, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                ProjectId: process.env.PROJECT_ID
            }
        });

        const PlayerName = response.data.name; // sub là User ID trong Unity
        const nickname = PlayerName; // Tùy bạn đặt logic
        var listKey = "keys=PLAYER_LEVEL&keys=PLAYER_AVATAR"
        try {
            const responseInfo = await axios.get(
                `https://cloud-save.services.api.unity.com/v1/data/projects/${process.env.PROJECT_ID}/players/${playerId}/public/items?${listKey}`,
                {
                    headers: {
                        Authorization: accessToken,
                        contentType: 'application/json'
                    }
                }
            )
            const ReturnData = {
                level: 1,
                AvatarId: "#0"
            }

            if (responseInfo.data.results) {
                responseInfo.data.results.forEach(item => {
                    if (item.key === "PLAYER_LEVEL") {
                        ReturnData.level = item.value;
                    } else if (item.key === "PLAYER_AVATAR") {
                        ReturnData.AvatarId = item.value
                    }
                });
            }


            // Trả kết quả cho Photon
            return res.json({
                ResultCode: 1,
                UserId: playerId,
                NickName: nickname,
                Data: ReturnData
            });



        } catch (err) {
            res.status(err).json({ ResultCode: 0, Message: "Cannot get player info" })
        }

    } catch (err) {
        return res.status(401).json({ ResultCode: 0, Message: "Invalid or expired token" });
    }
});

/// save match info and generate secret key
app.post('/init-new-match', async (req, res) => {
    const accessToken = req.headers.authorization; // Lấy access token từ header Authorization
    const matchId = req.body.match_id;
    const playerId = req.body.player_id;

    if (!accessToken || !matchId || !playerId) {
        return res.status(400).json({ ResultCode: 0, Message: "Missing Params" });
    }

    const CurrentTimeStamp = GetServerEpochTime()

    const MatchInfo = {
        matchId: matchId,
        startTimestamp: CurrentTimeStamp
    }

    const Data = {
        key: process.env.CLOUD_SAVE_MATCH_INFO_KEY,
        value: MatchInfo
    }
    // Save Data public
    try {
        const response = await axios.post(
            `https://cloud-save.services.api.unity.com/v1/data/projects/${process.env.PROJECT_ID}/players/${playerId}/public/items`,
            Data,
            {
                headers: {
                    Authorization: accessToken,
                    contentType: 'application/json'
                }
            }
        )
    } catch (err) {
        console.log(err)
        return res.status(err.status).json({ ResultCode: 0, Message: "Cannot save player data" })
    }
    // generate secret key
    const message = `${Data.value.matchId}${Data.value.startTimestamp}`
    const secret = process.env.SECRET_KEY

    const SecretKey = await signWithHMAC(message, secret);
    return res.json({
        ResultCode: 1,
        Message: "Succeed",
        Data: {
            matchId: MatchInfo.matchId,
            CreatAt: MatchInfo.startTimestamp,
            SecretKey: SecretKey
        }
    });
});

/// reward 
app.post('/reward', async (req, res) => {
    const accessToken = req.headers.authorization; // Lấy access token từ header Authorization
    const playerId = req.body.player_id;
    const Rewrads = req.body.rewards;
    const key = process.env.CLOUD_SAVE_MATCH_INFO_KEY
    if (!accessToken || !playerId || !Rewrads) {
        return res.status(400).json({ ResultCode: 0, Message: "Missing Params" });
    }
    var listKey = `keys=${key}`
    if (Rewrads.XP) {
        console.log("phat hien phan thuong co XP(2.1)")
        listKey += "&keys=PLAYER_LEVEL&keys=PLAYER_XP"
    }
    try {
        const response = await axios.get(
            `https://cloud-save.services.api.unity.com/v1/data/projects/${process.env.PROJECT_ID}/players/${playerId}/public/items?${listKey}`,
            {
                headers: {
                    Authorization: accessToken,
                    contentType: 'application/json'
                }
            }
        )
        const instance = {}
        if (response.data.results) {
            response.data.results.forEach(item => {
                if (item.key === "PLAYER_LEVEL") {
                    instance.level = item.value;
                } else if (item.key === "PLAYER_XP") {
                    instance.CurrentXp = item.value
                } else if (item.key === "MATCH_CURRENT_INFO") {
                    instance.MatchInfo = item.value
                }
            });
        }
        if (!instance.MatchInfo) {
            return res.status(400).json({ ResultCode: 0, Message: "Player don't have Match" })
        }
        const secret = await signWithHMAC(`${instance.MatchInfo.matchId}${instance.MatchInfo.startTimestamp}`, process.env.SECRET_KEY);

        const results = {}// bindding///////////////

        var message = ""
        for (let index = 0; index < Rewrads.Currencies.length; index++) {
            const reward = Rewrads.Currencies[index]
            message += `${reward.currencyId}:${reward.amount}`
        }

        if (Rewrads.XP) {
            message += `XP:${Rewrads.XP}`
            console.log(message)
        }

        const signature = Rewrads.rewards_token

        console.log("Dang xac thuc ma nhan thuong(6)")
        const isValid = await verifyHMAC(message, signature, secret);
        if (!isValid) {
            return res.status(400).json({ ResultCode: 0, Message: "Invalid token reward" })
        }

        console.log("xac thuc thanh cong(7)")

        //update XP
        if (Rewrads.XP) {
            instance.CurrentXp += Rewrads.XP
            var playerXPNeededKey = `LEVEL_UP_NEEDED_${instance.level}`

            try {
                const response = await axios.get(
                    `https://config.unity3d.com/api/v1/settings?projectId=${process.env.PROJECT_ID}&key=${playerXPNeededKey}`,
                    {
                        headers: {
                            Authorization: accessToken,
                            contentType: 'application/json'
                        }
                    }
                )
                if (response.data.configs &&
                    response.data.configs.settings &&
                    response.data.configs.settings[playerXPNeededKey]
                ) {
                    instance.xpNeedLevelUp = response.data.configs.settings[playerXPNeededKey]
                }
                console.log('xp' + instance.xpNeedLevelUp)

            } catch (error) {
                console.log(error)
                return res.status(error.status).json({ ResultCode: 0, Message: "Fail to get level up xp needed!" })
            }

            const shouldPlayerLevelUp = instance.CurrentXp >= instance.xpNeedLevelUp

            const Data = []

            if (shouldPlayerLevelUp) {
                instance.level++
                instance.CurrentXp = instance.CurrentXp - instance.xpNeedLevelUp
                // add to reward
                const levelUpReward = { currencyId: "COIN", amount: 999 }
                Rewrads.Currencies.push(levelUpReward)
                results.isLevelUp = shouldPlayerLevelUp
                results.levelUpReward = levelUpReward
                Data.push({ key: "PLAYER_LEVEL", value: instance.level })
            }
            Data.push({ key: "PLAYER_XP", value: instance.CurrentXp })

            //update player data
            try {
                //https://cloud-save.services.api.unity.com/v1/data/projects/{projectId}/players/{playerId}/public/item-batch
                const response = await axios.post(
                    `https://cloud-save.services.api.unity.com/v1/data/projects/${process.env.PROJECT_ID}/players/${playerId}/public/item-batch`,
                    { data: Data },
                    {
                        headers: {
                            Authorization: accessToken,
                            contentType: 'application/json'
                        }
                    }
                )
            } catch (err) {
                console.log(err)
                return res.status(err.status).json({ ResultCode: 0, Message: "Cannot save player data" })
            }




        }

        //reward currencies
        const promises = Rewrads.Currencies.map(async reward => {
            try {
                const Data = {
                    amount: reward.amount
                }
                const responseEconomy = await axios.post(
                    `https://economy.services.api.unity.com/v2/projects/${process.env.PROJECT_ID}/players/${playerId}/currencies/${reward.currencyId}/increment`,
                    Data,
                    {
                        headers: {
                            Authorization: accessToken,
                            contentType: 'application/json'
                        }
                    }
                )
                return { id: reward.currencyId, amount: Data.amount, succeed: true }

            } catch (error) {
                return { id: reward.currencyId, amount: reward.amount, succeed: false };
            }
        })

        const Granted = await Promise.all(promises);

        // comfirm granted
        var isAllGranted = true
        Granted.forEach(grant => {
            if (grant.succeed === false) {
                isAllGranted = false
            }
        })

        if (!isAllGranted) {
            return res.status(400).json({ ResultCode: 0, Message: "Grant rewards Fail", Granted: Granted })
        }


        try {
            //https://cloud-save.services.api.unity.com/v1/data/projects/{projectId}/players/{playerId}/public/items/{key}
            await axios.delete(
                `https://cloud-save.services.api.unity.com/v1/data/projects/${process.env.PROJECT_ID}/players/${playerId}/public/items/${key}`,
                {
                    headers: {
                        Authorization: accessToken,
                        contentType: 'application/json'
                    }
                }
            )
        } catch (err) {
            return res.status(err.status).json({ ResultCode: 0, Message: "Delete Fail" })
        }

        results.Granted = Granted
        return res.json({
            ResultCode: 1,
            message: "Succed",
            results: results
        })

    } catch (err) {
        return res.status(err.status).json({ ResultCode: 0, Message: "Get player public data fail!" })
    }

});

app.listen(port, () => console.log('Server listening on port', port));

